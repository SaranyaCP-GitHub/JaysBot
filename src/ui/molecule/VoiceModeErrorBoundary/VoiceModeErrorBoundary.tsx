import React from "react";
import { RotateCcw } from "lucide-react";
import IconButton from "../../atom/IconButton";

export interface VoiceModeErrorBoundaryProps {
  error: string;
  onReset: () => void;
  className?: string;
}

/**
 * VoiceModeErrorBoundary - Molecule component for voice mode error recovery
 * Displays error message with reset button
 * Uses IconButton atom component for consistency
 */
const VoiceModeErrorBoundary: React.FC<VoiceModeErrorBoundaryProps> = ({
  error,
  onReset,
  className = "",
}) => {
  return (
    <div
      className={`flex items-center justify-between w-full gap-3 p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800">
          Voice assistant encountered an error.
        </p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
      <IconButton
        icon={RotateCcw}
        onClick={onReset}
        className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors flex items-center gap-1.5"
        title="Reset"
        iconProps={{
          className: "w-4 h-4",
        }}
      >
        <span className="text-sm font-medium text-white">Reset</span>
      </IconButton>
    </div>
  );
};

export default VoiceModeErrorBoundary;
