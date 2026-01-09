import React, { useState, useEffect, useRef } from "react";
import { Mic, AudioLines, Sparkles, ChevronDown } from "lucide-react";
import LiveVoiceMode from "./LiveVoiceMode";
import SearchInput from "./searchInput/SearchInput";
import IconButton from "../ui/atom/IconButton";
import LoadingDots from "../ui/atom/LoadingDots";
import { parseBoldText } from "../utils/textUtils";
import useResponsiveValues from "../hooks/useResponsiveValues";
import { getSessionKey } from "../services/sessionService";
import useVoiceChat from "../hooks/useVoiceChat";
import useChat from "../hooks/useChat";
import { PLACEHOLDER_QUESTIONS } from "../constants/chatConstants";

const AIAssistantPopup = () => {
  const [query, setQuery] = useState("");
  const [showLady, setShowLady] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [animationStep, setAnimationStep] = useState(0); // 0: initial, 1: hero fading, 2: bottom showing, 3: modal showing
  const [sessionKey, setSessionKey] = useState(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isHeroInputFocused, setIsHeroInputFocused] = useState(false);

  const chatContainerRef = useRef(null);
  const bottomInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const heroSentinelRef = useRef(null);
  const { getModalStyles } = useResponsiveValues();
  const modalStyles = getModalStyles(minimized);

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
    placeholderQuestions: PLACEHOLDER_QUESTIONS,
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
      (entries) => {
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current && !minimized) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping, minimized]);

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
    const initializeSessionKey = async () => {
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

  return (
    <div id="techjays-chatbot" className="bg-transparent relative overflow-auto">
      {/* LiveVoiceMode - rendered once, always present to prevent remounting */}
      {isLiveVoiceActive && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-4 pb-4 sm:px-4 sm:pb-4">
          <div className="w-full max-w-full sm:max-w-[656px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-12 flex items-center p-3">
                <LiveVoiceMode
                  key="live-voice-mode" // Stable key to prevent remounting
                  isActive={isLiveVoiceActive}
                  onClose={closeLiveVoice}
                  onAddMessage={addVoiceMessage}
                  onShowChat={showChatForVoice}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom fixed input - slides in from bottom when scrolled or animation step 2+ */}
      {/* Hide when voice is active to prevent duplicate UI */}
      {!hasSearched && !isLiveVoiceActive && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-4 to-transparent transition-all duration-500 ease-out ${
            isScrolled || animationStep >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div className="w-full max-w-full sm:max-w-[656px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-12 flex items-center p-3">
                {!isLiveVoiceActive && (
                  <SearchInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    onSearch={handleSearch}
                    onVoiceStart={startLiveVoice}
                    placeholder="Ask us anything about Techjays"
                    inputRef={bottomInputRef}
                    disableSendWhenEmpty={true}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Sentinel element for Intersection Observer - always at hero input position */}
        {!hasSearched && (
          <div
            ref={heroSentinelRef}
            className="w-full max-w-full sm:max-w-[656px] h-1 pointer-events-none"
          />
        )}

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <div
            ref={heroInputRef}
            style={{ overflow: "visible", paddingBottom: "9px" }}
            className={`w-full max-w-full sm:max-w-[656px] px-4 sm:px-0 transition-all duration-500 ease-out overflow-hidden ${
              isScrolled || animationStep >= 1 || isLiveVoiceActive
                ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
                : "opacity-100 scale-100 max-h-32"
            }`}
          >
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-13 flex items-center p-3">
                <SearchInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  onSearch={handleSearch}
                  onVoiceStart={startLiveVoice}
                  placeholder="Ask us anything about Techjays"
                  showAnimatedPlaceholder={true}
                  animatedPlaceholderText={
                    PLACEHOLDER_QUESTIONS[placeholderIndex]
                  }
                  isInputFocused={isHeroInputFocused}
                  onFocus={() => setIsHeroInputFocused(true)}
                  onBlur={() => setIsHeroInputFocused(false)}
                  containerClassName="relative"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {showLady && (isTyping || chatHistory.length > 0) && (
        <div className="animate-modalIn">
          {!minimized && (
            <div
              className="fixed inset-0 z-40 animate-fadeIn"
              onClick={() => setMinimized(true)}
              onWheel={(e) => e.preventDefault()}
              onTouchMove={(e) => e.preventDefault()}
            />
          )}
          <div
            className={`fixed left-4 right-4 sm:left-1 sm:right-1 z-[50] transition-all duration-300 ease-out pointer-events-none overflow-hidden ${
              minimized ? "cursor-pointer" : ""
            }`}
            style={{
              bottom: modalStyles.bottom,
              maxHeight: modalStyles.maxHeight,
              opacity: 1,
            }}
          >
            <div
              className="relative w-full max-w-full sm:max-w-[656px] mx-auto px-4 sm:px-4"
              style={{ marginBottom: "-16px" }}
            >
              <div
                className={`relative w-full bg-white/95 backdrop-blur-xl rounded-t-3xl overflow-hidden border border-gray-200 flex flex-col pointer-events-auto animate-slideUp ${
                  minimized ? "cursor-pointer" : "cursor-default"
                }`}
                style={{
                  boxShadow:
                    "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (minimized) {
                    setMinimized(false);
                  }
                }}
              >
                <IconButton
                  icon={ChevronDown}
                  onClick={() => setMinimized(true)}
                  className={`flex self-end z-10 p-1.5 mr-3 mt-2 mb-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all ${
                    minimized ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                  iconProps={{
                    className: "w-4 h-4",
                  }}
                />

                {minimized && (chatHistory.length > 0 || isTyping) && (
                  <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-gray-800 text-base overflow-hidden">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center">
                      {chatHistory[chatHistory.length - 1] &&
                      chatHistory[chatHistory.length - 1].type === "ai" &&
                      chatHistory[chatHistory.length - 1].isVoice ? (
                        <AudioLines className="w-3 h-3 text-white" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isTyping ? (
                        <LoadingDots size="sm" color="#818cf8" />
                      ) : (
                        chatHistory[chatHistory.length - 1] &&
                        chatHistory[chatHistory.length - 1].type === "ai" && (
                          <p className="text-ellipsis overflow-hidden whitespace-nowrap ">
                            {chatHistory[chatHistory.length - 1].text}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div
                  className={`flex flex-col transition-opacity duration-300 ${
                    minimized
                      ? "opacity-0 pointer-events-none"
                      : "opacity-100 pointer-events-auto"
                  }`}
                >
                  <div
                    ref={chatContainerRef}
                    className="overflow-y-auto px-4 sm:px-6 pt-1 pb-10 mb-2 space-y-4 pointer-events-auto"
                    style={{
                      scrollBehavior: "smooth",
                      scrollbarWidth: "thin",
                      scrollbarColor: "#e5e7eb transparent",
                      WebkitOverflowScrolling: "touch",
                      overscrollBehavior: "contain",
                      maxHeight: modalStyles.chatMaxHeight,
                    }}
                  >
                    {chatHistory.map((message, index) => (
                      <div key={index} className="animate-fadeIn">
                        {message.type === "user" ? (
                          <div className="flex items-start gap-2 sm:gap-3 justify-end">
                            <div className="bg-gradient-to-r from-[#818cf8] to-[#6366f1] text-white rounded-2xl rounded-tr-none p-3 shadow-sm inline-block max-w-[85%] sm:max-w-[70%]">
                              {message.isVoice ? (
                                <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words italic font-semibold">
                                  {message.text}
                                </p>
                              ) : (
                                <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                                  {message.text}
                                </p>
                              )}
                            </div>
                            {/* {message.isVoice && (
                              <div className="relative">
                                <div className="absolute -top-3 right-2 ">
                                  <Mic
                                    className="w-6 h-6 bg-gray-100 shadow-lg rounded-full p-1"
                                    color="#818cf8"
                                    strokeWidth={2.5}
                                  />
                                </div>
                              </div>
                            )} */}
                          </div>
                        ) : (
                          <div className="flex gap-2 sm:gap-3 ">
                            <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center shadow-sm mt-3">
                              {message.isVoice ? (
                                <AudioLines className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                              ) : (
                                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                              )}
                            </div>
                            <div className="flex-shrink-0 max-w-[85%] sm:max-w-[75%]">
                              <div className="bg-gradient-to-br from-[#f3f0ff] to-[#faf8ff] rounded-2xl rounded-tl-none p-3 shadow-sm border border-[#e9d5ff]/30 inline-block">
                                {/* {message.isVoice && (
                                  <div className="flex items-center gap-1 text-[#818cf8]/70 text-xs mb-1">
                                    <AudioLines className="w-3 h-3" />
                                  </div>
                                )} */}
                                {message.isTyping ? (
                                  <LoadingDots size="md" color="#818cf8" />
                                ) : (
                                  <p className="text-gray-800 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                                    {message.isVoice
                                      ? parseBoldText(message.text)
                                      : parseBoldText(message.text)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isTyping && (
                      <div className="flex items-center gap-3 animate-fadeIn">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center shadow-sm">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex bg-gradient-to-br from-[#f3f0ff] to-[#faf8ff] rounded-2xl rounded-tl-none p-4 shadow-sm border border-[#e9d5ff]/30">
                          <LoadingDots size="md" color="#818cf8" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input container when hasSearched - hide when voice is active to prevent duplicate UI */}
      {hasSearched && !isLiveVoiceActive && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:px-4 sm:pb-4 to-transparent">
          <div className="w-full max-w-full sm:max-w-[656px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-12 flex items-center p-3">
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
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes loadingDotBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        .loading-dot-bounce {
          animation: loadingDotBounce 1.4s ease-in-out infinite;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes slideUp {
          from { 
            opacity: 0; 
            transform: translateY(100%);
          }
          to { 
            opacity: 1; 
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes modalIn {
          from { 
            opacity: 0;
          }
          to { 
            opacity: 1;
          }
        }
        .animate-modalIn {
          animation: modalIn 0.3s ease-out;
        }
        
        @keyframes borderGlow {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }
        
        .input-glow-container {
          position: relative;
          padding: 2.5px;
          border-radius: 50px;
          background: linear-gradient(
            90deg,
            #c084fc,
            #a78bfa,
            #818cf8,
            #60a5fa,
            #22d3ee,
            #60a5fa,
            #818cf8,
            #c084fc,
            #a78bfa,
            #818cf8
          );
          background-size: 300% 100%;
          animation: borderGlow 3s linear infinite;
          transition: all 0.3s ease;
        }
        
        .input-glow-container > div {
          position: relative;
          border-radius: 48px;
          border: none;
          outline: none;
          box-shadow: none;
          z-index: 1;
          background: linear-gradient(135deg, #f3f0ff 0%, #faf8ff 100%);
          transition: all 0.3s ease;
        }

        .input-glow-container:focus-within > div {
          background: linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%);
        }
        
        @keyframes micPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.8),
                        0 0 0 0 rgba(129, 140, 248, 0.6);
          }
          50% {
            box-shadow: 0 0 0 12px rgba(129, 140, 248, 0.3),
                        0 0 0 20px rgba(129, 140, 248, 0.1);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(129, 140, 248, 0),
                        0 0 0 0 rgba(129, 140, 248, 0);
          }
        }
        
        .mic-pulse {
          animation: micPulse 1.2s ease-out infinite;
          position: relative;
        }
        
        .mic-pulse::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(129, 140, 248, 0.3) 0%, transparent 70%);
          animation: micPulseInner 1.2s ease-out infinite;
          pointer-events: none;
        }
        
        @keyframes micPulseInner {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.5);
            opacity: 0;
          }
        }
        
        @keyframes placeholderSlide {
          0% {
            transform: translateY(4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .animate-placeholderSlide {
          animation: placeholderSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default AIAssistantPopup;
