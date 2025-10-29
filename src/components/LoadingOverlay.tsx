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
  
  // Adaptive text size based on viewport
  const getAdaptiveTextSize = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minDimension = Math.min(vw, vh);
    
    // Scale text size based on viewport
    // Small screens (< 768px): smaller text
    // Medium screens (768-1024px): medium text
    // Large screens (> 1024px): full text
    if (minDimension < 500) return 90;   // Very small mobile (было 80)
    if (minDimension < 768) return 110;  // Mobile (было 100)
    if (minDimension < 1024) return 120; // Tablet
    return 130; // Desktop
  };
  
  // Adaptive plane base height - bigger on small screens for visibility
  const getAdaptivePlaneHeight = () => {
    const minDimension = Math.min(window.innerWidth, window.innerHeight);
    
    if (minDimension < 500) return 9;  // Больше для маленьких экранов
    if (minDimension < 768) return 8;  // Средний размер
    return 7; // Стандартный для десктопа
  };
  
  const adaptiveTextSize = getAdaptiveTextSize();
  const adaptivePlaneHeight = getAdaptivePlaneHeight();
  
  // Timing configuration
  const animationDuration = prefersReducedMotion ? 800 : 3200; // 3.2s ASCII animation
  const fadeOutDuration = 800; // 0.8s fade out
  const totalDuration = animationDuration + fadeOutDuration;

  useEffect(() => {
    console.log('🎬 Loading animation started - будет показываться', animationDuration, 'ms');
    
    // Start fade out after animation completes
    const fadeOutTimer = setTimeout(() => {
      console.log('⬇️ Starting fade-out');
      setIsFadingOut(true);
    }, animationDuration);

    // Complete and unmount after fade out
    const completeTimer = setTimeout(() => {
      console.log('✅ Loading animation complete');
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
        transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        willChange: 'opacity', // GPU acceleration hint
        transform: 'translateZ(0)', // Force GPU layer
        backfaceVisibility: 'hidden' // Improve rendering
      }}
    >
      {/* ASCII Animation */}
      <div className="relative w-full h-full">
        <ASCIIText
          text="Fetching_data..."
          asciiFontSize={9}
          textFontSize={adaptiveTextSize}
          textColor="#A855F7"
          planeBaseHeight={adaptivePlaneHeight}
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
                  animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                  willChange: 'transform, opacity'
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
