import React, { useState, useMemo } from 'react';
import { useVwapZScore } from '@/hooks/useVwapZScore';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Maximize2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';
import { BklitLinePanel } from '@/components/charts-kit';
import { downsampleNamedLineSeries, toNamedLineSeries } from '@/lib/data-handlers';

export const VwapZScorePanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval] = useState('1d'); // Fixed to Daily as requested for the modal view
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const chartRef = React.useRef<HTMLDivElement>(null);

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

  const getStatus = (value: number) => {
    if (value > 2) return { label: 'Overbought', color: 'text-z-expensive', bg: 'bg-z-expensive/10', border: 'border-z-expensive/20', icon: TrendingUp };
    if (value < -2) return { label: 'Oversold', color: 'text-z-cheap', bg: 'bg-z-cheap/10', border: 'border-z-cheap/20', icon: TrendingDown };
    if (value > 1) return { label: 'Elevated', color: 'text-pulse-hot', bg: 'bg-pulse-hot/10', border: 'border-pulse-hot/20', icon: TrendingUp };
    if (value < -1) return { label: 'Depressed', color: 'text-pulse-cold', bg: 'bg-pulse-cold/10', border: 'border-pulse-cold/20', icon: TrendingDown };
    return { label: 'Neutral', color: 'text-muted-foreground', bg: 'bg-secondary/50', border: 'border-border/40', icon: Minus };
  };

  const chartData = useMemo(() => {
    return downsampleNamedLineSeries(
      toNamedLineSeries(data, (point) => point.timestamp, {
        z365: (point) => point.z365,
        z180: (point) => point.z180,
        z90: (point) => point.z90,
        z30: (point) => point.z30,
      }),
      900
    );
  }, [data]);

  const selectedSeriesKey = selectedPeriod ? (`z${selectedPeriod}` as const) : null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-full">
        {periods.map((period) => {
          const value = getLastValue(period.dataKey);
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
                 <div className={cn("absolute inset-0 bg-gradient-to-t from-background/10 to-transparent z-0")} />
                 <div className="relative h-full px-2 opacity-65">
                    <BklitLinePanel
                      compact
                      data={chartData.slice(-30)}
                      series={[
                        {
                          key: period.dataKey,
                          label: period.label,
                          color: value > 0 ? '#ff4500' : '#00e396',
                          width: 2,
                        },
                      ]}
                    />
                 </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={selectedPeriod !== null} onOpenChange={(open) => !open && setSelectedPeriod(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader className="px-6 py-4 border-b border-border/40 flex flex-row items-center justify-between shrink-0 space-y-0">
            <DialogTitle className="text-xl font-mono flex items-center gap-4">
              <span>{symbol} 1D</span>
              <span className="text-muted-foreground">|</span>
              <span>{periods.find(p => p.id === selectedPeriod)?.label} Analysis</span>
            </DialogTitle>
            <ShareChartDialog 
              targetRef={chartRef} 
              title={`${symbol} ${periods.find(p => p.id === selectedPeriod)?.label}`} 
              symbol={symbol}
              timeframe={interval}
              indicator={periods.find(p => p.id === selectedPeriod)?.label}
            />
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden p-4 bg-card/30">
            <div ref={chartRef} className="w-full h-full border border-border/20 rounded-lg overflow-hidden bg-background">
               {selectedSeriesKey ? (
                 <BklitLinePanel
                   data={chartData}
                   loading={isLoading}
                   series={[
                     {
                       key: selectedSeriesKey,
                       label: periods.find(p => p.id === selectedPeriod)?.label ?? 'Z-Score',
                       color: '#38bdf8',
                     },
                   ]}
                   yFormatter={(value) => `${value.toFixed(2)}σ`}
                 />
               ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
