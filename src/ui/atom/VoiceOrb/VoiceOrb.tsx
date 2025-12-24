import React from "react";
import { Mic } from "lucide-react";

export type VoiceState = "idle" | "connecting" | "listening" | "processing" | "speaking";

export interface VoiceOrbProps {
  voiceState: VoiceState;
  error?: string | null;
  frequencyData?: number[];
  className?: string;
}

/**
 * VoiceOrb - Atom component for voice assistant visualization
 * Displays different states: listening, speaking, processing, connecting, idle, error
 */
const VoiceOrb: React.FC<VoiceOrbProps> = ({
  voiceState,
  error,
  frequencyData = [0, 0, 0, 0, 0],
  className = "",
}) => {
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* Glow effect */}
      <div
        className={`absolute inset-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full blur-md ${
          voiceState === "listening"
            ? "animate-voicePulseInline"
            : voiceState === "speaking"
            ? "animate-voiceSpeakingPulseInline"
            : ""
        }`}
        style={{
          background:
            voiceState === "speaking"
              ? "linear-gradient(to right, #22d3ee, #60a5fa)"
              : error
              ? "linear-gradient(to right, #ef4444, #dc2626)"
              : "linear-gradient(to right, #818cf8, #6366f1)",
          opacity: 0.4,
        }}
      />

      {/* Main orb */}
      <div
        className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden ${
          voiceState === "listening"
            ? "animate-voiceOrbInline"
            : voiceState === "speaking"
            ? "animate-voiceSpeakingOrbInline"
            : ""
        }`}
        style={{
          background: error
            ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
            : voiceState === "speaking"
            ? "linear-gradient(135deg, #22d3ee 0%, #60a5fa 50%, #818cf8 100%)"
            : voiceState === "processing" || voiceState === "connecting"
            ? "linear-gradient(135deg, #a78bfa 0%, #818cf8 50%, #6366f1 100%)"
            : "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)",
          boxShadow: "0 0 20px rgba(99, 102, 241, 0.3)",
        }}
      >
        {/* Realistic voice visualization based on actual audio modulation */}
        {voiceState === "listening" && !error && (
          <div className="flex items-center justify-center gap-0.5">
            {frequencyData.map((height, index) => (
              <span
                key={index}
                style={{
                  display: "block",
                  width: "2px",
                  height: `${height}px`,
                  minHeight: "4px",
                  background: "white",
                  borderRadius: "2px",
                  transition: "height 0.1s ease-out",
                  transformOrigin: "bottom",
                }}
              />
            ))}
          </div>
        )}

        {/* Animated bars for speaking */}
        {voiceState === "speaking" && !error && (
          <div className="flex items-center justify-center gap-0.5">
            {[8, 14, 18, 14, 8].map((height, index) => (
              <span
                key={index}
                style={{
                  display: "block",
                  width: "2.5px",
                  height: `${height}px`,
                  background: "white",
                  borderRadius: "2px",
                  animation: "voiceBarAnimInline 0.6s ease-in-out infinite",
                  animationDelay: `${index * 0.08}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Processing/Connecting spinner */}
        {(voiceState === "processing" || voiceState === "connecting") &&
          !error && (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}

        {/* Idle or Error state - mic icon */}
        {(voiceState === "idle" || error) && (
          <Mic className="w-4 h-4 text-white" />
        )}
      </div>
    </div>
  );
};

export default VoiceOrb;

