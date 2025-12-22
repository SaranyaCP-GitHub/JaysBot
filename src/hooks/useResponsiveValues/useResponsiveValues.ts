import { useState, useEffect } from "react";

/**
 * Screen size breakpoint types
 */
export type ScreenSize =
  | "mobile"
  | "smallTablet"
  | "tablet"
  | "laptop"
  | "desktop"
  | "largeDesktop"
  | "xlargeDesktop"
  | "xxLargeDesktop"
  | "xxxLargeDesktop"
  | "designerDesktop"
  | "fourKDesktop";

/**
 * Viewport dimensions
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Modal style configuration
 */
export interface ModalStyles {
  bottom: string;
  maxHeight: string;
  chatMaxHeight: string;
}

/**
 * Return type for useResponsiveValues hook
 */
export interface UseResponsiveValuesReturn {
  screenSize: ScreenSize;
  viewport: Viewport;
  getModalStyles: (minimized: boolean) => ModalStyles;
}

/**
 * Custom hook for responsive breakpoints and viewport management
 * @returns Object containing screenSize, viewport, and getModalStyles function
 */
const useResponsiveValues = (): UseResponsiveValuesReturn => {
  const [screenSize, setScreenSize] = useState<ScreenSize>("laptop");
  const [viewport, setViewport] = useState<Viewport>({
    width: 1024,
    height: 800,
  });

  useEffect(() => {
    const updateScreenSize = (): void => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Update viewport dimensions
      setViewport({ width, height });

      if (width < 640) {
        setScreenSize("mobile");
      } else if (width <= 800) {
        setScreenSize("smallTablet");
      } else if (width < 1024) {
        setScreenSize("tablet");
      } else if (width < 1280) {
        setScreenSize("laptop");
      } else if (width < 1440) {
        setScreenSize("desktop");
      } else if (width < 1635) {
        setScreenSize("largeDesktop");
      } else if (width < 1700) {
        setScreenSize("xlargeDesktop");
      } else if (width < 1800) {
        setScreenSize("xxLargeDesktop");
      } else if (width < 1925) {
        setScreenSize("xxxLargeDesktop");
      } else if (width < 2960) {
        setScreenSize("designerDesktop");
      } else {
        setScreenSize("fourKDesktop");
      }
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  const getModalStyles = (minimized: boolean): ModalStyles => {
    const { width } = viewport;

    // Simple breakpoint-based styles - easy to adjust manually
    // Format: { bottom, minimizedHeight, expandedMaxHeight, chatMaxHeight }

    let bottom: string;
    let minimizedHeight: string;
    let expandedMaxHeight: string;
    let chatMaxHeight: string;

    if (width < 640) {
      // Mobile
      bottom = "48px";
      minimizedHeight = "56px";
      expandedMaxHeight = "45vh";
      chatMaxHeight = "38vh";
    } else if (width < 768) {
      // Small tablet
      bottom = "52px";
      minimizedHeight = "58px";
      expandedMaxHeight = "50vh";
      chatMaxHeight = "43vh";
    } else if (width < 1024) {
      // Tablet
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "55vh";
      chatMaxHeight = "48vh";
    } else if (width < 1280) {
      // Laptop
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "60vh";
      chatMaxHeight = "53vh";
    } else if (width < 1536) {
      // Desktop
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "65vh";
      chatMaxHeight = "58vh";
    } else {
      // Large desktop / 4K
      bottom = "52px";
      minimizedHeight = "60px";
      expandedMaxHeight = "70vh";
      chatMaxHeight = "63vh";
    }

    return {
      bottom,
      maxHeight: minimized ? minimizedHeight : expandedMaxHeight,
      chatMaxHeight,
    };
  };

  return { screenSize, viewport, getModalStyles };
};

export default useResponsiveValues;
