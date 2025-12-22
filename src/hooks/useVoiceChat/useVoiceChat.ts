import { useState, useCallback } from "react";

/**
 * Message type for chat history
 */
export interface ChatMessage {
  type: "user" | "ai";
  text: string;
  isVoice?: boolean;
  isStreaming?: boolean;
}

/**
 * Parameters for useVoiceChat hook
 */
export interface UseVoiceChatParams {
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  hasSearched: boolean;
  setMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setAnimationStep: React.Dispatch<React.SetStateAction<number>>;
  setShowLady: React.Dispatch<React.SetStateAction<boolean>>;
  setHasSearched: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Return type for useVoiceChat hook
 */
export interface UseVoiceChatReturn {
  isLiveVoiceActive: boolean;
  startLiveVoice: () => void;
  closeLiveVoice: () => void;
  addVoiceMessage: (message: ChatMessage) => void;
  showChatForVoice: () => void;
}

/**
 * Custom hook for managing voice chat functionality
 * @param params - Required state setters and values
 * @returns Voice chat state and functions
 */
const useVoiceChat = (params: UseVoiceChatParams): UseVoiceChatReturn => {
  const {
    setChatHistory,
    hasSearched,
    setMinimized,
    setAnimationStep,
    setShowLady,
    setHasSearched,
  } = params;

  const [isLiveVoiceActive, setIsLiveVoiceActive] = useState(false);

  const startLiveVoice = useCallback(() => {
    setIsLiveVoiceActive(true);
  }, []);

  const closeLiveVoice = useCallback(() => {
    setIsLiveVoiceActive(false);
  }, []);

  // Add message from voice to chat history
  const addVoiceMessage = useCallback(
    (message: ChatMessage) => {
      setChatHistory((prev) => {
        // If it's an AI message and the last message is also an AI message (streaming update)
        if (
          message.type === "ai" &&
          prev.length > 0 &&
          prev[prev.length - 1].type === "ai"
        ) {
          // Update the last message instead of adding a new one (for streaming)
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text: message.text,
            isVoice: message.isVoice || updated[updated.length - 1].isVoice,
            isStreaming: message.isStreaming !== false, // Default to true unless explicitly false
          };
          return updated;
        }
        // Otherwise, add as a new message
        return [
          ...prev,
          { ...message, isStreaming: message.isStreaming !== false },
        ];
      });
    },
    [setChatHistory]
  );

  // Show chat modal for voice conversation
  const showChatForVoice = useCallback(() => {
    // Prevent duplicate calls - if already searched, just minimize
    if (hasSearched) {
      setMinimized(false);
      return;
    }
    setAnimationStep(1);
    setTimeout(() => {
      setAnimationStep(2);
      setTimeout(() => {
        setAnimationStep(3);
        setShowLady(true);
        setHasSearched(true);
      }, 400);
    }, 0);
    setMinimized(false);
  }, [
    hasSearched,
    setMinimized,
    setAnimationStep,
    setShowLady,
    setHasSearched,
  ]);

  return {
    isLiveVoiceActive,
    startLiveVoice,
    closeLiveVoice,
    addVoiceMessage,
    showChatForVoice,
  };
};

export default useVoiceChat;
