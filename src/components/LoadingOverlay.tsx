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
      {/* Simple, lightweight loading animation */}
      <div className="flex flex-col items-center gap-6">
        {/* Loading text */}
        <div className="text-4xl font-bold text-purple-400 tracking-wider animate-pulse">
          BORKISS<span className="text-purple-500">.TRADE</span>
        </div>

        {/* Progress bar */}
        <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Loading text */}
        <div className="text-sm text-gray-400 font-mono">
          Loading Dashboard...
        </div>
      </div>
    </div>
  );
}
