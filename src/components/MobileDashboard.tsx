import { useState } from 'react';
import { Bell, RotateCw, Activity, TrendingUp } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { UnifiedChartPanel } from '@/components/charts/UnifiedChartPanel';
import { VwapZScorePanel } from '@/components/charts/VwapZScorePanel';
import { MarketPulseAlerts } from '@/components/MarketPulseAlerts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MobileDashboard = () => {
  const [activeTab, setActiveTab] = useState<'pulse' | 'vwap'>('pulse');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Simulate refresh delay
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden supports-[height:100dvh]:h-[100dvh] min-h-screen">
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
      <main className="flex-1 overflow-hidden bg-zinc-950 relative flex flex-col">
        <div className="flex-1 flex flex-col p-4 pb-24 h-full">
          {activeTab === 'pulse' && (
            <div className="flex-1 flex flex-col gap-4 h-full">
              <div className="flex-[3] min-h-0">
                <UnifiedChartPanel />
              </div>
              <div className="flex-[1] min-h-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                <MarketPulseAlerts />
              </div>
            </div>
          )}
          
          {activeTab === 'vwap' && (
            <div className="h-full w-full overflow-y-auto">
              <VwapZScorePanel />
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
