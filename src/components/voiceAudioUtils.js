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

/**
 * Breath/pause effect configuration
 * Creates a brief natural pause before speaking (pure silence)
 * Set enabled: false to disable completely
 */
export const BREATH_CONFIG = {
  // Set to false to disable breath pauses entirely
  enabled: true,
  // Probability of adding pause before response
  probability: 0.4,
  // Duration of silence in milliseconds (keep short: 80-150ms)
  durationMs: 100,
  // Not used (silence only) but kept for API compatibility
  volume: 0,
  // Sample rate must match Azure Realtime API (24kHz PCM16)
  sampleRate: 24000,
};

/**
 * Generate a natural pause (pure silence) before speaking
 * 
 * Rather than trying to synthesize breath sounds (which never sound natural),
 * we just create a brief moment of silence - the natural pause before speaking.
 * 
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} volume - Not used (silence)
 * @param {number} sampleRate - Audio sample rate
 * @returns {Float32Array} - Silent audio samples
 */
export const generateBreathSound = (
  durationMs = BREATH_CONFIG.durationMs,
  volume = BREATH_CONFIG.volume,
  sampleRate = BREATH_CONFIG.sampleRate
) => {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  // Pure silence - just a natural pause
  return new Float32Array(numSamples);
};

/**
 * Generate breath sound as PCM16 ArrayBuffer (ready for playback)
 * @param {number} durationMs - Duration in milliseconds  
 * @param {number} volume - Volume level (0-1)
 * @returns {ArrayBuffer} - PCM16 encoded breath sound
 */
export const generateBreathBuffer = (
  durationMs = BREATH_CONFIG.durationMs,
  volume = BREATH_CONFIG.volume
) => {
  const float32Samples = generateBreathSound(durationMs, volume);
  const pcm16 = float32ToPcm16(float32Samples);
  return pcm16.buffer;
};

/**
 * Decide whether to add a breath sound
 * Breath triggers when transitioning from silence to speech (start of response)
 * This sounds natural - like Teja taking a breath before speaking
 * 
 * @param {ArrayBuffer} previousChunk - Previous audio chunk (or null if first)
 * @param {ArrayBuffer} currentChunk - Current audio chunk
 * @returns {boolean} - True if breath should be added
 */
export const shouldAddBreath = (previousChunk, currentChunk) => {
  if (!BREATH_CONFIG.enabled) return false;

  // Only add breath when transitioning from silence to speech
  // (i.e., no previous chunk but we have a current chunk = start of response)
  const isStartingSpeech = !previousChunk && currentChunk;
  
  // Random probability check
  const passesLuck = Math.random() < BREATH_CONFIG.probability;

  if (isStartingSpeech && passesLuck) {
    console.log('🌬️ Adding breath before Teja starts speaking');
    return true;
  }

  return false;
};

