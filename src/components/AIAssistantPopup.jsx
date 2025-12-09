import React, { useState, useEffect, useRef } from "react";
import { Send, Mic, X, Sparkles, ChevronDown } from "lucide-react";

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
  const chatContainerRef = useRef(null);
  const bottomInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const heroSentinelRef = useRef(null);

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

  const handleSearch = async () => {
    if (!query.trim()) return;

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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Bottom fixed input - slides in from bottom when scrolled or animation step 2+ */}
      {!hasSearched && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-4  to-transparent transition-all duration-500 ease-out ${
            isScrolled || animationStep >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div className="max-w-3xl mx-auto">
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-500/60 backdrop-blur-lg rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    ref={bottomInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-base text-white placeholder-white/60 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className="p-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-full transition-all hover:scale-105"
                  >
                    {query.trim() ? (
                      <Send className="w-4 h-4 text-white" />
                    ) : (
                      <Mic className="w-4 h-4 text-white" />
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
            className="w-full max-w-3xl h-1 pointer-events-none"
          />
        )}

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <div
            ref={heroInputRef}
            className={`w-full max-w-3xl transition-all duration-500 ease-out overflow-hidden ${
              isScrolled || animationStep >= 1
                ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
                : "opacity-100 scale-100 max-h-32"
            }`}
          >
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-500/60 backdrop-blur-lg rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-base text-white placeholder-white/60 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className="p-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-full transition-all hover:scale-105"
                  >
                    {query.trim() ? (
                      <Send className="w-4 h-4 text-white" />
                    ) : (
                      <Mic className="w-4 h-4 text-white" />
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
              bottom: minimized ? "7vh" : "8vh",
              maxHeight: minimized ? "9vh" : "50vh",
              opacity: 1,
            }}
          >
            <div className="relative w-full max-w-3xl mx-auto px-4">
              <div
                className={`relative w-full bg-slate-600/95 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden border-t border-l border-r border-slate-700/50 flex flex-col pointer-events-auto animate-slideUp ${
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
                  className={`flex self-end z-10 p-1.5 mr-3 mt-2 mb-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all ${
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

                {minimized && chatHistory.length > 0 && (
                  <div className="absolute top-2 left-8 right-8 flex items-center gap-3 text-white text-base overflow-hidden">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 truncate">
                      {chatHistory[chatHistory.length - 1] &&
                        chatHistory[chatHistory.length - 1].type === "ai" && (
                          <p className="truncate">
                            {chatHistory[chatHistory.length - 1].text}
                          </p>
                        )}
                    </div>
                    {/* <ChevronDown className="w-4 h-4 text-white/70 rotate-180 flex-shrink-0" /> */}
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
                    className="overflow-y-auto px-6 pt-1 pb-10 space-y-4 pointer-events-auto"
                    style={{
                      scrollBehavior: "smooth",
                      WebkitOverflowScrolling: "touch",
                      overscrollBehavior: "contain",
                      maxHeight: "45vh",
                    }}
                  >
                    {chatHistory.map((message, index) => (
                      <div key={index} className="animate-fadeIn">
                        {message.type === "user" ? (
                          <div className="flex items-start gap-3 justify-end">
                            <div className="bg-blue-500/90 backdrop-blur-sm text-white rounded-2xl rounded-tr-none p-4 shadow-sm max-w-[75%]">
                              <p className="text-base leading-relaxed">
                                {message.text}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
                              <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="bg-white/20 backdrop-blur-sm rounded-2xl rounded-tl-none p-5 shadow-sm">
                                <p className="text-white text-base leading-relaxed">
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
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex bg-white/20 backdrop-blur-sm rounded-2xl rounded-tl-none p-4 shadow-sm">
                          <div className="flex gap-2">
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-white rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-white rounded-full animate-bounce"
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
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4  to-transparent">
          <div className="max-w-3xl mx-auto">
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-500/60 backdrop-blur-lg rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about Techjays"
                    className="flex-1 text-base text-white placeholder-white/60 focus:outline-none bg-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    className="p-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-full transition-all hover:scale-105"
                  >
                    {query.trim() ? (
                      <Send className="w-4 h-4 text-white" />
                    ) : (
                      <Mic className="w-4 h-4 text-white" />
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
      `}</style>
    </div>
  );
};

export default AIAssistantPopup;
