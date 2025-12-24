import { useRef, useCallback } from "react";

import {
  cancelResponse,
  resetTurnDetection,
} from "@/services/websocketService";

/**
 * Parameters for useInterruptAgent hook
 */
export interface UseInterruptAgentParams {
  instanceId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  voiceStateRef: React.MutableRefObject<string>;
  isProcessingResponseRef: React.MutableRefObject<boolean>;
  currentAiTextRef: React.MutableRefObject<string>;
  currentResponseIdRef: React.MutableRefObject<string | null>;
  isResponseDoneRef: React.MutableRefObject<boolean>;
  currentAudioSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>;
  audioQueueRef: React.MutableRefObject<ArrayBuffer[]>;
  currentTranscriptRef: React.MutableRefObject<string>;
  canSendAudioRef: React.MutableRefObject<boolean>;
  typingIndicatorClearedRef: React.MutableRefObject<boolean>;
  clearQueue: () => void;
  stopPlayback: () => void;
  updateVoiceState: (state: string) => void;
  setTranscript: (text: string) => void;
  setAiResponse: (text: string) => void;
  currentAiResponseRef: React.MutableRefObject<string>;
  onAddMessage?: (message: {
    type: "user" | "ai";
    text: string;
    isVoice?: boolean;
    isTyping?: boolean;
    isStreaming?: boolean;
    replaceTyping?: boolean;
  }) => void;
}

/**
 * Return type for useInterruptAgent hook
 */
export interface UseInterruptAgentReturn {
  interruptAgent: (reason?: string, keepBuffer?: boolean) => boolean;
  lastInterruptTimeRef: React.MutableRefObject<number>;
}

/**
 * Hook for managing agent interruption logic
 * Handles stopping audio, clearing queues, canceling responses, and resetting state
 */
const useInterruptAgent = ({
  instanceId,
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
}: UseInterruptAgentParams): UseInterruptAgentReturn => {
  const lastInterruptTimeRef = useRef<number>(0);

  /**
   * Interrupt the agent's current response
   * @param reason - Reason for interruption (e.g., "user_action", "vad_speech")
   * @param keepBuffer - Whether to keep the input audio buffer (true when user is speaking)
   * @returns true if interruption was successful, false otherwise
   */
  const interruptAgent = useCallback(
    (reason: string = "user_action", keepBuffer: boolean = false): boolean => {
      // ⭐ DEBOUNCE: Prevent rapid-fire interrupts (min 500ms between)
      const now = Date.now();
      if (now - lastInterruptTimeRef.current < 500) {
        console.log(`[${instanceId}] ⏸️ Interrupt debounced (too soon)`);
        return false;
      }
      lastInterruptTimeRef.current = now;

      // Only interrupt if agent is actually speaking or processing
      if (
        voiceStateRef.current !== "speaking" &&
        !isProcessingResponseRef.current
      ) {
        console.log(
          `[${instanceId}] ℹ️ Nothing to interrupt - agent not speaking`
        );
        return false;
      }

      console.log(`[${instanceId}] 🛑 Interrupting agent (${reason})`);

      // FIX: Clear typing indicator if AI was only processing (no text received yet)
      if (
        isProcessingResponseRef.current &&
        currentAiTextRef.current.trim() === "" &&
        onAddMessage
      ) {
        // Clear typing indicator immediately
        onAddMessage({
          type: "ai",
          text: "", // Empty text to update existing message
          isVoice: true,
          isTyping: false, // Explicitly set to false to clear
          isStreaming: false, // Not streaming anymore
        });
        // Send a second update after a small delay to ensure it's cleared
        setTimeout(() => {
          if (onAddMessage) {
            onAddMessage({
              type: "ai",
              text: "",
              isVoice: true,
              isTyping: false,
              isStreaming: false,
            });
          }
        }, 100);
        typingIndicatorClearedRef.current = true;
      }

      // 1. Stop current audio source immediately
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop();
          currentAudioSourceRef.current.disconnect();
          currentAudioSourceRef.current = null;
          console.log(`[${instanceId}] ✅ Stopped audio playback`);
        } catch (err: any) {
          console.warn(`[${instanceId}] ⚠️ Audio stop error:`, err.message);
        }
      }

      // 2. Clear audio queue and playback flags
      const queuedChunks = audioQueueRef.current.length;
      clearQueue();
      stopPlayback();

      if (queuedChunks > 0) {
        console.log(
          `[${instanceId}] 🧹 Cleared ${queuedChunks} queued audio chunks`
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
              `[${instanceId}] 🧹 Cleared input buffer (User Action)`
            );
          } catch (err: any) {
            console.warn(
              `[${instanceId}] ⚠️ Buffer clear failed:`,
              err.message
            );
          }
        } else {
          console.log(
            `[${instanceId}] 🔒 Keeping input buffer (user is speaking)`
          );
        }
      }

      // 4. Always cancel the AI's current response
      if (currentResponseIdRef.current && !isResponseDoneRef.current) {
        try {
          cancelResponse(wsRef.current, currentResponseIdRef.current);
          console.log(`[${instanceId}] 📤 Sent response.cancel to server`);
        } catch (err: any) {
          console.warn(
            `[${instanceId}] ⚠️ Cancel request failed:`,
            err.message
          );
        }
      }

      // 5. Reset turn detection after cancel has been sent
      setTimeout(() => {
        try {
          resetTurnDetection(wsRef.current);
          console.log(
            `[${instanceId}] 🔄 Reset turn detection - ready for new speech`
          );
        } catch (err: any) {
          console.warn(
            `[${instanceId}] ⚠️ Turn detection reset failed:`,
            err.message
          );
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

      console.log(`[${instanceId}] ✅ Interrupt complete - back to listening`);

      return true;
    },
    [
      instanceId,
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
    ]
  );

  return {
    interruptAgent,
    lastInterruptTimeRef,
  };
};

export default useInterruptAgent;
