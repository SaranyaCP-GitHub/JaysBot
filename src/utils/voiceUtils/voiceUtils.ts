/**
 * Voice utility functions for audio format conversions
 * Used for processing audio data in voice chat components
 */

/**
 * Converts a base64 string to an ArrayBuffer
 * @param base64 - Base64 encoded string
 * @returns ArrayBuffer containing the decoded binary data
 */
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Converts an ArrayBuffer to a base64 string
 * @param buffer - ArrayBuffer containing binary data
 * @returns Base64 encoded string
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Converts Float32 audio data to PCM16 format
 * @param float32Array - Float32Array containing audio samples (-1.0 to 1.0)
 * @returns Int16Array containing PCM16 audio samples
 */
export const float32ToPcm16 = (float32Array: Float32Array): Int16Array => {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
};

/**
 * Converts PCM16 audio data to Float32 format for Web Audio API
 * @param arrayBuffer - ArrayBuffer containing PCM16 audio data
 * @returns Float32Array containing normalized audio samples (-1.0 to 1.0)
 */
export const pcm16ToFloat32 = (arrayBuffer: ArrayBuffer): Float32Array => {
  const pcm16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
};
