/**
 * Voice Audio Utilities
 * Pure utility functions for audio processing in LiveVoiceMode
 * 
 * These functions handle:
 * - Audio format conversion (PCM16, Float32, Base64)
 * - Audio buffer manipulation
 */

/**
 * Convert base64 string to ArrayBuffer
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} - Decoded ArrayBuffer
 */
export const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Convert ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer - ArrayBuffer to encode
 * @returns {string} - Base64 encoded string
 */
export const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Convert Float32Array to Int16Array (PCM16 format)
 * Required for Azure OpenAI Realtime API audio input
 * @param {Float32Array} float32Array - Input audio samples
 * @returns {Int16Array} - PCM16 encoded samples
 */
export const float32ToPcm16 = (float32Array) => {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
};

/**
 * Convert PCM16 Int16Array to Float32Array
 * Required for Web Audio API playback
 * @param {Int16Array} pcm16Array - PCM16 encoded samples
 * @returns {Float32Array} - Float32 audio samples
 */
export const pcm16ToFloat32 = (pcm16Array) => {
  const float32 = new Float32Array(pcm16Array.length);
  for (let i = 0; i < pcm16Array.length; i++) {
    float32[i] = pcm16Array[i] / (pcm16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
};

/**
 * List of phantom transcription phrases to filter out
 * These are common hallucinations from Whisper when processing silence/noise
 */
export const PHANTOM_PHRASES = [
  "thanks for watching",
  "thank you for watching",
  "thanks for watching!",
  "thank you for watching!",
  "thank you",
  "thanks",
  "bye",
  "goodbye",
  "see you",
  "see you next time",
  "and many more",
  "subscribe",
  "like and subscribe",
  "please subscribe",
  "don't forget to subscribe",
  "hit the bell",
  "leave a comment",
  "...",
  "you",
  "the",
  "a",
  "i",
  "um",
  "uh",
  "hmm",
  "yeah",
  "ok",
  "okay",
];

/**
 * Check if a transcript is a phantom/hallucinated transcription
 * @param {string} transcript - The transcription text to check
 * @returns {boolean} - True if it's a phantom transcription
 */
export const isPhantomTranscription = (transcript) => {
  const transcriptLower = transcript.toLowerCase().trim().replace(/[!?.]/g, "");
  return (
    PHANTOM_PHRASES.some(
      (phrase) =>
        transcriptLower === phrase.replace(/[!?.]/g, "") ||
        transcriptLower.includes("thanks for watching") ||
        transcriptLower.includes("thank you for watching") ||
        transcriptLower.includes("subscribe")
    ) || transcriptLower.length < 3
  );
};

/**
 * Create an AudioContext with the correct sample rate for Azure Realtime API
 * @returns {AudioContext} - Configured AudioContext
 */
export const createAudioContext = () => {
  return new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 24000,
  });
};

/**
 * Default audio constraints for microphone capture
 * Optimized for voice with noise suppression
 */
export const AUDIO_CONSTRAINTS = {
  audio: {
    sampleRate: 24000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

