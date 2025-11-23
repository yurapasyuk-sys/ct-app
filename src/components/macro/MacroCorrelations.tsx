import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';

interface HistoryPoint {
  date: string;
  btcPrice: number;
  assetPrice: number;
}

interface CorrelationData {
  id: string;
  name: string;
  symbol: string;
  correlation: number;
  lastPrice: number;
  dataPoints: number;
  history: HistoryPoint[];
}

interface MacroData {
  btcPrice: number;
  correlations: CorrelationData[];
}

const CorrelationChart = ({ data, assetName }: { data: HistoryPoint[], assetName: string }) => {
  const normalized = useMemo(() => {
    if (!data.length) return [];
    const btcStart = data[0].btcPrice;
    const assetStart = data[0].assetPrice;
    return data.map(d => ({
      date: d.date,
      btc: ((d.btcPrice - btcStart) / btcStart) * 100,
      asset: ((d.assetPrice - assetStart) / assetStart) * 100
    }));
  }, [data]);

  if (!normalized.length) return null;

  const min = Math.min(...normalized.map(d => Math.min(d.btc, d.asset)));
  const max = Math.max(...normalized.map(d => Math.max(d.btc, d.asset)));
  const range = max - min || 1;
  const padding = range * 0.1;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const width = 800;
  const height = 400;
  const paddingX = 40;
  const paddingY = 20;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingY * 2;

  const getX = (i: number) => paddingX + (i / (normalized.length - 1)) * graphWidth;
  const getY = (val: number) => height - paddingY - ((val - yMin) / yRange) * graphHeight;

  const btcPath = normalized.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.btc)}`).join(' ');
  const assetPath = normalized.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.asset)}`).join(' ');

  // Generate dynamic ticks
  const tickCount = 6;
  const ticks = useMemo(() => {
    const step = yRange / tickCount;
    return Array.from({ length: tickCount + 1 }, (_, i) => {
        const val = yMin + i * step;
        return Math.round(val * 10) / 10; // Round to 1 decimal
    });
  }, [yMin, yRange]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-center gap-6 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <span className="text-zinc-300">Bitcoin</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
          <span className="text-zinc-300">{assetName}</span>
        </div>
      </div>
      
      <div className="flex-1 relative min-h-[300px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          {/* Grid Lines */}
          {ticks.map(val => {
             const y = getY(val);
             return (
               <g key={val}>
                 <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#27272a" strokeDasharray="4 4" />
                 <text x={paddingX - 5} y={y + 4} textAnchor="end" fill="#a1a1aa" fontSize="10">{val}%</text>
               </g>
             );
          })}

          {/* Zero Line */}
          {yMin < 0 && yMax > 0 && (
            <line x1={paddingX} y1={getY(0)} x2={width - paddingX} y2={getY(0)} stroke="#a1a1aa" strokeWidth="1" />
          )}

          {/* Paths */}
          <path d={btcPath} fill="none" stroke="#f59e0b" strokeWidth="2" />
          <path d={assetPath} fill="none" stroke="#3b82f6" strokeWidth="2" />
        </svg>
      </div>
      
      <div className="flex justify-between px-4 text-xs text-zinc-500 mt-2">
        <span>{normalized[0]?.date}</span>
        <span>{normalized[normalized.length - 1]?.date}</span>
      </div>
    </div>
  );
};

export const MacroCorrelations = () => {
  const [data, setData] = useState<MacroData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<CorrelationData | null>(null);
  const [period, setPeriod] = useState('30');
  const chartRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/macro-correlations?days=${period}`);
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setError('Failed to load macro data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const getCorrelationColor = (val: number) => {
    if (val > 0.5) return 'text-[#10b981]'; // Bull (Emerald-500)
    if (val < -0.5) return 'text-[#ef4444]'; // Bear (Red-500)
    return 'text-zinc-400';
  };

  const getCorrelationLabel = (val: number) => {
    if (val > 0.7) return 'Strong Positive';
    if (val > 0.3) return 'Positive';
    if (val < -0.7) return 'Strong Inverse';
    if (val < -0.3) return 'Inverse';
    return 'Uncorrelated';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Macro Correlations ({period}D)
            </h2>
            <Tabs value={period} onValueChange={setPeriod} className="h-7">
                <TabsList className="h-7 bg-secondary/50">
                    <TabsTrigger value="15" className="text-xs h-6 px-3">15d</TabsTrigger>
                    <TabsTrigger value="30" className="text-xs h-6 px-3">30d</TabsTrigger>
                    <TabsTrigger value="60" className="text-xs h-6 px-3">60d</TabsTrigger>
                    <TabsTrigger value="90" className="text-xs h-6 px-3">90d</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={fetchData} 
          disabled={isLoading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {error && (
        <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {isLoading && !data ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/40 animate-pulse">
              <CardHeader className="p-4 pb-2 space-y-2">
                <div className="h-4 w-16 bg-zinc-800 rounded" />
                <div className="h-6 w-24 bg-zinc-800 rounded" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="h-3 w-12 bg-zinc-800 rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          data?.correlations.map((item) => (
            <Card 
              key={item.id} 
              className="bg-card/50 backdrop-blur-sm border-border/40 hover:bg-card/80 transition-all cursor-pointer group relative overflow-hidden"
              onClick={() => setSelectedAsset(item)}
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-3 h-3 text-muted-foreground" />
              </div>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {item.name}
                  </span>
                  {item.correlation > 0 ? (
                    <TrendingUp className={cn("w-3 h-3", getCorrelationColor(item.correlation))} />
                  ) : (
                    <TrendingDown className={cn("w-3 h-3", getCorrelationColor(item.correlation))} />
                  )}
                </div>
                
                <div className="flex flex-col gap-0.5">
                  <span className={cn("text-xl font-bold font-mono", getCorrelationColor(item.correlation))}>
                    {item.correlation > 0 ? '+' : ''}{item.correlation.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {getCorrelationLabel(item.correlation)}
                  </span>
                </div>

                <div className="mt-2 pt-2 border-t border-border/20 flex justify-between items-center">
                   <span className="text-[10px] text-zinc-600">Price</span>
                   <span className="text-xs font-mono text-zinc-300">
                     {item.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                   </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <DialogContent className="max-w-3xl bg-zinc-950 border-zinc-800">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <span>BTC vs {selectedAsset?.name}</span>
              <span className={cn("text-sm font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800", getCorrelationColor(selectedAsset?.correlation || 0))}>
                Correlation: {selectedAsset?.correlation.toFixed(2)}
              </span>
            </DialogTitle>
            <ShareChartDialog 
                targetRef={chartRef} 
                title={`BTC vs ${selectedAsset?.name}`}
                symbol="BTC"
                timeframe={`${period}D`}
                indicator={`Correlation: ${selectedAsset?.correlation.toFixed(2)}`}
            />
          </DialogHeader>
          
          <div ref={chartRef} className="bg-zinc-950 p-4 rounded-lg">
            <div className="py-4">
                {selectedAsset && (
                <CorrelationChart data={selectedAsset.history} assetName={selectedAsset.name} />
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 border-t border-zinc-800 pt-4">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 uppercase">Bitcoin Price</span>
                    <span className="text-lg font-mono text-orange-500 font-bold">
                        ${data?.btcPrice.toLocaleString()}
                    </span>
                </div>
                <div className="flex flex-col gap-1 items-end">
                    <span className="text-xs text-zinc-500 uppercase">{selectedAsset?.name} Price</span>
                    <span className="text-lg font-mono text-blue-500 font-bold">
                        {selectedAsset?.lastPrice.toLocaleString()}
                    </span>
                </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
