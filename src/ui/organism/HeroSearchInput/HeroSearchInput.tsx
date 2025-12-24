import React from "react";
import GlowInputContainer from "../../molecule/GlowInputContainer";

export interface HeroSearchInputProps {
  children: React.ReactNode;
  isVisible?: boolean;
  inputRef?: React.RefObject<HTMLDivElement>;
  className?: string;
}

/**
 * HeroSearchInput - Organism component for hero section search input
 * Handles fade out and shrink animations when scrolled
 */
const HeroSearchInput: React.FC<HeroSearchInputProps> = ({
  children,
  isVisible = true,
  inputRef,
  className = "",
}) => {
  return (
    <div
      ref={inputRef}
      style={{ overflow: "visible", paddingBottom: "9px" }}
      className={`w-full max-w-[656px] px-2 sm:px-0 transition-all duration-500 ease-out overflow-hidden ${
        isVisible
          ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
          : "opacity-100 scale-100 max-h-32"
      } ${className}`}
    >
      <GlowInputContainer>{children}</GlowInputContainer>
    </div>
  );
};

export default HeroSearchInput;
