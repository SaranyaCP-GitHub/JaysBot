import React from "react";

export interface GlowInputContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * GlowInputContainer - Molecule component that wraps input with animated glow effect
 * Provides the animated gradient border effect
 */
const GlowInputContainer: React.FC<GlowInputContainerProps> = ({
  children,
  className = "",
}) => {
  return (
    <>
      <div className={`input-glow-container rounded-full ${className}`}>
        <div className="rounded-full h-12 flex items-center p-3">
          {children}
        </div>
      </div>
      <style>{`
        @keyframes borderGlow {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 200% 50%;
          }
        }
        
        .input-glow-container {
          position: relative;
          padding: 2.5px;
          border-radius: 50px;
          background: linear-gradient(
            90deg,
            #c084fc,
            #a78bfa,
            #818cf8,
            #60a5fa,
            #22d3ee,
            #60a5fa,
            #818cf8,
            #c084fc,
            #a78bfa,
            #818cf8
          );
          background-size: 300% 100%;
          animation: borderGlow 3s linear infinite;
          transition: all 0.3s ease;
        }
        
        .input-glow-container > div {
          position: relative;
          border-radius: 48px;
          border: none;
          outline: none;
          box-shadow: none;
          z-index: 1;
          background: linear-gradient(135deg, #f3f0ff 0%, #faf8ff 100%);
          transition: all 0.3s ease;
        }

        .input-glow-container:focus-within > div {
          background: linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%);
        }
      `}</style>
    </>
  );
};

export default GlowInputContainer;
