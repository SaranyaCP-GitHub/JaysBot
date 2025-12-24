/**
 * Voice/Azure OpenAI Realtime API configuration constants
 */

export const AZURE_ENDPOINT = (
  import.meta.env.VITE_AZURE_OPENAI_ENDPOINT ||
  "saran-mj6uzvzg-eastus2.services.ai.azure.com"
).replace(/\/$/, "");

export const API_VERSION = "2025-10-01";

export const MODEL = "gpt-4o-mini-realtime-preview";

export const WS_PATH = "voice-live/realtime";

export const SPEECH_TOKEN_API =
  "https://chat-api.techjays.com/api/v1/speech-token/";

export const CHAT_API_URL = "https://chat-api.techjays.com/api/v1/chat/";
