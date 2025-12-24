import React from "react";
import { AudioLines, Sparkles } from "lucide-react";
import LoadingDots from "../../atom/LoadingDots";

export interface MinimizedChatHeaderProps {
  lastMessage?: {
    type: "user" | "ai";
    text: string;
    isVoice?: boolean;
  } | null;
  isTyping?: boolean;
  className?: string;
}

/**
 * MinimizedChatHeader - Molecule component for minimized chat header
 * Shows icon and last message or typing indicator
 */
const MinimizedChatHeader: React.FC<MinimizedChatHeaderProps> = ({
  lastMessage,
  isTyping = false,
  className = "",
}) => {
  if (!lastMessage && !isTyping) return null;

  const isVoice = lastMessage?.isVoice || false;
  const isAi = lastMessage?.type === "ai";

  return (
    <div
      className={`absolute top-2 left-3 right-3 flex items-center gap-3 text-gray-800 text-base overflow-hidden ${className}`}
    >
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center">
        {isAi && isVoice ? (
          <AudioLines className="w-3 h-3 text-white" />
        ) : (
          <Sparkles className="w-3 h-3 text-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isTyping ? (
          <LoadingDots size="sm" color="#818cf8" />
        ) : (
          lastMessage &&
          lastMessage.type === "ai" && (
            <p className="text-ellipsis overflow-hidden whitespace-nowrap">
              {lastMessage.text}
            </p>
          )
        )}
      </div>
    </div>
  );
};

export default MinimizedChatHeader;
