import React from "react";
import { Sparkles, AudioLines, Send } from "lucide-react";
import IconButton from "../../ui/atom/IconButton";

interface SearchInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: () => void;
  onVoiceStart: () => void;
  placeholder?: string;
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  autoFocus?: boolean;
  disableSendWhenEmpty?: boolean;
  showAnimatedPlaceholder?: boolean;
  animatedPlaceholderText?: string;
  isInputFocused?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  inputClassName?: string;
  containerClassName?: string;
}

/**
 * Reusable SearchInput component with Sparkles icon, input field, voice button, and send button
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSearch,
  onVoiceStart,
  placeholder = "Ask us anything about Techjays",
  onKeyPress,
  inputRef,
  autoFocus = false,
  disableSendWhenEmpty = false,
  showAnimatedPlaceholder = false,
  animatedPlaceholderText = "",
  isInputFocused = false,
  onFocus,
  onBlur,
  inputClassName = "",
  containerClassName = "",
}) => {
  const isQueryEmpty = !value?.trim();
  const shouldDisableSend = disableSendWhenEmpty && isQueryEmpty;

  // Handle placeholder for hero input
  const displayPlaceholder =
    showAnimatedPlaceholder && !isInputFocused ? "" : placeholder;

  return (
    <div className={`flex items-center w-full ${containerClassName}`}>
      <Sparkles className="mr-2 w-4 h-4 sm:w-5 sm:h-5 text-[#818cf8] flex-shrink-0" />
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={onChange}
          onKeyPress={onKeyPress}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={displayPlaceholder}
          autoFocus={autoFocus}
          className={`w-full text-base text-gray-800 placeholder:text-base focus:outline-none bg-transparent ${
            showAnimatedPlaceholder && isInputFocused
              ? "placeholder-gray-400"
              : showAnimatedPlaceholder
              ? ""
              : "placeholder-gray-400"
          } ${inputClassName}`}
        />
        {showAnimatedPlaceholder && !isInputFocused && isQueryEmpty && (
          <div className="absolute left-0 top-0 w-full h-full flex items-center pointer-events-none animate-placeholderSlide bg-transparent">
            <span
              className="text-gray-800"
              style={{ fontSize: "1rem", lineHeight: "19px" }}
            >
              {animatedPlaceholderText}
            </span>
          </div>
        )}
      </div>
      <IconButton
        icon={AudioLines}
        onClick={onVoiceStart}
        className="ml-2 -mr-2 -z-2 sm:p-2 rounded-full transition-all duration-300 ease-in-out hover:-translate-x-2 bg-[#818cf8]/20 hover:bg-[#818cf8]/30 border-1 border-[#6366f1]/30"
        title="Start live voice chat"
        iconProps={{
          className: "w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6366f1]",
          strokeWidth: 3,
        }}
      />
      <IconButton
        icon={Send}
        onClick={onSearch}
        className={`p-1.5 sm:p-2 rounded-full ${
          shouldDisableSend
            ? "bg-[#818cf8] cursor-not-allowed"
            : "bg-[#6366f1] hover:bg-[#4f46e5] transition-all hover:scale-105"
        }`}
        disabled={shouldDisableSend}
        iconProps={{
          className: "w-3.5 h-3.5 sm:w-4 sm:h-4 text-white",
        }}
      />
    </div>
  );
};

export default SearchInput;
