import { ArrowLeft, Settings, RotateCw, Bell, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useDashboardSignals } from '@/hooks/useDashboardSignals';

// Lazy load components
const LoadingOverlay = lazy(() => import('@/components/LoadingOverlay'));

const MobileDashboard = () => {
  const navigate = useNavigate();
  const [showLoading, setShowLoading] = useState(true);
  const [contentOpacity, setContentOpacity] = useState(0);
  const [activeIndicatorIdx, setActiveIndicatorIdx] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  
  const signals = useDashboardSignals('BTCUSDT');

  const indicators = ['overview', 'mtm', 'rvwap'] as const;
  type IndicatorType = typeof indicators[number];
  const indicatorLabels: Record<IndicatorType, string> = {
    'overview': 'Overview',
    'mtm': 'MTM',
    'rvwap': 'RVWAP'
  };

  // Check for reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleLoadingComplete = () => {
    console.log('📍 MobileDashboard: анимация завершена');
    setShowLoading(false);
    setTimeout(() => {
      setContentOpacity(1);
    }, 50);
  };

  // Swipe gesture handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    handleSwipe();
  };

  const handleSwipe = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Swiped left - go to next indicator
        setActiveIndicatorIdx((prev) => (prev + 1) % indicators.length);
      } else {
        // Swiped right - go to previous indicator
        setActiveIndicatorIdx((prev) => (prev - 1 + indicators.length) % indicators.length);
      }
    }
  };

  const currentIndicator = indicators[activeIndicatorIdx];

  return (
    <div 
      className="min-h-screen bg-background relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Loading Overlay */}
      {showLoading && (
        <Suspense fallback={null}>
          <LoadingOverlay onComplete={handleLoadingComplete} />
        </Suspense>
      )}

      {/* Background */}
      <div
        className="fixed inset-0 z-0 bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950"
        style={{ pointerEvents: 'none' }}
      />
      <div
        className="fixed inset-0 z-[0.5] bg-gradient-to-t from-blue-500/5 to-transparent"
        style={{ pointerEvents: 'none' }}
      />

      {/* Content */}
      <div 
        className="relative z-10 min-h-screen transition-opacity duration-500 flex flex-col pb-32"
        style={{ 
          pointerEvents: 'auto',
          opacity: contentOpacity,
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Back to home"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </button>
          
          <h1 className="text-lg font-bold flex-1 text-center">
            {indicatorLabels[currentIndicator]}
          </h1>

          <button
            onClick={() => setFabOpen(!fabOpen)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Menu"
          >
            <Settings className="w-4 h-4" />
          </button>
        </header>

        {/* Indicator content */}
        <main className="flex-1 px-4 py-6 space-y-4">
          {currentIndicator === 'overview' && <OverviewMetrics signals={signals} />}
          {currentIndicator === 'mtm' && <MTMMetrics />}
          {currentIndicator === 'rvwap' && <RVWAPMetrics />}
        </main>

        {/* Swipe indicator */}
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50">
          Swipe to navigate
        </div>
      </div>

      {/* Dot indicators */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex gap-2">
        {indicators.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndicatorIdx(idx)}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === activeIndicatorIdx
                ? 'bg-primary w-6'
                : 'bg-muted-foreground/40 hover:bg-muted-foreground/60'
            }`}
            aria-label={`Go to ${indicatorLabels[indicators[idx]]}`}
          />
        ))}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-2 flex justify-around items-center">
        <button
          onClick={() => navigate('/')}
          className="flex flex-col items-center gap-1 p-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Home"
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>
        
        <button
          onClick={() => window.location.reload()}
          className="flex flex-col items-center gap-1 p-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Refresh data"
        >
          <RotateCw className="w-5 h-5" />
          <span>Refresh</span>
        </button>

        <button
          className="flex flex-col items-center gap-1 p-2 text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Alerts (coming soon)"
          disabled
        >
          <Bell className="w-5 h-5" />
          <span>Alerts</span>
        </button>

        <button
          onClick={() => setFabOpen(!fabOpen)}
          className="flex flex-col items-center gap-1 p-2 text-xs text-primary font-semibold"
          title="More options"
        >
          <Settings className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* Settings Overlay */}
      {fabOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setFabOpen(false)}
        >
          <div 
            className="absolute bottom-24 right-4 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 space-y-2 min-w-[200px]">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Quick Settings</p>
              
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted rounded transition-colors flex items-center gap-2"
                title="Full screen dashboard"
              >
                <span>🖥️</span>
                <span>Desktop View</span>
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted rounded transition-colors flex items-center gap-2 text-destructive"
              >
                <span>🔄</span>
                <span>Reset All</span>
              </button>

              <button
                onClick={() => navigate('/')}
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted rounded transition-colors flex items-center gap-2"
              >
                <span>🏠</span>
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ label, value, unit, status, change }: any) => (
  <div className="bg-card/50 border border-border rounded-lg p-4 backdrop-blur-sm">
    <div className="flex items-start justify-between mb-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      {status && (
        <span className={`text-xs font-semibold px-2 py-1 rounded ${
          status === 'bullish' ? 'bg-green-500/20 text-green-400' :
          status === 'bearish' ? 'bg-red-500/20 text-red-400' :
          'bg-yellow-500/20 text-yellow-400'
        }`}>
          {status === 'bullish' ? '📈' : status === 'bearish' ? '📉' : '⏸️'}
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
        {value}
      </span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
    {change && (
      <div className={`text-xs mt-2 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </div>
    )}
  </div>
);

// Overview Metrics
const OverviewMetrics = ({ signals }: any) => (
  <>
    <MetricCard
      label="MTM M15"
      value={signals.mtmM15Value?.toFixed(2) || '—'}
      unit="BTC"
      status={signals.mtmM15Status}
    />
    <MetricCard
      label="MTM 1H"
      value={signals.mtm1hValue?.toFixed(2) || '—'}
      unit="BTC"
      status={signals.mtm1hStatus}
    />
    <MetricCard
      label="MTM 4H"
      value={signals.mtm4hValue?.toFixed(2) || '—'}
      unit="BTC"
      status={signals.mtm4hStatus}
    />
    <MetricCard
      label="RVWAP 90D"
      value={signals.rvwap90d?.toFixed(2) || '—'}
      unit="%"
      status={signals.rvwapStatus}
    />
  </>
);

// MTM Metrics (Placeholder)
const MTMMetrics = () => (
  <>
    <MetricCard
      label="MTM Analysis"
      value="Multi-timeframe"
      status="neutral"
    />
    <div className="bg-card/50 border border-border rounded-lg p-4 text-center text-muted-foreground text-sm">
      Detailed charts available on desktop
    </div>
  </>
);

// RVWAP Metrics (Placeholder)
const RVWAPMetrics = () => (
  <>
    <MetricCard
      label="RVWAP Status"
      value="90D Analysis"
      status="neutral"
    />
    <div className="bg-card/50 border border-border rounded-lg p-4 text-center text-muted-foreground text-sm">
      Extended timeframes available on desktop
    </div>
  </>
);

export default MobileDashboard;
