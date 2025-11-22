import { useState, useEffect } from 'react';
import { Bell, RotateCw, LayoutDashboard, Activity, TrendingUp } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { UnifiedChartPanel } from '@/components/charts/UnifiedChartPanel';
import { MobileVwapPanel } from '@/components/mobile/MobileVwapPanel';
import { RvwapPanel } from '@/components/rvwap/RvwapPanel';
import { MarketPulseAlerts } from '@/components/MarketPulseAlerts';
import { CenturionLoader } from '@/components/CenturionLoader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MobileDashboard = () => {
  const [showLoading, setShowLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pulse' | 'vwap' | 'rvwap'>('pulse');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleLoadingComplete = () => {
    setShowLoading(false);
  };

  // Failsafe: ensure loader is removed after max 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showLoading) {
        setShowLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [showLoading]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate refresh delay
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* Loading Overlay */}
      {showLoading && (
        <CenturionLoader onComplete={handleLoadingComplete} />
      )}

      {/* Top Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-4 shrink-0 z-40">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-tight text-white">CENTURION</h1>
          <span className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Terminal Mobile</span>
        </div>
        
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <Bell className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] bg-zinc-950 border-l border-zinc-800 p-0">
            <div className="h-full pt-6">
              <MarketPulseAlerts />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950 relative">
        <div className="min-h-full p-4 pb-24">
          {activeTab === 'pulse' && (
            <div className="h-[60vh] min-h-[400px] w-full">
              <UnifiedChartPanel />
            </div>
          )}
          
          {activeTab === 'vwap' && (
            <div className="h-[60vh] min-h-[400px] w-full">
              <MobileVwapPanel />
            </div>
          )}

          {activeTab === 'rvwap' && (
            <div className="pb-4">
              <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-lg fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 pb-safe">
        <button
          onClick={() => setActiveTab('pulse')}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            activeTab === 'pulse' ? "text-primary" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Activity className="h-5 w-5" />
          <span className="text-[10px] font-medium">Pulse</span>
        </button>

        <button
          onClick={() => setActiveTab('vwap')}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            activeTab === 'vwap' ? "text-primary" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <TrendingUp className="h-5 w-5" />
          <span className="text-[10px] font-medium">VWAP</span>
        </button>

        <button
          onClick={() => setActiveTab('rvwap')}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            activeTab === 'rvwap' ? "text-primary" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] font-medium">RVWAP</span>
        </button>

        <button
          onClick={handleRefresh}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors text-zinc-500 hover:text-white",
            isRefreshing && "animate-pulse text-primary"
          )}
        >
          <RotateCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
          <span className="text-[10px] font-medium">Refresh</span>
        </button>
      </nav>
    </div>
  );
};

export default MobileDashboard;
