import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Parameters for useFrequencyAnalysis hook
 */
export interface UseFrequencyAnalysisParams {
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  isCapturingRef: React.MutableRefObject<boolean>;
  voiceStateRef: React.MutableRefObject<string>;
}

/**
 * Return type for useFrequencyAnalysis hook
 */
export interface UseFrequencyAnalysisReturn {
  frequencyData: number[];
  startFrequencyAnalysis: () => void;
  animationFrameRef: React.MutableRefObject<number | null>;
}

/**
 * Hook for real-time frequency analysis for voice visualization
 * Analyzes audio frequency data and provides visualization data
 */
const useFrequencyAnalysis = ({
  analyserRef,
  isCapturingRef,
  voiceStateRef,
}: UseFrequencyAnalysisParams): UseFrequencyAnalysisReturn => {
  const [frequencyData, setFrequencyData] = useState<number[]>([0, 0, 0, 0, 0]);
  const animationFrameRef = useRef<number | null>(null);

  const startFrequencyAnalysis = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!analyserRef.current || !isCapturingRef.current) {
        animationFrameRef.current = null;
        return;
      }

      // Only analyze when listening (not when AI is speaking)
      if (voiceStateRef.current === "listening") {
        analyser.getByteFrequencyData(dataArray);

        // Divide frequency spectrum into 5 bands for 5 bars
        // Human voice is typically in 85Hz - 3400Hz range
        // We'll sample different frequency ranges to capture voice modulation
        const bandSize = Math.floor(bufferLength / 5);
        const frequencyBands: number[] = [];

        for (let i = 0; i < 5; i++) {
          const start = i * bandSize;
          const end = start + bandSize;
          let sum = 0;
          let max = 0;
          let peakCount = 0;

          // Get max, average, and peak count for this frequency band
          for (let j = start; j < end && j < bufferLength; j++) {
            const value = dataArray[j];
            sum += value;
            max = Math.max(max, value);
            // Count peaks above threshold for more dynamic response
            if (value > 128) peakCount++;
          }

          // Use a combination of max and average for more natural response
          const avg = sum / bandSize;
          // Weighted combination: 60% max (for peaks) + 30% average (for smoothness) + 10% peak density
          const peakFactor = Math.min(peakCount / bandSize, 1);
          const normalized =
            (max * 0.6 + avg * 0.3 + peakFactor * 255 * 0.1) / 255;

          // Apply exponential scaling for more natural visual response
          // Voice modulation is more visible in the mid-range
          const scaled = Math.pow(Math.max(0, normalized), 0.55);

          // Map to bar height with dynamic range (min 4px, max 24px for natural look)
          // Center bars (2, 3) get slightly more range for better voice visualization
          const maxHeight = i === 2 || i === 3 ? 24 : 20;
          const height = 4 + scaled * (maxHeight - 4);
          frequencyBands.push(height);
        }

        setFrequencyData(frequencyBands);
      } else {
        // When not listening, fade out the bars
        setFrequencyData((prev) => prev.map((val) => Math.max(0, val * 0.85)));
      }

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, [analyserRef, isCapturingRef, voiceStateRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  return {
    frequencyData,
    startFrequencyAnalysis,
    animationFrameRef,
  };
};

export default useFrequencyAnalysis;
