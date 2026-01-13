import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";

// ⭐ SDK IMPORTS - Using OpenAI JavaScript SDK with Azure Realtime API support
// Reference: https://devblogs.microsoft.com/azure-sdk/introducing-azure-openai-realtime-api-support-in-javascript/
import { OpenAIRealtimeWebSocket } from "openai/beta/realtime/websocket";
import { AzureOpenAI } from "openai";

// Import audio utilities
import {
  base64ToArrayBuffer,
  arrayBufferToBase64,
  float32ToPcm16,
  isPhantomTranscription,
  AUDIO_CONSTRAINTS,
  generateBreathBuffer,
  shouldAddBreath,
  BREATH_CONFIG,
} from "./voiceAudioUtils";

// Import session configuration
import {
  AZURE_ENDPOINT,
  API_VERSION,
  MODEL,
  SPEECH_TOKEN_API,
  RAG_API_ENDPOINT,
  getSessionConfig,
  DEFAULT_TURN_DETECTION,
  GREETING_CONFIG,
} from "./voiceSessionConfig";

// Module-level connection tracker - persists across component remounts
let globalConnectionActive = false;
let globalRealtimeClient = null;
let globalHasGreeted = false;
let globalHasHadConversation = false; // Tracks if user has had a conversation (persists across reconnects)

/**
 * LiveVoiceMode - Inline voice chat component that fits within input box
 * Handles speech-to-speech conversation with Azure OpenAI Realtime API
 * 
 * ⭐ MIGRATED: Now uses OpenAI JavaScript SDK with Azure Realtime API support
 * Reference: https://devblogs.microsoft.com/azure-sdk/introducing-azure-openai-realtime-api-support-in-javascript/
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
  const [fatalError, setFatalError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState([0, 0, 0, 0, 0]);
  const [sessionKey, setSessionKey] = useState(null);

  // Refs for Realtime SDK client and Audio
  const rtRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const currentTranscriptRef = useRef("");
  const currentAiResponseRef = useRef("");
  const hasGreetedRef = useRef(false);
  const currentAiTextRef = useRef("");
  const currentAiTextSavedRef = useRef(false);
  const typingIndicatorClearedRef = useRef(false);

  // Additional refs to prevent duplicate handling
  const voiceStateRef = useRef("idle");
  const isCapturingRef = useRef(false);
  const currentResponseIdRef = useRef(null);
  const lastProcessedItemIdRef = useRef(null);
  const lastProcessedResponseIdRef = useRef(null);
  const isProcessingResponseRef = useRef(false);
  const isConnectingRef = useRef(false);
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));
  const sourceNodeRef = useRef(null);
  const connectRealtimeRef = useRef(null);
  const cleanupRef = useRef(null);
  const updateVoiceStateRef = useRef(null);
  const hasShownChatRef = useRef(false);
  const isResponseDoneRef = useRef(false);
  const currentAudioSourceRef = useRef(null);
  const interruptedResponseIdRef = useRef(null);
  const isInitialConnectionRef = useRef(true);
  const isReconnectingRef = useRef(false);
  const lastInterruptTimeRef = useRef(0);

  // Token management refs
  const tokenRef = useRef(null);
  const expiresAtRef = useRef(null);
  const tokenRefreshTimerRef = useRef(null);
  const isFetchingTokenRef = useRef(false);

  // Audio processing refs
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const canSendAudioRef = useRef(true);
  const sessionKeyRef = useRef(null);

  // Helper to update voice state and ref together
  const updateVoiceState = useCallback((newState) => {
    if (voiceStateRef.current !== newState) {
      voiceStateRef.current = newState;
      setVoiceState(newState);
    }
  }, []);

  // Initialize session key from sessionStorage
  useEffect(() => {
    const existingKey = sessionStorage.getItem("session_key");
    if (existingKey) {
      setSessionKey(existingKey);
      sessionKeyRef.current = existingKey;
    }
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  // Get or create RAG session key
  const getOrCreateSessionKey = useCallback(async () => {
    if (sessionKeyRef.current) {
      return sessionKeyRef.current;
    }

    try {
      const response = await fetch(RAG_API_ENDPOINT, { method: "GET" });
      if (!response.ok) {
        throw new Error("Failed to retrieve session key");
      }
      const data = await response.json();
      if (data.session_key) {
        sessionStorage.setItem("session_key", data.session_key);
        setSessionKey(data.session_key);
        sessionKeyRef.current = data.session_key;
        return data.session_key;
      }
      throw new Error("No session key in response");
    } catch (error) {
      console.error(`[${instanceIdRef.current}] Error creating RAG session:`, error);
      return null;
    }
  }, []);

  // Execute function calls from the AI
  const executeFunctionCall = useCallback(
    async (callId, functionName, args) => {
      try {
        let result;

        if (functionName === "search_techjays_knowledge") {
          updateVoiceState("processing");
          const currentSessionKey = await getOrCreateSessionKey();

          if (!currentSessionKey) {
            throw new Error("Failed to obtain session key");
          }

          const response = await fetch(RAG_API_ENDPOINT, {
              method: "POST",
            headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_key: currentSessionKey,
                question: args.query,
              }),
          });

          if (!response.ok) {
            throw new Error("Failed to fetch from knowledge base");
          }
          updateVoiceState("processing");

          const data = await response.json();

          if (data.result && data.response && data.response.text) {
            if (data.session_key) {
              sessionStorage.setItem("session_key", data.session_key);
              setSessionKey(data.session_key);
              sessionKeyRef.current = data.session_key;
            }

            let botMessage = data.response.text;

            if (data.response.links && data.response.links.length > 0) {
              const linkTexts = botMessage.split(", ");
              let formattedLinks = "\n\nRelevant links:\n";
              data.response.links.forEach((link, index) => {
                const cleanedLink = link.replace(/<|>|\[|\]/g, "");
                const linkText = linkTexts[index] ? linkTexts[index].trim() : `Link ${index + 1}`;
                formattedLinks += `- ${linkText}: ${cleanedLink}\n`;
              });
              botMessage += formattedLinks;
            }

            botMessage = botMessage.replace(/<link>/g, "").replace(/, $/, "");
            botMessage = botMessage.replace(/\s*\.:\s*/g, "");

            result = {
              success: true,
              answer: botMessage,
              sources: data.response.links || [],
            };
          } else {
            throw new Error("Invalid response format from knowledge base");
          }
        } else {
          result = { success: false, error: `Unknown function: ${functionName}` };
        }

        if (rtRef.current) {
          rtRef.current.send({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result),
              },
          });
          rtRef.current.send({ type: "response.create" });
        }
      } catch (error) {
        console.error(`[${instanceIdRef.current}] Function execution error:`, error);
        if (rtRef.current) {
          rtRef.current.send({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
              output: JSON.stringify({ success: false, error: error.message }),
            },
          });
          rtRef.current.send({ type: "response.create" });
        }
      }
    },
    [getOrCreateSessionKey, updateVoiceState]
  );

  // Fetch speech token from API
  const fetchSpeechToken = useCallback(async () => {
    if (isFetchingTokenRef.current) {
      let attempts = 0;
      const MAX_WAIT_ATTEMPTS = 50;
      while (isFetchingTokenRef.current && attempts < MAX_WAIT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      if (attempts >= MAX_WAIT_ATTEMPTS) {
        throw new Error("Token fetch timeout - another fetch is taking too long");
      }
      return tokenRef.current ? { token: tokenRef.current } : null;
    }

    isFetchingTokenRef.current = true;

    try {
      const response = await fetch(SPEECH_TOKEN_API);
      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      tokenRef.current = data.token;
      expiresAtRef.current = data.expiresAt ? new Date(data.expiresAt) : null;

      const expiresIn = data.expiresIn ||
        (data.expiresAt ? Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000) : 1200);

      const refreshIn = Math.min(3600, Math.max(0, expiresIn - 300));

      if (expiresIn < 600) {
        console.warn(`[${instanceIdRef.current}] ⚠️ Token expiring soon: ${expiresIn}s remaining`);
      }

      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }

      tokenRefreshTimerRef.current = setTimeout(() => {
        tokenRefreshTimerRef.current = null;
        fetchSpeechToken();
      }, refreshIn * 1000);

      isFetchingTokenRef.current = false;
      return { token: data.token };
    } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to fetch token:`, err);
      isFetchingTokenRef.current = false;
      throw err;
    }
  }, []);

  // Centralized interrupt function
  const interruptAgent = useCallback(
    (reason = "user_action", keepBuffer = false) => {
      const now = Date.now();
      if (now - lastInterruptTimeRef.current < 500) {
        console.log(`[${instanceIdRef.current}] ⏸️ Interrupt debounced (too soon)`);
        return false;
      }
      lastInterruptTimeRef.current = now;

      if (voiceStateRef.current !== "speaking" && !isProcessingResponseRef.current) {
        console.log(`[${instanceIdRef.current}] ℹ️ Nothing to interrupt - agent not speaking`);
        return false;
      }

      console.log(`[${instanceIdRef.current}] 🛑 Interrupting agent (${reason})`);

      if (isProcessingResponseRef.current && currentAiTextRef.current.trim() === "") {
        typingIndicatorClearedRef.current = true;
      }

      // Stop current audio source
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop();
          currentAudioSourceRef.current.disconnect();
          currentAudioSourceRef.current = null;
        } catch (err) {
          console.warn(`[${instanceIdRef.current}] ⚠️ Audio stop error:`, err.message);
        }
      }

      // Clear audio queue
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      // Clear input buffer if needed
      if (rtRef.current && !keepBuffer) {
        try {
          rtRef.current.send({ type: "input_audio_buffer.clear" });
          } catch (err) {
          console.warn(`[${instanceIdRef.current}] ⚠️ Buffer clear failed:`, err.message);
        }
      }

      // Cancel AI's current response
      if (rtRef.current && currentResponseIdRef.current && !isResponseDoneRef.current) {
        try {
          rtRef.current.send({ type: "response.cancel", response_id: currentResponseIdRef.current });
          } catch (err) {
          console.warn(`[${instanceIdRef.current}] ⚠️ Cancel request failed:`, err.message);
        }
      }

      // Reset turn detection
      setTimeout(() => {
        if (rtRef.current) {
          try {
            rtRef.current.send({ type: "session.update", session: { turn_detection: DEFAULT_TURN_DETECTION } });
          } catch (err) {
            console.warn(`[${instanceIdRef.current}] ⚠️ Turn detection reset failed:`, err.message);
          }
        }
      }, 100);

      // Reset state flags
      currentResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isResponseDoneRef.current = false;
      canSendAudioRef.current = true;
      currentTranscriptRef.current = "";
      setTranscript("");
      updateVoiceState("listening");
      setAiResponse("");
      currentAiResponseRef.current = "";

      return true;
    },
    [updateVoiceState]
  );

  // Clear the input audio buffer
  const clearInputAudioBuffer = useCallback(() => {
    if (rtRef.current) {
      rtRef.current.send({ type: "input_audio_buffer.clear" });
    }
  }, []);

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

      if (voiceStateRef.current === "listening") {
        analyser.getByteFrequencyData(dataArray);
        const bandSize = Math.floor(bufferLength / 5);
        const frequencyBands = [];

        for (let i = 0; i < 5; i++) {
          const start = i * bandSize;
          const end = start + bandSize;
          let sum = 0, max = 0, peakCount = 0;

          for (let j = start; j < end && j < bufferLength; j++) {
            const value = dataArray[j];
            sum += value;
            max = Math.max(max, value);
            if (value > 128) peakCount++;
          }

          const avg = sum / bandSize;
          const peakFactor = Math.min(peakCount / bandSize, 1);
          const normalized = (max * 0.6 + avg * 0.3 + peakFactor * 255 * 0.1) / 255;
          const scaled = Math.pow(Math.max(0, normalized), 0.55);
          const maxHeight = i === 2 || i === 3 ? 24 : 20;
          const height = 4 + scaled * (maxHeight - 4);
          frequencyBands.push(height);
        }

        setFrequencyData(frequencyBands);
      } else {
        setFrequencyData((prev) => prev.map((val) => Math.max(0, val * 0.85)));
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, []);

  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    [sourceNodeRef, analyserRef, workletNodeRef].forEach((nodeRef) => {
      if (nodeRef.current) {
        try { nodeRef.current.disconnect(); } catch (e) { /* ignore */ }
        nodeRef.current = null;
      }
    });

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try { audioContextRef.current.close(); } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }

    isCapturingRef.current = false;
    setAudioLevel(0);
    setFrequencyData([0, 0, 0, 0, 0]);
  }, []);

  // Start capturing audio from microphone
  const startAudioCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    stopAudioCapture();

    isCapturingRef.current = true;
    canSendAudioRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (rtRef.current && voiceStateRef.current !== "processing") {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);
          const base64Audio = arrayBufferToBase64(pcm16.buffer);

          try {
            rtRef.current.send({ type: "input_audio_buffer.append", audio: base64Audio });
          } catch (err) {
            console.error(`[${instanceIdRef.current}] Error sending audio:`, err);
          }
        }
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);
      workletNodeRef.current = processor;

      startFrequencyAnalysis();
    } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to start audio capture:`, err.name, err.message);
      isCapturingRef.current = false;

      if (err.name === "NotAllowedError") {
        setError("Microphone blocked. Please allow microphone in browser.");
      } else if (err.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone.");
      } else {
        setError(`Microphone error: ${err.message || err.name}`);
      }
    }
  }, [stopAudioCapture, startFrequencyAnalysis]);

  // Track if this is the first audio chunk of a new response (for breath injection)
  const isFirstChunkOfResponseRef = useRef(true);

  // Play audio from queue
  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      if (!isPlayingRef.current) break;
      const audioData = audioQueueRef.current.shift();

      try {
        await playAudioBuffer(audioData);
      } catch (error) {
        console.error(`[${instanceIdRef.current}] Audio playback error:`, error);
      }
      if (!isPlayingRef.current) break;
    }

    isPlayingRef.current = false;
  }, []);

  // Wait for audio playback to finish
  const waitForAudioToFinish = useCallback(() => {
    return new Promise((resolve) => {
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        setTimeout(() => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) resolve();
        }, 200);
        return;
      }

      let consecutiveEmptyChecks = 0;
      const checkInterval = setInterval(() => {
        if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
          consecutiveEmptyChecks++;
          if (consecutiveEmptyChecks >= 3) {
            clearInterval(checkInterval);
            resolve();
          }
        } else {
          consecutiveEmptyChecks = 0;
        }
      }, 100);

      setTimeout(() => { clearInterval(checkInterval); resolve(); }, 600000);
    });
  }, []);

  // Play a single audio buffer
  const playAudioBuffer = useCallback((arrayBuffer) => {
    return new Promise((resolve, reject) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }

      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      currentAudioSourceRef.current = source;

      source.onended = () => { currentAudioSourceRef.current = null; resolve(); };
      source.onerror = (error) => { currentAudioSourceRef.current = null; reject(error); };
      source.start();
    });
  }, []);

  // Handle interrupt button click
  const handleInterrupt = useCallback(() => {
    interruptAgent("button_click");
  }, [interruptAgent]);

  // Setup event handlers for the realtime client
  const setupEventHandlers = useCallback((rt) => {
    // WebSocket-level events
    rt.socket.addEventListener('open', () => {
      console.log(`[${instanceIdRef.current}] Connection opened!`);
      isConnectingRef.current = false;
      globalConnectionActive = true;

      rt.send({ type: "session.update", session: getSessionConfig() });

        if (onShowChat && !hasShownChatRef.current) {
          hasShownChatRef.current = true;
          onShowChat();
        }

        if (!hasGreetedRef.current && !globalHasGreeted) {
          setTimeout(() => {
          if (rtRef.current) {
            // Use welcome back message if user had a previous conversation, otherwise use full greeting
            const greetingMessage = globalHasHadConversation 
              ? GREETING_CONFIG.welcomeBackMessage 
              : GREETING_CONFIG.message;
            
            rt.send({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                content: [{ type: "input_text", text: greetingMessage }],
              },
            });
            rt.send({ type: "response.create" });
              hasGreetedRef.current = true;
            globalHasGreeted = true;
            globalHasHadConversation = true; // Mark that user has had a conversation
            updateVoiceState("speaking");
            }
        }, GREETING_CONFIG.delay);
        } else {
          updateVoiceState("listening");
        }

      if (!isCapturingRef.current) startAudioCapture();
    });

    rt.socket.addEventListener('close', (event) => {
        isConnectingRef.current = false;
      console.log(`[${instanceIdRef.current}] Connection closed. Code: ${event.code}`);

        if (event.code === 1000) {
        rtRef.current = null;
          globalConnectionActive = false;
        globalRealtimeClient = null;

          if (isActive && voiceStateRef.current !== "idle") {
            setTimeout(() => {
            if (isActive && connectRealtimeRef.current && !rtRef.current) {
              connectRealtimeRef.current();
              }
            }, 500);
          }
          return;
        }

      const timeSinceLastInterrupt = Date.now() - lastInterruptTimeRef.current;
      if (event.code === 1006 && (timeSinceLastInterrupt < 3000 || isProcessingResponseRef.current)) {
        rtRef.current = null;
          globalConnectionActive = false;
        globalRealtimeClient = null;
          isProcessingResponseRef.current = false;
          isResponseDoneRef.current = true;

        if (voiceStateRef.current !== "idle" && voiceStateRef.current !== "processing") {
            updateVoiceState("listening");
          }

          setTimeout(() => {
          if (isActive && connectRealtimeRef.current && !rtRef.current) {
            connectRealtimeRef.current();
            }
          }, 500);
          return;
        }

      if (isReconnectingRef.current) return;

      if (isActive && voiceStateRef.current !== "idle") {
          isReconnectingRef.current = true;
        setTimeout(() => {
          rtRef.current = null;
            globalConnectionActive = false;
          globalRealtimeClient = null;
            isConnectingRef.current = false;

          if (connectRealtimeRef.current) {
            connectRealtimeRef.current()
              .then(() => { isReconnectingRef.current = false; })
              .catch(() => {
                  isReconnectingRef.current = false;
                  setError("Connection lost. Please try again.");
                  updateVoiceState("idle");
                });
            } else {
              isReconnectingRef.current = false;
            }
        }, 500);
        } else {
          cleanup(false);
          globalConnectionActive = false;
        globalRealtimeClient = null;
      }
    });

    rt.socket.addEventListener('error', () => {
      isConnectingRef.current = false;
      setError("Connection error. Please try again.");
      updateVoiceState("idle");
    });

    // SDK event handlers
    rt.on('session.created', () => {});
    rt.on('session.updated', () => {});

    rt.on('input_audio_buffer.speech_started', () => {
          if (currentResponseIdRef.current) {
            interruptedResponseIdRef.current = currentResponseIdRef.current;
      }

      if (isProcessingResponseRef.current && currentAiTextRef.current.trim() === "") {
            typingIndicatorClearedRef.current = true;
          }

      if (currentAiTextRef.current.trim() !== "" && !currentAiTextSavedRef.current) {
            if (onAddMessage) {
          onAddMessage({ type: "ai", text: currentAiTextRef.current + "...", isVoice: true, isStreaming: false });
          currentAiTextSavedRef.current = true;
        }
      }

      interruptAgent("vad_speech", true);
          currentAiTextRef.current = "";
          setAiResponse("");
          updateVoiceState("listening");
          currentTranscriptRef.current = "";
          setTranscript("");
    });

    rt.on('input_audio_buffer.speech_stopped', () => {
      if (!isProcessingResponseRef.current) updateVoiceState("processing");
    });

    rt.on('input_audio_buffer.committed', () => {});
    rt.on('conversation.item.created', () => {});

    rt.on('conversation.item.input_audio_transcription.completed', (event) => {
      const itemId = event.item_id;
      if (itemId && itemId === lastProcessedItemIdRef.current) return;

      if (event.transcript) {
        if (isPhantomTranscription(event.transcript)) {
          console.log(`[${instanceIdRef.current}] 🚫 Ignoring phantom transcription`);
              return;
            }

            lastProcessedItemIdRef.current = itemId;
        currentTranscriptRef.current = event.transcript;
        setTranscript(event.transcript);

        if (onAddMessage) {
          onAddMessage({ type: "user", text: event.transcript, isVoice: true });
              typingIndicatorClearedRef.current = false;
            }

            if (onShowChat && !hasShownChatRef.current) {
              hasShownChatRef.current = true;
              onShowChat();
            }
          }
    });

    rt.on('response.created', (event) => {
      const newResponseId = event.response?.id;
          if (newResponseId) {
        if (newResponseId === currentResponseIdRef.current) return;

        if (interruptedResponseIdRef.current && interruptedResponseIdRef.current !== newResponseId) {
              interruptedResponseIdRef.current = null;
            }

            currentResponseIdRef.current = newResponseId;
            isProcessingResponseRef.current = true;
        isResponseDoneRef.current = false;
        canSendAudioRef.current = false;
            currentAiTextRef.current = "";
            currentAiTextSavedRef.current = false;
        typingIndicatorClearedRef.current = false;
        // 🌬️ Reset breath flag for new response - Teja will take a breath before speaking
        isFirstChunkOfResponseRef.current = true;
            updateVoiceState("processing");
            clearInputAudioBuffer();
      }
    });

    rt.on('response.audio_transcript.delta', (event) => {
      const deltaResponseId = event.response_id || event.response?.id;

      if (deltaResponseId && deltaResponseId === interruptedResponseIdRef.current) return;

      if (voiceStateRef.current !== "speaking") updateVoiceState("speaking");

      if (event.delta) currentAiTextRef.current += event.delta;

      if (event.delta && deltaResponseId === currentResponseIdRef.current && deltaResponseId !== lastProcessedResponseIdRef.current) {
        currentAiResponseRef.current += event.delta;
            setAiResponse(currentAiResponseRef.current);

            if (onAddMessage && currentAiResponseRef.current) {
              onAddMessage({
                type: "ai",
                text: currentAiResponseRef.current,
                isVoice: true,
            isStreaming: true,
            isTyping: false,
            replaceTyping: true,
          });
        }
      }
    });

    rt.on('response.audio_transcript.done', (event) => {
      const responseId = event.response_id || event.response?.id;

      if (responseId && responseId === interruptedResponseIdRef.current) return;
      if (responseId && responseId === lastProcessedResponseIdRef.current) return;
      if (responseId && responseId !== currentResponseIdRef.current) return;

          const transcriptText = currentAiTextRef.current.trim();
          if (!transcriptText) {
            currentAiResponseRef.current = "";
            return;
          }

      if (responseId) lastProcessedResponseIdRef.current = responseId;

      if (onAddMessage && transcriptText && !currentAiTextSavedRef.current) {
            onAddMessage({
              type: "ai",
              text: transcriptText,
              isVoice: true,
          isStreaming: false,
          isTyping: false,
          replaceTyping: true,
        });
            currentAiTextSavedRef.current = true;
          }

          currentAiResponseRef.current = "";
    });

    rt.on('response.audio.delta', (event) => {
      if (voiceStateRef.current !== "speaking") updateVoiceState("speaking");

      const audioResponseId = event.response_id || event.response?.id;
      if (event.delta && audioResponseId === currentResponseIdRef.current) {
        const audioData = base64ToArrayBuffer(event.delta);
        
        // 🌬️ Inject breath BEFORE the first audio chunk of a response
        // This makes Teja sound like she's taking a breath before speaking
        if (isFirstChunkOfResponseRef.current && shouldAddBreath(null, audioData)) {
          const breathBuffer = generateBreathBuffer();
          audioQueueRef.current.push(breathBuffer);
          isFirstChunkOfResponseRef.current = false;
        }
        
            audioQueueRef.current.push(audioData);
            playAudioQueue();
          }
    });

    rt.on('response.audio.done', () => {});

    rt.on('response.function_call_arguments.delta', () => {
      if (voiceStateRef.current !== "processing") updateVoiceState("processing");
    });

    rt.on('response.function_call_arguments.done', (event) => {
      const callId = event.call_id;
      const functionName = event.name;

      try {
        const functionArgs = JSON.parse(event.arguments);
            executeFunctionCall(callId, functionName, functionArgs);
          } catch (error) {
        console.error(`[${instanceIdRef.current}] Failed to parse function arguments:`, error);
        if (rtRef.current) {
          rtRef.current.send({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
              output: JSON.stringify({ success: false, error: "Failed to parse function arguments" }),
                  },
          });
            }
          }
    });

    rt.on('response.done', () => {
          isResponseDoneRef.current = true;
          clearInputAudioBuffer();

          const finalText = currentAiTextRef.current.trim();
      if (finalText !== "" && !currentAiTextSavedRef.current && onAddMessage) {
        onAddMessage({ type: "ai", text: finalText });
      }

          waitForAudioToFinish().then(() => {
            setTimeout(() => {
              isProcessingResponseRef.current = false;
              currentResponseIdRef.current = null;
          canSendAudioRef.current = true;
              currentAiTextRef.current = "";
              setAiResponse("");

          if (voiceStateRef.current !== "idle" && voiceStateRef.current !== "processing") {
                updateVoiceState("listening");
              }
        }, 300);
      });
    });

    rt.on('error', (event) => {
      const error = event.error || event;

      if (error?.code === "response_cancel_not_active" || error?.message?.includes("no active response") || error?.message?.includes("cancel")) {
        if (isProcessingResponseRef.current && currentAiTextRef.current.trim() === "") {
              typingIndicatorClearedRef.current = true;
            }
            isResponseDoneRef.current = true;
            isProcessingResponseRef.current = false;
            canSendAudioRef.current = true;
        if (voiceStateRef.current === "speaking") updateVoiceState("listening");
        return;
      }

      console.error("API Error:", error);
            const errorText = currentAiTextRef.current.trim();
            if (isProcessingResponseRef.current && onAddMessage && errorText) {
        onAddMessage({ type: "ai", text: errorText, isVoice: true, isTyping: false, isStreaming: false });
      }
            if (isProcessingResponseRef.current && !errorText) {
              typingIndicatorClearedRef.current = true;
            }
      setError(error?.message || "An error occurred");
            isProcessingResponseRef.current = false;
            canSendAudioRef.current = true;
    });
  }, [
      onAddMessage,
      onShowChat,
      updateVoiceState,
      clearInputAudioBuffer,
      executeFunctionCall,
      interruptAgent,
    startAudioCapture,
    playAudioQueue,
    waitForAudioToFinish,
    isActive,
  ]);

  // Initialize Realtime SDK connection
  const connectRealtime = useCallback(async () => {
    if (rtRef.current?.socket?.readyState === WebSocket.OPEN) return;
    if (rtRef.current?.socket?.readyState === WebSocket.CONNECTING) return;
    if (isConnectingRef.current) return;

    isConnectingRef.current = true;
    updateVoiceState("connecting");
    setError(null);

    try {
      const tokenData = await fetchSpeechToken();
      if (!tokenData || !tokenData.token) {
        throw new Error("Failed to obtain authentication token");
      }

      const azureClient = new AzureOpenAI({
        azureADTokenProvider: async () => tokenData.token,
        apiVersion: API_VERSION,
        deployment: MODEL,
        endpoint: `https://${AZURE_ENDPOINT}`,
        dangerouslyAllowBrowser: true,
      });

      const rt = await OpenAIRealtimeWebSocket.azure(azureClient);
      rtRef.current = rt;
      globalRealtimeClient = rt;
      setupEventHandlers(rt);
          } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to connect:`, err);
      isConnectingRef.current = false;
      setError("Failed to connect. Please try again.");
      updateVoiceState("idle");
    }
  }, [fetchSpeechToken, updateVoiceState, setupEventHandlers]);

  // Cleanup resources
  const cleanup = useCallback(
    (shouldCloseConnection = true) => {
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop();
          currentAudioSourceRef.current.disconnect();
          currentAudioSourceRef.current = null;
        } catch (e) { /* ignore */ }
      }

      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }

      stopAudioCapture();

      if (rtRef.current && shouldCloseConnection) {
        try { rtRef.current.close(); } catch (e) { /* ignore */ }
        rtRef.current = null;
        globalConnectionActive = false;
        globalRealtimeClient = null;
      }

      audioQueueRef.current = [];
      isPlayingRef.current = false;
      currentResponseIdRef.current = null;
      lastProcessedItemIdRef.current = null;
      lastProcessedResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isResponseDoneRef.current = false;
      isConnectingRef.current = false;
      canSendAudioRef.current = true;

      if (shouldCloseConnection) {
        tokenRef.current = null;
        expiresAtRef.current = null;
        isFetchingTokenRef.current = false;
      }
    },
    [stopAudioCapture]
  );

  // End session
  const handleEndSession = () => {
    cleanup(true);
    updateVoiceState("idle");
    setTranscript("");
    setAiResponse("");
    setError(null);
    setFatalError(null);
    setAudioLevel(0);
    currentTranscriptRef.current = "";
    currentAiResponseRef.current = "";
    hasStartedRef.current = false;
    hasGreetedRef.current = false;
    globalHasGreeted = false;
    lastProcessedItemIdRef.current = null;
    lastProcessedResponseIdRef.current = null;
    isProcessingResponseRef.current = false;
    isConnectingRef.current = false;
    isReconnectingRef.current = false;
    canSendAudioRef.current = true;
    hasShownChatRef.current = false;
    isInitialConnectionRef.current = true;
    onClose();
  };

  // Update refs whenever functions change
  useEffect(() => {
    connectRealtimeRef.current = connectRealtime;
    cleanupRef.current = cleanup;
    updateVoiceStateRef.current = updateVoiceState;
  }, [connectRealtime, cleanup, updateVoiceState]);

  // Cleanup token refresh timer on unmount
  useEffect(() => {
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Watchdog: Detect stuck "Listening" state
  useEffect(() => {
    if (!isActive) return;

    const watchdogInterval = setInterval(() => {
      const isListening = voiceStateRef.current === "listening";
      const noConnection = !rtRef.current || rtRef.current.socket?.readyState !== WebSocket.OPEN;
      const notConnecting = !isConnectingRef.current;
      const notReconnecting = !isReconnectingRef.current;

      if (isListening && noConnection && notConnecting && notReconnecting) {
        console.warn(`[${instanceIdRef.current}] ⚠️ WATCHDOG: Stuck in Listening - attempting recovery...`);
        if (connectRealtimeRef.current) connectRealtimeRef.current();
      }
    }, 3000);

    return () => clearInterval(watchdogInterval);
  }, [isActive]);

  // Session management
  useEffect(() => {
    const currentIsActive = isActive;

    if (!currentIsActive) {
      if (hasStartedRef.current && cleanupRef.current) {
          cleanupRef.current(true);
        hasStartedRef.current = false;
      }
      return;
    }

    if (globalConnectionActive && globalRealtimeClient) {
      if (!rtRef.current && globalRealtimeClient.socket?.readyState === WebSocket.OPEN) {
        rtRef.current = globalRealtimeClient;
      }

      if (globalRealtimeClient.socket?.readyState === WebSocket.OPEN) {
        rtRef.current = globalRealtimeClient;
        hasStartedRef.current = true;
        if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
          updateVoiceStateRef.current("listening");
        }
        return;
      }

      if (globalRealtimeClient.socket?.readyState === WebSocket.CONNECTING) {
        rtRef.current = globalRealtimeClient;
        hasStartedRef.current = true;
        if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
          updateVoiceStateRef.current("connecting");
        }
        return;
      }
    }

    if (rtRef.current?.socket?.readyState === WebSocket.OPEN) {
      hasStartedRef.current = true;
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("listening");
      }
      return;
    }

    if (rtRef.current?.socket?.readyState === WebSocket.CONNECTING) {
      hasStartedRef.current = true;
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("connecting");
      }
      return;
    }

    if (isCapturingRef.current || hasStartedRef.current) {
      hasStartedRef.current = true;
      return;
    }

    hasStartedRef.current = true;

    if (updateVoiceStateRef.current && voiceStateRef.current === "idle") {
      updateVoiceStateRef.current("connecting");
    }

    if (connectRealtimeRef.current) connectRealtimeRef.current();

    return () => {
      if (!currentIsActive && hasStartedRef.current && cleanupRef.current) {
          cleanupRef.current(true);
        hasStartedRef.current = false;
      }
    };
  }, [isActive]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isActive) handleEndSession();
    };

    if (isActive) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  const getStatusText = () => {
    if (error) return error;
    switch (voiceState) {
      case "connecting": return "Connecting...";
      case "listening": return "Listening...";
      case "processing": return "Searching...";
      case "speaking": return "";
      default:
        if (isActive && (rtRef.current?.socket?.readyState === WebSocket.OPEN || globalConnectionActive)) {
          return "Listening...";
        }
        return "Ready";
    }
  };

  // Error boundary UI
  if (fatalError) {
    return (
      <div className="flex items-center justify-between w-full gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Voice assistant encountered an error.</p>
          <p className="text-xs text-red-600 mt-1">{fatalError}</p>
        </div>
        <button
          onClick={() => { setFatalError(null); handleEndSession(); }}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
        >
          Reset
        </button>
      </div>
    );
  }

  if (!isActive) return null;

  return (
    <div className="flex items-center justify-between w-full gap-3 animate-voiceFadeIn">
      {/* Voice Orb */}
      <div className="relative flex-shrink-0">
        <div
          className={`absolute inset-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full blur-md ${
            voiceState === "listening" ? "animate-voicePulseInline" : voiceState === "speaking" ? "animate-voiceSpeakingPulseInline" : ""
          }`}
          style={{
            background: voiceState === "speaking"
                ? "linear-gradient(to right, #22d3ee, #60a5fa)"
              : error ? "linear-gradient(to right, #ef4444, #dc2626)" : "linear-gradient(to right, #818cf8, #6366f1)",
            opacity: 0.4,
          }}
        />

        <div
          className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden ${
            voiceState === "listening" ? "animate-voiceOrbInline" : voiceState === "speaking" ? "animate-voiceSpeakingOrbInline" : ""
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
          {voiceState === "listening" && !error && (
            <div className="flex items-center justify-center gap-0.5">
              {frequencyData.map((height, index) => (
                <span key={index} style={{ display: "block", width: "2px", height: `${height}px`, minHeight: "4px", background: "white", borderRadius: "2px", transition: "height 0.1s ease-out", transformOrigin: "bottom" }} />
              ))}
            </div>
          )}

          {voiceState === "speaking" && !error && (
            <div className="flex items-center justify-center gap-0.5">
              {[8, 14, 18, 14, 8].map((height, index) => (
                <span key={index} style={{ display: "block", width: "2.5px", height: `${height}px`, background: "white", borderRadius: "2px", animation: "voiceBarAnimInline 0.6s ease-in-out infinite", animationDelay: `${index * 0.08}s` }} />
              ))}
            </div>
          )}

          {(voiceState === "processing" || voiceState === "connecting") && !error && (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}

          {(voiceState === "idle" || error) && <Mic className="w-4 h-4 text-white" />}
        </div>
      </div>

      {/* Status text */}
      <div className="flex-1 text-center min-w-0">
        <p className={`text-sm sm:text-base font-medium truncate ${error ? "text-red-500" : "text-gray-700"}`}>
          {getStatusText()}
        </p>
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {voiceState === "speaking" && (
          <button onClick={handleInterrupt} className="p-1.5 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:scale-105" title="Interrupt">
            <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
          </button>
        )}

        <button onClick={handleEndSession} className="p-1.5 sm:p-2 rounded-full transition-all duration-200 hover:scale-105" style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" }} title="End Session">
          <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
        </button>
      </div>

      {/* Styles */}
      <style>{`
        @keyframes voiceFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-voiceFadeIn { animation: voiceFadeIn 0.2s ease-out; }
        @keyframes voicePulseInline { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.15); opacity: 0.5; } }
        .animate-voicePulseInline { animation: voicePulseInline 1.5s ease-in-out infinite; }
        @keyframes voiceOrbInline { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .animate-voiceOrbInline { animation: voiceOrbInline 1.5s ease-in-out infinite; }
        @keyframes voiceSpeakingPulseInline { 0%, 100% { transform: scale(1); opacity: 0.35; } 50% { transform: scale(1.2); opacity: 0.5; } }
        .animate-voiceSpeakingPulseInline { animation: voiceSpeakingPulseInline 1s ease-in-out infinite; }
        @keyframes voiceSpeakingOrbInline { 0%, 100% { transform: scale(1); } 25% { transform: scale(1.03); } 50% { transform: scale(1.06); } 75% { transform: scale(1.03); } }
        .animate-voiceSpeakingOrbInline { animation: voiceSpeakingOrbInline 0.8s ease-in-out infinite; }
        @keyframes voiceBarAnimInline { 0%, 100% { transform: scaleY(0.4); opacity: 0.6; } 50% { transform: scaleY(1.2); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default LiveVoiceMode;
