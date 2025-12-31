import { useState, useCallback } from "react";

/**
 * Message type for chat history
 */
export interface ChatMessage {
  type: "user" | "ai";
  text: string;
  isVoice?: boolean;
  isStreaming?: boolean;
  isTyping?: boolean;
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
        const lastMessage = prev.length > 0 ? prev[prev.length - 1] : null;
        
        // ⭐ CRITICAL FIX: Only update/replace if BOTH are AI messages AND BOTH are voice messages
        // This prevents voice greetings from overwriting text chat responses
        const shouldUpdateLastMessage = 
          message.type === "ai" &&
          lastMessage?.type === "ai" &&
          lastMessage?.isVoice === true && // Last message must be a voice message
          message.isVoice === true; // New message must also be a voice message
        
        if (shouldUpdateLastMessage && lastMessage) {
          // Update the last voice message instead of adding a new one (for streaming)
          const updated = [...prev];
          
          // Prevent empty text from overwriting existing content
          const newTextHasContent = message.text?.trim();
          const lastTextHasContent = lastMessage.text?.trim();
          
          // Protect against empty overwrites: keep existing text if new text is empty but old has content
          const protectedText = newTextHasContent 
            ? message.text 
            : (lastTextHasContent ? lastMessage.text : message.text);
          
          // If message has text, isTyping should be false
          const shouldBeTyping = message.isTyping === true && !newTextHasContent;
          
          updated[updated.length - 1] = {
            ...lastMessage,
            text: protectedText,
            isVoice: true,
            isStreaming: message.isStreaming !== false, // Default to true unless explicitly false
            isTyping: shouldBeTyping, // Only true if explicitly set AND no text
          };
          return updated;
        }
        
        // Don't add empty AI messages - this prevents phantom empty messages
        if (message.type === "ai" && !message.text?.trim()) {
          return prev; // Return unchanged - don't add empty AI message
        }
        
        // Otherwise, add as a new message (this preserves text chat messages!)
        return [
          ...prev,
          { 
            ...message, 
            isStreaming: message.isStreaming !== false,
            // Only set isTyping to true if explicitly set AND no text
            isTyping: message.isTyping === true && !message.text?.trim(),
          },
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
