import { useState, useEffect, useRef, useCallback } from "react";

import { getSessionKey } from "@/services/sessionService";

/**
 * Return type for useSessionKey hook
 */
export interface UseSessionKeyReturn {
  sessionKey: string | null;
  sessionKeyRef: React.MutableRefObject<string | null>;
  getOrCreateSessionKey: () => Promise<string | null>;
}

/**
 * Hook for managing RAG session key
 * Handles session key initialization, storage, and retrieval
 */
const useSessionKey = (): UseSessionKeyReturn => {
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);

  // Initialize session key from sessionStorage
  useEffect(() => {
    const existingKey = sessionStorage.getItem("session_key");
    if (existingKey) {
      setSessionKey(existingKey);
      sessionKeyRef.current = existingKey;
    }
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    sessionKeyRef.current = sessionKey;
  }, [sessionKey]);

  // Get or create RAG session key
  const getOrCreateSessionKey = useCallback(async (): Promise<
    string | null
  > => {
    // Return existing session key from ref if available
    if (sessionKeyRef.current) {
      return sessionKeyRef.current;
    }

    // Use sessionService to get or create session key
    try {
      const key = await getSessionKey();

      if (key) {
        // Update ref and state to keep them in sync
        sessionKeyRef.current = key;
        setSessionKey(key);
        return key;
      }

      return null;
    } catch (error) {
      console.error("Error creating RAG session:", error);
      return null;
    }
  }, []);

  return {
    sessionKey,
    sessionKeyRef,
    getOrCreateSessionKey,
  };
};

export default useSessionKey;
