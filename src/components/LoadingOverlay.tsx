import { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  onComplete?: () => void;
}

export default function LoadingOverlay({ onComplete }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Timing configuration - super fast loading
  const animationDuration = prefersReducedMotion ? 300 : 600; // Very fast load
  const fadeOutDuration = 400; // Quick fade out
  const totalDuration = animationDuration + fadeOutDuration;

  useEffect(() => {
    console.log('🎬 Loading animation started - будет показываться', animationDuration, 'ms');

    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + (100 / (animationDuration / 50));
      });
    }, 50);

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
      clearInterval(progressInterval);
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
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(10px)'
      }}
    >
      {/* Animated gradient background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/20 rounded-full blur-[120px] animate-pulse"
          style={{ animationDuration: '5s', animationDelay: '1s' }}
        />
      </div>

      {/* Simple, lightweight loading animation */}
      <div className="flex flex-col items-center gap-6 relative z-10">
        {/* Loading text with gradient */}
        <div className="text-4xl md:text-5xl font-bold tracking-wider">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">
            BORKISS
          </span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_30px_rgba(34,211,238,0.5)]">
            .TRADE
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-64 md:w-80 h-1 bg-gray-800/50 rounded-full overflow-hidden shadow-[0_0_20px_rgba(59,130,246,0.2)]">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-100 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Loading text */}
        <div className="text-sm text-cyan-400/70 font-mono animate-pulse">
          Loading Dashboard...
        </div>
      </div>
    </div>
  );
}
