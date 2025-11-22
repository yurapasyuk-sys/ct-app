import React, { useState, useMemo } from 'react';
import { QuantChart, ChartDataPoint, Overlay } from './QuantChart';
import { useKlines } from '@/hooks/useKlines';
import { getRecommendedThreshold } from '@/lib/tension';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity } from 'lucide-react';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';

export const UnifiedChartPanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const chartRef = React.useRef<HTMLDivElement>(null);

  // Fetch Data
  // Primary source for candles: Futures (matches MTM Tension)
  const { klines: futuresKlines, tensionData, isLoading: loadingKlines } = useKlines({
    symbol,
    interval,
    lookbackDays: 90, 
    minRefreshMs: 5000, // Update every 5 seconds
    dataSource: 'futures',
  });

  // Merge Data
  const chartData = useMemo(() => {
    if (!futuresKlines.length) return [];

    // Create base map from timestamps
    const dataMap = new Map<number, ChartDataPoint>();
    
    futuresKlines.forEach(k => {
      dataMap.set(k.openTime, {
        timestamp: k.openTime,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      });
    });

    // Merge Tension
    tensionData.forEach(t => {
      const point = dataMap.get(t.timestamp);
      if (point) {
        point.tension = t.tensionIndex;
      }
    });

    return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [futuresKlines, tensionData]);

  // Define Overlays
  const overlays: Overlay[] = useMemo(() => {
    return [{
      id: 'Market Pulse',
      type: 'pulse',
      dataKey: 'tension',
      color: '#FACC15', // Yellow-400 (High visibility on dark)
      opacity: 0.4,
      threshold: getRecommendedThreshold(interval), // Highlight high tension
    }];
  }, [interval]);

  return (
    <Card className="w-full h-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 gap-4 border-b border-border/40">
        <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                {symbol} <span className="text-muted-foreground text-sm font-normal">Perpetual</span>
            </CardTitle>
            
            <Tabs value={interval} onValueChange={setInterval} className="h-7">
                <TabsList className="h-7 bg-secondary/50">
                    <TabsTrigger value="15m" className="text-xs h-6 px-3">15m</TabsTrigger>
                    <TabsTrigger value="1h" className="text-xs h-6 px-3">1h</TabsTrigger>
                    <TabsTrigger value="4h" className="text-xs h-6 px-3">4h</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
        <ShareChartDialog 
          targetRef={chartRef} 
          title={`${symbol} Market Pulse`} 
          symbol={symbol}
          timeframe={interval}
          indicator="Market Pulse"
        />
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
         {loadingKlines && chartData.length === 0 ? (
             <div className="h-full flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
         ) : (
             <div ref={chartRef} className="w-full h-full bg-background">
               <QuantChart 
                  data={chartData} 
                  overlays={overlays} 
                  height="100%" // Let it fill container
                  className="h-full w-full"
                  mainSeriesName="Price"
               />
             </div>
         )}
      </CardContent>
    </Card>
  );
};
