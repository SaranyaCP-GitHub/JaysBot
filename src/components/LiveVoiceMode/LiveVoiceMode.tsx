import React, { useState, useEffect, useRef, useCallback } from "react";

// Molecule components
import VoiceModeErrorBoundary from "@/ui/molecule/VoiceModeErrorBoundary";
// Organism components
import VoiceModeBar from "@/ui/organism/VoiceModeBar";
// Hooks
import useSessionKey from "@/hooks/useSessionKey";
import useFrequencyAnalysis from "@/hooks/useFrequencyAnalysis";
import useAudioPlayback from "@/hooks/useAudioPlayback";
import useAudioCapture from "@/hooks/useAudioCapture";
import useInterruptAgent from "@/hooks/useInterruptAgent";
import useWebSocketConnection, {
  getGlobalConnectionState,
  setGlobalConnectionState,
} from "@/hooks/useWebSocketConnection";
import useServerMessageHandler from "@/hooks/useServerMessageHandler";
// Services
import { createTokenService } from "@/services/tokenService";
import {
  executeFunctionCall,
  sendFunctionCallResult,
} from "@/services/functionCallService";
import { clearInputAudioBuffer as clearInputBuffer } from "@/services/websocketService";
// Types
import type { VoiceState } from "@/ui/atom/VoiceOrb";

// Styles
import "@/styles/animations.css";

// Global connection state is now managed by useWebSocketConnection hook

export interface LiveVoiceModeProps {
  isActive: boolean;
  onClose: () => void;
  onAddMessage: (message: {
    type: "user" | "ai";
    text: string;
    isVoice?: boolean;
    isTyping?: boolean;
    isStreaming?: boolean;
    replaceTyping?: boolean;
  }) => void;
  onShowChat?: () => void;
}

/**
 * LiveVoiceMode - Inline voice chat component that fits within input box
 * Handles speech-to-speech conversation with Azure OpenAI Realtime API
 */
const LiveVoiceMode: React.FC<LiveVoiceModeProps> = ({
  isActive,
  onClose,
  onAddMessage,
  onShowChat,
}) => {
  // Voice state: "idle" | "connecting" | "listening" | "processing" | "speaking"
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Refs for WebSocket and component state
  const wsRef = useRef<WebSocket | null>(null);
  const hasStartedRef = useRef<boolean>(false);
  const currentTranscriptRef = useRef<string>("");
  const currentAiResponseRef = useRef<string>("");
  const hasGreetedRef = useRef<boolean>(false); // Track if greeting has been sent
  const currentAiTextRef = useRef<string>(""); // Keeps track of what the AI is saying RIGHT NOW
  const currentAiTextSavedRef = useRef<boolean>(false); // Track if current AI text was already saved (e.g., due to interruption)
  const typingIndicatorClearedRef = useRef<boolean>(false); // Track if typing indicator was cleared due to interruption

  // Additional refs to prevent duplicate handling
  const voiceStateRef = useRef<string>("idle"); // Track voice state for closures
  const currentResponseIdRef = useRef<string | null>(null); // Track current response to prevent duplicates
  const handleServerMessageRef = useRef<((message: any) => void) | null>(null); // Store latest message handler
  const lastProcessedItemIdRef = useRef<string | null>(null); // Track last processed conversation item
  const lastProcessedResponseIdRef = useRef<string | null>(null); // Track last processed AI response
  const isProcessingResponseRef = useRef<boolean>(false); // Flag to prevent processing while AI is responding
  const isConnectingRef = useRef<boolean>(false); // Prevent multiple connection attempts
  const instanceIdRef = useRef<string>(Math.random().toString(36).substr(2, 9)); // Debug instance tracking
  const connectWebSocketRef = useRef<(() => Promise<void>) | null>(null); // Store latest connectWebSocket function
  const cleanupRef = useRef<((shouldCloseWebSocket?: boolean) => void) | null>(
    null
  ); // Store latest cleanup function
  const updateVoiceStateRef = useRef<((state: string) => void) | null>(null); // Store latest updateVoiceState function
  const hasShownChatRef = useRef<boolean>(false); // Track if chat has been shown to prevent duplicate calls
  const isResponseDoneRef = useRef<boolean>(false); // Track if response is already done (to prevent canceling completed responses)
  const isInitialConnectionRef = useRef<boolean>(true); // Track if this is the first connection (for welcome message)
  const isReconnectingRef = useRef<boolean>(false); // Prevent multiple simultaneous reconnection attempts
  const [fatalError, setFatalError] = useState<string | null>(null); // Fatal error state for error recovery

  // Token service instance
  const tokenServiceRef = useRef(createTokenService(instanceIdRef.current));

  // Helper to update voice state and ref together
  const updateVoiceState = useCallback((newState: string) => {
    const state = newState as VoiceState;
    if (voiceStateRef.current !== state) {
      voiceStateRef.current = state;
      setVoiceState(state);
    }
  }, []);

  // Use extracted hooks
  const { sessionKeyRef } = useSessionKey();

  // Audio playback hook
  const {
    audioQueueRef,
    audioContextRef: playbackAudioContextRef,
    currentAudioSourceRef,
    playAudioQueue,
    waitForAudioToFinish,
    stopPlayback,
    clearQueue,
  } = useAudioPlayback({
    instanceId: instanceIdRef.current,
  });

  // Use playback audio context for capture as well (shared context)
  const audioContextRef = playbackAudioContextRef;
  const canSendAudioRef = useRef(true); // Control audio sending during AI speech

  // Create animation frame ref for frequency analysis
  const animationFrameRef = useRef<number | null>(null);

  // Audio capture hook
  const {
    analyserRef,
    isCapturingRef,
    setAudioLevel,
    startAudioCapture: startAudioCaptureHook,
    stopAudioCapture,
  } = useAudioCapture({
    instanceId: instanceIdRef.current,
    wsRef,
    voiceStateRef,
    audioContextRef,
    canSendAudioRef,
    startFrequencyAnalysis: () => {}, // Placeholder, will be set below
    animationFrameRef,
    onError: setError,
  });

  // Frequency analysis hook (uses analyserRef from audio capture)
  const {
    frequencyData,
    startFrequencyAnalysis,
    animationFrameRef: frequencyAnimationFrameRef,
  } = useFrequencyAnalysis({
    analyserRef,
    isCapturingRef,
    voiceStateRef,
  });

  // Sync animation frame ref
  useEffect(() => {
    animationFrameRef.current = frequencyAnimationFrameRef.current;
  }, [frequencyAnimationFrameRef.current]);

  // Wrap startAudioCapture to include frequency analysis
  const startAudioCapture = useCallback(async () => {
    await startAudioCaptureHook();
    // Start frequency analysis after audio capture is set up
    // Small delay to ensure analyser is ready
    setTimeout(() => {
      if (analyserRef.current) {
        startFrequencyAnalysis();
      }
    }, 100);
  }, [startAudioCaptureHook, startFrequencyAnalysis, analyserRef]);

  // Execute function calls from the AI using FunctionCallService
  const handleFunctionCall = useCallback(
    async (callId: string, functionName: string, args: any) => {
      try {
        // Execute function using service
        const result = await executeFunctionCall(
          functionName,
          args,
          instanceIdRef.current
        );

        // Update session key if returned
        if (result.sessionKey) {
          sessionStorage.setItem("session_key", result.sessionKey);
          // Session key is managed by useSessionKey hook, but we need to update it
          sessionKeyRef.current = result.sessionKey;
        }

        // Send result back to WebSocket
        sendFunctionCallResult(wsRef.current, callId, result);
      } catch (error) {
        console.error(
          `[${instanceIdRef.current}] Function execution error:`,
          error
        );

        // Send error back to model
        sendFunctionCallResult(wsRef.current, callId, {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    []
  );

  // Fetch speech token from API using TokenService
  const fetchSpeechToken = useCallback(async (): Promise<{
    token: string;
  } | null> => {
    try {
      const tokenData = await tokenServiceRef.current.fetchToken();
      return tokenData;
    } catch (err) {
      console.error(`[${instanceIdRef.current}] Failed to fetch token:`, err);
      throw err;
    }
  }, []);

  // Use interrupt agent hook
  const { interruptAgent, lastInterruptTimeRef } = useInterruptAgent({
    instanceId: instanceIdRef.current,
    wsRef,
    voiceStateRef,
    isProcessingResponseRef,
    currentAiTextRef,
    currentResponseIdRef,
    isResponseDoneRef,
    currentAudioSourceRef,
    audioQueueRef,
    currentTranscriptRef,
    canSendAudioRef,
    typingIndicatorClearedRef,
    clearQueue,
    stopPlayback,
    updateVoiceState,
    setTranscript,
    setAiResponse,
    currentAiResponseRef,
    onAddMessage,
  });

  // Clear the input audio buffer on the server using service
  const clearInputAudioBuffer = useCallback(() => {
    clearInputBuffer(wsRef.current);
  }, []);

  // Use server message handler hook (needed before WebSocket connection)
  const { handleServerMessage } = useServerMessageHandler({
    instanceId: instanceIdRef.current,
    wsRef,
    voiceStateRef,
    isProcessingResponseRef,
    isResponseDoneRef,
    currentResponseIdRef,
    lastProcessedItemIdRef,
    lastProcessedResponseIdRef,
    currentAiTextRef,
    currentAiTextSavedRef,
    currentAiResponseRef,
    currentTranscriptRef,
    typingIndicatorClearedRef,
    hasShownChatRef,
    canSendAudioRef,
    audioQueueRef,
    interruptAgent,
    updateVoiceState,
    setTranscript,
    setAiResponse,
    setError,
    clearInputAudioBuffer,
    handleFunctionCall,
    playAudioQueue,
    waitForAudioToFinish,
    onAddMessage,
    onShowChat,
  });

  // Keep the ref updated with the latest handler
  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  // Cleanup resources (needed before WebSocket connection hook)
  const cleanup = useCallback(
    (shouldCloseWebSocket: boolean = true) => {
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

      // Clear token service
      tokenServiceRef.current.clearRefreshTimer();

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
        setGlobalConnectionState(false, null);
      }

      // Clear audio queue and reset flags
      clearQueue();
      stopPlayback();
      currentResponseIdRef.current = null;
      lastProcessedItemIdRef.current = null;
      lastProcessedResponseIdRef.current = null;
      isProcessingResponseRef.current = false;
      isResponseDoneRef.current = false; // Reset response done flag
      isConnectingRef.current = false;
      canSendAudioRef.current = true;

      // Clear token data if ending session
      if (shouldCloseWebSocket) {
        tokenServiceRef.current.cleanup();
      }
    },
    [stopAudioCapture, clearQueue, stopPlayback]
  );

  // Use WebSocket connection hook (needs cleanup and handleServerMessage)
  const { connectWebSocket } = useWebSocketConnection({
    instanceId: instanceIdRef.current,
    wsRef,
    isConnectingRef,
    isReconnectingRef,
    isCapturingRef,
    hasGreetedRef,
    hasShownChatRef,
    voiceStateRef,
    isProcessingResponseRef,
    isResponseDoneRef,
    lastInterruptTimeRef,
    connectWebSocketRef,
    fetchSpeechToken,
    updateVoiceState,
    setError,
    startAudioCapture,
    handleServerMessageRef,
    cleanup,
    isActive,
    onShowChat,
  });

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

  // End session
  const handleEndSession = () => {
    cleanup(true); // Close WebSocket when ending session
    updateVoiceState("idle" as VoiceState);
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

  // ⭐ MEMORY LEAK FIX: Cleanup token service on unmount
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      tokenServiceRef.current.cleanup();
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
    const { globalConnectionActive, globalWebSocket } =
      getGlobalConnectionState();
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
          updateVoiceStateRef.current("listening" as VoiceState);
        }
        return;
      }

      // If global WebSocket is CONNECTING, wait
      if (globalWebSocket.readyState === WebSocket.CONNECTING) {
        wsRef.current = globalWebSocket;
        hasStartedRef.current = true;
        // Set state to connecting if idle
        if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
          updateVoiceStateRef.current("connecting" as VoiceState);
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
        updateVoiceStateRef.current("listening" as VoiceState);
      }
      return;
    }

    // If connecting, wait - do nothing
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      hasStartedRef.current = true;
      // Set state to connecting if idle
      if (voiceStateRef.current === "idle" && updateVoiceStateRef.current) {
        updateVoiceStateRef.current("connecting" as VoiceState);
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
      updateVoiceStateRef.current("connecting" as VoiceState);
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
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const getStatusText = (): string => {
    if (error) return error;

    switch (voiceState) {
      case "connecting":
        return "Connecting...";
      case "listening":
        // return transcript ? `"${transcript}"` : "Listening...";
        return "Listening...";
      case "processing":
        return "Thinking...";
      case "speaking":
        return "Speaking...";
      default:
        // If active and connected, show "Listening..." instead of "Ready"
        const { globalConnectionActive: isGlobalActive } =
          getGlobalConnectionState();
        if (
          isActive &&
          (wsRef.current?.readyState === WebSocket.OPEN || isGlobalActive)
        ) {
          return "Listening...";
        }
        return "Ready";
    }
  };

  // ⭐ ERROR BOUNDARY: Show error recovery UI if fatal error occurs
  if (fatalError) {
    return (
      <VoiceModeErrorBoundary
        error={fatalError}
        onReset={() => {
          setFatalError(null);
          handleEndSession();
        }}
      />
    );
  }

  if (!isActive) return null;

  return (
    <VoiceModeBar
      voiceState={voiceState}
      statusText={getStatusText()}
      error={error}
      frequencyData={frequencyData}
      onInterrupt={handleInterrupt}
      onEndSession={handleEndSession}
    />
  );
};

export default LiveVoiceMode;
