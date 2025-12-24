/**
 * Function call service for executing AI function calls
 * Handles RAG knowledge base searches and other function executions
 */

import { CHAT_API_URL } from "@/constants/voiceConstants";
import { getSessionKey } from "@/services/sessionService";
import { formatMessageLinks } from "@/utils/formatMessageLinks";

export interface FunctionCallResult {
  success: boolean;
  answer?: string;
  sources?: string[];
  error?: string;
  sessionKey?: string; // Updated session key if provided
}

/**
 * Execute a function call from the AI
 * @param functionName - Name of the function to execute
 * @param args - Function arguments
 * @param instanceId - Instance ID for logging
 * @returns Promise<FunctionCallResult> Function execution result
 */
export const executeFunctionCall = async (
  functionName: string,
  args: Record<string, any>,
  instanceId: string = ""
): Promise<FunctionCallResult> => {
  try {
    let result: FunctionCallResult;

    if (functionName === "search_techjays_knowledge") {
      // Get or create session key
      const currentSessionKey = await getSessionKey();

      if (!currentSessionKey) {
        throw new Error("Failed to obtain session key");
      }

      // Call RAG API
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_key: currentSessionKey,
          question: args.query,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch from knowledge base");
      }

      const data = await response.json();

      if (data.result && data.response && data.response.text) {
        // Update session key if provided
        if (data.session_key) {
          sessionStorage.setItem("session_key", data.session_key);
        }

        // Format message with links
        const botMessage = formatMessageLinks(
          data.response.text,
          data.response.links
        );

        result = {
          success: true,
          answer: botMessage,
          sources: data.response.links || [],
          sessionKey: data.session_key, // Return updated session key
        };
      } else {
        throw new Error("Invalid response format from knowledge base");
      }
    } else {
      result = {
        success: false,
        error: `Unknown function: ${functionName}`,
      };
    }

    return result;
  } catch (error) {
    console.error(`[${instanceId}] Function execution error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Send function call result back to the WebSocket
 * @param ws - WebSocket instance
 * @param callId - Function call ID
 * @param result - Function execution result
 */
export const sendFunctionCallResult = (
  ws: WebSocket | null,
  callId: string,
  result: FunctionCallResult
): void => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      })
    );

    // Trigger the model to respond with the function result
    ws.send(
      JSON.stringify({
        type: "response.create",
      })
    );
  }
};
