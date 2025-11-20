import React, { useState, useMemo } from 'react';
import { useVwapZScore } from '@/hooks/useVwapZScore';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Maximize2 } from 'lucide-react';
import { QuantChart, type Overlay } from '@/components/charts/QuantChart';
import { cn } from '@/lib/utils';

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

  const getValueColor = (value: number) => {
    if (value > 2) return 'text-red-500';
    if (value < -2) return 'text-green-500';
    return 'text-foreground';
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
          return (
            <Card 
              key={period.id}
              className="relative group cursor-pointer hover:bg-secondary/50 transition-colors border-border/40 bg-card/50 backdrop-blur-sm flex flex-col items-center justify-center p-4"
              onClick={() => setSelectedPeriod(period.id)}
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="text-sm font-medium text-muted-foreground mb-2">
                {period.label}
              </div>
              
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <div className={cn("text-2xl font-bold font-mono", getValueColor(value))}>
                  {value.toFixed(2)}
                </div>
              )}
              
              <div className="text-xs text-muted-foreground mt-1">
                Z-Score Deviation
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