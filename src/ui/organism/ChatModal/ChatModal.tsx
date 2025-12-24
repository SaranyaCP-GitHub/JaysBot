import React, { useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import IconButton from "../../atom/IconButton";
import MinimizedChatHeader from "../../molecule/MinimizedChatHeader";
import ChatMessage from "../../molecule/ChatMessage";
import TypingIndicator from "../../molecule/TypingIndicator";

export interface ChatMessageType {
  type: "user" | "ai";
  text: string;
  isVoice?: boolean;
  isTyping?: boolean;
}

export interface ChatModalProps {
  isVisible: boolean;
  minimized: boolean;
  chatHistory: ChatMessageType[];
  isTyping: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  modalStyles: {
    bottom: string;
    maxHeight: string;
    chatMaxHeight: string;
  };
  className?: string;
}

/**
 * ChatModal - Organism component for the chat modal interface
 * Combines backdrop, modal container, header, and message list
 */
const ChatModal: React.FC<ChatModalProps> = ({
  isVisible,
  minimized,
  chatHistory,
  isTyping,
  onMinimize,
  onExpand,
  modalStyles,
  className = "",
}) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current && !minimized) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping, minimized]);

  if (!isVisible) return null;

  return (
    <div className={`animate-modalIn ${className}`}>
      {!minimized && (
        <div
          className="fixed inset-0 z-40 animate-fadeIn"
          onClick={onMinimize}
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
        />
      )}
      <div
        className={`fixed left-1 right-1 z-[50] transition-all duration-300 ease-out pointer-events-none overflow-hidden ${
          minimized ? "cursor-pointer" : ""
        }`}
        style={{
          bottom: modalStyles.bottom,
          maxHeight: modalStyles.maxHeight,
          opacity: 1,
        }}
      >
        <div
          className="relative w-full max-w-[656px] mx-auto px-2 sm:px-4"
          style={{ marginBottom: "-16px" }}
        >
          <div
            className={`relative w-full bg-white/95 backdrop-blur-xl rounded-t-3xl overflow-hidden border border-gray-200 flex flex-col pointer-events-auto animate-slideUp ${
              minimized ? "cursor-pointer" : "cursor-default"
            }`}
            style={{
              boxShadow:
                "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (minimized) {
                onExpand();
              }
            }}
          >
            <IconButton
              icon={ChevronDown}
              onClick={onMinimize}
              className={`flex self-end z-10 p-1.5 mr-3 mt-2 mb-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all ${
                minimized ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
              iconProps={{
                className: "w-4 h-4",
              }}
            />

            {minimized && (chatHistory.length > 0 || isTyping) && (
              <MinimizedChatHeader
                lastMessage={
                  chatHistory.length > 0
                    ? chatHistory[chatHistory.length - 1]
                    : null
                }
                isTyping={isTyping}
              />
            )}

            <div
              className={`flex flex-col transition-opacity duration-300 ${
                minimized
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100 pointer-events-auto"
              }`}
            >
              <div
                ref={chatContainerRef}
                className="overflow-y-auto px-4 sm:px-6 pt-1 pb-10 mb-2 space-y-4 pointer-events-auto"
                style={{
                  scrollBehavior: "smooth",
                  scrollbarWidth: "thin",
                  scrollbarColor: "#e5e7eb transparent",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                  maxHeight: modalStyles.chatMaxHeight,
                }}
              >
                {chatHistory.map((message, index) => (
                  <div key={index} className="animate-fadeIn">
                    <ChatMessage
                      type={message.type}
                      text={message.text}
                      isVoice={message.isVoice}
                      isTyping={message.isTyping}
                    />
                  </div>
                ))}

                {isTyping && <TypingIndicator />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatModal;
