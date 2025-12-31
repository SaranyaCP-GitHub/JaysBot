/**
 * Session service for managing chat session keys
 */

const SESSION_STORAGE_KEY = "session_key";
const CHAT_API_URL = "https://chat-api.techjays.com/api/v1/gemini-chat/";

/**
 * Get or initialize a session key
 * Checks sessionStorage first, then fetches a new one from the API if needed
 * @returns Promise<string | null> The session key, or null if fetching failed
 */
export const getSessionKey = async (): Promise<string | null> => {
  // Check sessionStorage first
  const storedSessionKey = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (storedSessionKey) {
    return storedSessionKey;
  }

  // If no session key, fetch one
  try {
    const response = await fetch(CHAT_API_URL, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Failed to retrieve session key");
    }

    const data = await response.json();
    if (data.session_key) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, data.session_key);
      return data.session_key;
    }

    return null;
  } catch (error) {
    console.error("Error fetching session key:", error);
    return null;
  }
};

/**
 * Clear the stored session key from sessionStorage
 */
export const clearSessionKey = (): void => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

/**
 * Get the current session key from sessionStorage without fetching
 * @returns string | null The current session key, or null if not found
 */
export const getStoredSessionKey = (): string | null => {
  return sessionStorage.getItem(SESSION_STORAGE_KEY);
};
