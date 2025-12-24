/**
 * Type definitions for Azure OpenAI Realtime API voice configuration
 * Contains all voice, audio format, transcription, and language types
 */

/**
 * Available voice options for Azure OpenAI Realtime API
 */
export type Voice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

/**
 * Supported audio input/output formats
 */
export type AudioFormat = "pcm16" | "g711_ulaw" | "g711_alaw";

/**
 * Available transcription models
 */
export type TranscriptionModel =
  | "whisper-1"
  | "gpt-4o-transcribe"
  | "gpt-4o-mini-transcribe"
  | "gpt-4o-transcribe-diarize"
  | "azure-fast-transcription"
  | "azure-speech";

/**
 * Supported language codes for transcription
 */
export type LanguageCode =
  | "af"
  | "ar"
  | "az"
  | "be"
  | "bg"
  | "bs"
  | "ca"
  | "cs"
  | "cy"
  | "da"
  | "de"
  | "el"
  | "en"
  | "es"
  | "et"
  | "fa"
  | "fi"
  | "fr"
  | "gl"
  | "he"
  | "hi"
  | "hr"
  | "hu"
  | "hy"
  | "id"
  | "is"
  | "it"
  | "ja"
  | "kk"
  | "kn"
  | "ko"
  | "lt"
  | "lv"
  | "mi"
  | "mk"
  | "mr"
  | "ms"
  | "ne"
  | "nl"
  | "no"
  | "pl"
  | "pt"
  | "ro"
  | "ru"
  | "sk"
  | "sl"
  | "sr"
  | "sv"
  | "sw"
  | "ta"
  | "th"
  | "tl"
  | "tr"
  | "uk"
  | "ur"
  | "vi"
  | "zh";

/**
 * Turn detection type
 */
export type TurnDetectionType = "server_vad" | "client_vad" | "none";

/**
 * Input audio transcription configuration
 */
export interface InputAudioTranscription {
  model: TranscriptionModel;
  language: LanguageCode;
  prompt?: string;
}

/**
 * Turn detection configuration
 */
export interface TurnDetection {
  type: TurnDetectionType;
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
}

/**
 * Function tool parameter definition
 */
export interface FunctionToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  properties?: Record<string, any>;
}

/**
 * Function tool parameter schema
 */
export interface FunctionToolParameters {
  type: "object";
  properties: Record<string, FunctionToolParameter>;
  required: string[];
}

/**
 * Function tool definition
 */
export interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: FunctionToolParameters;
}

/**
 * Tool choice options
 */
export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; name: string };
