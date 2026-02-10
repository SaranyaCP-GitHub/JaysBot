import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Sparkles } from "lucide-react";

/**
 * ⭐ Azure VoiceLive SDK POC
 * Reference: https://learn.microsoft.com/en-us/javascript/api/overview/azure/ai-voicelive-readme
 * 
 * Uses Azure AD or API Key authentication with VoiceLive SDK for:
 * - Built-in noise suppression (azure_deep_noise_suppression)
 * - Echo cancellation (server_echo_cancellation)
 * - Semantic VAD (azure_semantic_vad)
 * - Stable WebSocket connection management
 * 
 * IMPORTANT: VoiceLive SDK requires tokens with scope: https://cognitiveservices.azure.com/.default
 * If your token has a different audience (like https://ai.azure.com), use API key auth instead.
 */
import { VoiceLiveClient } from "@azure/ai-voicelive";
import { AzureKeyCredential } from "@azure/core-auth";

// Import audio utilities
import {
  base64ToArrayBuffer,
  arrayBufferToBase64,
  float32ToPcm16,
  isPhantomTranscription,
  AUDIO_CONSTRAINTS,
} from "./voiceAudioUtils";

// Import session configuration
import {
  AZURE_ENDPOINT,
  MODEL,
  RAG_API_ENDPOINT,
  GREETING_CONFIG,
  SPEECH_TOKEN_API,
} from "./voiceSessionConfig";

// ⭐ VoiceLive Configuration
// Option 1: Use API Key (recommended if your AD token has wrong audience)
const VOICELIVE_API_KEY = import.meta.env.VITE_VOICELIVE_API_KEY || "";
// Option 2: Use Azure AD token (requires token with scope: https://cognitiveservices.azure.com/.default)
const USE_API_KEY_AUTH = !!VOICELIVE_API_KEY;

// Module-level state
let globalConnectionActive = false;
let globalHasGreeted = false;
let globalHasHadConversation = false;

/**
 * Custom TokenCredential for Azure AD tokens from your API
 * Implements the TokenCredential interface required by Azure SDKs
 * 
 * Reference: https://learn.microsoft.com/en-us/javascript/api/@azure/core-auth/tokencredential
 */
class AzureADTokenCredential {
  constructor(tokenFetcher) {
    this.tokenFetcher = tokenFetcher;
    this.cachedToken = null;
    this.expiresAt = null;
  }

  /**
   * Gets the token used for authentication.
   * @param {string | string[]} scopes - The scopes for which the token is valid
   * @param {object} options - Optional options
   * @returns {Promise<{token: string, expiresOnTimestamp: number}>}
   */
  async getToken(scopes, options) {
    console.log("[AzureADTokenCredential] getToken called with scopes:", scopes);
    
    // Check if we have a valid cached token (with 60s buffer)
    if (this.cachedToken && this.expiresAt && Date.now() < this.expiresAt - 60000) {
      console.log("[AzureADTokenCredential] Using cached token");
      return {
        token: this.cachedToken,
        expiresOnTimestamp: this.expiresAt,
      };
    }

    // Fetch new token
    console.log("[AzureADTokenCredential] Fetching new token...");
    const tokenData = await this.tokenFetcher();
    if (!tokenData || !tokenData.token) {
      throw new Error("Failed to fetch Azure AD token");
    }

    this.cachedToken = tokenData.token;
    // Default to 1 hour if no expiration provided
    this.expiresAt = tokenData.expiresAt 
      ? new Date(tokenData.expiresAt).getTime() 
      : Date.now() + 3600000;

    console.log("[AzureADTokenCredential] Token fetched, expires at:", new Date(this.expiresAt).toISOString());
    
    return {
      token: this.cachedToken,
      expiresOnTimestamp: this.expiresAt,
    };
  }
}

/**
 * LiveVoiceModePOC - VoiceLive SDK implementation
 */
const LiveVoiceModePOC = ({ isActive, onClose, onAddMessage, onShowChat }) => {
  // State
  const [voiceState, setVoiceState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [error, setError] = useState(null);
  const [fatalError, setFatalError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState([0, 0, 0, 0, 0]);
  const [sessionKey, setSessionKey] = useState(null);

  // Refs
  const clientRef = useRef(null);
  const sessionRef = useRef(null);
  const subscriptionRef = useRef(null);
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

  const voiceStateRef = useRef("idle");
  const isCapturingRef = useRef(false);
  const currentResponseIdRef = useRef(null);
  const lastProcessedItemIdRef = useRef(null);
  const lastProcessedResponseIdRef = useRef(null);
  const isProcessingResponseRef = useRef(false);
  const isConnectingRef = useRef(false);
  const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));
  const sourceNodeRef = useRef(null);
  const hasShownChatRef = useRef(false);
  const isResponseDoneRef = useRef(false);
  const currentAudioSourceRef = useRef(null);
  const interruptedResponseIdRef = useRef(null);
  const lastInterruptTimeRef = useRef(0);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const canSendAudioRef = useRef(true);
  const sessionKeyRef = useRef(null);
  const tokenCredentialRef = useRef(null);

  // Helper to update voice state
  const updateVoiceState = useCallback((newState) => {
    if (voiceStateRef.current !== newState) {
      voiceStateRef.current = newState;
      setVoiceState(newState);
    }
  }, []);

  // Fetch Azure AD token from your API
  const fetchAzureToken = useCallback(async () => {
    try {
      const response = await fetch(SPEECH_TOKEN_API);
      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[VoiceLive-${instanceIdRef.current}] Token fetched successfully`);
      return { token: data.token, expiresAt: data.expiresAt };
    } catch (err) {
      console.error(`[VoiceLive-${instanceIdRef.current}] Token fetch error:`, err);
      throw err;
    }
  }, []);

  // Initialize session key
  useEffect(() => {
    const existingKey = sessionStorage.getItem("session_key");
    if (existingKey) {
      setSessionKey(existingKey);
      sessionKeyRef.current = existingKey;
    }
  }, []);

  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  // Get or create RAG session key
  const getOrCreateSessionKey = useCallback(async () => {
    if (sessionKeyRef.current) return sessionKeyRef.current;

    try {
      const response = await fetch(RAG_API_ENDPOINT, { method: "GET" });
      if (!response.ok) throw new Error("Failed to retrieve session key");
      const data = await response.json();
      if (data.session_key) {
        sessionStorage.setItem("session_key", data.session_key);
        setSessionKey(data.session_key);
        sessionKeyRef.current = data.session_key;
        return data.session_key;
      }
      throw new Error("No session key in response");
    } catch (error) {
      console.error(`[VoiceLive-${instanceIdRef.current}] Session key error:`, error);
      return null;
    }
  }, []);

  // Execute RAG function call
  const executeRAGCall = useCallback(async (callId, query) => {
    try {
      updateVoiceState("processing");
      const currentSessionKey = await getOrCreateSessionKey();
      if (!currentSessionKey) throw new Error("No session key");

      const response = await fetch(RAG_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_key: currentSessionKey, question: query }),
      });

      if (!response.ok) throw new Error("RAG API failed");

      const data = await response.json();
      if (data.result && data.response?.text) {
        if (data.session_key) {
          sessionStorage.setItem("session_key", data.session_key);
          sessionKeyRef.current = data.session_key;
        }

        let botMessage = data.response.text;
        if (data.response.links?.length > 0) {
          botMessage += "\n\nRelevant links:\n" + 
            data.response.links.map((link, i) => `- ${link.replace(/<|>|\[|\]/g, "")}`).join("\n");
        }

        return { success: true, answer: botMessage, sources: data.response.links || [] };
      }
      throw new Error("Invalid RAG response");
    } catch (error) {
      console.error(`[VoiceLive-${instanceIdRef.current}] RAG error:`, error);
      return { success: false, error: error.message };
    }
  }, [getOrCreateSessionKey, updateVoiceState]);

  // Audio playback - handles both base64 strings and ArrayBuffers
  const playAudioChunk = useCallback(async (audioData) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }

      let arrayBuffer;
      
      // Handle different audio data formats from VoiceLive SDK
      if (audioData instanceof ArrayBuffer) {
        // Already an ArrayBuffer
        arrayBuffer = audioData;
      } else if (audioData instanceof Uint8Array) {
        // Uint8Array - convert to ArrayBuffer
        arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
      } else if (typeof audioData === 'string') {
        // Base64 string - decode it
        try {
          arrayBuffer = base64ToArrayBuffer(audioData);
        } catch (e) {
          // If standard base64 fails, try URL-safe base64
          const standardBase64 = audioData.replace(/-/g, '+').replace(/_/g, '/');
          const padding = standardBase64.length % 4;
          const paddedBase64 = padding ? standardBase64 + '='.repeat(4 - padding) : standardBase64;
          arrayBuffer = base64ToArrayBuffer(paddedBase64);
        }
      } else {
        console.warn(`[VoiceLive-${instanceIdRef.current}] Unknown audio format:`, typeof audioData);
        return;
      }

      if (arrayBuffer.byteLength === 0) return;

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
      source.start();
    } catch (err) {
      console.error(`[VoiceLive-${instanceIdRef.current}] Audio play error:`, err);
    }
  }, []);

  // Stop audio playback
  const stopAudioPlayback = useCallback(() => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
      } catch (e) { /* ignore */ }
      currentAudioSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Mic muting helper - mute mic when AI is speaking to prevent feedback
  const setMicMuted = useCallback((muted) => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }, []);

  // Frequency analysis for visualization
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
          let max = 0;
          for (let j = start; j < start + bandSize && j < bufferLength; j++) {
            max = Math.max(max, dataArray[j]);
          }
          const scaled = Math.pow(max / 255, 0.55);
          const maxHeight = i === 2 || i === 3 ? 24 : 20;
          frequencyBands.push(4 + scaled * (maxHeight - 4));
        }
        setFrequencyData(frequencyBands);
      } else {
        setFrequencyData(prev => prev.map(val => Math.max(0, val * 0.85)));
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

    [sourceNodeRef, analyserRef, workletNodeRef].forEach(ref => {
      if (ref.current) {
        try { ref.current.disconnect(); } catch (e) { /* ignore */ }
        ref.current = null;
      }
    });

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current?.state !== "closed") {
      try { audioContextRef.current?.close(); } catch (e) { /* ignore */ }
      audioContextRef.current = null;
    }

    isCapturingRef.current = false;
    setAudioLevel(0);
    setFrequencyData([0, 0, 0, 0, 0]);
  }, []);

  // Start audio capture and send to VoiceLive
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
        // Send audio to VoiceLive session - only when listening (not speaking/processing)
        if (
          sessionRef.current && 
          canSendAudioRef.current &&
          voiceStateRef.current !== "speaking" && 
          voiceStateRef.current !== "processing"
        ) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);

          try {
            // VoiceLive SDK expects raw ArrayBuffer, not base64
            sessionRef.current.sendAudio(pcm16.buffer);
          } catch (err) {
            console.error(`[VoiceLive-${instanceIdRef.current}] Audio send error:`, err);
          }
        }
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);
      workletNodeRef.current = processor;

      startFrequencyAnalysis();
      console.log(`[VoiceLive-${instanceIdRef.current}] Audio capture started`);
    } catch (err) {
      console.error(`[VoiceLive-${instanceIdRef.current}] Audio capture error:`, err);
      isCapturingRef.current = false;
      if (err.name === "NotAllowedError") {
        setError("Microphone blocked. Please allow microphone access.");
      } else {
        setError(`Microphone error: ${err.message}`);
      }
    }
  }, [stopAudioCapture, startFrequencyAnalysis]);

  // Connect to VoiceLive
  const connectVoiceLive = useCallback(async () => {
    if (sessionRef.current) return;
    if (isConnectingRef.current) return;

    isConnectingRef.current = true;
    updateVoiceState("connecting");
    setError(null);

    try {
      console.log(`[VoiceLive-${instanceIdRef.current}] 🚀 Connecting to Azure VoiceLive...`);
      console.log(`[VoiceLive-${instanceIdRef.current}] Auth mode: ${USE_API_KEY_AUTH ? 'API Key' : 'Azure AD Token'}`);

      // Clean the endpoint
      const cleanEndpoint = AZURE_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const endpoint = `https://${cleanEndpoint}`;
      console.log(`[VoiceLive-${instanceIdRef.current}] Endpoint: ${endpoint}`);
      console.log(`[VoiceLive-${instanceIdRef.current}] Model: ${MODEL}`);

      let client;

      if (USE_API_KEY_AUTH) {
        // ⭐ Option 1: API Key Authentication (recommended)
        console.log(`[VoiceLive-${instanceIdRef.current}] Using API Key authentication`);
        const credential = new AzureKeyCredential(VOICELIVE_API_KEY);
        client = new VoiceLiveClient(endpoint, credential);
      } else {
        // ⭐ Option 2: Azure AD Token Authentication
        // NOTE: Token must have scope: https://cognitiveservices.azure.com/.default
        console.log(`[VoiceLive-${instanceIdRef.current}] Using Azure AD token authentication`);
        
        // Fetch token first to validate
        const tokenData = await fetchAzureToken();
        if (!tokenData || !tokenData.token) {
          throw new Error("Failed to fetch Azure AD token");
        }
        console.log(`[VoiceLive-${instanceIdRef.current}] ✅ Token fetched`);

        // Create token credential
        if (!tokenCredentialRef.current) {
          tokenCredentialRef.current = new AzureADTokenCredential(fetchAzureToken);
        }
        
        client = new VoiceLiveClient(endpoint, tokenCredentialRef.current);
      }
      
      clientRef.current = client;

      // Start session
      console.log(`[VoiceLive-${instanceIdRef.current}] Starting session with model: ${MODEL}`);
      const session = await client.startSession(MODEL);
      sessionRef.current = session;

      // ⭐ Configure session with VoiceLive-specific features
      await session.updateSession({
        modalities: ["audio", "text"],
        instructions: `You are Teja — Techjays' SUPER energetic, jumpy, excited voice buddy!
        
🚨 **ABSOLUTE RULE: KEEP IT SHORT & PUNCHY!** 🚨
- DEFAULT: 1-2 sentences max. Stop there.
- ONLY go longer if user asks for details
- ALWAYS end with a question to keep conversation flowing

🎯 **PERSONALITY:** 
- Be warm, friendly, genuinely excited
- Use engaging expressions: "Ooh!", "That's awesome!", "Here's the thing..."
- Sound like a knowledgeable friend, not a robot

📚 **KNOWLEDGE:**
- Use search_techjays_knowledge for: clients, projects, services, pricing
- Never make up information - always search first
- For basic info (CEO, founded, etc.) - answer directly

Remember: Short, punchy, excited, and always ask a follow-up question!`,
        voice: {
          name: "en-US-AvaNeural",
          type: "azure-standard",
        },
        // ⭐ VoiceLive-specific turn detection
        turnDetection: {
          type: "azure_semantic_vad",
          threshold: 0.5,
          prefixPaddingMs: 300,
          silenceDurationMs: 500,
          removeFillerWords: true,
        },
        // ⭐ VoiceLive noise/echo features
        inputAudioNoiseReduction: { type: "azure_deep_noise_suppression" },
        inputAudioEchoCancellation: { type: "server_echo_cancellation" },
        inputAudioFormat: "pcm16",
        outputAudioFormat: "pcm16",
        inputAudioTranscription: { model: "whisper-1" },
        tools: [{
          type: "function",
          name: "search_techjays_knowledge",
          description: "Search Techjays knowledge base for accurate information about clients, projects, services, etc.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
            },
            required: ["query"],
          },
        }],
        toolChoice: "auto",
      });

      console.log(`[VoiceLive-${instanceIdRef.current}] ✅ Session configured`);

      // ⭐ Subscribe to VoiceLive events
      const subscription = session.subscribe({
        onResponseAudioDelta: async (event) => {
          // VoiceLive SDK may provide audio in different formats
          const audioData = event.delta || event.audio || event.data;
          if (audioData) {
            // Debug first chunk to see format
            if (!window._audioFormatLogged) {
              console.log(`[VoiceLive-${instanceIdRef.current}] Audio format:`, {
                type: typeof audioData,
                isArrayBuffer: audioData instanceof ArrayBuffer,
                isUint8Array: audioData instanceof Uint8Array,
                length: audioData.length || audioData.byteLength,
                sample: typeof audioData === 'string' ? audioData.substring(0, 50) : 'binary'
              });
              window._audioFormatLogged = true;
            }
            // Mute mic when AI starts speaking to prevent feedback
            if (voiceStateRef.current !== "speaking") {
              setMicMuted(true);
            }
            updateVoiceState("speaking");
            await playAudioChunk(audioData);
          }
        },

        onResponseTextDelta: async (event) => {
          if (event.delta) {
            currentAiResponseRef.current += event.delta;
            setAiResponse(currentAiResponseRef.current);
          }
        },

        onInputAudioTranscriptionCompleted: async (event) => {
          const text = event.transcript?.trim();
          if (text && !isPhantomTranscription(text)) {
            console.log(`[VoiceLive-${instanceIdRef.current}] User: ${text}`);
            setTranscript(text);
            currentTranscriptRef.current = text;
            onAddMessage?.({ type: "user", text, isVoice: true });
          }
        },

        onInputAudioBufferSpeechStarted: async () => {
          console.log(`[VoiceLive-${instanceIdRef.current}] User started speaking`);
          stopAudioPlayback();
          updateVoiceState("listening");
        },

        onInputAudioBufferSpeechStopped: async () => {
          if (!isProcessingResponseRef.current) {
            updateVoiceState("processing");
          }
        },

        onResponseCreated: async (event) => {
          const responseId = event.response?.id;
          if (responseId) {
            currentResponseIdRef.current = responseId;
            isProcessingResponseRef.current = true;
            isResponseDoneRef.current = false;
            currentAiTextRef.current = "";
            currentAiTextSavedRef.current = false;
            updateVoiceState("processing");
          }
        },

        onResponseDone: async () => {
          console.log(`[VoiceLive-${instanceIdRef.current}] Response complete`);
          isResponseDoneRef.current = true;
          
          // Unmute mic when AI finishes speaking
          setMicMuted(false);
          
          const finalText = currentAiResponseRef.current.trim();
          if (finalText && !currentAiTextSavedRef.current) {
            onAddMessage?.({ type: "ai", text: finalText, isVoice: true });
            currentAiTextSavedRef.current = true;
          }

          setTimeout(() => {
            isProcessingResponseRef.current = false;
            currentResponseIdRef.current = null;
            currentAiResponseRef.current = "";
            setAiResponse("");
            if (voiceStateRef.current !== "idle") {
              updateVoiceState("listening");
            }
          }, 300);
        },

        onResponseFunctionCallArgumentsDone: async (event) => {
          console.log(`[VoiceLive-${instanceIdRef.current}] Function call: ${event.name}`);
          
          if (event.name === "search_techjays_knowledge") {
            try {
              const args = JSON.parse(event.arguments);
              const result = await executeRAGCall(event.callId, args.query);
              
              await session.addConversationItem({
                type: "function_call_output",
                callId: event.callId,
                output: JSON.stringify(result),
              });
              await session.sendEvent({ type: "response.create" });
            } catch (err) {
              console.error(`[VoiceLive-${instanceIdRef.current}] Function error:`, err);
            }
          }
        },

        onError: async (event) => {
          console.error(`[VoiceLive-${instanceIdRef.current}] Session error:`, event);
          setError(event.error?.message || "Session error occurred");
        },

        onSessionClosed: async () => {
          console.log(`[VoiceLive-${instanceIdRef.current}] Session closed`);
          globalConnectionActive = false;
          isConnectingRef.current = false;
        },
      });

      subscriptionRef.current = subscription;
      globalConnectionActive = true;
      isConnectingRef.current = false;

      // Show chat
      if (onShowChat && !hasShownChatRef.current) {
        hasShownChatRef.current = true;
        onShowChat();
      }

      // Start audio capture
      await startAudioCapture();

      // Send greeting
      if (!hasGreetedRef.current && !globalHasGreeted) {
        const greetingMessage = globalHasHadConversation
          ? GREETING_CONFIG.welcomeBackMessage
          : GREETING_CONFIG.message;

        setTimeout(async () => {
          if (sessionRef.current) {
            await session.addConversationItem({
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: greetingMessage }],
            });
            await session.sendEvent({ type: "response.create" });
            
            hasGreetedRef.current = true;
            globalHasGreeted = true;
            globalHasHadConversation = true;
            updateVoiceState("speaking");
          }
        }, 500);
      } else {
        updateVoiceState("listening");
      }

    } catch (err) {
      console.error(`[VoiceLive-${instanceIdRef.current}] Connection error:`, err);
      console.error(`[VoiceLive-${instanceIdRef.current}] Error details:`, {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      isConnectingRef.current = false;
      
      // Provide helpful error message
      let errorMessage = err.message;
      if (err.message?.includes('WebSocket')) {
        errorMessage = `WebSocket connection failed. Check if VoiceLive is enabled on your Azure AI resource. (${err.message})`;
      } else if (err.message?.includes('401') || err.message?.includes('403')) {
        errorMessage = `Authentication failed. Ensure you have Cognitive Services User role. (${err.message})`;
      } else if (err.message?.includes('404')) {
        errorMessage = `VoiceLive endpoint not found. The endpoint may not support VoiceLive. (${err.message})`;
      }
      
      setFatalError(errorMessage);
      updateVoiceState("idle");
    }
  }, [fetchAzureToken, updateVoiceState, startAudioCapture, playAudioChunk, stopAudioPlayback, executeRAGCall, onAddMessage, onShowChat]);

  // Cleanup
  const cleanup = useCallback(() => {
    console.log(`[VoiceLive-${instanceIdRef.current}] Cleaning up...`);
    
    stopAudioCapture();
    stopAudioPlayback();

    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe?.();
      subscriptionRef.current = null;
    }

    if (sessionRef.current) {
      sessionRef.current.close?.();
      sessionRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current = null;
    }

    globalConnectionActive = false;
    isConnectingRef.current = false;
  }, [stopAudioCapture, stopAudioPlayback]);

  // End session
  const handleEndSession = useCallback(() => {
    cleanup();
    updateVoiceState("idle");
    setTranscript("");
    setAiResponse("");
    setError(null);
    setFatalError(null);
    setAudioLevel(0);
    hasGreetedRef.current = false;
    globalHasGreeted = false;
    hasShownChatRef.current = false;
    hasStartedRef.current = false;
    onClose?.();
  }, [cleanup, updateVoiceState, onClose]);

  // Interrupt
  const handleInterrupt = useCallback(() => {
    const now = Date.now();
    if (now - lastInterruptTimeRef.current < 500) return;
    lastInterruptTimeRef.current = now;

    stopAudioPlayback();
    
    if (sessionRef.current && currentResponseIdRef.current && !isResponseDoneRef.current) {
      sessionRef.current.sendEvent?.({ type: "response.cancel" });
    }

    updateVoiceState("listening");
  }, [stopAudioPlayback, updateVoiceState]);

  // Connect on mount
  useEffect(() => {
    if (isActive && !hasStartedRef.current) {
      hasStartedRef.current = true;
      connectVoiceLive();
    }

    return () => {
      if (!isActive && hasStartedRef.current) {
        cleanup();
        hasStartedRef.current = false;
      }
    };
  }, [isActive, connectVoiceLive, cleanup]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isActive) handleEndSession();
    };
    if (isActive) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, handleEndSession]);

  const getStatusText = () => {
    if (error) return error;
    switch (voiceState) {
      case "connecting": return "Connecting...";
      case "listening": return "Listening...";
      case "processing": return "Thinking...";
      case "speaking": return "";
      default: return globalConnectionActive ? "Listening..." : "Ready";
    }
  };

  // Error UI
  if (fatalError) {
    const isAuthError = fatalError.includes('Authentication') || fatalError.includes('credentials');
    return (
      <div className="flex items-center justify-between w-full gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">VoiceLive connection failed</p>
          <p className="text-xs text-red-600 mt-1">{fatalError}</p>
          {isAuthError && !USE_API_KEY_AUTH && (
            <p className="text-xs text-orange-600 mt-2">
              💡 Tip: Add VITE_VOICELIVE_API_KEY to .env to use API key auth
            </p>
          )}
        </div>
        <button
          onClick={() => { setFatalError(null); handleEndSession(); }}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          Reset
        </button>
      </div>
    );
  }

  if (!isActive) return null;

  return (
    <div className="flex items-center justify-between w-full gap-3 animate-voiceFadeIn">
      {/* VoiceLive Badge */}
      <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
        <Sparkles className="w-3 h-3" />
        <span>VoiceLive</span>
      </div>

      {/* Voice Orb */}
      <div className="relative flex-shrink-0">
        <div
          className={`absolute inset-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full blur-md ${
            voiceState === "listening" ? "animate-voicePulseInline" : voiceState === "speaking" ? "animate-voiceSpeakingPulseInline" : ""
          }`}
          style={{
            background: voiceState === "speaking"
              ? "linear-gradient(to right, #22d3ee, #60a5fa)"
              : error ? "linear-gradient(to right, #ef4444, #dc2626)" : "linear-gradient(to right, #a855f7, #6366f1)",
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
              ? "linear-gradient(135deg, #22d3ee 0%, #60a5fa 50%, #a855f7 100%)"
              : voiceState === "processing" || voiceState === "connecting"
              ? "linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)"
              : "linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6366f1 100%)",
            boxShadow: "0 0 20px rgba(168, 85, 247, 0.3)",
          }}
        >
          {voiceState === "listening" && !error && (
            <div className="flex items-center justify-center gap-0.5">
              {frequencyData.map((height, index) => (
                <span key={index} style={{ display: "block", width: "2px", height: `${height}px`, minHeight: "4px", background: "white", borderRadius: "2px", transition: "height 0.1s ease-out" }} />
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

      {/* Status */}
      <div className="flex-1 text-center min-w-0">
        <p className={`text-sm sm:text-base font-medium truncate ${error ? "text-red-500" : "text-gray-700"}`}>
          {getStatusText()}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {voiceState === "speaking" && (
          <button onClick={handleInterrupt} className="p-1.5 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all hover:scale-105" title="Interrupt">
            <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
          </button>
        )}

        <button onClick={handleEndSession} className="p-1.5 sm:p-2 rounded-full transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" }} title="End Session">
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

export default LiveVoiceModePOC;
