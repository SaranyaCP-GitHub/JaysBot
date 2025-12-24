import React from "react";
import { AudioLines, Sparkles } from "lucide-react";
import LoadingDots from "../../atom/LoadingDots";
import { parseBoldText } from "../../../utils/textUtils";

export interface ChatMessageProps {
  type: "user" | "ai";
  text: string;
  isVoice?: boolean;
  isTyping?: boolean;
  className?: string;
}

/**
 * ChatMessage - Molecule component for displaying chat messages
 * Handles both user and AI messages with different styling
 */
const ChatMessage: React.FC<ChatMessageProps> = ({
  type,
  text,
  isVoice = false,
  isTyping = false,
  className = "",
}) => {
  if (type === "user") {
    return (
      <div
        className={`flex items-start gap-2 sm:gap-3 justify-end ${className}`}
      >
        <div className="bg-gradient-to-r from-[#818cf8] to-[#6366f1] text-white rounded-2xl rounded-tr-none p-3 shadow-sm inline-block max-w-[85%] sm:max-w-[70%]">
          {isVoice ? (
            <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words italic font-semibold">
              {text}
            </p>
          ) : (
            <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
              {text}
            </p>
          )}
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className={`flex gap-2 sm:gap-3 ${className}`}>
      <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center shadow-sm mt-3">
        {isVoice ? (
          <AudioLines className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
        ) : (
          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
        )}
      </div>
      <div className="flex-shrink-0 max-w-[85%] sm:max-w-[75%]">
        <div className="bg-gradient-to-br from-[#f3f0ff] to-[#faf8ff] rounded-2xl rounded-tl-none p-3 shadow-sm border border-[#e9d5ff]/30 inline-block">
          {isTyping ? (
            <LoadingDots size="md" color="#818cf8" />
          ) : (
            <p className="text-gray-800 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
              {parseBoldText(text)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
