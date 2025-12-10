import React, { useState, useEffect, useRef } from "react";
import { Send, Mic, X, Sparkles, ChevronDown } from "lucide-react";

// Custom hook for responsive breakpoints
const useResponsiveValues = () => {
  const [screenSize, setScreenSize] = useState("laptop");

  useEffect(() => {
    const updateScreenSize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setScreenSize("mobile");
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
      }
      else if (width < 1925) {
        setScreenSize("nineteenTwentyFiveDesktop");
      } else if (width < 2960) {
        setScreenSize("designerDesktop");
      } else {
        setScreenSize("fourteenKDesktop");
      }
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  const getModalStyles = (minimized) => {
    const styles = {
      mobile: {
        bottom: minimized ? "7vh" : "7vh",
        maxHeight: minimized ? "8vh" : "45vh",
        chatMaxHeight: "40vh",
      },
      tablet: {
        bottom: minimized ? "8.5vh" : "11vh",
        maxHeight: minimized ? "9vh" : "50vh",
        chatMaxHeight: "45vh",
      },
      laptop: {
        bottom: minimized ? "5vh" : "8vh",
        maxHeight: minimized ? "8.5vh" : "50vh",
        chatMaxHeight: "45vh",
      },
      desktop: {
        bottom: minimized ? "3.5vh" : "5vh",
        maxHeight: minimized ? "9vh" : "70vh",
        chatMaxHeight: "65vh",
      },
      largeDesktop: {
        bottom: minimized ? "4.5vh" : "5.5vh",
        maxHeight: minimized ? "4.5vh" : "70vh",
        chatMaxHeight: "65vh",
      },
      xlargeDesktop: {
        bottom: minimized ? "4vh" : "4vh",
        maxHeight: minimized ? "2.5vh" : "50vh",
        chatMaxHeight: "45vh",
      },
      xxLargeDesktop: {
        bottom: minimized ? "4vh" : "4vh",
        maxHeight: minimized ? "2vh" : "50vh",
        chatMaxHeight: "45vh",
      },
      designerDesktop: {
        bottom: minimized ? "2.5vh" : "3.5vh",
        maxHeight: minimized ? "4vh" : "50vh",
        chatMaxHeight: "40vh",
      },
      fourteenKDesktop: {
        bottom: minimized ? "0.5vh" : "3.5vh",
        maxHeight: minimized ? "2.5vh" : "50vh",
        chatMaxHeight: "40vh",
      },
      nineteenTwentyFiveDesktop: {
        bottom: minimized ? "2vh" : "5vh",
        maxHeight: minimized ? "7vh" : "70vh",
        chatMaxHeight: "65vh",
      },
    };
    return styles[screenSize];
  };

  return { screenSize, getModalStyles };
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
  const chatContainerRef = useRef(null);
  const bottomInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const heroSentinelRef = useRef(null);
  const { screenSize, getModalStyles } = useResponsiveValues();
  const modalStyles = getModalStyles(minimized);

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

  const handleMicToggle = () => {
    setIsMicActive(!isMicActive);
    // TODO: Add actual microphone recording functionality here
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      handleMicToggle();
      return;
    }

    const userMessage = query;

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

      {/* Bottom fixed input - slides in from bottom when scrolled or animation step 2+ */}
      {!hasSearched && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-4 to-transparent transition-all duration-500 ease-out ${
            isScrolled || animationStep >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div className="w-full max-w-[576px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="bg-white/70 backdrop-blur-md rounded-full h-12 flex items-center p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3 w-full">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 flex-shrink-0" />
                  <input
                    ref={bottomInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-sm sm:text-base text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className={`p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 ${
                      query.trim() 
                        ? "bg-gray-700 hover:bg-gray-800" 
                        : isMicActive 
                        ? "bg-gray-700" 
                        : "bg-transparent"
                    }`}
                  >
                    {query.trim() ? (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <Mic className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isMicActive ? "text-white" : "text-gray-900"}`} />
                    )}
                  </button>
                </div>
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
            className="w-full max-w-[576px] h-1 pointer-events-none"
          />
        )}

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <div
            ref={heroInputRef}
            style={{overflow: "visible", paddingBottom: "9px"}}
            className={`w-full max-w-[576px] px-2 sm:px-0 transition-all duration-500 ease-out overflow-hidden ${
              isScrolled || animationStep >= 1
                ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
                : "opacity-100 scale-100 max-h-32"
            }`}
          >
            <div className="input-glow-container rounded-full">
              <div className="bg-white/70 backdrop-blur-md rounded-full h-12 flex items-center p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3 w-full">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-sm sm:text-base text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className={`p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 ${
                      query.trim() 
                        ? "bg-gray-700 hover:bg-gray-800" 
                        : isMicActive 
                        ? "bg-gray-700" 
                        : "bg-transparent"
                    }`}
                  >
                    {query.trim() ? (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <Mic className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isMicActive ? "text-white" : "text-gray-900"}`} />
                    )}
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
            className={`fixed left-0 right-0 z-50 transition-all duration-300 ease-out pointer-events-none overflow-hidden ${
              minimized ? "cursor-pointer" : ""
            }`}
            style={{
              bottom: modalStyles.bottom,
              maxHeight: modalStyles.maxHeight,
              opacity: 1,
            }}
          >
            <div className="relative w-full max-w-[576px] mx-auto px-2 sm:px-4">
              <div
                className={`relative w-full bg-white/95 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden border-t border-l border-r border-gray-200/50 flex flex-col pointer-events-auto animate-slideUp ${
                  minimized ? "cursor-pointer" : "cursor-default"
                }`}
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
                  <div className="absolute top-2 left-8 right-8 flex items-center gap-3 text-gray-800 text-base overflow-hidden">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1">
                      {isTyping ? (
                        <div className="flex items-center gap-1.5 ">
                          <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"></div>
                          <div
                            className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                          <div
                            className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"
                            style={{ animationDelay: "0.4s" }}
                          ></div>
                        </div>
                      ) : (
                        chatHistory[chatHistory.length - 1] &&
                        chatHistory[chatHistory.length - 1].type === "ai" && (
                          <p className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[85%]">
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
                    className="overflow-y-auto px-4 sm:px-6 pt-1 pb-10 space-y-4 pointer-events-auto"
                    style={{
                      scrollBehavior: "smooth",
                      scrollbarWidth: "thin",
                      scrollbarColor: "gray transparent",
                      WebkitOverflowScrolling: "touch",
                      overscrollBehavior: "contain",
                      maxHeight: modalStyles.chatMaxHeight,
                    }}
                  >
                    {chatHistory.map((message, index) => (
                      <div key={index} className="animate-fadeIn">
                        {message.type === "user" ? (
                          <div className="flex items-start gap-2 sm:gap-3 justify-end">
                            <div className="bg-gray-800 text-white rounded-2xl rounded-tr-none p-3 sm:p-4 shadow-sm max-w-[85%] sm:max-w-[75%]">
                              <p className="text-sm sm:text-base leading-relaxed">
                                {message.text}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gray-700 flex items-center justify-center shadow-sm">
                              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="bg-gray-100 rounded-2xl rounded-tl-none p-3 sm:p-5 shadow-sm">
                                <p className="text-gray-800 text-sm sm:text-base leading-relaxed">
                                  {message.text}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isTyping && (
                      <div className="flex items-start gap-3 animate-fadeIn">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shadow-sm">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex bg-gray-100 rounded-2xl rounded-tl-none p-4 shadow-sm">
                          <div className="flex gap-2">
                            <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
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

      {hasSearched && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-2 sm:px-4 sm:pb-4 to-transparent">
            <div className="w-full max-w-[576px] mx-auto">
            <div className="input-glow-container rounded-full">
              <div className="bg-white/70 backdrop-blur-md rounded-full h-12 flex items-center p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3 w-full">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-sm sm:text-base text-gray-800 placeholder-gray-400 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className={`p-1.5 sm:p-2 rounded-full transition-all hover:scale-105 ${
                      query.trim() 
                        ? "bg-gray-700 hover:bg-gray-800" 
                        : isMicActive 
                        ? "bg-gray-700" 
                        : "bg-transparent"
                    }`}
                  >
                    {query.trim() ? (
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <Mic className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isMicActive ? "text-white" : "text-gray-900"}`} />
                    )}
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
        
        @keyframes radiantGlow {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }
        
        .input-glow-container {
          position: relative;
          padding: 2px;
          border-radius: 9999px;
          background: transparent;
        }
        
        .input-glow-container > div {
          position: relative;
          border-radius: 9999px;
          border: none;
          outline: none;
          box-shadow: none;
          z-index: 1;
        }
        
        .input-glow-container::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          padding: 2px;
          background: linear-gradient(
            90deg,
            rgba(99, 102, 241, 0.4),
            rgba(139, 92, 246, 0.5),
            rgba(99, 102, 241, 0.4),
            rgba(139, 92, 246, 0.5),
            rgba(99, 102, 241, 0.4)
          );
          background-size: 200% 100%;
          animation: radiantGlow 3s linear infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          z-index: 0;
        }
        
        .input-glow-container::after {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 9999px;
          background: linear-gradient(
            90deg,
            rgba(99, 102, 241, 0.2),
            rgba(139, 92, 246, 0.3),
            rgba(99, 102, 241, 0.2),
            rgba(139, 92, 246, 0.3),
            rgba(99, 102, 241, 0.2)
          );
          background-size: 200% 100%;
          animation: radiantGlow 3s linear infinite;
          filter: blur(8px);
          z-index: -1;
        }
        
        .input-glow-container:focus-within::before,
        .input-glow-container:focus-within::after {
          animation-duration: 2s;
        }
      `}</style>
    </div>
  );
};

export default AIAssistantPopup;