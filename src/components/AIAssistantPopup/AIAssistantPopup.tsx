import React, { useState, useEffect, useRef } from "react";

import LiveVoiceMode from "@/components/LiveVoiceMode";
import SearchInput from "@/components/searchInput/SearchInput";
// Organism components
import VoiceModeContainer from "@/ui/organism/VoiceModeContainer";
import SearchInputSection from "@/ui/organism/SearchInputSection";
import HeroSearchInput from "@/ui/organism/HeroSearchInput";
import ChatModal from "@/ui/organism/ChatModal";
// Types
import type { ChatMessage } from "@/hooks/useVoiceChat";
import type { ChatMessageType } from "@/ui/organism/ChatModal";
import type { ModalStyles } from "@/hooks/useResponsiveValues";
// Hooks
import useResponsiveValues from "@/hooks/useResponsiveValues";
import { getSessionKey } from "@/services/sessionService";
import useVoiceChat from "@/hooks/useVoiceChat";
import useChat from "@/hooks/useChat";
// Constants
import { PLACEHOLDER_QUESTIONS } from "@/constants/chatConstants";

// Styles
import "@/styles/animations.css";

const AIAssistantPopup: React.FC = () => {
  const [query, setQuery] = useState<string>("");
  const [showLady, setShowLady] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const [animationStep, setAnimationStep] = useState<number>(0); // 0: initial, 1: hero fading, 2: bottom showing, 3: modal showing
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState<number>(0);
  const [isHeroInputFocused, setIsHeroInputFocused] = useState<boolean>(false);

  const bottomInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLDivElement>(null);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const { getModalStyles } = useResponsiveValues();
  const modalStyles: ModalStyles = getModalStyles(minimized);

  // Use voice chat hook
  const {
    isLiveVoiceActive,
    startLiveVoice,
    closeLiveVoice,
    addVoiceMessage,
    showChatForVoice,
  } = useVoiceChat({
    setChatHistory,
    hasSearched,
    setMinimized,
    setAnimationStep,
    setShowLady,
    setHasSearched,
  });

  // Use chat hook
  const { handleSearch } = useChat({
    query,
    setQuery,
    hasSearched,
    placeholderQuestions: [...PLACEHOLDER_QUESTIONS], // Convert readonly array to mutable
    placeholderIndex,
    sessionKey,
    setSessionKey,
    setChatHistory,
    setIsTyping,
    setAnimationStep,
    setShowLady,
    setHasSearched,
    setIsScrolled,
    setMinimized,
  });

  // Use Intersection Observer to detect when hero input leaves viewport
  useEffect(() => {
    if (!heroSentinelRef.current || hasSearched) return;

    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        entries.forEach((entry) => {
          // When sentinel is NOT intersecting (out of viewport), show bottom sticky
          // When it IS intersecting (in viewport), hide bottom sticky and show hero input
          setIsScrolled(!entry.isIntersecting);
        });
      },
      {
        // Trigger when any part of the element enters/leaves viewport
        threshold: 0,
        // Small margin to trigger slightly before fully out
        rootMargin: "0px",
      }
    );

    observer.observe(heroSentinelRef.current);

    return () => {
      if (heroSentinelRef.current) {
        observer.unobserve(heroSentinelRef.current);
      }
    };
  }, [hasSearched]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showLady && !minimized) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showLady, minimized]);

  // Initialize session key on component mount
  useEffect(() => {
    const initializeSessionKey = async (): Promise<void> => {
      const key = await getSessionKey();
      if (key) {
        setSessionKey(key);
      }
    };
    initializeSessionKey();
  }, []);

  // Rotate placeholder text every 4 seconds (only for hero input, pause when focused)
  useEffect(() => {
    if (hasSearched || isHeroInputFocused) return; // Stop rotating after first search or when focused

    const interval = setInterval(() => {
      setPlaceholderIndex(
        (prevIndex) => (prevIndex + 1) % PLACEHOLDER_QUESTIONS.length
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [hasSearched, isHeroInputFocused]);

  // Convert ChatMessage to ChatMessageType for ChatModal
  const chatHistoryForModal: ChatMessageType[] = chatHistory.map((msg) => ({
    type: msg.type,
    text: msg.text,
    isVoice: msg.isVoice,
    isTyping: msg.isTyping,
  }));

  return (
    <div className="bg-transparent relative overflow-auto">
      {/* LiveVoiceMode - rendered once, always present to prevent remounting */}
      {isLiveVoiceActive && (
        <VoiceModeContainer>
          <LiveVoiceMode
            key="live-voice-mode" // Stable key to prevent remounting
            isActive={isLiveVoiceActive}
            onClose={closeLiveVoice}
            onAddMessage={addVoiceMessage}
            onShowChat={showChatForVoice}
          />
        </VoiceModeContainer>
      )}

      {/* Bottom fixed input - slides in from bottom when scrolled or animation step 2+ */}
      {/* Hide when voice is active to prevent duplicate UI */}
      {!hasSearched && !isLiveVoiceActive && (
        <SearchInputSection
          isVisible={isScrolled || animationStep >= 2}
          zIndex={50}
          className="p-2"
        >
          {!isLiveVoiceActive && (
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              onSearch={handleSearch}
              onVoiceStart={startLiveVoice}
              placeholder="Ask us anything about Techjays"
              inputRef={bottomInputRef as React.RefObject<HTMLInputElement>}
              disableSendWhenEmpty={true}
            />
          )}
        </SearchInputSection>
      )}

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Sentinel element for Intersection Observer - always at hero input position */}
        {!hasSearched && (
          <div
            ref={heroSentinelRef}
            className="w-full max-w-[656px] h-1 pointer-events-none"
          />
        )}

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <HeroSearchInput
            inputRef={heroInputRef as React.RefObject<HTMLDivElement>}
            isVisible={isScrolled || animationStep >= 1 || isLiveVoiceActive}
          >
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              onSearch={handleSearch}
              onVoiceStart={startLiveVoice}
              placeholder="Ask us anything about Techjays"
              showAnimatedPlaceholder={true}
              animatedPlaceholderText={PLACEHOLDER_QUESTIONS[placeholderIndex]}
              isInputFocused={isHeroInputFocused}
              onFocus={() => setIsHeroInputFocused(true)}
              onBlur={() => setIsHeroInputFocused(false)}
              containerClassName="relative"
            />
          </HeroSearchInput>
        )}
      </div>

      {showLady && (isTyping || chatHistory.length > 0) && (
        <ChatModal
          isVisible={true}
          minimized={minimized}
          chatHistory={chatHistoryForModal}
          isTyping={isTyping}
          onMinimize={() => setMinimized(true)}
          onExpand={() => setMinimized(false)}
          modalStyles={modalStyles}
        />
      )}

      {/* Input container when hasSearched - hide when voice is active to prevent duplicate UI */}
      {hasSearched && !isLiveVoiceActive && (
        <SearchInputSection isVisible={true} zIndex={50}>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            onSearch={handleSearch}
            onVoiceStart={startLiveVoice}
            placeholder="Ask us anything about Techjays"
            autoFocus={true}
            disableSendWhenEmpty={true}
          />
        </SearchInputSection>
      )}
    </div>
  );
};

export default AIAssistantPopup;
