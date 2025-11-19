import { ArrowLeft, Activity, BarChart2, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Lazy load heavy components
const RvwapPanel = lazy(() => import('@/components/rvwap/RvwapPanel').then(module => ({ default: module.RvwapPanel })));
const MTMPanel = lazy(() => import('@/components/mtm/MTMPanel').then(module => ({ default: module.MTMPanel })));

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("mtm");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="h-6 w-px bg-border mx-2" />
            
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <span className="font-semibold tracking-tight">Research Terminal</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground font-mono bg-secondary/50 px-3 py-1 rounded-full border border-border">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              DATA STREAM: ACTIVE
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="mtm" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {activeTab === 'mtm' ? 'Market Tension Map' : 'Rolling VWAP'}
              </h1>
              <p className="text-muted-foreground max-w-2xl">
                {activeTab === 'mtm' 
                  ? 'Multi-timeframe analysis of price extension relative to mean. Identifies potential reversal zones.' 
                  : 'Volume-Weighted Average Price models adapting to market volatility.'}
              </p>
            </div>
            
            <TabsList className="bg-secondary/50 border border-border p-1">
              <TabsTrigger value="mtm" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Activity className="w-4 h-4" />
                Tension Map
              </TabsTrigger>
              <TabsTrigger value="rvwap" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <BarChart2 className="w-4 h-4" />
                Rolling VWAP
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="mtm" className="space-y-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
            <Suspense fallback={<div className="h-[600px] bg-secondary/20 animate-pulse rounded-xl border border-border" />}>
              <MTMPanel symbol="BTCUSDT" dataSource="futures" />
            </Suspense>
          </TabsContent>

          <TabsContent value="rvwap" className="space-y-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
            <Suspense fallback={<div className="h-[600px] bg-secondary/20 animate-pulse rounded-xl border border-border" />}>
              <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
