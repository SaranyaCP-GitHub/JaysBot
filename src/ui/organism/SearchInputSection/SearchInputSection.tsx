import React from "react";
import GlowInputContainer from "../../molecule/GlowInputContainer";

export interface SearchInputSectionProps {
  children: React.ReactNode;
  isVisible?: boolean;
  className?: string;
  zIndex?: number;
}

/**
 * SearchInputSection - Organism component for search input with positioning
 * Handles fixed positioning and visibility transitions
 */
const SearchInputSection: React.FC<SearchInputSectionProps> = ({
  children,
  isVisible = true,
  className = "",
  zIndex = 50,
}) => {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 px-2 pb-2 sm:px-4 sm:pb-4 to-transparent transition-all duration-500 ease-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0 pointer-events-none"
      } ${className}`}
      style={{ zIndex }}
    >
      <div className="w-full max-w-[656px] mx-auto">
        <GlowInputContainer>{children}</GlowInputContainer>
      </div>
    </div>
  );
};

export default SearchInputSection;
