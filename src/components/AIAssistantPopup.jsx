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
  const chatContainerRef = useRef(null);
  const bottomInputRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!hasSearched) {
        setIsScrolled(window.scrollY > 200);
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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

  const handleSearch = () => {
    if (!query.trim()) return;

    const userMessage = query;

    // Step 1: Fade out hero section textbox
    setAnimationStep(1);

    setTimeout(() => {
      // Step 2: Slide up bottom textbox
      setAnimationStep(2);

      setTimeout(() => {
        // Step 3: Show modal
        setAnimationStep(3);
        setShowLady(true);
        setHasSearched(true);
      }, 400); // Wait for bottom textbox slide up
      setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
      setIsScrolled(false);
      setMinimized(false);
      setIsTyping(true);
      setResponse("");
      setQuery("");
      setTimeout(() => {
        const aiResponse =
          "Hi there! I am your AI assistant. I can help you with information about C3 AI, our products, services, and answer any questions you have. What would you like to know?";
        setResponse(aiResponse);
        setChatHistory((prev) => [...prev, { type: "ai", text: aiResponse }]);
        setIsTyping(false);
      }, 2000);
    }, 0); // Wait for hero fadeout
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Bottom fixed input - slides in from bottom when scrolled or animation step 2+ */}
      {!hasSearched && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent transition-all duration-500 ease-out ${
            isScrolled || animationStep >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div className="max-w-3xl mx-auto">
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    ref={bottomInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about C3 AI"
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

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8 pb-32">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-gray-200 mb-4">
            15 Years of Enterprise AI Success
          </h1>
          <p className="text-xl text-gray-400">
            Powered by advanced AI technology
          </p>
        </div>

        {/* Hero section input - fades out and shrinks when scrolled or animation step 1+ */}
        {!hasSearched && (
          <div
            className={`w-full max-w-3xl transition-all duration-500 ease-out overflow-hidden ${
              isScrolled || animationStep >= 1
                ? "opacity-0 scale-95 pointer-events-none max-h-0 mb-0"
                : "opacity-100 scale-100 max-h-32 mb-12"
            }`}
          >
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about C3 AI"
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

        <div className="w-full max-w-4xl space-y-8 mt-16">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-4">About C3 AI</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              C3 AI is the Enterprise AI application software company. C3 AI
              delivers a family of fully integrated products including the C3 AI
              Suite, an end-to-end platform for developing, deploying, and
              operating enterprise AI applications and C3 AI Applications, a
              portfolio of industry-specific SaaS enterprise AI applications.
            </p>
            <p className="text-gray-300 leading-relaxed">
              The core of the C3 AI offering is the C3 AI Suite, an application
              platform that enables customers to rapidly develop, deploy, and
              operate large-scale AI, predictive analytics, and IoT
              applications. The C3 AI Suite provides comprehensive services to
              address the entire application development and deployment
              lifecycle including data science and application development
              tools.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <h2 className="text-3xl font-bold text-white mb-4">
                Our Products
              </h2>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    <strong className="text-white">C3 AI Suite:</strong>{" "}
                    End-to-end platform for developing, deploying, and operating
                    enterprise AI applications
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    <strong className="text-white">C3 AI Applications:</strong>{" "}
                    Industry-specific SaaS enterprise AI applications
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    <strong className="text-white">C3 AI CRM:</strong>{" "}
                    Industry-specific CRM applications to optimize customer
                    acquisition and customer lifetime value
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    <strong className="text-white">C3 AI Ex Machina:</strong>{" "}
                    Provides business users access to Enterprise Search and
                    Generative AI across their data landscape
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <h2 className="text-3xl font-bold text-white mb-4">
                Key Features
              </h2>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    Model-driven architecture for rapid application development
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    Open, standards-based architecture for seamless integration
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>
                    Multi-cloud deployment support (AWS, Azure, Google Cloud)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Advanced machine learning and AI capabilities</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Enterprise-grade security and compliance</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-4">
              Industry Solutions
            </h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              C3 AI applications address critical business needs across multiple
              industries, delivering measurable value through AI-powered
              insights and automation.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Manufacturing
                </h3>
                <p className="text-gray-400 text-sm">
                  Predictive maintenance, supply chain optimization, production
                  planning, and quality control
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Financial Services
                </h3>
                <p className="text-gray-400 text-sm">
                  Anti-money laundering, fraud detection, risk management, and
                  customer analytics
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Energy & Utilities
                </h3>
                <p className="text-gray-400 text-sm">
                  Energy management, grid optimization, predictive maintenance,
                  and sustainability initiatives
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Defense & Intelligence
                </h3>
                <p className="text-gray-400 text-sm">
                  Mission-critical analytics, threat detection, logistics
                  optimization, and resource management
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Telecommunications
                </h3>
                <p className="text-gray-400 text-sm">
                  Network optimization, customer churn prediction, service
                  quality monitoring, and infrastructure planning
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-xl font-semibold text-white mb-3">
                  Healthcare
                </h3>
                <p className="text-gray-400 text-sm">
                  Population health management, clinical decision support,
                  operational efficiency, and patient outcomes
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/20">
            <h2 className="text-3xl font-bold text-white mb-4">Use Cases</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Operational Efficiency
                </h3>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>Predictive maintenance and asset optimization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>Supply chain and inventory optimization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>Production planning and scheduling</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Risk & Compliance
                </h3>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Fraud detection and prevention</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Anti-money laundering (AML)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <span>Regulatory compliance monitoring</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Customer Intelligence
                </h3>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400">•</span>
                    <span>Customer churn prediction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400">•</span>
                    <span>Personalized recommendations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400">•</span>
                    <span>Customer lifetime value optimization</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Sustainability
                </h3>
                <ul className="space-y-2 text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400">•</span>
                    <span>Energy optimization and conservation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400">•</span>
                    <span>Carbon footprint reduction</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400">•</span>
                    <span>ESG reporting and compliance</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <h2 className="text-3xl font-bold text-white mb-4">
              Why Choose C3 AI?
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Proven Track Record
                  </h3>
                  <p className="text-gray-300">
                    Over 15 years of delivering enterprise AI solutions to
                    Fortune 500 companies and government agencies worldwide.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Rapid Time to Value
                  </h3>
                  <p className="text-gray-300">
                    Model-driven architecture enables rapid application
                    development and deployment, significantly reducing time to
                    market.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Enterprise Scale
                  </h3>
                  <p className="text-gray-300">
                    Built to handle massive data volumes and complex enterprise
                    requirements with enterprise-grade security and compliance.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                  4
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Flexibility & Integration
                  </h3>
                  <p className="text-gray-300">
                    Open architecture seamlessly integrates with existing
                    enterprise systems and supports deployment across multiple
                    cloud platforms.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Transform Your Business with AI?
            </h2>
            <p className="text-gray-300 text-lg mb-6">
              Join leading enterprises worldwide who trust C3 AI to deliver
              measurable business value through enterprise AI applications.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full font-semibold transition-all hover:scale-105 shadow-lg">
                Request a Demo
              </button>
              <button className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full font-semibold transition-all hover:scale-105 border border-white/20">
                Learn More
              </button>
            </div>
          </div>
        </div>
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
            className={`fixed left-0 right-0 z-50 transition-all duration-300 ease-out pointer-events-none ${
              minimized ? "cursor-pointer" : ""
            }`}
            style={{
              bottom: minimized ? "105px" : "80px",
              maxHeight: minimized ? "25px" : "50vh",
              opacity: 1,
            }}
          >
            <div className="relative w-full max-w-3xl mx-auto px-4">
              <div
                className={`relative w-full bg-white/10 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden border-t border-l border-r border-white/20 flex flex-col pointer-events-auto animate-slideUp ${
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
                  className={`flex self-end z-10 p-1.5 mr-3 mt-2  mb-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all ${
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
                    className="overflow-y-auto px-6 pt-4 pb-8 space-y-4 pointer-events-auto"
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
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
          <div className="max-w-3xl mx-auto">
            <div className="p-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500">
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-full shadow-xl p-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Ask us anything about C3 AI"
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
