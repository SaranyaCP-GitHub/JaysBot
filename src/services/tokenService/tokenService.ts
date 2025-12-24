/**
 * Token service for managing Azure OpenAI speech tokens
 * Handles token fetching, caching, and automatic refresh
 */

import { SPEECH_TOKEN_API } from "@/constants/voiceConstants";

interface TokenData {
  token: string;
  expiresAt?: Date | null;
  expiresIn?: number;
}

/**
 * Token service interface
 */
export interface TokenService {
  fetchToken: () => Promise<TokenData | null>;
  getToken: () => string | null;
  clearRefreshTimer: () => void;
  cleanup: () => void;
}

/**
 * Create a token service instance
 * Functional approach using closures to maintain state
 * @param instanceId - Optional instance ID for logging
 * @returns TokenService instance with methods
 */
const createTokenService = (instanceId: string = ""): TokenService => {
  // Private state using closures
  let token: string | null = null;
  let expiresAt: Date | null = null;
  let refreshTimer: NodeJS.Timeout | null = null;
  let isFetching: boolean = false;

  /**
   * Clear the refresh timer
   */
  const clearRefreshTimer = (): void => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  /**
   * Fetch a new speech token from the API
   * Prevents multiple simultaneous fetches and handles token refresh
   * @returns Promise<TokenData | null> Token data or null if fetch failed
   */
  const fetchToken = async (): Promise<TokenData | null> => {
    // Prevent multiple simultaneous token fetches
    if (isFetching) {
      // Wait for existing fetch to complete (with timeout to prevent infinite loop)
      let attempts = 0;
      const MAX_WAIT_ATTEMPTS = 50; // 5 seconds max (50 * 100ms)

      while (isFetching && attempts < MAX_WAIT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (attempts >= MAX_WAIT_ATTEMPTS) {
        throw new Error(
          "Token fetch timeout - another fetch is taking too long"
        );
      }

      return token ? { token } : null;
    }

    isFetching = true;

    try {
      const response = await fetch(SPEECH_TOKEN_API);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch token: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Store token data
      token = data.token;
      expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

      // Calculate refresh time
      const expiresIn =
        data.expiresIn ||
        (data.expiresAt
          ? Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
          : 1200); // Default 20 minutes if not provided

      // Refresh at 60 minutes (3600s) OR 5 minutes before expiration, whichever comes FIRST
      const refreshIn = Math.min(3600, Math.max(0, expiresIn - 300));

      // Warn if token is expiring soon
      if (expiresIn < 600) {
        console.warn(
          `[${instanceId}] ⚠️ Token expiring soon: ${expiresIn}s remaining`
        );
      }

      // Clear existing refresh timer
      clearRefreshTimer();

      // Schedule token refresh
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        // Refresh token (but don't reconnect if WebSocket is open)
        fetchToken().then(() => {
          // Token refreshed
        });
      }, refreshIn * 1000);

      isFetching = false;
      return {
        token: data.token,
        expiresAt,
        expiresIn,
      };
    } catch (err) {
      console.error(`[${instanceId}] Failed to fetch token:`, err);
      isFetching = false;
      throw err;
    }
  };

  /**
   * Get the current token (if available)
   * @returns string | null Current token or null
   */
  const getToken = (): string | null => {
    return token;
  };

  /**
   * Cleanup - clear token and timers
   */
  const cleanup = (): void => {
    clearRefreshTimer();
    token = null;
    expiresAt = null;
    isFetching = false;
  };

  // Return service interface
  return {
    fetchToken,
    getToken,
    clearRefreshTimer,
    cleanup,
  };
};

export default createTokenService;
