import { useState, useEffect } from 'react';
import ASCIIText from './ASCIIText';

interface LoadingOverlayProps {
  onComplete?: () => void;
  duration?: number; // in milliseconds, default 2400ms (2.4s)
}

export default function LoadingOverlay({ onComplete, duration = 2400 }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Adjust duration for reduced motion (quick fade only)
  const actualDuration = prefersReducedMotion ? 400 : duration;
  const fadeOutDuration = 600; // 600ms fade out

  useEffect(() => {
    // Start fade out before completion
    const fadeOutTimer = setTimeout(() => {
      setOpacity(0);
    }, actualDuration - fadeOutDuration);

    // Complete and unmount
    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      }
    }, actualDuration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [actualDuration, fadeOutDuration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity"
      style={{
        opacity,
        transitionDuration: `${fadeOutDuration}ms`,
        transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      }}
    >
      {/* ASCII Animation */}
      <div className="relative w-full h-full">
        <ASCIIText
          text={prefersReducedMotion ? 'Fetching_data' : 'Fetching_data...'}
          asciiFontSize={8}
          textFontSize={120}
          textColor="#A855F7"
          planeBaseHeight={6}
          enableWaves={!prefersReducedMotion}
        />
      </div>

      {/* Subtle loading indicator (optional) */}
      {!prefersReducedMotion && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/60"
                style={{
                  animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite`
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
