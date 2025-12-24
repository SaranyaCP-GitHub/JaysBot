import React from "react";

export interface VoiceStatusTextProps {
  statusText: string;
  error?: string | null;
  className?: string;
}

/**
 * VoiceStatusText - Atom component for displaying voice assistant status
 */
const VoiceStatusText: React.FC<VoiceStatusTextProps> = ({
  statusText,
  error,
  className = "",
}) => {
  return (
    <div className={`flex-1 text-center min-w-0 ${className}`}>
      <p
        className={`text-sm sm:text-base font-medium truncate ${
          error ? "text-red-500" : "text-gray-700"
        }`}
      >
        {statusText}
      </p>
    </div>
  );
};

export default VoiceStatusText;
