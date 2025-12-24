import { useRef, useCallback } from "react";

import { pcm16ToFloat32 } from "@/utils/voiceUtils";

/**
 * Parameters for useAudioPlayback hook
 */
export interface UseAudioPlaybackParams {
  instanceId: string;
}

/**
 * Return type for useAudioPlayback hook
 */
export interface UseAudioPlaybackReturn {
  audioQueueRef: React.MutableRefObject<ArrayBuffer[]>;
  isPlayingRef: React.MutableRefObject<boolean>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  currentAudioSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>;
  playAudioQueue: () => Promise<void>;
  waitForAudioToFinish: () => Promise<void>;
  playAudioBuffer: (arrayBuffer: ArrayBuffer) => Promise<void>;
  stopPlayback: () => void;
  clearQueue: () => void;
}

/**
 * Hook for managing audio playback queue
 * Handles playing audio chunks from a queue with interruption support
 */
const useAudioPlayback = ({
  instanceId,
}: UseAudioPlaybackParams): UseAudioPlaybackReturn => {
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  /**
   * Play a single audio buffer
   */
  const playAudioBuffer = useCallback(
    (arrayBuffer: ArrayBuffer): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!audioContextRef.current) {
          const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContextClass({
            sampleRate: 24000,
          });
        }

        // Convert PCM16 to Float32 for Web Audio API
        const float32 = pcm16ToFloat32(arrayBuffer);

        const audioBuffer = audioContextRef.current.createBuffer(
          1,
          float32.length,
          24000
        );
        audioBuffer.getChannelData(0).set(float32);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);

        // Store source for interruption
        currentAudioSourceRef.current = source;

        source.onended = () => {
          currentAudioSourceRef.current = null;
          resolve();
        };

        // Handle errors via try-catch since onerror doesn't exist on AudioBufferSourceNode
        try {
          source.start();
        } catch (error) {
          currentAudioSourceRef.current = null;
          reject(error);
        }
      });
    },
    []
  );

  /**
   * Play audio from queue
   */
  const playAudioQueue = useCallback(async (): Promise<void> => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    while (audioQueueRef.current.length > 0) {
      // Check for interruption before playing
      if (!isPlayingRef.current) {
        console.log(`[${instanceId}] Playback interrupted`);
        break;
      }

      const audioData = audioQueueRef.current.shift();
      if (!audioData) break;

      try {
        await playAudioBuffer(audioData);
      } catch (error) {
        console.error(`[${instanceId}] Audio playback error:`, error);
      }

      // Check for interruption after playing
      if (!isPlayingRef.current) {
        console.log(`[${instanceId}] Playback interrupted between chunks`);
        break;
      }
    }

    isPlayingRef.current = false;
  }, [instanceId, playAudioBuffer]);

  /**
   * Wait for audio playback to finish
   */
  const waitForAudioToFinish = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      // If not playing and queue is empty, wait a bit then resolve
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        // Wait 200ms to ensure no new audio is coming
        setTimeout(() => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            resolve();
          }
        }, 200);
        return;
      }

      let consecutiveEmptyChecks = 0;
      const requiredEmptyChecks = 3; // Require 3 consecutive checks (300ms) of no activity

      // Poll every 100ms to check if audio is done
      const checkInterval = setInterval(() => {
        const isPlaying = isPlayingRef.current;
        const queueLength = audioQueueRef.current.length;

        // If not playing and queue is empty, increment counter
        if (!isPlaying && queueLength === 0) {
          consecutiveEmptyChecks++;
          // Only resolve after multiple consecutive checks to ensure audio is really done
          if (consecutiveEmptyChecks >= requiredEmptyChecks) {
            clearInterval(checkInterval);
            resolve();
          }
        } else {
          // Reset counter if audio is still playing or queue has items
          consecutiveEmptyChecks = 0;
        }
      }, 100);

      // Safety timeout - only as a last resort (10 minutes for very long responses)
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 600000); // 10 minutes - should be enough for any response
    });
  }, []);

  /**
   * Stop current playback
   */
  const stopPlayback = useCallback((): void => {
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current.disconnect();
        currentAudioSourceRef.current = null;
      } catch (e) {
        // ignore
      }
    }
    isPlayingRef.current = false;
  }, []);

  /**
   * Clear audio queue
   */
  const clearQueue = useCallback((): void => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  return {
    audioQueueRef,
    isPlayingRef,
    audioContextRef,
    currentAudioSourceRef,
    playAudioQueue,
    waitForAudioToFinish,
    playAudioBuffer,
    stopPlayback,
    clearQueue,
  };
};

export default useAudioPlayback;
