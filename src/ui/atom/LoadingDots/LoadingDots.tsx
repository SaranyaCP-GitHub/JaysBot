import React from "react";

interface LoadingDotsProps {
  size?: "sm" | "md" | "lg";
  color?: string;
  className?: string;
  dotClassName?: string;
}

/**
 * Reusable LoadingDots atom component
 * Displays animated bouncing dots for loading states
 */
const LoadingDots: React.FC<LoadingDotsProps> = ({
  size = "md",
  color = "#818cf8",
  className = "",
  dotClassName = "",
}) => {
  // Size mapping
  const sizeMap = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  const dotSize = sizeMap[size];

  return (
    <div className={`flex gap-2 items-center ${className}`}>
      <div
        className={`${dotSize} rounded-full loading-dot-bounce ${dotClassName}`}
        style={{ backgroundColor: color }}
      />
      <div
        className={`${dotSize} rounded-full loading-dot-bounce ${dotClassName}`}
        style={{
          backgroundColor: color,
          animationDelay: "0.2s",
        }}
      />
      <div
        className={`${dotSize} rounded-full loading-dot-bounce ${dotClassName}`}
        style={{
          backgroundColor: color,
          animationDelay: "0.4s",
        }}
      />
    </div>
  );
};

export default LoadingDots;
