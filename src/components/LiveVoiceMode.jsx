import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

// Module-level connection tracker - persists across component remounts
// Tracks if a connection is active (survives component remounts)
let globalConnectionActive = false;
let globalWebSocket = null;

/**
 * LiveVoiceMode - Inline voice chat component that fits within input box
 * Handles speech-to-speech conversation with Azure OpenAI Realtime API
 *
 * @param {boolean} isActive - Whether the voice mode is active
 * @param {function} onClose - Callback to close the voice mode
 * @param {function} onAddMessage - Callback to add message to chat history { type: 'user' | 'ai', text: string }
 * @param {function} onShowChat - Callback to show chat modal
 */
const LiveVoiceMode = ({ isActive, onClose, onAddMessage, onShowChat }) => {
  // Voice state: "idle" | "connecting" | "listening" | "processing" | "speaking"
  const [voiceState, setVoiceState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [error, setError] = useState(null);

  // Refs for WebSocket and Audio
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const currentTranscriptRef = useRef("");
  const currentAiResponseRef = useRef("");

  // Additional refs to prevent duplicate handling
  const voiceStateRef = useRef("idle"); // Track voice state for closures
  const isCapturingRef = useRef(false); // Prevent multiple audio captures
  const currentResponseIdRef = useRef(null); // Track current response to prevent duplicates
  const handleServerMessageRef = useRef(null); // Store latest message handler
  const lastProcessedItemIdRef = useRef(null); // Track last processed conversation item
  const lastProcessedResponseIdRef = useRef(null); // Track last processed AI response
  const isProcessingResponseRef = useRef(false); // Flag to prevent processing while AI is responding
  const isConnectingRef = useRef(false); // Prevent multiple connection attempts
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9)); // Debug instance tracking
  const sourceNodeRef = useRef(null); // Track audio source node for cleanup
  const connectWebSocketRef = useRef(null); // Store latest connectWebSocket function
  const cleanupRef = useRef(null); // Store latest cleanup function
  const updateVoiceStateRef = useRef(null); // Store latest updateVoiceState function
  const hasShownChatRef = useRef(false); // Track if chat has been shown to prevent duplicate calls

  // Token management refs
  const tokenRef = useRef(null); // Current authentication token
  const expiresAtRef = useRef(null); // Token expiration timestamp
  const tokenRefreshTimerRef = useRef(null); // Timer for token refresh
  const isFetchingTokenRef = useRef(false); // Prevent multiple token fetches

  // Audio processing refs for noise reduction
  const highPassFilterRef = useRef(null);
  const lowPassFilterRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const canSendAudioRef = useRef(true); // Control audio sending during AI speech

  // Audio level state for visualization (optional)
  const [audioLevel, setAudioLevel] = useState(0);
  // Frequency data for realistic voice visualization (5 bars for different frequency bands)
  const [frequencyData, setFrequencyData] = useState([0, 0, 0, 0, 0]);

  // AudioWorklet processor code - runs in separate thread for better performance
  const audioWorkletCode = `
    class AudioCaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.bufferSize = 2400; // 100ms at 24kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.inputSampleRate = 48000;
        this.outputSampleRate = 24000;
        this.resampleRatio = this.outputSampleRate / this.inputSampleRate;
      }
      
      // Simple linear interpolation resampling from 48kHz to 24kHz
      resample(input) {
        const outputLength = Math.floor(input.length * this.resampleRatio);
        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i / this.resampleRatio;
          const srcIndexFloor = Math.floor(srcIndex);
          const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
          const t = srcIndex - srcIndexFloor;
          output[i] = input[srcIndexFloor] * (1 - t) + input[srcIndexCeil] * t;
        }
        return output;
      }
      
      // Convert Float32 to Int16 PCM
      float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          const s = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
      }
      
      process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        
        const inputData = input[0];
        
        // Resample from 48kHz to 24kHz
        const resampled = this.resample(inputData);
        
        // Add resampled data to buffer
        for (let i = 0; i < resampled.length; i++) {
          this.buffer[this.bufferIndex++] = resampled[i];
          
          // When buffer is full, send it
          if (this.bufferIndex >= this.bufferSize) {
            const pcm16 = this.float32ToInt16(this.buffer);
            this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;
          }
        }
        
        return true;
      }
    }
    
    registerProcessor('audio-capture-processor', AudioCaptureProcessor);
  `;

  // Azure OpenAI Realtime API configuration
  const AZURE_ENDPOINT = (
    import.meta.env.VITE_AZURE_OPENAI_ENDPOINT ||
    "saran-mj6uzvzg-eastus2.services.ai.azure.com"
  ).replace(/\/$/, "");
  const API_VERSION = "2025-10-01";
  const MODEL = "gpt-4o-mini-realtime-preview";
  const WS_PATH = "voice-live/realtime";
  const SPEECH_TOKEN_API = "https://chat-api.techjays.com/api/v1/speech-token/";

  // Helper to update voice state and ref together
  const updateVoiceState = useCallback((newState) => {
    if (voiceStateRef.current !== newState) {
      console.log(
        `[${instanceIdRef.current}] Voice state change: ${voiceStateRef.current} → ${newState}`
      );
      voiceStateRef.current = newState;
      setVoiceState(newState);
    }
  }, []);

  // Fetch speech token from API
  const fetchSpeechToken = useCallback(async () => {
    // Prevent multiple simultaneous token fetches
    if (isFetchingTokenRef.current) {
      console.log(
        `[${instanceIdRef.current}] Token fetch already in progress, waiting...`
      );
      // Wait for existing fetch to complete
      while (isFetchingTokenRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return tokenRef.current ? { token: tokenRef.current } : null;
    }

    isFetchingTokenRef.current = true;
    console.log(`[${instanceIdRef.current}] Fetching speech token from API`);

    try {
      const response = await fetch(SPEECH_TOKEN_API);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch token: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log(`[${instanceIdRef.current}] Token fetched successfully`);

      // Store token data (API now only returns token)
      tokenRef.current = data.token;
      expiresAtRef.current = data.expiresAt ? new Date(data.expiresAt) : null;

      // Calculate refresh time (60 minutes = 3600 seconds before expiration)
      // If expiresIn is provided, use it; otherwise calculate from expiresAt
      const expiresIn =
        data.expiresIn ||
        (data.expiresAt
          ? Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
          : 1200); // Default 20 minutes if not provided

      // Refresh at 60 minutes (3600s) OR 2 minutes before expiration, whichever comes FIRST (smaller value)
      const refreshIn = Math.min(3600, Math.max(0, expiresIn - 120));

      console.log(
        `[${instanceIdRef.current}] Token expires in ${expiresIn}s, will refresh in ${refreshIn}s`
      );

      // Clear existing refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }

      // Schedule token refresh
      tokenRefreshTimerRef.current = setTimeout(() => {
        console.log(
          `[${instanceIdRef.current}] Token refresh timer triggered, refreshing token...`
        );
        tokenRefreshTimerRef.current = null;

        // Refresh token (but don't reconnect if WebSocket is open)
        fetchSpeechToken().then((newTokenData) => {
          if (newTokenData && wsRef.current?.readyState === WebSocket.OPEN) {
            console.log(
              `[${instanceIdRef.current}] Token refreshed, WebSocket still open - no reconnection needed`
            );
          }
        });
      }, refreshIn * 1000);

      isFetchingTokenRef.current = false;
      return {
        token: data.token,
      };
    } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to fetch token:`, err);
      isFetchingTokenRef.current = false;
      throw err;
    }
  }, []);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(async () => {
    // Check if WebSocket is already open or connecting

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      console.log(
        `[${instanceIdRef.current}] WebSocket already connected/connecting, skipping`
      );
      return;
    }
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      console.log(
        `[${instanceIdRef.current}] Connection already in progress, skipping`
      );
      return;
    }

    isConnectingRef.current = true;
    console.log(`[${instanceIdRef.current}] Starting WebSocket connection`);
    updateVoiceState("connecting");
    setError(null);

    try {
      // Fetch token first
      const tokenData = await fetchSpeechToken();
      if (!tokenData || !tokenData.token) {
        throw new Error("Failed to obtain authentication token");
      }

      // Build WebSocket URL with token authorization
      // Construct URL using endpoint and path, then add authorization
      const wsUrl = `wss://${AZURE_ENDPOINT}/${WS_PATH}?api-version=${API_VERSION}&model=${MODEL}&authorization=Bearer ${tokenData.token}`;

      console.log(
        `[${instanceIdRef.current}] Connecting to:`,
        wsUrl.replace(tokenData.token, "***")
      );

      wsRef.current = new WebSocket(wsUrl);
      globalWebSocket = wsRef.current; // Store globally to survive remounts

      wsRef.current.onopen = () => {
        console.log(`[${instanceIdRef.current}] WebSocket connected`);
        isConnectingRef.current = false;
        globalConnectionActive = true; // Mark as active globally

        // Configure the session
        const sessionConfig = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions:
              "You are a helpful AI assistant for Techjays. Be concise and friendly. Answer questions about Techjays services, projects, and team.",
            voice: "ash",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800, // Increased to better detect end of speech
            },
          },
        };

        wsRef.current.send(JSON.stringify(sessionConfig));
        updateVoiceState("listening");

        // Only start audio capture if not already capturing
        if (!isCapturingRef.current) {
          startAudioCapture();
        } else {
          console.log(
            `[${instanceIdRef.current}] Audio already capturing, skipping`
          );
        }
      };

      // Use ref to always call the latest handler (avoids stale closures)
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log(
            `[${instanceIdRef.current}] Received message:`,
            message.type,
            message
          );
          // Call the latest handler via ref
          if (handleServerMessageRef.current) {
            handleServerMessageRef.current(message);
          } else {
            console.warn(
              `[${instanceIdRef.current}] No message handler available`
            );
          }
        } catch (err) {
          console.error(
            `[${instanceIdRef.current}] Error parsing message:`,
            err,
            event.data
          );
        }
      };

      wsRef.current.onerror = (err) => {
        console.error(`[${instanceIdRef.current}] WebSocket error:`, err);
        isConnectingRef.current = false;
        setError("Connection error. Please try again.");
        updateVoiceState("idle");
      };

      wsRef.current.onclose = (event) => {
        console.log(
          `[${instanceIdRef.current}] WebSocket closed - code:`,
          event.code,
          "reason:",
          event.reason || "(no reason provided)",
          "isActive:",
          isActive
        );
        isConnectingRef.current = false;

        // Only cleanup and show error if it's an unexpected closure
        // Code 1000 is normal closure (intentional), don't cleanup if we're still active
        if (event.code !== 1000) {
          // Provide more helpful error messages based on close code
          let errorMsg = "Connection closed unexpectedly.";
          if (event.code === 1006) {
            errorMsg = "Connection failed. Please try again.";
          } else if (event.code === 1008) {
            errorMsg = "Policy violation. Check API configuration.";
          } else if (event.code === 1011) {
            errorMsg = "Server error. Please try again later.";
          } else if (event.code === 4001) {
            errorMsg = "Authentication failed. Token may have expired.";
          } else if (event.code === 4003) {
            errorMsg = "Forbidden. Check your API permissions.";
          }
          if (event.reason) {
            errorMsg += ` (${event.reason})`;
          }
          console.error(
            `[${instanceIdRef.current}] Connection error:`,
            errorMsg
          );
          setError(errorMsg);
          cleanup(false); // Don't close WebSocket (it's already closed), just cleanup audio
          // Clear global tracker on error
          globalConnectionActive = false;
          globalWebSocket = null;
        } else {
          // Normal closure (code 1000) - WebSocket was closed intentionally
          // Don't cleanup here, just log it
          console.log(
            `[${instanceIdRef.current}] WebSocket closed normally (code 1000)`
          );
          // Clear the ref and global tracker
          wsRef.current = null;
          globalConnectionActive = false;
          globalWebSocket = null;
        }
      };
    } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to connect:`, err);
      isConnectingRef.current = false;
      setError("Failed to connect. Please try again.");
      updateVoiceState("idle");
    }
  }, [fetchSpeechToken, updateVoiceState]);

  // Clear the input audio buffer on the server
  const clearInputAudioBuffer = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Clearing input audio buffer");
      wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    }
  }, []);

  // Handle messages from the server
  const handleServerMessage = useCallback(
    (message) => {
      switch (message.type) {
        case "session.created":
          console.log(
            `[${instanceIdRef.current}] Session created:`,
            message.session?.id
          );
          break;

        case "session.updated":
          console.log(`[${instanceIdRef.current}] Session updated:`, message);
          break;

        case "input_audio_buffer.speech_started":
          // Ignore speech detection if we're currently processing a response
          if (isProcessingResponseRef.current) {
            console.log(
              `[${instanceIdRef.current}] Speech started IGNORED - AI is responding`
            );
            return;
          }
          console.log(`[${instanceIdRef.current}] Speech started`);
          updateVoiceState("listening");
          currentTranscriptRef.current = "";
          setTranscript("");
          break;

        case "input_audio_buffer.speech_stopped":
          // Ignore if we're currently processing a response
          if (isProcessingResponseRef.current) {
            console.log(
              `[${instanceIdRef.current}] Speech stopped IGNORED - AI is responding`
            );
            return;
          }
          console.log(
            `[${instanceIdRef.current}] Speech stopped - waiting for transcription`
          );
          updateVoiceState("processing");
          break;

        case "input_audio_buffer.committed":
          console.log("Audio buffer committed, item_id:", message.item_id);
          break;

        case "conversation.item.created":
          // Track conversation item to prevent duplicates
          if (message.item?.id) {
            console.log(
              "Conversation item created:",
              message.item.id,
              "role:",
              message.item?.role
            );
          }
          break;

        case "conversation.item.input_audio_transcription.completed":
          // User's speech transcription - check for duplicates
          const itemId = message.item_id;
          if (itemId && itemId === lastProcessedItemIdRef.current) {
            console.log("Duplicate transcription IGNORED for item:", itemId);
            return;
          }

          if (message.transcript) {
            console.log(
              "Transcription completed:",
              message.transcript,
              "item:",
              itemId
            );
            lastProcessedItemIdRef.current = itemId;
            currentTranscriptRef.current = message.transcript;
            setTranscript(message.transcript);
            // Add to chat history
            if (onAddMessage) {
              onAddMessage({
                type: "user",
                text: message.transcript,
                isVoice: true,
              });
            }
            // Only show chat once to prevent remounting and reconnection
            if (onShowChat && !hasShownChatRef.current) {
              hasShownChatRef.current = true;
              onShowChat();
            }
          }
          break;

        case "response.created":
          // Track the response ID and mark that we're processing
          const newResponseId = message.response?.id;
          if (newResponseId) {
            // Check if this is a duplicate response.created event
            if (newResponseId === currentResponseIdRef.current) {
              console.log(
                `[${instanceIdRef.current}] Duplicate response.created IGNORED:`,
                newResponseId
              );
              return;
            }
            console.log(
              `[${instanceIdRef.current}] Response created:`,
              newResponseId,
              "previous:",
              currentResponseIdRef.current
            );
            currentResponseIdRef.current = newResponseId;
            isProcessingResponseRef.current = true;
            canSendAudioRef.current = false; // Stop sending audio while AI responds
            // Set state to speaking immediately when AI starts responding
            updateVoiceState("speaking");
            console.log(
              `[${instanceIdRef.current}] State set to "speaking" - AI responding`
            );
            // Clear any buffered audio to prevent echo processing
            clearInputAudioBuffer();
          }
          break;

        case "response.audio_transcript.delta":
          // AI response text streaming
          const deltaResponseId = message.response_id || message.response?.id;
          // Only process if matches current response and hasn't been processed yet
          if (
            message.delta &&
            deltaResponseId === currentResponseIdRef.current &&
            deltaResponseId !== lastProcessedResponseIdRef.current
          ) {
            currentAiResponseRef.current += message.delta;
            setAiResponse(currentAiResponseRef.current);

            // Stream to chat history as text comes in
            if (onAddMessage && currentAiResponseRef.current) {
              onAddMessage({
                type: "ai",
                text: currentAiResponseRef.current,
                isVoice: true,
                isStreaming: true, // Mark as streaming
              });
            }

            // Set state to speaking when we start receiving response text
            if (voiceStateRef.current !== "speaking") {
              updateVoiceState("speaking");
            }
          } else if (
            deltaResponseId &&
            deltaResponseId === lastProcessedResponseIdRef.current
          ) {
            // Already processed this response, ignore deltas
            console.log(
              `[${instanceIdRef.current}] Ignoring delta for already processed response:`,
              deltaResponseId
            );
          }
          break;

        case "response.audio_transcript.done":
          // AI response complete - only process if matches current response and not already processed
          const responseId = message.response_id || message.response?.id;
          console.log(
            `[${instanceIdRef.current}] AI transcript done, response_id:`,
            responseId,
            "current:",
            currentResponseIdRef.current,
            "lastProcessed:",
            lastProcessedResponseIdRef.current
          );

          // Check if this response was already processed
          if (responseId && responseId === lastProcessedResponseIdRef.current) {
            console.log(
              `[${instanceIdRef.current}] Duplicate AI response IGNORED:`,
              responseId
            );
            return;
          }

          // Only process if matches current response
          if (responseId && responseId !== currentResponseIdRef.current) {
            console.log(
              `[${instanceIdRef.current}] Mismatched response_id IGNORED:`,
              responseId
            );
            return;
          }

          // Check if we have text to add
          if (
            !currentAiResponseRef.current ||
            currentAiResponseRef.current.trim() === ""
          ) {
            console.log(`[${instanceIdRef.current}] No response text to add`);
            currentAiResponseRef.current = "";
            return;
          }

          // Store the response text before clearing
          const responseText = currentAiResponseRef.current;

          // Mark as processed BEFORE adding to prevent race conditions
          if (responseId) {
            lastProcessedResponseIdRef.current = responseId;
          }

          // Clear the response text first
          currentAiResponseRef.current = "";

          // Final update to chat history (mark as not streaming)
          if (onAddMessage && responseText && responseText.trim() !== "") {
            console.log(
              `[${instanceIdRef.current}] Finalizing AI response in chat:`,
              responseText.substring(0, 50)
            );
            onAddMessage({
              type: "ai",
              text: responseText,
              isVoice: true,
              isStreaming: false, // Mark as complete
            });
          }
          break;

        case "response.audio.delta":
          // AI audio response - set state to speaking when audio starts
          const audioResponseId = message.response_id || message.response?.id;
          // Set state to speaking immediately when we receive audio
          if (message.delta && voiceStateRef.current !== "speaking") {
            updateVoiceState("speaking");
          }
          // Only process if matches current response
          if (
            message.delta &&
            audioResponseId === currentResponseIdRef.current
          ) {
            const audioData = base64ToArrayBuffer(message.delta);
            audioQueueRef.current.push(audioData);
            playAudioQueue();
          }
          break;

        case "response.audio.done":
          // All audio chunks received from server - playback will finish naturally
          const audioDoneResponseId =
            message.response_id || message.response?.id;
          console.log(
            `[${instanceIdRef.current}] Audio done from server, response_id:`,
            audioDoneResponseId,
            "isPlaying:",
            isPlayingRef.current,
            "queue length:",
            audioQueueRef.current.length
          );
          // Note: We don't change state here - we wait for response.done and then wait for playback to finish
          break;

        case "response.done":
          // Response complete, wait for audio to finish before going back to listening
          const doneResponseId = message.response?.id || message.response_id;
          console.log(
            `[${instanceIdRef.current}] Response done, response_id:`,
            doneResponseId,
            "current:",
            currentResponseIdRef.current,
            "lastProcessed:",
            lastProcessedResponseIdRef.current,
            "current state:",
            voiceStateRef.current,
            "isPlaying:",
            isPlayingRef.current
          );

          // Clear the input buffer to remove any echo that was captured
          clearInputAudioBuffer();

          // Wait for audio playback to finish before allowing new speech detection
          waitForAudioToFinish().then(() => {
            console.log(
              `[${instanceIdRef.current}] Audio playback finished, waiting 300ms before resuming listening`
            );
            // Small delay after audio finishes to prevent echo/overlap
            setTimeout(() => {
              isProcessingResponseRef.current = false;
              // Only clear currentResponseIdRef, keep lastProcessedResponseIdRef to prevent duplicates
              currentResponseIdRef.current = null;
              canSendAudioRef.current = true; // Resume sending audio
              // Use ref to check current state, not stale closure
              if (voiceStateRef.current !== "idle") {
                updateVoiceState("listening");
                setAiResponse("");
              }
            }, 300); // Small delay to let any echo subside
          });
          break;

        case "error":
          console.error("API Error:", message.error);
          setError(message.error?.message || "An error occurred");
          isProcessingResponseRef.current = false;
          canSendAudioRef.current = true; // Resume sending audio on error
          break;

        default:
          // console.log("Unhandled message type:", message.type);
          break;
      }
    },
    [onAddMessage, onShowChat, updateVoiceState, clearInputAudioBuffer]
  );

  // Keep the ref updated with the latest handler
  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // Convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Real-time frequency analysis for voice visualization
  const startFrequencyAnalysis = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!analyserRef.current || !isCapturingRef.current) {
        animationFrameRef.current = null;
        return;
      }

      // Only analyze when listening (not when AI is speaking)
      if (voiceStateRef.current === "listening") {
        analyser.getByteFrequencyData(dataArray);

        // Divide frequency spectrum into 5 bands for 5 bars
        // Human voice is typically in 85Hz - 3400Hz range
        // We'll sample different frequency ranges to capture voice modulation
        const bandSize = Math.floor(bufferLength / 5);
        const frequencyBands = [];

        for (let i = 0; i < 5; i++) {
          const start = i * bandSize;
          const end = start + bandSize;
          let sum = 0;
          let max = 0;
          let peakCount = 0;

          // Get max, average, and peak count for this frequency band
          for (let j = start; j < end && j < bufferLength; j++) {
            const value = dataArray[j];
            sum += value;
            max = Math.max(max, value);
            // Count peaks above threshold for more dynamic response
            if (value > 128) peakCount++;
          }

          // Use a combination of max and average for more natural response
          const avg = sum / bandSize;
          // Weighted combination: 60% max (for peaks) + 30% average (for smoothness) + 10% peak density
          const peakFactor = Math.min(peakCount / bandSize, 1);
          const normalized =
            (max * 0.6 + avg * 0.3 + peakFactor * 255 * 0.1) / 255;

          // Apply exponential scaling for more natural visual response
          // Voice modulation is more visible in the mid-range
          const scaled = Math.pow(Math.max(0, normalized), 0.55);

          // Map to bar height with dynamic range (min 4px, max 24px for natural look)
          // Center bars (2, 3) get slightly more range for better voice visualization
          const maxHeight = i === 2 || i === 3 ? 24 : 20;
          const height = 4 + scaled * (maxHeight - 4);
          frequencyBands.push(height);
        }

        setFrequencyData(frequencyBands);
      } else {
        // When not listening, fade out the bars
        setFrequencyData((prev) => prev.map((val) => Math.max(0, val * 0.85)));
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, []);

  // Stop existing audio capture
  const stopAudioCapture = useCallback(() => {
    console.log(`[${instanceIdRef.current}] Stopping audio capture`);

    // Cancel animation frame for audio level visualization
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect all audio nodes
    const nodesToDisconnect = [
      sourceNodeRef,
      highPassFilterRef,
      lowPassFilterRef,
      analyserRef,
      workletNodeRef,
    ];

    nodesToDisconnect.forEach((nodeRef) => {
      if (nodeRef.current) {
        try {
          nodeRef.current.disconnect();
        } catch (e) {
          /* ignore */
        }
        nodeRef.current = null;
      }
    });

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch (e) {
        /* ignore */
      }
      audioContextRef.current = null;
    }

    isCapturingRef.current = false;
    setAudioLevel(0);
    setFrequencyData([0, 0, 0, 0, 0]);
  }, []);

  // Start capturing audio from microphone (simple ScriptProcessor approach)
  const startAudioCapture = useCallback(async () => {
    // Prevent multiple audio captures
    if (isCapturingRef.current) {
      console.log(
        `[${instanceIdRef.current}] Audio capture already running, skipping`
      );
      return;
    }

    // Clean up any existing audio resources first
    stopAudioCapture();

    isCapturingRef.current = true;
    canSendAudioRef.current = true;
    console.log(`[${instanceIdRef.current}] Starting audio capture`);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: 24000,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // Create AnalyserNode for real-time frequency analysis
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256; // Smaller FFT for faster updates
      analyser.smoothingTimeConstant = 0.8; // Smooth transitions
      analyserRef.current = analyser;

      // Create ScriptProcessor for audio processing
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      let audioChunkCount = 0;
      processor.onaudioprocess = (e) => {
        // Don't send audio while AI is speaking
        if (!canSendAudioRef.current) {
          return;
        }

        // Use refs to check current state (avoid stale closures)
        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          voiceStateRef.current !== "speaking" &&
          voiceStateRef.current !== "processing" &&
          !isProcessingResponseRef.current
        ) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);
          const base64Audio = arrayBufferToBase64(pcm16.buffer);

          audioChunkCount++;
          if (audioChunkCount === 1) {
            console.log(`[${instanceIdRef.current}] First audio chunk sent`);
          }
          if (audioChunkCount % 50 === 0) {
            console.log(
              `[${instanceIdRef.current}] Sent ${audioChunkCount} audio chunks`
            );
          }

          try {
            wsRef.current.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: base64Audio,
              })
            );
          } catch (err) {
            console.error(
              `[${instanceIdRef.current}] Error sending audio:`,
              err
            );
          }
        }
      };

      // Connect: source -> analyser -> processor -> destination
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);
      workletNodeRef.current = processor;

      // Start real-time frequency analysis animation
      startFrequencyAnalysis();

      console.log(
        `[${instanceIdRef.current}] Audio capture started successfully`
      );
    } catch (err) {
      console.error(
        `[${instanceIdRef.current}] Failed to start audio capture:`,
        err.name,
        err.message
      );
      isCapturingRef.current = false;

      if (err.name === "NotAllowedError") {
        setError("Microphone blocked. Please allow microphone in browser.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone.");
      } else {
        setError(`Microphone error: ${err.message || err.name}`);
      }
    }
  }, [stopAudioCapture]);

  // Convert Float32 to PCM16
  const float32ToPcm16 = (float32Array) => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  };

  // Play audio from queue
  const playAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      await playAudioBuffer(audioData);
    }

    isPlayingRef.current = false;
  };

  // Wait for audio playback to finish
  const waitForAudioToFinish = () => {
    return new Promise((resolve) => {
      console.log(
        `[${instanceIdRef.current}] Starting wait for audio to finish, isPlaying:`,
        isPlayingRef.current,
        "queue length:",
        audioQueueRef.current.length
      );

      // If not playing and queue is empty, wait a bit then resolve
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        // Wait 200ms to ensure no new audio is coming
        setTimeout(() => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            console.log(
              `[${instanceIdRef.current}] Audio already finished, resolving immediately`
            );
            resolve();
          }
        }, 200);
        return;
      }

      let consecutiveEmptyChecks = 0;
      const requiredEmptyChecks = 3; // Require 3 consecutive checks (300ms) of no activity

      // Poll every 100ms to check if audio is done
      const checkInterval = setInterval(() => {
        const isPlaying = isPlayingRef.current;
        const queueLength = audioQueueRef.current.length;

        console.log(
          `[${instanceIdRef.current}] Checking audio status - isPlaying:`,
          isPlaying,
          "queue:",
          queueLength,
          "consecutiveEmpty:",
          consecutiveEmptyChecks
        );

        // If not playing and queue is empty, increment counter
        if (!isPlaying && queueLength === 0) {
          consecutiveEmptyChecks++;
          // Only resolve after multiple consecutive checks to ensure audio is really done
          if (consecutiveEmptyChecks >= requiredEmptyChecks) {
            clearInterval(checkInterval);
            console.log(
              `[${
                instanceIdRef.current
              }] ✅ Audio playback confirmed finished after ${
                consecutiveEmptyChecks * 100
              }ms of no activity`
            );
            resolve();
          }
        } else {
          // Reset counter if audio is still playing or queue has items
          consecutiveEmptyChecks = 0;
        }
      }, 100);

      // Safety timeout - only as a last resort (10 minutes for very long responses)
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn(
          `[${instanceIdRef.current}] ⚠️ Audio wait timeout reached (10 minutes) - forcing resolve. isPlaying:`,
          isPlayingRef.current,
          "queue:",
          audioQueueRef.current.length
        );
        resolve();
      }, 600000); // 10 minutes - should be enough for any response
    });
  };

  // Play a single audio buffer
  const playAudioBuffer = (arrayBuffer) => {
    return new Promise((resolve) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: 24000,
        });
      }

      // Convert PCM16 to Float32 for Web Audio API
      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }

      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        float32.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = resolve;
      source.start();
    });
  };

  // Interrupt AI speaking
  const handleInterrupt = () => {
    if (
      voiceStateRef.current === "speaking" ||
      isProcessingResponseRef.current
    ) {
      console.log(
        `[${instanceIdRef.current}] Interrupting AI response, currentResponseId:`,
        currentResponseIdRef.current,
        "isProcessing:",
        isProcessingResponseRef.current
      );

      // Clear audio queue and stop playback
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      // Only send cancel if we have an active response ID
      if (
        wsRef.current?.readyState === WebSocket.OPEN &&
        currentResponseIdRef.current
      ) {
        console.log(
          `[${instanceIdRef.current}] Sending cancel for response:`,
          currentResponseIdRef.current
        );
        // Send cancel response event with response ID if available
        wsRef.current.send(
          JSON.stringify({
            type: "response.cancel",
            response_id: currentResponseIdRef.current,
          })
        );
        // Clear input buffer as well
        wsRef.current.send(
          JSON.stringify({
            type: "input_audio_buffer.clear",
          })
        );
      } else {
        console.log(
          `[${instanceIdRef.current}] No active response to cancel, just clearing local state`
        );
        // Clear input buffer even if no response to cancel
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "input_audio_buffer.clear",
            })
          );
        }
      }

      // Reset state
      currentResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      canSendAudioRef.current = true; // Resume sending audio
      updateVoiceState("listening");
      setAiResponse("");
      currentAiResponseRef.current = "";
    }
  };

  // Cleanup resources
  const cleanup = useCallback(
    (shouldCloseWebSocket = true) => {
      console.log(
        `[${instanceIdRef.current}] Cleaning up resources, shouldCloseWebSocket:`,
        shouldCloseWebSocket
      );

      // Clear token refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
        console.log(`[${instanceIdRef.current}] Token refresh timer cleared`);
      }

      // Stop audio capture (handles media stream, audio nodes, and context)
      stopAudioCapture();

      // Close WebSocket only if explicitly requested (when ending session)
      if (wsRef.current && shouldCloseWebSocket) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          console.log(`[${instanceIdRef.current}] Closing WebSocket`);
          wsRef.current.close(1000, "Session ended");
        } else if (wsRef.current.readyState === WebSocket.CONNECTING) {
          // If still connecting, set up a handler to close it when it opens
          const ws = wsRef.current;
          ws.onopen = () => {
            ws.close(1000, "Session ended");
          };
          // Also clear handlers to prevent memory leaks
          ws.onmessage = null;
          ws.onerror = null;
        }
        wsRef.current = null;
        // Clear global connection tracker
        globalConnectionActive = false;
        globalWebSocket = null;
      } else if (wsRef.current && !shouldCloseWebSocket) {
        console.log(`[${instanceIdRef.current}] Skipping WebSocket close`);
      }

      // Clear audio queue and reset flags
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      currentResponseIdRef.current = null;
      lastProcessedItemIdRef.current = null;
      lastProcessedResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isConnectingRef.current = false;
      canSendAudioRef.current = true;

      // Clear token data if ending session
      if (shouldCloseWebSocket) {
        tokenRef.current = null;
        expiresAtRef.current = null;
        isFetchingTokenRef.current = false;
      }
    },
    [stopAudioCapture]
  );

  // End session
  const handleEndSession = () => {
    console.log(`[${instanceIdRef.current}] Ending session`);
    cleanup(true); // Close WebSocket when ending session
    updateVoiceState("idle");
    setTranscript("");
    setAiResponse("");
    setError(null);
    setAudioLevel(0);
    currentTranscriptRef.current = "";
    currentAiResponseRef.current = "";
    hasStartedRef.current = false;
    lastProcessedItemIdRef.current = null;
    lastProcessedResponseIdRef.current = null;
    isProcessingResponseRef.current = false;
    isConnectingRef.current = false;
    canSendAudioRef.current = true;
    hasShownChatRef.current = false; // Reset so chat can be shown again next time
    onClose();
  };

  // Update refs whenever functions change (runs first to ensure refs are set)
  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
    cleanupRef.current = cleanup;
    updateVoiceStateRef.current = updateVoiceState;
  }, [connectWebSocket, cleanup, updateVoiceState]);

  // Simplified session management - ONLY depends on isActive
  // Connection logic is self-contained to prevent reconnection issues
  useEffect(() => {
    // Capture isActive at effect time
    const currentIsActive = isActive;

    console.log(
      `[${instanceIdRef.current}] Session effect - isActive:`,
      currentIsActive,
      "hasStarted:",
      hasStartedRef.current,
      "wsState:",
      wsRef.current?.readyState
    );

    // If deactivating, cleanup and return
    if (!currentIsActive) {
      if (hasStartedRef.current) {
        console.log(`[${instanceIdRef.current}] Deactivating - cleaning up`);
        if (cleanupRef.current) {
          cleanupRef.current(true);
        }
        hasStartedRef.current = false;
      }
      return;
    }

    // CRITICAL: Check global connection first (survives remounts)
    if (globalConnectionActive && globalWebSocket) {
      // Restore WebSocket reference if we lost it on remount
      if (!wsRef.current && globalWebSocket.readyState === WebSocket.OPEN) {
        console.log(
          `[${instanceIdRef.current}] 🔄 Restoring WebSocket reference from global (remount detected)`
        );
        wsRef.current = globalWebSocket;
      }

      // If global WebSocket is OPEN, never reconnect
      if (globalWebSocket.readyState === WebSocket.OPEN) {
        console.log(
          `[${instanceIdRef.current}] ✅✅✅ Global connection OPEN - ABSOLUTELY NO RECONNECTION`
        );
        wsRef.current = globalWebSocket;
        hasStartedRef.current = true;
        // Ensure voice state is listening if it's idle
        if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
          updateVoiceStateRef.current("listening");
        }
        return;
      }

      // If global WebSocket is CONNECTING, wait
      if (globalWebSocket.readyState === WebSocket.CONNECTING) {
        console.log(
          `[${instanceIdRef.current}] ⏳ Global connection CONNECTING - NO ACTION (waiting)`
        );
        wsRef.current = globalWebSocket;
        hasStartedRef.current = true;
        // Set state to connecting if idle
        if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
          updateVoiceStateRef.current("connecting");
        }
        return;
      }
    }

    // CRITICAL CHECK: If WebSocket is already OPEN, do ABSOLUTELY NOTHING
    // This prevents any reconnection attempts during the session, even on remount
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(
        `[${instanceIdRef.current}] ✅✅✅ Connection OPEN - ABSOLUTELY NO ACTION (connection persists)`
      );
      hasStartedRef.current = true;
      // Ensure voice state is listening if it's idle
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("listening");
      }
      return;
    }

    // If connecting, wait - do nothing
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log(
        `[${instanceIdRef.current}] ⏳ Connection CONNECTING - NO ACTION (waiting)`
      );
      hasStartedRef.current = true;
      // Set state to connecting if idle
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("connecting");
      }
      return;
    }

    // CRITICAL: If audio is already capturing, we have an active session
    // Don't reconnect even if component remounted (audio capture indicates active session)
    if (isCapturingRef.current) {
      console.log(
        `[${instanceIdRef.current}] 🎤🎤🎤 Audio capturing - ACTIVE SESSION DETECTED - NO RECONNECTION`
      );
      hasStartedRef.current = true;
      return;
    }

    // If already marked as started, don't reconnect (even without WebSocket ref)
    // This prevents reconnection when component remounts
    if (hasStartedRef.current) {
      console.log(
        `[${instanceIdRef.current}] ⚠️ Already started - NO RECONNECTION`
      );
      return;
    }

    // If WebSocket exists but is closed, and we're already started, don't reconnect
    if (hasStartedRef.current && wsRef.current) {
      console.log(
        `[${instanceIdRef.current}] ⚠️ Already started with existing WebSocket - NO RECONNECTION`
      );
      return;
    }

    // Only connect if: active, not started, and WebSocket doesn't exist or is closed
    console.log(`[${instanceIdRef.current}] 🚀 Initializing NEW connection`);
    hasStartedRef.current = true;

    // Set state to connecting immediately when starting new connection
    if (updateVoiceStateRef.current && voiceStateRef.current === "idle") {
      updateVoiceStateRef.current("connecting");
    }

    // Use ref to call connectWebSocket (avoids dependency issues)
    // The ref is set by the useEffect below, which runs before this one
    if (connectWebSocketRef.current) {
      connectWebSocketRef.current();
    } else {
      console.error(`[${instanceIdRef.current}] connectWebSocketRef not set!`);
    }

    // Cleanup function - only runs when isActive changes to false
    return () => {
      // Only cleanup if we're actually deactivating
      if (!currentIsActive && hasStartedRef.current) {
        console.log(`[${instanceIdRef.current}] 🛑 Cleanup: deactivating`);
        if (cleanupRef.current) {
          cleanupRef.current(true);
        } else {
          console.error(`[${instanceIdRef.current}] cleanupRef not set!`);
        }
        hasStartedRef.current = false;
      } else {
        console.log(
          `[${instanceIdRef.current}] ⏸️ Cleanup skipped: still active`
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]); // ONLY isActive - connection persists regardless of other changes

  // Keyboard support - Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isActive) {
        handleEndSession();
      }
    };

    if (isActive) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isActive]);

  const getStatusText = () => {
    if (error) return error;

    switch (voiceState) {
      case "connecting":
        return "Connecting...";
      case "listening":
        return transcript ? `"${transcript}"` : "Listening...";
      case "processing":
        return "Processing...";
      case "speaking":
        return "Speaking...";
      default:
        // If active and connected, show "Listening..." instead of "Ready"
        if (
          isActive &&
          (wsRef.current?.readyState === WebSocket.OPEN ||
            globalConnectionActive)
        ) {
          return "Listening...";
        }
        return "Ready";
    }
  };

  console.log(
    `[${instanceIdRef.current}] Rendering LiveVoiceMode, isActive:`,
    isActive,
    "voiceState:",
    voiceState
  );

  if (!isActive) return null;

  return (
    <div className="flex items-center justify-between w-full gap-3 animate-voiceFadeIn">
      {/* Voice Orb - Compact size */}
      <div className="relative flex-shrink-0">
        {/* Glow effect */}
        <div
          className={`absolute inset-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full blur-md ${
            voiceState === "listening"
              ? "animate-voicePulseInline"
              : voiceState === "speaking"
              ? "animate-voiceSpeakingPulseInline"
              : ""
          }`}
          style={{
            background:
              voiceState === "speaking"
                ? "linear-gradient(to right, #22d3ee, #60a5fa)"
                : error
                ? "linear-gradient(to right, #ef4444, #dc2626)"
                : "linear-gradient(to right, #818cf8, #6366f1)",
            opacity: 0.4,
          }}
        />

        {/* Main orb */}
        <div
          className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden ${
            voiceState === "listening"
              ? "animate-voiceOrbInline"
              : voiceState === "speaking"
              ? "animate-voiceSpeakingOrbInline"
              : ""
          }`}
          style={{
            background: error
              ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
              : voiceState === "speaking"
              ? "linear-gradient(135deg, #22d3ee 0%, #60a5fa 50%, #818cf8 100%)"
              : voiceState === "processing" || voiceState === "connecting"
              ? "linear-gradient(135deg, #a78bfa 0%, #818cf8 50%, #6366f1 100%)"
              : "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)",
            boxShadow: "0 0 20px rgba(99, 102, 241, 0.3)",
          }}
        >
          {/* Realistic voice visualization based on actual audio modulation */}
          {voiceState === "listening" && !error && (
            <div className="flex items-center justify-center gap-0.5">
              {frequencyData.map((height, index) => (
                <span
                  key={index}
                  style={{
                    display: "block",
                    width: "2px",
                    height: `${height}px`,
                    minHeight: "4px",
                    background: "white",
                    borderRadius: "2px",
                    transition: "height 0.1s ease-out",
                    transformOrigin: "bottom",
                  }}
                />
              ))}
            </div>
          )}

          {/* Animated bars for speaking */}
          {voiceState === "speaking" && !error && (
            <div className="flex items-center justify-center gap-0.5">
              {[8, 14, 18, 14, 8].map((height, index) => (
                <span
                  key={index}
                  style={{
                    display: "block",
                    width: "2.5px",
                    height: `${height}px`,
                    background: "white",
                    borderRadius: "2px",
                    animation: "voiceBarAnimInline 0.6s ease-in-out infinite",
                    animationDelay: `${index * 0.08}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing/Connecting spinner */}
          {(voiceState === "processing" || voiceState === "connecting") &&
            !error && (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}

          {/* Idle or Error state - mic icon */}
          {(voiceState === "idle" || error) && (
            <Mic className="w-4 h-4 text-white" />
          )}
        </div>
      </div>

      {/* Status text - centered */}
      <div className="flex-1 text-center min-w-0">
        <p
          className={`text-sm sm:text-base font-medium truncate ${
            error ? "text-red-500" : "text-gray-700"
          }`}
        >
          {getStatusText()}
        </p>
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Interrupt button - only visible when speaking */}
        {/* {voiceState === "speaking" && (
          <button
            onClick={handleInterrupt}
            className="p-1.5 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:scale-105"
            title="Interrupt"
          >
            <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
          </button>
        )} */}

        {/* End session button */}
        <button
          onClick={handleEndSession}
          className="p-1.5 sm:p-2 rounded-full transition-all duration-200 hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
          }}
          title="End Session"
        >
          <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
        </button>
      </div>

      {/* Component-specific styles */}
      <style>{`
        @keyframes voiceFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-voiceFadeIn {
          animation: voiceFadeIn 0.2s ease-out;
        }

        @keyframes voicePulseInline {
          0%, 100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.5;
          }
        }
        .animate-voicePulseInline {
          animation: voicePulseInline 1.5s ease-in-out infinite;
        }

        @keyframes voiceOrbInline {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        .animate-voiceOrbInline {
          animation: voiceOrbInline 1.5s ease-in-out infinite;
        }

        @keyframes voiceSpeakingPulseInline {
          0%, 100% {
            transform: scale(1);
            opacity: 0.35;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.5;
          }
        }
        .animate-voiceSpeakingPulseInline {
          animation: voiceSpeakingPulseInline 1s ease-in-out infinite;
        }

        @keyframes voiceSpeakingOrbInline {
          0%, 100% {
            transform: scale(1);
          }
          25% {
            transform: scale(1.03);
          }
          50% {
            transform: scale(1.06);
          }
          75% {
            transform: scale(1.03);
          }
        }
        .animate-voiceSpeakingOrbInline {
          animation: voiceSpeakingOrbInline 0.8s ease-in-out infinite;
        }

        @keyframes voiceWaveAnimInline {
          0%, 100% {
            transform: scaleY(0.5);
            opacity: 0.6;
          }
          50% {
            transform: scaleY(1);
            opacity: 1;
          }
        }

        @keyframes voiceBarAnimInline {
          0%, 100% {
            transform: scaleY(0.4);
            opacity: 0.6;
          }
          50% {
            transform: scaleY(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default LiveVoiceMode;
