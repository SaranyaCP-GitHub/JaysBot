/**
 * WebSocket service for Azure OpenAI Realtime API
 * Handles WebSocket connection, session configuration, and message sending
 */

import {
  AZURE_ENDPOINT,
  API_VERSION,
  MODEL,
  WS_PATH,
} from "@/constants/voiceConstants";
import {
  ASSISTANT_INSTRUCTIONS,
  SEARCH_TECHJAYS_KNOWLEDGE_DESCRIPTION,
  SEARCH_QUERY_PARAMETER_DESCRIPTION,
} from "@/constants/assistantInstructions";
import type {
  Voice,
  AudioFormat,
  InputAudioTranscription,
  TurnDetection,
  FunctionTool,
  ToolChoice,
} from "@/types/voice";

export interface SessionConfig {
  modalities?: string[];
  instructions?: string;
  voice?: Voice;
  input_audio_format?: AudioFormat;
  output_audio_format?: AudioFormat;
  input_audio_transcription?: InputAudioTranscription;
  turn_detection?: TurnDetection;
  tools?: FunctionTool[];
  tool_choice?: ToolChoice;
}

/**
 * Build WebSocket URL with authentication
 * @param token - Authentication token
 * @returns WebSocket URL string
 */
export const buildWebSocketUrl = (token: string): string => {
  return `wss://${AZURE_ENDPOINT}/${WS_PATH}?api-version=${API_VERSION}&model=${MODEL}&authorization=Bearer ${token}`;
};

/**
 * Create default session configuration for Techjays voice assistant
 * @returns SessionConfig object
 */
export const createDefaultSessionConfig = (): SessionConfig => {
  return {
    modalities: ["text", "audio"],
    instructions: ASSISTANT_INSTRUCTIONS,
    voice: "ash",
    input_audio_format: "pcm16",
    output_audio_format: "pcm16",
    input_audio_transcription: {
      model: "whisper-1",
      language: "en",
      prompt:
        "Philip Samuelraj, Jesso Clarence, Dharmaraj, Agentic AI, RAG, MLOps, ChromaDB, Palantir, Techjays, CEO, Arun, Aparna",
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.6,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
    tools: [
      {
        type: "function",
        name: "search_techjays_knowledge",
        description: SEARCH_TECHJAYS_KNOWLEDGE_DESCRIPTION,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: SEARCH_QUERY_PARAMETER_DESCRIPTION,
            },
          },
          required: ["query"],
        },
      },
    ],
    tool_choice: "auto",
  };
};

/**
 * Send session update configuration to WebSocket
 * @param ws - WebSocket instance
 * @param config - Session configuration
 */
export const sendSessionUpdate = (
  ws: WebSocket | null,
  config: SessionConfig
): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: config,
      })
    );
  }
};

/**
 * Send audio data to WebSocket
 * @param ws - WebSocket instance
 * @param audioBase64 - Base64 encoded audio data
 */
export const sendAudioData = (
  ws: WebSocket | null,
  audioBase64: string
): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: audioBase64,
      })
    );
  }
};

/**
 * Clear input audio buffer on server
 * @param ws - WebSocket instance
 */
export const clearInputAudioBuffer = (ws: WebSocket | null): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  }
};

/**
 * Cancel current response
 * @param ws - WebSocket instance
 * @param responseId - Response ID to cancel
 */
export const cancelResponse = (
  ws: WebSocket | null,
  responseId: string
): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "response.cancel",
        response_id: responseId,
      })
    );
  }
};

/**
 * Reset turn detection
 * @param ws - WebSocket instance
 */
export const resetTurnDetection = (ws: WebSocket | null): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          turn_detection: {
            type: "server_vad",
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
        },
      })
    );
  }
};

/**
 * Send greeting message to trigger AI greeting
 * @param ws - WebSocket instance
 */
export const sendGreeting = (ws: WebSocket | null): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    // Send greeting trigger using conversation.item.create approach
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Greet the user briefly: 'Hi I am Teja, How can I help you?'",
            },
          ],
        },
      })
    );

    // Trigger AI response
    ws.send(
      JSON.stringify({
        type: "response.create",
      })
    );
  }
};

/**
 * Create a new response
 * @param ws - WebSocket instance
 */
export const createResponse = (ws: WebSocket | null): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "response.create",
      })
    );
  }
};
