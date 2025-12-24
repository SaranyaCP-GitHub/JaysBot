import React from "react";
import GlowInputContainer from "../../molecule/GlowInputContainer";

export interface VoiceModeContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * VoiceModeContainer - Organism component that wraps LiveVoiceMode with GlowInputContainer
 * Provides positioning and styling for voice mode interface
 */
const VoiceModeContainer: React.FC<VoiceModeContainerProps> = ({
  children,
  className = "",
}) => {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[60] px-2 pb-2 sm:px-4 sm:pb-4 ${className}`}
    >
      <div className="w-full max-w-[656px] mx-auto">
        <GlowInputContainer>{children}</GlowInputContainer>
      </div>
    </div>
  );
};

export default VoiceModeContainer;
