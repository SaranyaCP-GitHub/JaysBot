import { useRef, useCallback, useState } from "react";

import { float32ToPcm16, arrayBufferToBase64 } from "@/utils/voiceUtils";
import { sendAudioData } from "@/services/websocketService";

/**
 * Parameters for useAudioCapture hook
 */
export interface UseAudioCaptureParams {
  instanceId: string;
  wsRef: React.MutableRefObject<WebSocket | null>;
  voiceStateRef: React.MutableRefObject<string>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  canSendAudioRef: React.MutableRefObject<boolean>;
  startFrequencyAnalysis: () => void;
  animationFrameRef: React.MutableRefObject<number | null>;
  onError?: (error: string) => void;
}

/**
 * Return type for useAudioCapture hook
 */
export interface UseAudioCaptureReturn {
  mediaStreamRef: React.MutableRefObject<MediaStream | null>;
  sourceNodeRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  workletNodeRef: React.MutableRefObject<ScriptProcessorNode | null>;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  highPassFilterRef: React.MutableRefObject<BiquadFilterNode | null>;
  lowPassFilterRef: React.MutableRefObject<BiquadFilterNode | null>;
  isCapturingRef: React.MutableRefObject<boolean>;
  audioLevel: number;
  setAudioLevel: React.Dispatch<React.SetStateAction<number>>;
  startAudioCapture: () => Promise<void>;
  stopAudioCapture: () => void;
}

/**
 * Hook for managing audio capture from microphone
 * Handles microphone access, audio processing, and sending to WebSocket
 */
const useAudioCapture = ({
  instanceId,
  wsRef,
  voiceStateRef,
  audioContextRef,
  canSendAudioRef,
  startFrequencyAnalysis,
  animationFrameRef,
  onError,
}: UseAudioCaptureParams): UseAudioCaptureReturn => {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const lowPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  /**
   * Stop existing audio capture
   */
  const stopAudioCapture = useCallback(() => {
    // Cancel animation frame for audio level visualization
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect all audio nodes
    const nodesToDisconnect = [
      sourceNodeRef,
      highPassFilterRef,
      lowPassFilterRef,
      analyserRef,
      workletNodeRef,
    ];

    nodesToDisconnect.forEach((nodeRef) => {
      if (nodeRef.current) {
        try {
          nodeRef.current.disconnect();
        } catch (e) {
          /* ignore */
        }
        nodeRef.current = null;
      }
    });

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context (only if it's not being used by playback)
    // Note: We don't close audioContextRef here as it might be shared with playback
    // The cleanup should be handled at a higher level

    isCapturingRef.current = false;
    setAudioLevel(0);
  }, [animationFrameRef]);

  /**
   * Start capturing audio from microphone
   */
  const startAudioCapture = useCallback(async (): Promise<void> => {
    // Prevent multiple audio captures
    if (isCapturingRef.current) {
      return;
    }

    // Clean up any existing audio resources first
    stopAudioCapture();

    isCapturingRef.current = true;
    canSendAudioRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // Use existing audio context or create new one
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass({
          sampleRate: 24000,
        });
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // Create AnalyserNode for real-time frequency analysis
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256; // Smaller FFT for faster updates
      analyser.smoothingTimeConstant = 0.8; // Smooth transitions
      analyserRef.current = analyser;

      // Create ScriptProcessor for audio processing
      const processor = audioContextRef.current.createScriptProcessor(
        4096,
        1,
        1
      );

      processor.onaudioprocess = (e) => {
        // ⭐ ALWAYS send audio for server VAD to detect interruptions
        // Server-side VAD needs audio stream to detect when user starts speaking

        // Use refs to check current state (avoid stale closures)
        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          voiceStateRef.current !== "processing" &&
          canSendAudioRef.current
        ) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(inputData);
          const base64Audio = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);

          try {
            sendAudioData(wsRef.current, base64Audio);
          } catch (err) {
            console.error(`[${instanceId}] Error sending audio:`, err);
          }
        }
      };

      // Connect: source -> analyser -> processor -> destination
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContextRef.current.destination);
      workletNodeRef.current = processor;

      // Start real-time frequency analysis animation
      startFrequencyAnalysis();
    } catch (err: any) {
      console.error(
        `[${instanceId}] Failed to start audio capture:`,
        err.name,
        err.message
      );
      isCapturingRef.current = false;

      let errorMessage = `Microphone error: ${err.message || err.name}`;
      if (err.name === "NotAllowedError") {
        errorMessage =
          "Microphone blocked. Please allow microphone in browser.";
      } else if (err.name === "NotFoundError") {
        errorMessage = "No microphone found. Please connect a microphone.";
      }

      if (onError) {
        onError(errorMessage);
      }
    }
  }, [
    instanceId,
    wsRef,
    voiceStateRef,
    audioContextRef,
    canSendAudioRef,
    startFrequencyAnalysis,
    stopAudioCapture,
    onError,
  ]);

  return {
    mediaStreamRef,
    sourceNodeRef,
    workletNodeRef,
    analyserRef,
    highPassFilterRef,
    lowPassFilterRef,
    isCapturingRef,
    audioLevel,
    setAudioLevel,
    startAudioCapture,
    stopAudioCapture,
  };
};

export default useAudioCapture;
