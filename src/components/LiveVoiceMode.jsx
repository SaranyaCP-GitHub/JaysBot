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
  const hasGreetedRef = useRef(false); // Track if greeting has been sent
  const currentAiTextRef = useRef(""); // Keeps track of what the AI is saying RIGHT NOW
  const currentAiTextSavedRef = useRef(false); // Track if current AI text was already saved (e.g., due to interruption)

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
  const isResponseDoneRef = useRef(false); // Track if response is already done (to prevent canceling completed responses)
  const currentAudioSourceRef = useRef(null); // Track current playing audio source
  const isInitialConnectionRef = useRef(true); // Track if this is the first connection (for welcome message)
  const isReconnectingRef = useRef(false); // Prevent multiple simultaneous reconnection attempts
  const [fatalError, setFatalError] = useState(null); // Fatal error state for error recovery

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

  // RAG session key management
  const [sessionKey, setSessionKey] = useState(null);
  const sessionKeyRef = useRef(null);

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
    // Return existing session key if available
    if (sessionKeyRef.current) {
      return sessionKeyRef.current;
    }

    // Create new session key
    try {
      const response = await fetch(
        "https://chat-api.techjays.com/api/v1/chat/",
        {
          method: "GET",
        }
      );

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
      console.error(
        `[${instanceIdRef.current}] Error creating RAG session:`,
        error
      );
      return null;
    }
  }, []);

  // Execute function calls from the AI
  const executeFunctionCall = useCallback(
    async (callId, functionName, args) => {
      try {
        let result;

        if (functionName === "search_techjays_knowledge") {
          // Get or create session key
          const currentSessionKey = await getOrCreateSessionKey();

          if (!currentSessionKey) {
            throw new Error("Failed to obtain session key");
          }

          // Call your RAG API
          const response = await fetch(
            "https://chat-api.techjays.com/api/v1/chat/",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                session_key: currentSessionKey,
                question: args.query,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Failed to fetch from knowledge base");
          }

          const data = await response.json();

          if (data.result && data.response && data.response.text) {
            // Update session key if provided
            if (data.session_key) {
              sessionStorage.setItem("session_key", data.session_key);
              setSessionKey(data.session_key);
              sessionKeyRef.current = data.session_key;
            }

            let botMessage = data.response.text;

            // Handle links if they exist
            if (data.response.links && data.response.links.length > 0) {
              const linkTexts = botMessage.split(", ");
              let formattedLinks = "\n\nRelevant links:\n";
              data.response.links.forEach((link, index) => {
                const cleanedLink = link.replace(/<|>|\[|\]/g, "");
                const linkText = linkTexts[index]
                  ? linkTexts[index].trim()
                  : `Link ${index + 1}`;
                formattedLinks += `- ${linkText}: ${cleanedLink}\n`;
              });
              botMessage += formattedLinks;
            }

            // Clean up message formatting
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
          result = {
            success: false,
            error: `Unknown function: ${functionName}`,
          };
        }

        // Send function result back to the model
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result),
              },
            })
          );

          // Trigger the model to respond with the function result
          wsRef.current.send(
            JSON.stringify({
              type: "response.create",
            })
          );
        }
      } catch (error) {
        console.error(
          `[${instanceIdRef.current}] Function execution error:`,
          error
        );

        // Send error back to model
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify({
                  success: false,
                  error: error.message,
                }),
              },
            })
          );

          // Still trigger a response so the model can tell the user about the error
          wsRef.current.send(
            JSON.stringify({
              type: "response.create",
            })
          );
        }
      }
    },
    [getOrCreateSessionKey]
  );

  // Fetch speech token from API
  const fetchSpeechToken = useCallback(async () => {
    // Prevent multiple simultaneous token fetches
    if (isFetchingTokenRef.current) {
      // Wait for existing fetch to complete (with timeout to prevent infinite loop)
      let attempts = 0;
      const MAX_WAIT_ATTEMPTS = 50; // 5 seconds max (50 * 100ms)

      while (isFetchingTokenRef.current && attempts < MAX_WAIT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (attempts >= MAX_WAIT_ATTEMPTS) {
        throw new Error(
          "Token fetch timeout - another fetch is taking too long"
        );
      }

      return tokenRef.current ? { token: tokenRef.current } : null;
    }

    isFetchingTokenRef.current = true;

    try {
      const response = await fetch(SPEECH_TOKEN_API);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch token: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

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

      // Refresh at 60 minutes (3600s) OR 5 minutes before expiration, whichever comes FIRST (smaller value)
      // Increased buffer from 2 min to 5 min to reduce disconnection risk
      const refreshIn = Math.min(3600, Math.max(0, expiresIn - 300));

      // Warn if token is expiring soon
      if (expiresIn < 600) {
        console.warn(
          `[${instanceIdRef.current}] ⚠️ Token expiring soon: ${expiresIn}s remaining`
        );
      }

      // Clear existing refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }

      // Schedule token refresh
      tokenRefreshTimerRef.current = setTimeout(() => {
        tokenRefreshTimerRef.current = null;

        // Refresh token (but don't reconnect if WebSocket is open)
        fetchSpeechToken().then((newTokenData) => {
          // Token refreshed
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

  // ⭐ CENTRALIZED INTERRUPT FUNCTION - Single source of truth
  // ⭐ CENTRALIZED INTERRUPT FUNCTION - Single source of truth
  // ⭐ CENTRALIZED INTERRUPT FUNCTION - Single source of truth
  // Add this with your other refs at the top
  const lastInterruptTimeRef = useRef(0); // Track last interrupt time

  // Update your interruptAgent function:
  // In interruptAgent function (around line 447)
  // Replace your current interruptAgent function with this improved version:
  const interruptAgent = useCallback(
    (reason = "user_action", keepBuffer = false) => {
      // ⭐ DEBOUNCE: Prevent rapid-fire interrupts (min 500ms between)
      const now = Date.now();
      if (now - lastInterruptTimeRef.current < 500) {
        console.log(
          `[${instanceIdRef.current}] ⏸️ Interrupt debounced (too soon)`
        );
        return false;
      }
      lastInterruptTimeRef.current = now;

      // Only interrupt if agent is actually speaking or processing
      if (
        voiceStateRef.current !== "speaking" &&
        !isProcessingResponseRef.current
      ) {
        console.log(
          `[${instanceIdRef.current}] ℹ️ Nothing to interrupt - agent not speaking`
        );
        return false;
      }

      console.log(
        `[${instanceIdRef.current}] 🛑 Interrupting agent (${reason})`
      );

      // 1. Stop current audio source immediately
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop();
          currentAudioSourceRef.current.disconnect();
          currentAudioSourceRef.current = null;
          console.log(`[${instanceIdRef.current}] ✅ Stopped audio playback`);
        } catch (err) {
          console.warn(
            `[${instanceIdRef.current}] ⚠️ Audio stop error:`,
            err.message
          );
        }
      }

      // 2. Clear audio queue and playback flags
      const queuedChunks = audioQueueRef.current.length;
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      if (queuedChunks > 0) {
        console.log(
          `[${instanceIdRef.current}] 🧹 Cleared ${queuedChunks} queued audio chunks`
        );
      }

      // 3. ⭐ THE FIX: Only clear the input buffer if it's NOT a voice-triggered interrupt
      // If the user is already speaking, clearing the buffer deletes their "Hello..."
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        if (!keepBuffer) {
          try {
            wsRef.current.send(
              JSON.stringify({
                type: "input_audio_buffer.clear",
              })
            );
            console.log(
              `[${instanceIdRef.current}] 🧹 Cleared input buffer (User Action)`
            );
          } catch (err) {
            console.warn(
              `[${instanceIdRef.current}] ⚠️ Buffer clear failed:`,
              err.message
            );
          }
        } else {
          console.log(
            `[${instanceIdRef.current}] 🔒 Keeping input buffer (user is speaking)`
          );
        }
      }

      // 4. Always cancel the AI's current response
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        if (currentResponseIdRef.current && !isResponseDoneRef.current) {
          try {
            wsRef.current.send(
              JSON.stringify({
                type: "response.cancel",
                response_id: currentResponseIdRef.current,
              })
            );
            console.log(
              `[${instanceIdRef.current}] 📤 Sent response.cancel to server`
            );
          } catch (err) {
            console.warn(
              `[${instanceIdRef.current}] ⚠️ Cancel request failed:`,
              err.message
            );
          }
        }
      }

      // 5. Reset turn detection after cancel has been sent
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  turn_detection: {
                    type: "server_vad",
                    threshold: 0.6,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 700,
                  },
                },
              })
            );
            console.log(
              `[${instanceIdRef.current}] 🔄 Reset turn detection - ready for new speech`
            );
          } catch (err) {
            console.warn(
              `[${instanceIdRef.current}] ⚠️ Turn detection reset failed:`,
              err.message
            );
          }
        }
      }, 100); // Additional delay after cancel

      // 6. Reset all state flags IMMEDIATELY (don't wait)
      currentResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isResponseDoneRef.current = false;
      canSendAudioRef.current = true;

      // Also clear transcript refs
      currentTranscriptRef.current = "";
      setTranscript("");

      // 7. Update UI state
      updateVoiceState("listening");
      setAiResponse("");
      currentAiResponseRef.current = "";

      console.log(
        `[${instanceIdRef.current}] ✅ Interrupt complete - back to listening`
      );

      return true;
    },
    [updateVoiceState]
  );

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(async () => {
    // Check if WebSocket is already open or connecting

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current) {
      return;
    }

    isConnectingRef.current = true;
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

      wsRef.current = new WebSocket(wsUrl);
      globalWebSocket = wsRef.current; // Store globally to survive remounts

      wsRef.current.onopen = () => {
        isConnectingRef.current = false;
        globalConnectionActive = true; // Mark as active globally

        // Configure the session with RAG tool
        const sessionConfig = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            // FIX 2: Enhanced Session Update to prevent hallucinations
            instructions: `You are Teja, the voice AI assistant for Techjays, a custom software and AI solutions company.

            **CONTEXT AWARENESS:**
            If the conversation has already started, do not greet again. Just listen and respond to the user's questions.

            **CORE IDENTITY:**
            Friendly, knowledgeable company representative. Conversational and helpful.
            
            **GREETING (First Message Only):**
            "Hi! I'm Teja from Techjays. How can I help you today?"
            
            **TRANSCRIPTION AUTO-CORRECT:**
            Silently fix: "Texas"→Techjays, "Philip Samuel"→Philip Samuelraj, "Jaso/Jesse"→Jesso Clarence, "Dharma Raj"→Dharmaraj
            
            **CRITICAL: STRICT RAG-ONLY PROTOCOL (Except for static information)**

            **Static Information:**
            -- Techjays was founded in July 9, 2020
            -- Techjays was founded by Philip Samuelraj
            -- Techjays CEO is Philip Samuelraj
            -- Techjays CTO is Jesso Clarence
            -- Tagline: "The best way to build your software."
            
            You have NO general knowledge about Techjays. You can ONLY answer using information retrieved from the search_techjays_knowledge function.
            
            **MANDATORY PROCESS FOR EVERY TECHJAYS QUESTION:**
            1. **Check if the question is about static information, if it is, use the static information provided above. Don't call search_techjays_knowledge for CEO**
            2. **ALWAYS call search_techjays_knowledge FIRST EXCEPT FOR STATIC INFORMATION.** - No exceptions
            3. **WAIT for search results**
            4. **Check if results contain the specific answer:**
               - ✅ Results have the exact info → Answer using ONLY that information, for static information, use the static information provided above.
               - ⚠️ Results are vague/partial → Say: "Based on our knowledge base, [partial answer]. For complete details, contact info@techjays.com"
               - ❌ Results don't answer the question → Say: "I don't have that specific information. Please contact info@techjays.com"
           
            **FORBIDDEN BEHAVIORS:**
            - ❌ Never answer from general knowledge about companies, AI, or software
            - ❌ Never assume information not explicitly stated in search results
            - ❌ Never say "Techjays likely..." or "Typically companies..." - only state facts from search results
            - ❌ Never combine search results with your general knowledge
            - ❌ Never answer before searching
            - ❌ Never say Jake Dawson is the CEO of Techjays
            
            **WHAT REQUIRES RAG SEARCH (Everything about Techjays):**
            Company info, team members, services, technologies, projects, processes, contact details, pricing, partnerships, clients, locations, certifications, awards - literally ANY Techjays question.
            
            **WHAT DOESN'T REQUIRE RAG (Decline these):**
            Weather, news, personal advice, entertainment, general knowledge unrelated to Techjays.
            Response: "I focus on Techjays information. What would you like to know about our services?"
            
            **RESPONSE CONSTRUCTION RULES:**
            
            When you have search results:
            1. Read ALL search result content carefully
            2. Extract ONLY the specific facts that answer the question
            3. Respond in natural, conversational language
            4. DO NOT add context, explanations, or elaborations not present in results
            5. If asked for details not in results, acknowledge: "I don't have those specific details"
            
            **VOICE-OPTIMIZED DELIVERY:**
            - Conversational tone: "we're", "it's", natural flow
            - Concise: 2-3 sentences for simple facts, 3-4 for complex topics
            - Under 25 seconds of speech
            - Natural transitions: "So...", "Well..."
            
            **QUALITY CHECK BEFORE RESPONDING:**
            Ask yourself: "Did this exact information come from the search results?"
            - If YES → Respond with that information
            - If NO → Don't include it
            - If UNSURE → Don't include it
            - If the question is about static information, use the static information provided above. Don't use search results.
            
            **Example Correct Behavior:**
            
            User: "Where is Techjays headquarters?"
            → Search: "Techjays headquarters location address"
            → Results contain: "101 Jefferson Drive Suite 212C, Menlo Park, CA 94025"
            → Response: "We're headquartered at 101 Jefferson Drive Suite 212C, Menlo Park, California."
            
            User: "What's Techjays' annual revenue?"
            → Search: "Techjays revenue annual financial"
            → Results: [No revenue information found]
            → Response: "I don't have that information. For business inquiries, contact our team at info@techjays.com"
            
            User: "Who is Arun M P?"
            → Search: "Arun M P role position title"  
            → Results contain: "Arun M P - Director of Engineering"
            → Response: "Arun M P is our Director of Engineering."
            
            User: "What AI services do you offer?"
            → Search: "AI services capabilities offerings"
            → Results contain: [Detailed AI services list]
            → Response: [Summarize ONLY what's in the results, nothing more]
            
            **REMEMBER:** 
            - You're a search interface, not an AI expert
            - Your knowledge = Search results only
            - When unsure, admit it and offer to connect them with the team
            - Better to say "I don't know" than to hallucinate
            
            You represent Techjays accurately by ONLY sharing verified information from our knowledge base.
            
            **CRITICAL TRANSCRIPTION RULES:**
            - If you hear silence or background noise, do not transcribe it
            - Never output 'Thanks for watching' or 'Thank you' unless the user explicitly said it
            - Only transcribe actual speech from the user`,
            voice: "ash",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",

            // ⭐ IMPROVED TRANSCRIPTION CONFIG
            input_audio_transcription: {
              model: "whisper-1",
              language: "en",
              prompt:
                "Philip Samuelraj, Jesso Clarence, Dharmaraj, Agentic AI, RAG, MLOps, ChromaDB, Palantir, Techjays, CEO, Arun, Aparna",
            },

            // FIX 2: Enhanced turn detection to filter out background hum
            turn_detection: {
              type: "server_vad",
              threshold: 0.6, // Increased threshold (default is 0.5) to filter out background hum
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            tools: [
              {
                type: "function",
                name: "search_techjays_knowledge",
                description:
                  "Search the Techjays knowledge base for information about services, projects, team, capabilities, case studies, and company information. Use this whenever users ask about Techjays, including questions about AI technologies like RAG, Agentic AI, MLOps, LLMs, and other technical concepts that Techjays implements.",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description:
                        "The user's question or search query about Techjays. Include questions about AI technologies, services, team, projects, and company information.",
                    },
                  },
                  required: ["query"],
                },
              },
            ],
            tool_choice: "auto",
          },
        };

        wsRef.current.send(JSON.stringify(sessionConfig));

        if (onShowChat && !hasShownChatRef.current) {
          hasShownChatRef.current = true;
          onShowChat();
        }

        // FIX 2: Only greet if this is the very first time AND history is empty
        if (!hasGreetedRef.current) {
          // Small delay to ensure session configuration is processed
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              // Send greeting trigger using conversation.item.create approach (more reliable)
              wsRef.current.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: "Greet the user briefly: 'Hi I am Teja, How can I help you?'",
                      },
                    ],
                  },
                })
              );

              // Trigger AI response
              wsRef.current.send(
                JSON.stringify({
                  type: "response.create",
                })
              );
              
              hasGreetedRef.current = true;
              updateVoiceState("speaking"); // Set state to speaking for the greeting
            }
          }, 500); // 500ms delay to ensure session is ready
        } else {
          // Reconnection - resume conversation without welcome
          console.log(
            `[${instanceIdRef.current}] 🔄 Reconnected - resuming conversation`
          );
          updateVoiceState("listening");
        }

        // Only start audio capture if not already capturing
        if (!isCapturingRef.current) {
          startAudioCapture();
        }
      };

      // Use ref to always call the latest handler (avoids stale closures)
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // Call the latest handler via ref
          if (handleServerMessageRef.current) {
            handleServerMessageRef.current(message);
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

      // In connectWebSocket, update the onclose handler (around line 753)
      wsRef.current.onclose = (event) => {
        isConnectingRef.current = false;

        console.log(
          `[${instanceIdRef.current}] WebSocket closed. Code: ${
            event.code
          }, Reason: ${event.reason || "none"}`
        );

        // Code 1000 = normal closure (intentional)
        if (event.code === 1000) {
          wsRef.current = null;
          globalConnectionActive = false;
          globalWebSocket = null;
          return;
        }

        // ⭐ IMPROVED: More lenient handling of Code 1006
        // Check multiple conditions to determine if this is an "expected" interruption closure
        const timeSinceLastInterrupt =
          Date.now() - lastInterruptTimeRef.current;
        const isRecentInterrupt = timeSinceLastInterrupt < 3000; // Increased to 3 seconds
        const wasProcessingResponse = isProcessingResponseRef.current;

        // If Code 1006 happened during/after an interrupt, this is likely expected behavior
        if (
          event.code === 1006 &&
          (isRecentInterrupt || wasProcessingResponse)
        ) {
          console.log(
            `[${instanceIdRef.current}] ℹ️ Code 1006 after interrupt (${timeSinceLastInterrupt}ms ago, processing: ${wasProcessingResponse}) - treating as expected, will NOT reconnect`
          );

          // Reset flags but DON'T reconnect
          wsRef.current = null;
          globalConnectionActive = false;
          globalWebSocket = null;
          isProcessingResponseRef.current = false;
          isResponseDoneRef.current = true;

          // Just update state to listening - user can continue with next request
          if (voiceStateRef.current !== "idle") {
            updateVoiceState("listening");
          }

          // ⭐ CRITICAL: Restart the connection silently without user knowing
          // This maintains the session without showing errors
          setTimeout(() => {
            console.log(
              `[${instanceIdRef.current}] 🔄 Silently re-establishing connection after interrupt...`
            );
            if (isActive && connectWebSocketRef.current && !wsRef.current) {
              connectWebSocketRef.current();
            }
          }, 500);

          return; // Don't proceed with error reconnection logic
        }

        // ⭐ PREVENT RACE CONDITION: Check if reconnection already in progress
        if (isReconnectingRef.current) {
          console.log(
            `[${instanceIdRef.current}] Reconnection already in progress, skipping`
          );
          return;
        }

        // Unexpected disconnect - attempt recovery
        if (isActive && voiceStateRef.current !== "idle") {
          console.warn(
            `[${instanceIdRef.current}] Unexpected disconnect during active session (Code: ${event.code})`
          );

          isReconnectingRef.current = true;

          const attemptReconnect = () => {
            console.log(
              `[${instanceIdRef.current}] Attempting automatic reconnection...`
            );

            wsRef.current = null;
            globalConnectionActive = false;
            globalWebSocket = null;
            isConnectingRef.current = false;

            if (connectWebSocketRef.current) {
              connectWebSocketRef
                .current()
                .then(() => {
                  isReconnectingRef.current = false;
                })
                .catch((err) => {
                  console.error(
                    `[${instanceIdRef.current}] Auto-reconnect failed:`,
                    err
                  );
                  isReconnectingRef.current = false;
                  setError("Connection lost. Please try again.");
                  updateVoiceState("idle");
                });
            } else {
              isReconnectingRef.current = false;
            }
          };

          setTimeout(attemptReconnect, 500);
        } else {
          cleanup(false);
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
  }, [fetchSpeechToken, updateVoiceState, onShowChat]);

  // Clear the input audio buffer on the server
  const clearInputAudioBuffer = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    }
  }, []);

  // Handle messages from the server
  const handleServerMessage = useCallback(
    (message) => {
      switch (message.type) {
        case "session.created":
          break;

        case "session.updated":
          break;

        case "input_audio_buffer.speech_started":
          // ⭐ Auto-interrupt when user starts speaking
          console.log("VAD: User started speaking. Interrupting AI but KEEPING buffer.");
          
          // FIX 1: If user interrupts, save the partial greeting/message to history
          if (currentAiTextRef.current.trim() !== "" && !currentAiTextSavedRef.current) {
            if (onAddMessage) {
              onAddMessage({ 
                type: 'ai', 
                text: currentAiTextRef.current + "..." // Add ellipsis to show it was cut off
              });
              currentAiTextSavedRef.current = true; // Mark as saved
            }
          }
          
          // Pass 'true' to keepBuffer because the user is currently talking
          const wasInterrupted = interruptAgent("vad_speech", true);

          if (wasInterrupted) {
            console.log(
              `[${instanceIdRef.current}] 🎤 User interrupted agent by speaking`
            );
          }

          // Reset buffers for the next turn
          currentAiTextRef.current = ""; 
          setAiResponse("");
          
          // Update state to listening
          updateVoiceState("listening");
          currentTranscriptRef.current = "";
          setTranscript("");
          break;

        case "input_audio_buffer.speech_stopped":
          // Ignore if we're currently processing a response
          if (isProcessingResponseRef.current) {
            return;
          }
          updateVoiceState("processing");
          break;

        case "input_audio_buffer.committed":
          break;

        case "conversation.item.created":
          // Track conversation item to prevent duplicates
          break;

        case "conversation.item.input_audio_transcription.completed":
          // User's speech transcription - check for duplicates
          const itemId = message.item_id;
          if (itemId && itemId === lastProcessedItemIdRef.current) {
            return;
          }

          if (message.transcript) {
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
              
              // ⭐ Show typing indicator immediately after user message appears
              onAddMessage({
                type: "ai",
                text: "",
                isVoice: true,
                isTyping: true,
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
              return;
            }
            currentResponseIdRef.current = newResponseId;
            isProcessingResponseRef.current = true;
            isResponseDoneRef.current = false; // Mark response as active
            canSendAudioRef.current = false; // Stop sending audio while AI responds
            // Reset text tracking for new response
            currentAiTextRef.current = "";
            currentAiTextSavedRef.current = false;
            // FIX 1: Show loader initially, will be removed when audio/text starts arriving
            updateVoiceState("processing");
            // Clear any buffered audio to prevent echo processing
            clearInputAudioBuffer();
            
            // ⭐ Typing indicator is already added after transcript, so we don't need to add it here
            // It will be replaced when the actual response starts streaming
          }
          break;

        case "response.audio_transcript.delta":
          // FIX 1: Remove loader as soon as text starts arriving
          if (voiceStateRef.current !== "speaking") updateVoiceState("speaking");
          
          // FIX 1: Update the Ref so we always know what the AI has said so far
          if (message.delta) {
            currentAiTextRef.current += message.delta;
          }
          
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
            // This will replace the typing indicator if it exists
            if (onAddMessage && currentAiResponseRef.current) {
              onAddMessage({
                type: "ai",
                text: currentAiResponseRef.current,
                isVoice: true,
                isStreaming: true, // Mark as streaming
                isTyping: false, // Replace typing indicator
              });
            }
          } else if (
            deltaResponseId &&
            deltaResponseId === lastProcessedResponseIdRef.current
          ) {
            // Already processed this response, ignore deltas
          }
          break;

        case "response.audio_transcript.done":
          // AI response complete - only process if matches current response and not already processed
          const responseId = message.response_id || message.response?.id;

          // Check if this response was already processed
          if (responseId && responseId === lastProcessedResponseIdRef.current) {
            return;
          }

          // Only process if matches current response
          if (responseId && responseId !== currentResponseIdRef.current) {
            return;
          }

          // Check if we have text to add
          if (
            !currentAiResponseRef.current ||
            currentAiResponseRef.current.trim() === ""
          ) {
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
            onAddMessage({
              type: "ai",
              text: responseText,
              isVoice: true,
              isStreaming: false, // Mark as complete
              isTyping: false, // Ensure typing indicator is removed
            });
          }
          break;

        case "response.audio.delta":
          // FIX 1: Remove loader as soon as audio starts arriving
          if (voiceStateRef.current !== "speaking") updateVoiceState("speaking");
          
          // AI audio response
          const audioResponseId = message.response_id || message.response?.id;
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
          // Note: We don't change state here - we wait for response.done and then wait for playback to finish
          break;

        case "response.function_call_arguments.delta":
          // Function arguments streaming (optional - for showing progress)
          // Optionally update UI to show "Searching knowledge base..."
          if (message.name === "search_techjays_knowledge") {
            updateVoiceState("processing");
          }
          break;

        case "response.function_call_arguments.done":
          // Complete function call received - execute it
          const callId = message.call_id;
          const functionName = message.name;

          try {
            const functionArgs = JSON.parse(message.arguments);

            // Execute the function
            executeFunctionCall(callId, functionName, functionArgs);
          } catch (error) {
            console.error(
              `[${instanceIdRef.current}] Failed to parse function arguments:`,
              error
            );
            // Send error back to model
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({
                      success: false,
                      error: "Failed to parse function arguments",
                    }),
                  },
                })
              );
            }
          }
          break;

        case "response.done":
          // Response complete, wait for audio to finish before going back to listening
          // Mark response as done immediately to prevent cancel attempts
          isResponseDoneRef.current = true;
          // Clear the input buffer to remove any echo that was captured
          clearInputAudioBuffer();

          // FIX 1: Only add to history if it wasn't already added by an interruption
          const finalText = currentAiTextRef.current.trim();
          if (finalText !== "" && !currentAiTextSavedRef.current) {
            if (onAddMessage) {
              onAddMessage({ 
                type: 'ai', 
                text: finalText 
              });
            }
          }

          // Wait for audio playback to finish before allowing new speech detection
          waitForAudioToFinish().then(() => {
            // Small delay after audio finishes to prevent echo/overlap
            setTimeout(() => {
              isProcessingResponseRef.current = false;
              // Only clear currentResponseIdRef, keep lastProcessedResponseIdRef to prevent duplicates
              currentResponseIdRef.current = null;
              canSendAudioRef.current = true; // Resume sending audio
              
              // Clear for next turn
              currentAiTextRef.current = "";
              setAiResponse("");
              
              // Use ref to check current state, not stale closure
              if (voiceStateRef.current !== "idle") {
                updateVoiceState("listening");
              }
            }, 300); // Small delay to let any echo subside
          });
          break;

        case "error":
          // Don't show error for cancel failures (response might already be done)
          if (
            message.error?.code === "response_cancel_not_active" ||
            message.error?.message?.includes("no active response") ||
            message.error?.message?.includes("cancel") // ⭐ ADD THIS
          ) {
            console.log(
              `[${instanceIdRef.current}] ℹ️ Cancel ignored - response already completed`
            );
            // Reset state since response is done
            isResponseDoneRef.current = true;
            isProcessingResponseRef.current = false;
            canSendAudioRef.current = true;
            if (voiceStateRef.current === "speaking") {
              updateVoiceState("listening");
            }
            // ⭐ DON'T SET ERROR - just log and continue
            return; // ⭐ ADD RETURN to prevent error display
          } else {
            console.error("API Error:", message.error);
            setError(message.error?.message || "An error occurred");
            isProcessingResponseRef.current = false;
            canSendAudioRef.current = true;
          }
          break;

        default:
          // console.log("Unhandled message type:", message.type);
          break;
      }
    },
    [
      onAddMessage,
      onShowChat,
      updateVoiceState,
      clearInputAudioBuffer,
      executeFunctionCall,
      interruptAgent,
    ]
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
      return;
    }

    // Clean up any existing audio resources first
    stopAudioCapture();

    isCapturingRef.current = true;
    canSendAudioRef.current = true;

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
        // ⭐ ALWAYS send audio for server VAD to detect interruptions
        // Server-side VAD needs audio stream to detect when user starts speaking

        // Use refs to check current state (avoid stale closures)
        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          voiceStateRef.current !== "processing"
        ) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);
          const base64Audio = arrayBufferToBase64(pcm16.buffer);

          audioChunkCount++;

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
  }, [stopAudioCapture, startFrequencyAnalysis]);

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
      // Check for interruption before playing
      if (!isPlayingRef.current) {
        console.log(`[${instanceIdRef.current}] Playback interrupted`);
        break;
      }

      const audioData = audioQueueRef.current.shift();

      try {
        await playAudioBuffer(audioData);
      } catch (error) {
        console.error(
          `[${instanceIdRef.current}] Audio playback error:`,
          error
        );
      }

      // Check for interruption after playing
      if (!isPlayingRef.current) {
        console.log(
          `[${instanceIdRef.current}] Playback interrupted between chunks`
        );
        break;
      }
    }

    isPlayingRef.current = false;
  };

  // Wait for audio playback to finish
  const waitForAudioToFinish = () => {
    return new Promise((resolve) => {
      // If not playing and queue is empty, wait a bit then resolve
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        // Wait 200ms to ensure no new audio is coming
        setTimeout(() => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
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

        // If not playing and queue is empty, increment counter
        if (!isPlaying && queueLength === 0) {
          consecutiveEmptyChecks++;
          // Only resolve after multiple consecutive checks to ensure audio is really done
          if (consecutiveEmptyChecks >= requiredEmptyChecks) {
            clearInterval(checkInterval);
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
        resolve();
      }, 600000); // 10 minutes - should be enough for any response
    });
  };

  // Play a single audio buffer
  const playAudioBuffer = (arrayBuffer) => {
    return new Promise((resolve, reject) => {
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

      // ⭐ Store source for interruption
      currentAudioSourceRef.current = source;

      source.onended = () => {
        currentAudioSourceRef.current = null;
        resolve();
      };

      source.onerror = (error) => {
        currentAudioSourceRef.current = null;
        reject(error);
      };

      source.start();
    });
  };

  // ⭐ SIMPLIFIED handleInterrupt - uses centralized interruptAgent
  const handleInterrupt = useCallback(() => {
    const wasInterrupted = interruptAgent("button_click");

    if (wasInterrupted) {
      console.log(
        `[${instanceIdRef.current}] 👆 User interrupted agent via button`
      );
    } else {
      console.log(
        `[${instanceIdRef.current}] ℹ️ No active response to interrupt`
      );
    }
  }, [interruptAgent]);

  // Cleanup resources
  const cleanup = useCallback(
    (shouldCloseWebSocket = true) => {
      // ⭐ Stop any playing audio first
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop();
          currentAudioSourceRef.current.disconnect();
          currentAudioSourceRef.current = null;
        } catch (e) {
          /* ignore */
        }
      }

      // Clear token refresh timer
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }

      // Stop audio capture (handles media stream, audio nodes, and context)
      stopAudioCapture();

      // Close WebSocket only if explicitly requested (when ending session)
      if (wsRef.current && shouldCloseWebSocket) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
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
      }

      // Clear audio queue and reset flags
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      currentResponseIdRef.current = null;
      lastProcessedItemIdRef.current = null;
      lastProcessedResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isResponseDoneRef.current = false; // Reset response done flag
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
    cleanup(true); // Close WebSocket when ending session
    updateVoiceState("idle");
    setTranscript("");
    setAiResponse("");
    setError(null);
    setFatalError(null); // Clear fatal error on session end
    setAudioLevel(0);
    currentTranscriptRef.current = "";
    currentAiResponseRef.current = "";
    hasStartedRef.current = false;
    lastProcessedItemIdRef.current = null;
    lastProcessedResponseIdRef.current = null;
    isProcessingResponseRef.current = false;
    isConnectingRef.current = false;
    isReconnectingRef.current = false; // Reset reconnection flag
    canSendAudioRef.current = true;
    hasShownChatRef.current = false; // Reset so chat can be shown again next time
    isInitialConnectionRef.current = true; // Reset for next session
    onClose();
  };

  // Update refs whenever functions change (runs first to ensure refs are set)
  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
    cleanupRef.current = cleanup;
    updateVoiceStateRef.current = updateVoiceState;
  }, [connectWebSocket, cleanup, updateVoiceState]);

  // ⭐ MEMORY LEAK FIX: Cleanup token refresh timer on unmount
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Simplified session management - ONLY depends on isActive
  // Connection logic is self-contained to prevent reconnection issues
  useEffect(() => {
    // Capture isActive at effect time
    const currentIsActive = isActive;

    // If deactivating, cleanup and return
    if (!currentIsActive) {
      if (hasStartedRef.current) {
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
        wsRef.current = globalWebSocket;
      }

      // If global WebSocket is OPEN, never reconnect
      if (globalWebSocket.readyState === WebSocket.OPEN) {
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
      hasStartedRef.current = true;
      // Ensure voice state is listening if it's idle
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("listening");
      }
      return;
    }

    // If connecting, wait - do nothing
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
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
      hasStartedRef.current = true;
      return;
    }

    // If already marked as started, don't reconnect (even without WebSocket ref)
    // This prevents reconnection when component remounts
    if (hasStartedRef.current) {
      return;
    }

    // If WebSocket exists but is closed, and we're already started, don't reconnect
    if (hasStartedRef.current && wsRef.current) {
      return;
    }

    // Only connect if: active, not started, and WebSocket doesn't exist or is closed
    hasStartedRef.current = true;

    // Set state to connecting immediately when starting new connection
    if (updateVoiceStateRef.current && voiceStateRef.current === "idle") {
      updateVoiceStateRef.current("connecting");
    }

    // Use ref to call connectWebSocket (avoids dependency issues)
    // The ref is set by the useEffect below, which runs before this one
    if (connectWebSocketRef.current) {
      connectWebSocketRef.current();
    }

    // Cleanup function - only runs when isActive changes to false
    return () => {
      // Only cleanup if we're actually deactivating
      if (!currentIsActive && hasStartedRef.current) {
        if (cleanupRef.current) {
          cleanupRef.current(true);
        }
        hasStartedRef.current = false;
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
        return "Thinking...";
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

  // ⭐ ERROR BOUNDARY: Show error recovery UI if fatal error occurs
  if (fatalError) {
    return (
      <div className="flex items-center justify-between w-full gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">
            Voice assistant encountered an error.
          </p>
          <p className="text-xs text-red-600 mt-1">{fatalError}</p>
        </div>
        <button
          onClick={() => {
            setFatalError(null);
            handleEndSession();
          }}
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
        {voiceState === "speaking" && (
          <button
            onClick={handleInterrupt}
            className="p-1.5 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:scale-105"
            title="Interrupt"
          >
            <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
          </button>
        )}

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
        @keyframes loadingDotBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        .loading-dot-bounce {
          animation: loadingDotBounce 1.4s ease-in-out infinite;
        }
        
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
