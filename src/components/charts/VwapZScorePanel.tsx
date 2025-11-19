import React, { useState } from 'react';
import { ZScoreChart } from './ZScoreChart';
import { useVwapZScore } from '@/hooks/useVwapZScore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity } from 'lucide-react';

export const VwapZScorePanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');

  const { data, isLoading } = useVwapZScore(symbol, interval);

  return (
    <Card className="w-full h-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 gap-4 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                VWAP Z-Score Mod <span className="text-muted-foreground text-sm font-normal">(Spot)</span>
            </CardTitle>
            
            <Tabs value={interval} onValueChange={setInterval} className="h-7">
                <TabsList className="h-7 bg-secondary/50">
                    <TabsTrigger value="15m" className="text-xs h-6 px-3">15m</TabsTrigger>
                    <TabsTrigger value="1h" className="text-xs h-6 px-3">1h</TabsTrigger>
                    <TabsTrigger value="4h" className="text-xs h-6 px-3">4h</TabsTrigger>
                    <TabsTrigger value="1d" className="text-xs h-6 px-3">1d</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
         {isLoading && data.length === 0 ? (
             <div className="h-full flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
         ) : (
             <div className="flex flex-col h-full divide-y divide-border/40">
                <div className="flex-1 min-h-0 p-2">
                    <ZScoreChart 
                    title="Z-Score VWAP 365" 
                    data={data.map(d => ({ timestamp: d.timestamp, value: d.z365 }))} 
                    height={undefined}
                    className="h-full"
                    />
                </div>
                <div className="flex-1 min-h-0 p-2">
                    <ZScoreChart 
                    title="Z-Score VWAP 180" 
                    data={data.map(d => ({ timestamp: d.timestamp, value: d.z180 }))} 
                    height={undefined}
                    className="h-full"
                    />
                </div>
                <div className="flex-1 min-h-0 p-2">
                    <ZScoreChart 
                    title="Z-Score VWAP 90" 
                    data={data.map(d => ({ timestamp: d.timestamp, value: d.z90 }))} 
                    height={undefined}
                    className="h-full"
                    />
                </div>
                <div className="flex-1 min-h-0 p-2">
                    <ZScoreChart 
                    title="Z-Score VWAP 30" 
                    data={data.map(d => ({ timestamp: d.timestamp, value: d.z30 }))} 
                    height={undefined}
                    className="h-full"
                    />
                </div>
             </div>
         )}
      </CardContent>
    </Card>
  );
};