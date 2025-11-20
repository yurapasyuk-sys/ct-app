import { Sidebar } from '@/components/Sidebar';
import { UnifiedChartPanel } from '@/components/charts/UnifiedChartPanel';
import { MarketPulseAlerts } from '@/components/MarketPulseAlerts';
import { VwapZScorePanel } from '@/components/charts/VwapZScorePanel';
import { CenturionLoader } from '@/components/CenturionLoader';
import { useState } from 'react';

const Dashboard = () => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <>
      {isLoading && <CenturionLoader onComplete={() => setIsLoading(false)} />}
      <div className={`flex h-screen w-full bg-background text-foreground overflow-hidden ${isLoading ? 'hidden' : ''}`}>
        <Sidebar />
        
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-border/40 bg-background/95 backdrop-blur flex items-center px-6 justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-lg tracking-tight">Market Overview</h1>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-1 rounded-full border border-border/40">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                SYSTEM ONLINE
              </div>
            </div>
          </header>

          {/* Dashboard Grid */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-4 grid-rows-[3fr_2fr] gap-4 h-full min-h-[600px]">
              
              {/* Main Chart Area (Top Left - 3 cols) */}
              <div className="lg:col-span-3 row-span-1 min-h-0">
                <UnifiedChartPanel />
              </div>

              {/* Alerts Panel (Top Right - 1 col) */}
              <div className="lg:col-span-1 row-span-1 min-h-0">
                <MarketPulseAlerts />
              </div>

              {/* VWAP Z-Score Mod (Bottom - Full Width) */}
              <div className="lg:col-span-4 row-span-1 min-h-0">
                <VwapZScorePanel />
              </div>

            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Dashboard;
