import React from "react";
import VoiceOrb from "../../atom/VoiceOrb";
import VoiceStatusText from "../../atom/VoiceStatusText";
import VoiceControlButtons from "../../molecule/VoiceControlButtons";
import type { VoiceState } from "../../atom/VoiceOrb";

export interface VoiceModeBarProps {
  voiceState: VoiceState;
  statusText: string;
  error?: string | null;
  frequencyData?: number[];
  onInterrupt: () => void;
  onEndSession: () => void;
  className?: string;
}

/**
 * VoiceModeBar - Organism component combining VoiceOrb, VoiceStatusText, and VoiceControlButtons
 * The main bar component for voice mode interface
 * 
 * This is an ORGANISM because it:
 * - Combines multiple atoms (VoiceOrb, VoiceStatusText)
 * - Combines a molecule (VoiceControlButtons)
 * - Forms a distinct, complex section of the interface
 * - Represents a complete functional unit (voice mode control bar)
 */
const VoiceModeBar: React.FC<VoiceModeBarProps> = ({
  voiceState,
  statusText,
  error,
  frequencyData,
  onInterrupt,
  onEndSession,
  className = "",
}) => {
  return (
    <div
      className={`flex items-center justify-between w-full gap-3 animate-voiceFadeIn ${className}`}
    >
      {/* Voice Orb */}
      <VoiceOrb
        voiceState={voiceState}
        error={error}
        frequencyData={frequencyData}
      />

      {/* Status text */}
      <VoiceStatusText statusText={statusText} error={error} />

      {/* Control buttons */}
      <VoiceControlButtons
        voiceState={voiceState}
        onInterrupt={onInterrupt}
        onEndSession={onEndSession}
      />
    </div>
  );
};

export default VoiceModeBar;

