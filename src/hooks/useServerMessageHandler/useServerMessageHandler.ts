import { useCallback } from "react";

import { base64ToArrayBuffer } from "@/utils/voiceUtils";
import { sendFunctionCallResult } from "@/services/functionCallService";

/**
 * Parameters for useServerMessageHandler hook
 */
export interface UseServerMessageHandlerParams {
  instanceId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  voiceStateRef: React.MutableRefObject<string>;
  isProcessingResponseRef: React.MutableRefObject<boolean>;
  isResponseDoneRef: React.MutableRefObject<boolean>;
  currentResponseIdRef: React.MutableRefObject<string | null>;
  lastProcessedItemIdRef: React.MutableRefObject<string | null>;
  lastProcessedResponseIdRef: React.MutableRefObject<string | null>;
  currentAiTextRef: React.MutableRefObject<string>;
  currentAiTextSavedRef: React.MutableRefObject<boolean>;
  currentAiResponseRef: React.MutableRefObject<string>;
  currentTranscriptRef: React.MutableRefObject<string>;
  typingIndicatorClearedRef: React.MutableRefObject<boolean>;
  hasShownChatRef: React.MutableRefObject<boolean>;
  canSendAudioRef: React.MutableRefObject<boolean>;
  audioQueueRef: React.MutableRefObject<ArrayBuffer[]>;
  interruptAgent: (reason: string, keepBuffer?: boolean) => boolean;
  updateVoiceState: (state: string) => void;
  setTranscript: (text: string) => void;
  setAiResponse: (text: string) => void;
  setError: (error: string | null) => void;
  clearInputAudioBuffer: () => void;
  handleFunctionCall: (
    callId: string,
    functionName: string,
    args: any
  ) => Promise<void>;
  playAudioQueue: () => Promise<void>;
  waitForAudioToFinish: () => Promise<void>;
  onAddMessage?: (message: {
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
 * Return type for useServerMessageHandler hook
 */
export interface UseServerMessageHandlerReturn {
  handleServerMessage: (message: any) => void;
}

/**
 * Hook for handling WebSocket messages from Azure OpenAI Realtime API
 * Processes all message types including transcripts, responses, audio, and errors
 */
const useServerMessageHandler = ({
  instanceId,
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
}: UseServerMessageHandlerParams): UseServerMessageHandlerReturn => {
  /**
   * Handle messages from the server
   */
  const handleServerMessage = useCallback(
    (message: any) => {
      switch (message.type) {
        case "session.created":
          break;

        case "session.updated":
          break;

        case "input_audio_buffer.speech_started":
          // ⭐ Auto-interrupt when user starts speaking
          console.log(
            "VAD: User started speaking. Interrupting AI but KEEPING buffer."
          );

          // FIX: Clear typing indicator if AI was processing (no text yet, just thinking)
          // This must happen BEFORE interruptAgent to ensure it's cleared
          if (
            isProcessingResponseRef.current &&
            currentAiTextRef.current.trim() === ""
          ) {
            // AI was processing but no text received yet - clear the typing indicator immediately
            if (onAddMessage) {
              // Send update to clear typing - this will update the last AI message
              onAddMessage({
                type: "ai",
                text: "", // Empty text - hook will update last AI message
                isVoice: true,
                isTyping: false, // Explicitly false to clear
                isStreaming: false, // Not streaming
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
              typingIndicatorClearedRef.current = true; // Mark as cleared to prevent re-adding
            }
          }

          // FIX 1: If user interrupts, save the partial greeting/message to history
          if (
            currentAiTextRef.current.trim() !== "" &&
            !currentAiTextSavedRef.current
          ) {
            if (onAddMessage) {
              onAddMessage({
                type: "ai",
                text: currentAiTextRef.current + "...", // Add ellipsis to show it was cut off
              });
              currentAiTextSavedRef.current = true; // Mark as saved
            }
          }

          // Pass 'true' to keepBuffer because the user is currently talking
          const wasInterrupted = interruptAgent("vad_speech", true);

          if (wasInterrupted) {
            console.log(
              `[${instanceId}] 🎤 User interrupted agent by speaking`
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
              // Only add typing indicator if it wasn't just cleared (give it a moment)
              // Reset the cleared flag for new conversation turn after a small delay
              const wasJustCleared = typingIndicatorClearedRef.current;
              if (wasJustCleared) {
                // Wait a bit before adding new typing indicator to ensure old one is cleared
                setTimeout(() => {
                  typingIndicatorClearedRef.current = false;
                  if (onAddMessage) {
                    onAddMessage({
                      type: "ai",
                      text: "",
                      isVoice: true,
                      isTyping: true,
                    });
                  }
                }, 150);
              } else {
                typingIndicatorClearedRef.current = false;
                onAddMessage({
                  type: "ai",
                  text: "",
                  isVoice: true,
                  isTyping: true,
                });
              }
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
            typingIndicatorClearedRef.current = false; // Reset cleared flag for new response
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
          if (voiceStateRef.current !== "speaking")
            updateVoiceState("speaking");

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
                replaceTyping: true, // Explicitly replace any typing indicators
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

          // Check if we have text to add - use currentAiTextRef for consistency
          const transcriptText = currentAiTextRef.current.trim();
          if (!transcriptText) {
            currentAiResponseRef.current = "";
            return;
          }

          // Mark as processed BEFORE adding to prevent race conditions
          if (responseId) {
            lastProcessedResponseIdRef.current = responseId;
          }

          // Final update to chat history (mark as not streaming)
          // Only add if not already saved (e.g., by interruption)
          if (
            onAddMessage &&
            transcriptText &&
            !currentAiTextSavedRef.current
          ) {
            onAddMessage({
              type: "ai",
              text: transcriptText,
              isVoice: true,
              isStreaming: false, // Mark as complete
              isTyping: false, // Ensure typing indicator is removed
              replaceTyping: true, // Explicitly replace any typing indicators
            });
            // Mark as saved to prevent duplicate in response.done
            currentAiTextSavedRef.current = true;
          }

          // Clear the response text refs (but keep currentAiTextRef for response.done check)
          currentAiResponseRef.current = "";
          break;

        case "response.audio.delta":
          // FIX 1: Remove loader as soon as audio starts arriving
          if (voiceStateRef.current !== "speaking")
            updateVoiceState("speaking");

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

            // Execute the function using service
            handleFunctionCall(callId, functionName, functionArgs);
          } catch (error) {
            console.error(
              `[${instanceId}] Failed to parse function arguments:`,
              error
            );
            // Send error back to model
            sendFunctionCallResult(wsRef.current, callId, {
              success: false,
              error: "Failed to parse function arguments",
            });
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
                type: "ai",
                text: finalText,
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
              `[${instanceId}] ℹ️ Cancel ignored - response already completed`
            );
            // FIX: Clear typing indicator if response was canceled during processing
            if (
              isProcessingResponseRef.current &&
              currentAiTextRef.current.trim() === "" &&
              onAddMessage
            ) {
              onAddMessage({
                type: "ai",
                text: "", // Empty text to update existing message
                isVoice: true,
                isTyping: false, // Explicitly set to false to clear
                isStreaming: false, // Not streaming anymore
              });
              // Send a second update to ensure it's cleared
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
              }, 50);
              typingIndicatorClearedRef.current = true;
            }
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
            // FIX: Clear typing indicator on error too
            if (isProcessingResponseRef.current && onAddMessage) {
              onAddMessage({
                type: "ai",
                text: currentAiTextRef.current.trim() || "", // Use any partial text or empty
                isVoice: true,
                isTyping: false, // Explicitly set to false to clear
                isStreaming: false, // Not streaming anymore
              });
              // Send a second update to ensure it's cleared
              setTimeout(() => {
                if (onAddMessage) {
                  onAddMessage({
                    type: "ai",
                    text: currentAiTextRef.current.trim() || "",
                    isVoice: true,
                    isTyping: false,
                    isStreaming: false,
                  });
                }
              }, 50);
              typingIndicatorClearedRef.current = true;
            }
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
      instanceId,
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
    ]
  );

  return {
    handleServerMessage,
  };
};

export default useServerMessageHandler;
