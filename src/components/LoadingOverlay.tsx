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
    
    // Увеличены размеры для лучшей читаемости ASCII
    if (minDimension < 500) return 110;  // Увеличено с 90
    if (minDimension < 768) return 130;  // Увеличено с 110
    if (minDimension < 1024) return 140; // Увеличено с 120
    return 150; // Увеличено с 130
  };
  
  // Adaptive plane base height - bigger on small screens for visibility
  const getAdaptivePlaneHeight = () => {
    const minDimension = Math.min(window.innerWidth, window.innerHeight);
    
    // Увеличены значения для лучшей видимости (camera.z теперь 15 вместо 30)
    if (minDimension < 500) return 12;  // Ещё больше для маленьких (было 9)
    if (minDimension < 768) return 10;  // Больше для мобильных (было 8)
    return 8; // Больше для десктопа (было 7)
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
      className="fixed inset-0 z-[100] flex items-center justify-center transition-opacity overflow-hidden"
      style={{
        opacity: isFadingOut ? 0 : 1,
        transitionDuration: `${fadeOutDuration}ms`,
        transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        willChange: 'opacity',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        background: '#000000'
      }}
    >

      {/* ASCII Animation */}
      <div className="relative w-full h-full z-10">
        <ASCIIText
          text="Fetching_data..."
          asciiFontSize={7}
          textFontSize={adaptiveTextSize}
          textColor="#A855F7"
          planeBaseHeight={adaptivePlaneHeight}
          enableWaves={!prefersReducedMotion}
        />
      </div>

      {/* Enhanced loading indicator */}
      {!prefersReducedMotion && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20">
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="relative"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: 'linear-gradient(45deg, #ff0080, #00bfff)',
                    animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                    willChange: 'transform, opacity',
                    boxShadow: '0 0 10px rgba(255, 0, 128, 0.5)'
                  }}
                />
                <div
                  className="absolute inset-0 w-2.5 h-2.5 rounded-full"
                  style={{
                    background: 'linear-gradient(45deg, #ff0080, #00bfff)',
                    animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                    filter: 'blur(4px)',
                    opacity: 0.6
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
