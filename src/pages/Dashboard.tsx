import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import LoadingOverlay from '@/components/LoadingOverlay'; // Not lazy - loads immediately

// Lazy load heavy components
const RvwapPanel = lazy(() => import('@/components/rvwap/RvwapPanel').then(module => ({ default: module.RvwapPanel })));
const MTMPanel = lazy(() => import('@/components/mtm/MTMPanel').then(module => ({ default: module.MTMPanel })));

const Dashboard = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [contentOpacity, setContentOpacity] = useState(0);

  useEffect(() => {
    let resizeTimeout: number | null = null;

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    const debouncedCheckMobile = () => {
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(checkMobile, 150);
    };

    checkMobile();
    window.addEventListener('resize', debouncedCheckMobile);

    return () => {
      window.removeEventListener('resize', debouncedCheckMobile);
      if (resizeTimeout !== null) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  const handleLoadingComplete = () => {
    console.log('📍 Dashboard: loading complete, showing content');
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Loading Overlay - NOT lazy loaded, shows immediately */}
      {showLoading && <LoadingOverlay onComplete={handleLoadingComplete} />}

      {/* Beautiful gradient background - no WebGL, super fast */}
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-purple-950/40 via-background to-blue-950/40">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>

      {/* Subtle noise texture overlay */}
      <div
        className="fixed inset-0 z-[1] opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat'
        }}
      />

      {/* Content - fades in after loading */}
      <div
        className="relative z-10 min-h-screen transition-opacity duration-[800ms]"
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
          {/* MTM Panel */}
          <Suspense fallback={<div className="h-96 bg-card/50 animate-pulse rounded-lg" />}>
            <MTMPanel symbol="BTCUSDT" dataSource="futures" />
          </Suspense>

          {/* RVWAP Panel */}
          <Suspense fallback={<div className="h-96 bg-card/50 animate-pulse rounded-lg" />}>
            <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
