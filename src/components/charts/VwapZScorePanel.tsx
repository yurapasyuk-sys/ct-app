import React, { useState, useMemo } from 'react';
import { useVwapZScore } from '@/hooks/useVwapZScore';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Maximize2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { QuantChart, type Overlay } from '@/components/charts/QuantChart';
import { cn } from '@/lib/utils';

const Sparkline = ({ data, color }: { data: number[], color: string }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 40;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="w-full h-10 opacity-50">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const VwapZScorePanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval] = useState('1d'); // Fixed to Daily as requested for the modal view
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const { data, isLoading } = useVwapZScore(symbol, interval);

  const periods = [
    { id: 365, label: '365d VWAP', dataKey: 'z365' as const },
    { id: 180, label: '180d VWAP', dataKey: 'z180' as const },
    { id: 90, label: '90d VWAP', dataKey: 'z90' as const },
    { id: 30, label: '30d VWAP', dataKey: 'z30' as const },
  ];

  const getLastValue = (key: 'z365' | 'z180' | 'z90' | 'z30') => {
    if (!data || data.length === 0) return 0;
    return data[data.length - 1][key];
  };

  const getSparklineData = (key: 'z365' | 'z180' | 'z90' | 'z30') => {
    if (!data || data.length === 0) return [];
    // Get last 30 points
    return data.slice(-30).map(d => d[key] as number);
  };

  const getStatus = (value: number) => {
    if (value > 2) return { label: 'Overbought', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: TrendingUp };
    if (value < -2) return { label: 'Oversold', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: TrendingDown };
    if (value > 1) return { label: 'Elevated', color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20', icon: TrendingUp };
    if (value < -1) return { label: 'Depressed', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20', icon: TrendingDown };
    return { label: 'Neutral', color: 'text-muted-foreground', bg: 'bg-secondary/50', border: 'border-border/40', icon: Minus };
  };

  // Prepare combined data for QuantChart
  const chartData = useMemo(() => {
    return data.map(d => ({
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      z365: d.z365,
      z180: d.z180,
      z90: d.z90,
      z30: d.z30,
    }));
  }, [data]);

  const overlays = useMemo<Overlay[]>(() => {
    if (!selectedPeriod) return [];
    return [{
      id: `Z-Score ${selectedPeriod}`,
      type: 'z-score',
      dataKey: `z${selectedPeriod}`,
      color: '#94a3b8', // Base color, overridden by z-score logic
      domain: [-4, 4]
    }];
  }, [selectedPeriod]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full">
        {periods.map((period) => {
          const value = getLastValue(period.dataKey);
          const sparkData = getSparklineData(period.dataKey);
          const status = getStatus(value);
          const StatusIcon = status.icon;

          return (
            <Card 
              key={period.id}
              className={cn(
                "relative group cursor-pointer transition-all duration-300 flex flex-col justify-between overflow-hidden",
                "hover:shadow-lg hover:-translate-y-1",
                status.bg,
                status.border,
                "border bg-opacity-30 backdrop-blur-sm"
              )}
              onClick={() => setSelectedPeriod(period.id)}
            >
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="p-4 pb-0 z-10">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  {period.label}
                </div>
                
                {isLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-primary mt-2" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-3xl font-bold font-mono tracking-tight", status.color)}>
                      {value > 0 ? '+' : ''}{value.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">σ</span>
                  </div>
                )}
                
                <div className={cn("flex items-center gap-1.5 mt-2 text-xs font-medium px-2 py-1 rounded-full w-fit", status.bg, status.color)}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                </div>
              </div>
              
              <div className="w-full h-16 mt-2 px-0 relative">
                 {/* Gradient Fade for Sparkline */}
                 <div className={cn("absolute inset-0 bg-gradient-to-t from-background/10 to-transparent z-0")} />
                 <div className="px-4">
                    <Sparkline data={sparkData} color={value > 0 ? '#fb7185' : '#22d3ee'} />
                 </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={selectedPeriod !== null} onOpenChange={(open) => !open && setSelectedPeriod(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader className="px-6 py-4 border-b border-border/40 flex flex-row items-center justify-between shrink-0">
            <DialogTitle className="text-xl font-mono flex items-center gap-4">
              <span>{symbol} 1D</span>
              <span className="text-muted-foreground">|</span>
              <span>{periods.find(p => p.id === selectedPeriod)?.label} Analysis</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden p-4 bg-card/30">
            <div className="w-full h-full border border-border/20 rounded-lg overflow-hidden">
               <QuantChart 
                 data={chartData} 
                 overlays={overlays}
                 height="100%" 
                 className="w-full h-full"
               />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};