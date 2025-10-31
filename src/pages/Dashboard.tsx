import LiquidEther from '@/components/LiquidEther';
import LoadingOverlay from '@/components/LoadingOverlay';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

// Import panels
import { RvwapPanel } from '@/components/rvwap/RvwapPanel';
import { MTMPanel } from '@/components/mtm/MTMPanel';
import { OEBTCIndicator } from '@/components/OEBTCIndicator';

const Dashboard = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [showLoading, setShowLoading] = useState(true); // Always show on mount
  const [contentOpacity, setContentOpacity] = useState(0);

  // Remove sessionStorage check - always show animation
  // Animation will play every time user navigates to dashboard

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const handleLoadingComplete = () => {
    console.log('📍 Dashboard: анимация завершена, показываем контент');
    setShowLoading(false);
    
    // Small delay before starting content fade-in for smooth transition
    setTimeout(() => {
      setContentOpacity(1);
    }, 50);
  };

  // Mobile blocker
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border-2 border-border rounded-lg p-8 shadow-2xl text-center space-y-6">
          <div className="text-7xl">📱🚫</div>
          <h1 className="text-3xl font-bold">Dashboard Not Available on Mobile</h1>
          <p className="text-muted-foreground text-lg">
            The trading dashboard is currently not available on mobile devices due to complex chart interactions and data requirements.
          </p>
          <div className="pt-4 space-y-3 text-left bg-muted/30 rounded-lg p-4">
            <p className="font-semibold text-center">Please try:</p>
            <ul className="space-y-2 text-sm">
              <li>• Enable <strong>Desktop Mode</strong> in your browser settings</li>
              <li>• Access from a <strong>computer</strong> for the best experience</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Loading Overlay - shows every time dashboard is loaded */}
      {showLoading && (
        <LoadingOverlay onComplete={handleLoadingComplete} />
      )}

      {/* Liquid Ether Background - lowest z-index, dimmed during loading */}
      <div 
        className="fixed inset-0 z-0 transition-all duration-500"
        style={{ 
          opacity: showLoading ? 0.2 : 1,
          filter: showLoading ? 'blur(8px)' : 'blur(0px)',
          transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
        }}
      >
        <LiquidEther
          colors={['#5227FF', '#FF9FFC', '#B19EEF']}
          mouseForce={prefersReducedMotion ? 15 : 30}
          cursorSize={150}
          isViscous={false}
          viscous={30}
          iterationsViscous={prefersReducedMotion ? 16 : 32}
          iterationsPoisson={prefersReducedMotion ? 16 : 32}
          resolution={prefersReducedMotion ? 0.3 : 0.5}
          isBounce={false}
          autoDemo={true}
          autoSpeed={prefersReducedMotion ? 0.4 : 0.7}
          autoIntensity={3.0}
          takeoverDuration={0.25}
          autoResumeDelay={3000}
          autoRampDuration={0.6}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Darkening mask for chart readability */}
      <div 
        className="fixed inset-0 z-[1] bg-black/60" 
        style={{ pointerEvents: 'none' }}
      />

      {/* Content - fades in after loading */}
      <div 
        className="relative z-10 min-h-screen transition-opacity duration-[1200ms]"
        style={{ 
          pointerEvents: 'auto',
          opacity: contentOpacity,
          transitionTimingFunction: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Back Button */}
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              {/* Title */}
              <h1 className="text-2xl font-bold">Dashboard</h1>

              {/* Spacer */}
              <div className="w-20"></div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
          {/* OE-BTC Indicator */}
          <OEBTCIndicator />
          
          {/* MTM Panel */}
          <MTMPanel symbol="BTCUSDT" dataSource="futures" />
          
          {/* RVWAP Panel */}
          <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
