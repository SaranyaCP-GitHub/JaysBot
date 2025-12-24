import { useCallback } from "react";

import {
  buildWebSocketUrl,
  createDefaultSessionConfig,
  sendSessionUpdate,
  sendGreeting,
} from "@/services/websocketService";

// Module-level connection tracker - persists across component remounts
// Tracks if a connection is active (survives component remounts)
// These are shared across all instances to prevent duplicate connections
let globalConnectionActive = false;
let globalWebSocket: WebSocket | null = null;

/**
 * Get the current global connection state
 */
export const getGlobalConnectionState = () => ({
  globalConnectionActive,
  globalWebSocket,
});

/**
 * Set the global connection state
 */
export const setGlobalConnectionState = (
  active: boolean,
  ws: WebSocket | null
) => {
  globalConnectionActive = active;
  globalWebSocket = ws;
};

/**
 * Parameters for useWebSocketConnection hook
 */
export interface UseWebSocketConnectionParams {
  instanceId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  isConnectingRef: React.MutableRefObject<boolean>;
  isReconnectingRef: React.MutableRefObject<boolean>;
  isCapturingRef: React.MutableRefObject<boolean>;
  hasGreetedRef: React.MutableRefObject<boolean>;
  hasShownChatRef: React.MutableRefObject<boolean>;
  voiceStateRef: React.MutableRefObject<string>;
  isProcessingResponseRef: React.MutableRefObject<boolean>;
  isResponseDoneRef: React.MutableRefObject<boolean>;
  lastInterruptTimeRef: React.MutableRefObject<number>;
  connectWebSocketRef: React.MutableRefObject<(() => Promise<void>) | null>;
  fetchSpeechToken: () => Promise<{ token: string } | null>;
  updateVoiceState: (state: string) => void;
  setError: (error: string | null) => void;
  startAudioCapture: () => Promise<void>;
  handleServerMessageRef: React.MutableRefObject<
    ((message: any) => void) | null
  >;
  cleanup: (shouldCloseWebSocket: boolean) => void;
  isActive: boolean;
  onShowChat?: () => void;
}

/**
 * Return type for useWebSocketConnection hook
 */
export interface UseWebSocketConnectionReturn {
  connectWebSocket: () => Promise<void>;
}

/**
 * Hook for managing WebSocket connection to Azure OpenAI Realtime API
 * Handles connection, reconnection, error recovery, and event handlers
 */
const useWebSocketConnection = ({
  instanceId,
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
}: UseWebSocketConnectionParams): UseWebSocketConnectionReturn => {
  /**
   * Initialize WebSocket connection
   */
  const connectWebSocket = useCallback(async (): Promise<void> => {
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

      // Build WebSocket URL with token authorization using service
      const wsUrl = buildWebSocketUrl(tokenData.token);

      wsRef.current = new WebSocket(wsUrl);
      globalWebSocket = wsRef.current; // Store globally to survive remounts

      wsRef.current.onopen = () => {
        isConnectingRef.current = false;
        globalConnectionActive = true; // Mark as active globally

        // Configure the session with RAG tool using service
        const sessionConfig = createDefaultSessionConfig();
        sendSessionUpdate(wsRef.current!, sessionConfig);

        if (onShowChat && !hasShownChatRef.current) {
          hasShownChatRef.current = true;
          onShowChat();
        }

        // FIX 2: Only greet if this is the very first time AND history is empty
        if (!hasGreetedRef.current) {
          // Small delay to ensure session configuration is processed
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              // Send greeting using service
              sendGreeting(wsRef.current);
              hasGreetedRef.current = true;
              updateVoiceState("speaking"); // Set state to speaking for the greeting
            }
          }, 500); // 500ms delay to ensure session is ready
        } else {
          // Reconnection - resume conversation without welcome
          console.log(`[${instanceId}] 🔄 Reconnected - resuming conversation`);
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
            `[${instanceId}] Error parsing message:`,
            err,
            event.data
          );
        }
      };

      wsRef.current.onerror = (err) => {
        console.error(`[${instanceId}] WebSocket error:`, err);
        isConnectingRef.current = false;
        setError("Connection error. Please try again.");
        updateVoiceState("idle");
      };

      // Handle WebSocket close events
      wsRef.current.onclose = (event) => {
        isConnectingRef.current = false;

        console.log(
          `[${instanceId}] WebSocket closed. Code: ${event.code}, Reason: ${
            event.reason || "none"
          }`
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
            `[${instanceId}] ℹ️ Code 1006 after interrupt (${timeSinceLastInterrupt}ms ago, processing: ${wasProcessingResponse}) - treating as expected, will NOT reconnect`
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
              `[${instanceId}] 🔄 Silently re-establishing connection after interrupt...`
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
            `[${instanceId}] Reconnection already in progress, skipping`
          );
          return;
        }

        // Unexpected disconnect - attempt recovery
        if (isActive && voiceStateRef.current !== "idle") {
          console.warn(
            `[${instanceId}] Unexpected disconnect during active session (Code: ${event.code})`
          );

          isReconnectingRef.current = true;

          const attemptReconnect = () => {
            console.log(`[${instanceId}] Attempting automatic reconnection...`);

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
                  console.error(`[${instanceId}] Auto-reconnect failed:`, err);
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
      console.error(`[${instanceId}] Failed to connect:`, err);
      isConnectingRef.current = false;
      setError("Failed to connect. Please try again.");
      updateVoiceState("idle");
    }
  }, [
    instanceId,
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
  ]);

  return {
    connectWebSocket,
  };
};

export default useWebSocketConnection;
