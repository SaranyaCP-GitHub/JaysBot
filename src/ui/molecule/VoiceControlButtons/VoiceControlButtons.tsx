import React from "react";
import { MicOff, PhoneOff } from "lucide-react";
import IconButton from "../../atom/IconButton";
import type { VoiceState } from "../../atom/VoiceOrb";

export interface VoiceControlButtonsProps {
  voiceState: VoiceState;
  onInterrupt: () => void;
  onEndSession: () => void;
  className?: string;
}

/**
 * VoiceControlButtons - Molecule component combining interrupt and end session buttons
 * Uses IconButton atoms
 */
const VoiceControlButtons: React.FC<VoiceControlButtonsProps> = ({
  voiceState,
  onInterrupt,
  onEndSession,
  className = "",
}) => {
  return (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
      {/* Interrupt button - only visible when speaking */}
      {voiceState === "speaking" && (
        <IconButton
          icon={MicOff}
          onClick={onInterrupt}
          className="p-1.5 sm:p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 hover:scale-105"
          title="Interrupt"
          iconProps={{
            className: "w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600",
          }}
        />
      )}

      {/* End session button */}
      <IconButton
        icon={PhoneOff}
        onClick={onEndSession}
        className="p-1.5 sm:p-2 rounded-full transition-all duration-200 hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
        }}
        title="End Session"
        iconProps={{
          className: "w-3.5 h-3.5 sm:w-4 sm:h-4 text-white",
        }}
      />
    </div>
  );
};

export default VoiceControlButtons;
