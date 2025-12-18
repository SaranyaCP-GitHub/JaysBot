import React, { useState, useEffect, useRef, useCallback } from "react";
import { Send, Mic, AudioLines, Sparkles, ChevronDown } from "lucide-react";
import LiveVoiceMode from "./LiveVoiceMode";

// Custom hook for responsive breakpoints
const useResponsiveValues = () => {
  const [screenSize, setScreenSize] = useState("laptop");
  const [viewport, setViewport] = useState({ width: 1024, height: 800 });

  useEffect(() => {
    const updateScreenSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Update viewport dimensions
      setViewport({ width, height });

      if (width < 640) {
        setScreenSize("mobile");
      } else if (width <= 800) {
        setScreenSize("smallTablet");
      } else if (width < 1024) {
        setScreenSize("tablet");
      } else if (width < 1280) {
        setScreenSize("laptop");
      } else if (width < 1440) {
        setScreenSize("desktop");
      } else if (width < 1635) {
        setScreenSize("largeDesktop");
      } else if (width < 1700) {
        setScreenSize("xlargeDesktop");
      } else if (width < 1800) {
        setScreenSize("xxLargeDesktop");
      } else if (width < 1925) {
        setScreenSize("xxxLargeDesktop");
      } else if (width < 2960) {
        setScreenSize("designerDesktop");
      } else {
        setScreenSize("fourKDesktop");
      }
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  const getModalStyles = (minimized) => {
    const { width, height } = viewport;

    // Simple breakpoint-based styles - easy to adjust manually
    // Format: { bottom, minimizedHeight, expandedMaxHeight, chatMaxHeight }

    let bottom, minimizedHeight, expandedMaxHeight, chatMaxHeight;

    if (width < 640) {
      // Mobile
      bottom = "48px";
      minimizedHeight = "56px";
      expandedMaxHeight = "45vh";
      chatMaxHeight = "38vh";
    } else if (width < 768) {
      // Small tablet
      bottom = "52px";
      minimizedHeight = "58px";
      expandedMaxHeight = "50vh";
      chatMaxHeight = "43vh";
    } else if (width < 1024) {
      // Tablet
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "55vh";
      chatMaxHeight = "48vh";
    } else if (width < 1280) {
      // Laptop
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "60vh";
      chatMaxHeight = "53vh";
    } else if (width < 1536) {
      // Desktop
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "65vh";
      chatMaxHeight = "58vh";
    } else {
      // Large desktop / 4K
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "70vh";
      chatMaxHeight = "63vh";
    }

    return {
      bottom: bottom,
      maxHeight: minimized ? minimizedHeight : expandedMaxHeight,
      chatMaxHeight: chatMaxHeight,
    };
  };

  return { screenSize, viewport, getModalStyles };
};

const AIAssistantPopup = () => {
  const [query, setQuery] = useState("");
  const [showLady, setShowLady] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [response, setResponse] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [animationStep, setAnimationStep] = useState(0); // 0: initial, 1: hero fading, 2: bottom showing, 3: modal showing
  const [sessionKey, setSessionKey] = useState(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isHeroInputFocused, setIsHeroInputFocused] = useState(false);

  // Live Voice Chat State
  const [isLiveVoiceActive, setIsLiveVoiceActive] = useState(false);

  const chatContainerRef = useRef(null);
  const bottomInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const heroSentinelRef = useRef(null);
  const { screenSize, getModalStyles } = useResponsiveValues();
  const modalStyles = getModalStyles(minimized);

  const placeholderQuestions = [
    "What does Techjays do?",
    "How can you help me with my project?",
    "How do I get in touch with your team?",
  ];

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

  // Get or initialize session key
  const getSessionKey = async () => {
    // Check sessionStorage first
    let storedSessionKey = sessionStorage.getItem("session_key");
    if (storedSessionKey) {
      setSessionKey(storedSessionKey);
      return storedSessionKey;
    }

    // If no session key, fetch one
    try {
      const response = await fetch(
        "https://chat-api.techjays.com/api/v1/chat/",
        {
          method: "GET",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to retrieve session key");
      }
      const data = await response.json();
      if (data.session_key) {
        sessionStorage.setItem("session_key", data.session_key);
        setSessionKey(data.session_key);
        return data.session_key;
      }
      return null;
    } catch (error) {
      console.error("Error fetching session key:", error);
      return null;
    }
  };

  // Initialize session key on component mount
  useEffect(() => {
    getSessionKey();
  }, []);

  // Rotate placeholder text every 4 seconds (only for hero input, pause when focused)
  useEffect(() => {
    if (hasSearched || isHeroInputFocused) return; // Stop rotating after first search or when focused

    const interval = setInterval(() => {
      setPlaceholderIndex(
        (prevIndex) => (prevIndex + 1) % placeholderQuestions.length
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [hasSearched, isHeroInputFocused, placeholderQuestions.length]);

  const handleMicToggle = () => {
    setIsMicActive(!isMicActive);
    // TODO: Add actual microphone recording functionality here
  };

  // Live Voice Chat Functions
  const startLiveVoice = () => {
    setIsLiveVoiceActive(true);
  };

  const closeLiveVoice = () => {
    setIsLiveVoiceActive(false);
  };

  // Add message from voice to chat history
  const addVoiceMessage = (message) => {
    setChatHistory((prev) => {
      // If it's an AI message and the last message is also an AI message (streaming update)
      if (
        message.type === "ai" &&
        prev.length > 0 &&
        prev[prev.length - 1].type === "ai"
      ) {
        // Update the last message instead of adding a new one (for streaming)
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          text: message.text,
          isVoice: message.isVoice || updated[updated.length - 1].isVoice,
          isStreaming: message.isStreaming !== false, // Default to true unless explicitly false
        };
        return updated;
      }
      // Otherwise, add as a new message
      return [
        ...prev,
        { ...message, isStreaming: message.isStreaming !== false },
      ];
    });
  };

  // Show chat modal for voice conversation
  const showChatForVoice = useCallback(() => {
    // Prevent duplicate calls - if already searched, just minimize
    if (hasSearched) {
      setMinimized(false);
      return;
    }
    setAnimationStep(1);
    setTimeout(() => {
      setAnimationStep(2);
      setTimeout(() => {
        setAnimationStep(3);
        setShowLady(true);
        setHasSearched(true);
      }, 400);
    }, 0);
    setMinimized(false);
  }, [hasSearched]);

  const handleSearch = async () => {
    // If query is empty, use the current placeholder text (only for hero input)
    let userMessage = query.trim();
    if (!userMessage && !hasSearched) {
      userMessage = placeholderQuestions[placeholderIndex];
    }

    if (!userMessage) {
      return;
    }

    // Get or initialize session key
    const currentSessionKey = await getSessionKey();
    if (!currentSessionKey) {
      const errorMessage =
        "Sorry, I'm having trouble connecting. Please try again.";
      setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
      setChatHistory((prev) => [...prev, { type: "ai", text: errorMessage }]);
      return;
    }

    // Step 1: Fade out hero section textbox (only on first search)
    if (!hasSearched) {
      setAnimationStep(1);
    }

    // Add user message to chat history
    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setIsTyping(true);
    setResponse("");
    setQuery("");

    // Show modal on first search
    if (!hasSearched) {
      setTimeout(() => {
        setAnimationStep(2);
        setTimeout(() => {
          setAnimationStep(3);
          setShowLady(true);
          setHasSearched(true);
        }, 400);
      }, 0);
    }

    setIsScrolled(false);
    setMinimized(false);

    try {
      // Call the chat API
      const response = await fetch(
        "https://chat-api.techjays.com/api/v1/chat/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_key: currentSessionKey,
            question: userMessage,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch bot response");
      }

      const data = await response.json();

      if (data.result && data.response && data.response.text) {
        // Update session key if provided
        if (data.session_key) {
          sessionStorage.setItem("session_key", data.session_key);
          setSessionKey(data.session_key);
        }

        let botMessage = data.response.text;

        // Handle links if they exist (similar to chat.js logic)
        if (data.response.links && data.response.links.length > 0) {
          const linkTexts = botMessage.split(", ");
          let formattedLinks = "";
          data.response.links.forEach((link, index) => {
            const cleanedLink = link.replace(/<|>|\[|\]/g, "");
            const linkText = linkTexts[index] ? linkTexts[index].trim() : "";
            formattedLinks += `${linkText}: ${cleanedLink}`;
            if (index !== data.response.links.length - 1) {
              formattedLinks += " ";
            }
          });
          botMessage = formattedLinks;
        }

        // Clean up message formatting
        botMessage = botMessage.replace(/<link>/g, "").replace(/, $/, "");
        botMessage = botMessage.replace(/\s*\.:\s*/g, "");

        setResponse(botMessage);
        setChatHistory((prev) => [...prev, { type: "ai", text: botMessage }]);
      } else {
        throw new Error("Invalid bot response format");
      }
    } catch (error) {
      console.error("Error sending user message:", error);
      const errorMessage = "Sorry, I encountered an error. Please try again.";
      setChatHistory((prev) => [...prev, { type: "ai", text: errorMessage }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClose = () => {
    setShowLady(false);
    setQuery("");
    setResponse("");
    setChatHistory([]);
    setMinimized(false);
    setHasSearched(false);
    setAnimationStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="bg-transparent relative overflow-auto">
      {/* LiveVoiceMode - rendered once, always present to prevent remounting */}
      {isLiveVoiceActive && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-2 pb-2 sm:px-4 sm:pb-4">
          <div className="w-full max-w-[656px] mx-auto">
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
          className={`fixed bottom-0 left-0 right-0 z-50 p-2 to-transparent transition-all duration-500 ease-out ${
            isScrolled || animationStep >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div className="w-full max-w-[656px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-12 flex items-center p-3">
                {!isLiveVoiceActive && (
                  <div className="flex items-center  w-full">
                    <Sparkles className="mr-2 w-4 h-4 sm:w-5 sm:h-5 text-[#818cf8] flex-shrink-0" />
                    <input
                      ref={bottomInputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Ask us anything about Techjays"
                      className="flex-1 text-base text-gray-800 placeholder:text-base placeholder-gray-400 focus:outline-none bg-transparent"
                    />
                    <button
                      onClick={startLiveVoice}
                      className="ml-2 -mr-2 p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 bg-[#818cf8]/20 hover:bg-[#818cf8]/30 border border-[#818cf8]/30"
                      title="Start live voice chat"
                    >
                      <AudioLines
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6366f1]"
                        strokeWidth={2.7}
                      />
                    </button>
                    <button
                      onClick={handleSearch}
                      className={`p-1.5 sm:p-2 rounded-full ${
                        query.trim()
                          ? "bg-[#6366f1] hover:bg-[#4f46e5] transition-all hover:scale-105"
                          : "bg-[#818cf8] cursor-not-allowed"
                      }`}
                      disabled={!query.trim()}
                    >
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </button>
                  </div>
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
            className="w-full max-w-[656px] h-1 pointer-events-none"
          />
        )}

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <div
            ref={heroInputRef}
            style={{ overflow: "visible", paddingBottom: "9px" }}
            className={`w-full max-w-[656px] px-2 sm:px-0 transition-all duration-500 ease-out overflow-hidden ${
              isScrolled || animationStep >= 1 || isLiveVoiceActive
                ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
                : "opacity-100 scale-100 max-h-32"
            }`}
          >
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-13 flex items-center p-3">
                <div className="flex items-center  w-full relative">
                  <Sparkles className="mr-2 w-4 h-4 sm:w-5 sm:h-5 text-[#818cf8] flex-shrink-0" />
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                      onFocus={() => setIsHeroInputFocused(true)}
                      onBlur={() => setIsHeroInputFocused(false)}
                      placeholder={
                        isHeroInputFocused
                          ? "Ask us anything about Techjays"
                          : ""
                      }
                      className={`w-full text-base text-gray-800 placeholder:text-base focus:outline-none bg-transparent ${
                        isHeroInputFocused ? "placeholder-gray-400" : ""
                      }`}
                    />
                    {!isHeroInputFocused && !query.trim() && (
                      <div
                        key={placeholderIndex}
                        className="absolute left-0 top-0 w-full h-full flex items-center pointer-events-none animate-placeholderSlide bg-transparent"
                      >
                        <span
                          className="text-gray-800"
                          style={{ fontSize: "1rem", lineHeight: "19px" }}
                        >
                          {placeholderQuestions[placeholderIndex]}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={startLiveVoice}
                    className="ml-2 -mr-2 p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 bg-[#818cf8]/20 hover:bg-[#818cf8]/30 border border-[#818cf8]/30"
                    title="Start live voice chat"
                  >
                    <AudioLines
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6366f1]"
                      strokeWidth={2.7}
                    />
                  </button>
                  <button
                    onClick={handleSearch}
                    className="p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 bg-[#6366f1] hover:bg-[#4f46e5]"
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  </button>
                </div>
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
            ></div>
          )}
          <div
            className={`fixed left-1 right-1 z-[50] transition-all duration-300 ease-out pointer-events-none overflow-hidden ${
              minimized ? "cursor-pointer" : ""
            }`}
            style={{
              bottom: modalStyles.bottom,
              maxHeight: modalStyles.maxHeight,
              opacity: 1,
            }}
          >
            <div
              className="relative w-full max-w-[656px] mx-auto px-2 sm:px-4"
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
                <button
                  onClick={() => setMinimized(true)}
                  className={`flex self-end z-10 p-1.5 mr-3 mt-2 mb-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all ${
                    minimized ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                {/* <button
                  onClick={() => setMinimized(true)}
                  className={`absolute top-3 right-12 z-10 p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all ${
                    minimized ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                  title="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </button> */}

                {minimized && (chatHistory.length > 0 || isTyping) && (
                  <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-gray-800 text-base overflow-hidden">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isTyping ? (
                        <div className="flex items-center gap-1.5 ">
                          <div className="w-1.5 h-1.5 bg-[#818cf8] rounded-full animate-bounce"></div>
                          <div
                            className="w-1.5 h-1.5 bg-[#818cf8] rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                          <div
                            className="w-1.5 h-1.5 bg-[#818cf8] rounded-full animate-bounce"
                            style={{ animationDelay: "0.4s" }}
                          ></div>
                        </div>
                      ) : (
                        chatHistory[chatHistory.length - 1] &&
                        chatHistory[chatHistory.length - 1].type === "ai" && (
                          <p className="text-ellipsis overflow-hidden whitespace-nowrap ">
                            {chatHistory[chatHistory.length - 1].text}
                          </p>
                        )
                      )}
                    </div>
                    {/* <ChevronDown className="w-4 h-4 text-gray-600 rotate-180 flex-shrink-0" /> */}
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
                              {message.isVoice && (
                                <div className="flex items-center gap-1 text-white/70 text-xs mb-1">
                                  <Mic className="w-3 h-3" />
                                  <span>Voice</span>
                                </div>
                              )}
                              <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                                {message.text}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 sm:gap-3 ">
                            <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#818cf8] flex items-center justify-center shadow-sm mt-3">
                              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                            </div>
                            <div className="flex-shrink-0 max-w-[85%] sm:max-w-[75%]">
                              <div className="bg-gradient-to-br from-[#f3f0ff] to-[#faf8ff] rounded-2xl rounded-tl-none p-3 shadow-sm border border-[#e9d5ff]/30 inline-block">
                                {message.isVoice && (
                                  <div className="flex items-center gap-1 text-[#818cf8]/70 text-xs mb-1">
                                    <AudioLines className="w-3 h-3" />
                                    <span>Voice</span>
                                  </div>
                                )}
                                <p className="text-gray-800 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">
                                  {message.text}
                                </p>
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
                          <div className="flex gap-2 items-center">
                            <div className="w-2 h-2 bg-[#818cf8] rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-[#818cf8] rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-[#818cf8] rounded-full animate-bounce"
                              style={{ animationDelay: "0.4s" }}
                            ></div>
                          </div>
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
        <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-2 sm:px-4 sm:pb-4 to-transparent">
          <div className="w-full max-w-[656px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="rounded-full h-12 flex items-center p-3">
                <div className="flex items-center  w-full">
                  <Sparkles className="mr-2 w-4 h-4 sm:w-5 sm:h-5 text-[#818cf8] flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-base text-gray-800 placeholder:text-base placeholder-gray-400 focus:outline-none bg-transparent"
                    autoFocus={true}
                  />
                  <button
                    onClick={startLiveVoice}
                    className="-mr-2 ml-2 p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 bg-[#818cf8]/20 hover:bg-[#818cf8]/30 border border-[#818cf8]/30"
                    title="Start live voice chat"
                  >
                    <AudioLines
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6366f1]"
                      strokeWidth={2.7}
                    />
                  </button>
                  <button
                    onClick={handleSearch}
                    className={`p-1.5 sm:p-2 rounded-full ${
                      query.trim()
                        ? "bg-[#6366f1] hover:bg-[#4f46e5] transition-all hover:scale-105"
                        : "bg-[#818cf8] cursor-not-allowed"
                    }`}
                    disabled={!query.trim()}
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
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
