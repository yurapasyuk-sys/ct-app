import React, { useState } from 'react';
import { QuantChart, Overlay } from './QuantChart';
import { useVwapZScore } from '@/hooks/useVwapZScore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity } from 'lucide-react';

export const VwapZScorePanel = () => {
  const [symbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');

  const { data, isLoading } = useVwapZScore(symbol, interval);

  const overlays: Overlay[] = [
    {
      id: 'Z-365',
      type: 'oscillator',
      dataKey: 'z365',
      color: '#1f77b4', // Blue
      width: 2,
      domain: [-4, 4],
    },
    {
      id: 'Z-180',
      type: 'oscillator',
      dataKey: 'z180',
      color: '#ff7f0e', // Orange
      width: 2,
      domain: [-4, 4],
    },
    {
      id: 'Z-90',
      type: 'oscillator',
      dataKey: 'z90',
      color: '#2ca02c', // Green
      width: 2,
      domain: [-4, 4],
    },
    {
      id: 'Z-30',
      type: 'oscillator',
      dataKey: 'z30',
      color: '#d62728', // Red
      width: 2,
      domain: [-4, 4],
    },
  ];

  return (
    <Card className="w-full h-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 gap-4 border-b border-border/40">
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
        <div className="flex gap-2 text-xs">
            <span className="text-[#1f77b4]">365</span>
            <span className="text-[#ff7f0e]">180</span>
            <span className="text-[#2ca02c]">90</span>
            <span className="text-[#d62728]">30</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
         {isLoading && data.length === 0 ? (
             <div className="h-full flex items-center justify-center">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
             </div>
         ) : (
             <QuantChart 
                data={data} 
                overlays={overlays} 
                height={undefined} 
                className="h-full w-full"
             />
         )}
      </CardContent>
    </Card>
  );
};