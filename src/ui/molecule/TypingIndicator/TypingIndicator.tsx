import React from "react";
import { Sparkles } from "lucide-react";
import LoadingDots from "../../atom/LoadingDots";

export interface TypingIndicatorProps {
  className?: string;
}

/**
 * TypingIndicator - Molecule component for showing AI typing indicator
 * Combines icon and loading dots
 */
const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-3 animate-fadeIn ${className}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center shadow-sm">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex bg-gradient-to-br from-[#f3f0ff] to-[#faf8ff] rounded-2xl rounded-tl-none p-4 shadow-sm border border-[#e9d5ff]/30">
        <LoadingDots size="md" color="#818cf8" />
      </div>
    </div>
  );
};

export default TypingIndicator;
