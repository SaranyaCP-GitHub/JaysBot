import { useCallback } from "react";
import { getSessionKey } from "../../services/sessionService";

/**
 * Message type for chat history
 */
export interface ChatMessage {
  type: "user" | "ai";
  text: string;
  isVoice?: boolean;
  isStreaming?: boolean;
}

/**
 * Chat API response structure
 */
interface ChatApiResponse {
  result: boolean;
  session_key?: string;
  response: {
    text: string;
    links?: string[] | null;
    grounded?: boolean;
    source?: string;
  };
}

/**
 * Parameters for useChat hook
 */
export interface UseChatParams {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  hasSearched: boolean;
  placeholderQuestions: string[];
  placeholderIndex: number;
  sessionKey: string | null;
  setSessionKey: React.Dispatch<React.SetStateAction<string | null>>;
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>;
  setAnimationStep: React.Dispatch<React.SetStateAction<number>>;
  setShowLady: React.Dispatch<React.SetStateAction<boolean>>;
  setHasSearched: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScrolled: React.Dispatch<React.SetStateAction<boolean>>;
  setMinimized: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Return type for useChat hook
 */
export interface UseChatReturn {
  handleSearch: () => Promise<void>;
}

const CHAT_API_URL = "https://chat-api.techjays.com/api/v1/gemini-chat/";

/**
 * Custom hook for managing chat/search functionality
 * @param params - Required state setters and values
 * @returns Chat handler function
 */
const useChat = (params: UseChatParams): UseChatReturn => {
  const {
    query,
    setQuery,
    hasSearched,
    placeholderQuestions,
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
  } = params;

  const handleSearch = useCallback(async () => {
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
    // Update session key in state if it was fetched
    if (currentSessionKey !== sessionKey) {
      setSessionKey(currentSessionKey);
    }

    // Step 1: Fade out hero section textbox (only on first search)
    if (!hasSearched) {
      setAnimationStep(1);
    }

    // Add user message to chat history
    setChatHistory((prev) => [...prev, { type: "user", text: userMessage }]);
    setIsTyping(true);
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
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_key: currentSessionKey,
          question: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch bot response");
      }

      const data: ChatApiResponse = await response.json();

      if (data.result && data.response && data.response.text) {
        // Update session key if provided
        if (data.session_key) {
          sessionStorage.setItem("session_key", data.session_key);
          setSessionKey(data.session_key);
        }

        let botMessage = data.response.text;

        // Handle links if they exist (similar to chat.js logic)
        const links = data.response.links;
        if (links && links.length > 0) {
          const linkTexts = botMessage.split(", ");
          let formattedLinks = "";
          links.forEach((link, index) => {
            const cleanedLink = link.replace(/<|>|\[|\]/g, "");
            const linkText = linkTexts[index] ? linkTexts[index].trim() : "";
            formattedLinks += `${linkText}: ${cleanedLink}`;
            if (index !== links.length - 1) {
              formattedLinks += " ";
            }
          });
          botMessage = formattedLinks;
        }

        // Clean up message formatting
        botMessage = botMessage.replace(/<link>/g, "").replace(/, $/, "");
        botMessage = botMessage.replace(/\s*\.:\s*/g, "");

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
  }, [
    query,
    hasSearched,
    placeholderQuestions,
    placeholderIndex,
    sessionKey,
    setQuery,
    setSessionKey,
    setChatHistory,
    setIsTyping,
    setAnimationStep,
    setShowLady,
    setHasSearched,
    setIsScrolled,
    setMinimized,
  ]);

  return { handleSearch };
};

export default useChat;
