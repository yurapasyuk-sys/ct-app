import { useState, useEffect } from 'react';
import ASCIIText from './ASCIIText';

interface LoadingOverlayProps {
  onComplete?: () => void;
}

export default function LoadingOverlay({ onComplete }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Timing configuration
  const animationDuration = prefersReducedMotion ? 800 : 2500; // 2.5s ASCII animation
  const fadeOutDuration = 800; // 800ms fade out
  const totalDuration = animationDuration + fadeOutDuration;

  useEffect(() => {
    // Start fade out after animation completes
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, animationDuration);

    // Complete and unmount after fade out
    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      }
    }, totalDuration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(completeTimer);
    };
  }, [animationDuration, totalDuration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity"
      style={{
        opacity: isFadingOut ? 0 : 1,
        transitionDuration: `${fadeOutDuration}ms`,
        transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
      }}
    >
      {/* ASCII Animation */}
      <div className="relative w-full h-full">
        <ASCIIText
          text="Fetching_data..."
          asciiFontSize={10}
          textFontSize={180}
          textColor="#A855F7"
          planeBaseHeight={8}
          enableWaves={!prefersReducedMotion}
        />
      </div>

      {/* Subtle loading indicator */}
      {!prefersReducedMotion && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-primary/70"
                style={{
                  animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
