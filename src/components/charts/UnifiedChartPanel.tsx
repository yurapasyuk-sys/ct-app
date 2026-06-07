import React, { useMemo, useState } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity } from 'lucide-react';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';
import { BklitCandlestickPanel } from '@/components/charts-kit';
import { downsampleOhlcSeries, toMarketOhlcSeries } from '@/lib/data-handlers';

export const UnifiedChartPanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const chartRef = React.useRef<HTMLDivElement>(null);

  const { klines: futuresKlines, isLoading: loadingKlines } = useKlines({
    symbol,
    interval,
    lookbackDays: 90, 
    minRefreshMs: 5000,
    dataSource: 'futures',
    calculateTension: false,
  });

  const chartData = useMemo(() => {
    return downsampleOhlcSeries(toMarketOhlcSeries(futuresKlines), 360);
  }, [futuresKlines]);

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
               <BklitCandlestickPanel
                  data={chartData}
                  loading={loadingKlines}
               />
             </div>
         )}
      </CardContent>
    </Card>
  );
};
