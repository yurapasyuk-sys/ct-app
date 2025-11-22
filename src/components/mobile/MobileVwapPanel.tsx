import React, { useState, useMemo, useRef } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { QuantChart, type ChartDataPoint, type Overlay } from '@/components/charts/QuantChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp } from 'lucide-react';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';

export const MobileVwapPanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('15m');
  const chartRef = useRef<HTMLDivElement>(null);

  // Fetch Data
  const { klines, isLoading } = useKlines({
    symbol,
    interval,
    lookbackDays: 7, // Enough for a few days of session VWAP
    minRefreshMs: 5000,
    dataSource: 'futures',
  });

  // Calculate Session VWAP
  const chartData = useMemo(() => {
    if (!klines.length) return [];

    let cumTpVol = 0;
    let cumVol = 0;
    let currentDay = -1;

    return klines.map(k => {
      const date = new Date(k.openTime);
      const day = date.getUTCDate(); // Use UTC day for crypto standard

      if (day !== currentDay) {
        cumTpVol = 0;
        cumVol = 0;
        currentDay = day;
      }

      const tp = (k.high + k.low + k.close) / 3;
      cumTpVol += tp * k.volume;
      cumVol += k.volume;
      
      const vwap = cumVol ? cumTpVol / cumVol : 0;
      
      return {
        timestamp: k.openTime,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        vwap: vwap
      };
    });
  }, [klines]);

  // Define Overlays
  const overlays: Overlay[] = useMemo(() => {
    return [{
      id: 'Session VWAP',
      type: 'line',
      dataKey: 'vwap',
      color: '#22D3EE', // Cyan-400
      width: 2,
    }];
  }, []);

  return (
    <Card className="w-full h-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 gap-4 border-b border-border/40">
        <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {symbol} <span className="text-muted-foreground text-sm font-normal">VWAP</span>
            </CardTitle>
            
            <Tabs value={interval} onValueChange={setInterval} className="h-7">
                <TabsList className="h-7 bg-secondary/50">
                    <TabsTrigger value="5m" className="text-xs h-6 px-3">5m</TabsTrigger>
                    <TabsTrigger value="15m" className="text-xs h-6 px-3">15m</TabsTrigger>
                    <TabsTrigger value="1h" className="text-xs h-6 px-3">1h</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
        <ShareChartDialog targetRef={chartRef} title={`${symbol} Session VWAP`} />
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
         {isLoading && chartData.length === 0 ? (
             <div className="h-full flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
         ) : (
             <div ref={chartRef} className="w-full h-full bg-background">
               <QuantChart 
                  data={chartData} 
                  overlays={overlays} 
                  height="100%" 
                  className="h-full w-full"
               />
             </div>
         )}
      </CardContent>
    </Card>
  );
};
