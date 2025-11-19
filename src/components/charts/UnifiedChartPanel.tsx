import React, { useState, useMemo } from 'react';
import { QuantChart, ChartDataPoint, Overlay } from './QuantChart';
import { useKlines } from '@/hooks/useKlines';
import { useMultiRvwap } from '@/hooks/useMultiRvwap';
import { getRecommendedThreshold } from '@/lib/tension';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity, BarChart2 } from 'lucide-react';

export const UnifiedChartPanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [selectedOverlays, setSelectedOverlays] = useState<string[]>(['tension', 'rvwap']);

  // Fetch Data
  // Primary source for candles: Futures (matches MTM Tension)
  const { klines: futuresKlines, tensionData, isLoading: loadingKlines } = useKlines({
    symbol,
    interval,
    lookbackDays: 90, 
    dataSource: 'futures',
  });

  // Secondary source: Spot (for RVWAP)
  const { rvwapData, isLoading: loadingRvwap } = useMultiRvwap(symbol, 'spot');

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

    // Merge RVWAP
    // Note: RVWAP might have different timestamps if gaps exist, but usually 1h aligns.
    if (rvwapData) {
        rvwapData['30d'].forEach(r => {
        const point = dataMap.get(r.timestamp);
        if (point) point.rvwap30 = r.vwap;
        });
        rvwapData['90d'].forEach(r => {
        const point = dataMap.get(r.timestamp);
        if (point) point.rvwap90 = r.vwap;
        });
        // 365d is daily, so it will only match 00:00 timestamps. 
        // We might want to interpolate or just show dots. For now, just points.
        rvwapData['365d'].forEach(r => {
        const point = dataMap.get(r.timestamp);
        if (point) point.rvwap365 = r.vwap;
        });
    }

    return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [futuresKlines, tensionData, rvwapData]);

  // Define Overlays based on selection
  const overlays: Overlay[] = useMemo(() => {
    const list: Overlay[] = [];
    
    if (selectedOverlays.includes('tension')) {
      list.push({
        id: 'Market Pulse',
        type: 'pulse', // New type
        dataKey: 'tension',
        color: '#3b82f6', // Blue base
        opacity: 0.4,
        threshold: getRecommendedThreshold(interval), // Highlight high tension
      });
    }

    if (selectedOverlays.includes('rvwap')) {
      list.push({
        id: 'RVWAP 30d',
        type: 'line',
        dataKey: 'rvwap30',
        color: '#3B82F6', // Blue
        width: 2,
      });
      list.push({
        id: 'RVWAP 90d',
        type: 'line',
        dataKey: 'rvwap90',
        color: '#8B5CF6', // Violet
        width: 2,
      });
       list.push({
        id: 'RVWAP 365d',
        type: 'line',
        dataKey: 'rvwap365',
        color: '#EC4899', // Pink
        width: 2,
      });
    }

    return list;
  }, [selectedOverlays]);

  return (
    <Card className="w-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Market Pulse
            </CardTitle>
            
            <Tabs value={interval} onValueChange={setInterval} className="h-8">
                <TabsList className="h-8 bg-secondary/50">
                    <TabsTrigger value="15m" className="text-xs h-7 px-3">15m</TabsTrigger>
                    <TabsTrigger value="1h" className="text-xs h-7 px-3">1h</TabsTrigger>
                    <TabsTrigger value="4h" className="text-xs h-7 px-3">4h</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>

        <div className="flex items-center gap-4">
           <ToggleGroup type="multiple" value={selectedOverlays} onValueChange={setSelectedOverlays} className="bg-muted/50 p-1 rounded-lg">
              <ToggleGroupItem value="tension" aria-label="Toggle Pulse" className="data-[state=on]:bg-background data-[state=on]:text-foreground text-xs px-3 py-1 h-7">
                 Pulse
              </ToggleGroupItem>
              <ToggleGroupItem value="rvwap" aria-label="Toggle RVWAP" className="data-[state=on]:bg-background data-[state=on]:text-foreground text-xs px-3 py-1 h-7">
                 RVWAP
              </ToggleGroupItem>
           </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
         {(loadingKlines || loadingRvwap) && chartData.length === 0 ? (
             <div className="h-[600px] flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
         ) : (
             <QuantChart 
                data={chartData} 
                overlays={overlays} 
                height={600} 
             />
         )}
      </CardContent>
    </Card>
  );
};
