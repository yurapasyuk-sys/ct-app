/**
 * RVWAP Chart Component using custom QuantChart
 */

import { useMemo, useRef } from 'react';
import type { RvwapDataPoint } from '@/lib/rvwap';
import type { Kline } from '@/lib/binance';
import type { MultiRvwapData } from '@/hooks/useMultiRvwap';
import { QuantChart, type ChartDataPoint, type Overlay } from '@/components/charts/QuantChart';
import { Watermark } from '@/components/Watermark';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';

export interface RvwapChartProps {
  data?: RvwapDataPoint[]; // Single period (legacy)
  multiData?: MultiRvwapData; // Multiple periods
  klines: Kline[];
  height?: number;
  className?: string;
}

export function RvwapChart({ data, multiData, klines, height = 400, className = '' }: RvwapChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (klines.length === 0) return [];

    // Create maps for O(1) lookup
    const map30d = multiData ? new Map(multiData['30d'].map(d => [d.timestamp, d.vwap])) : new Map();
    const map90d = multiData ? new Map(multiData['90d'].map(d => [d.timestamp, d.vwap])) : new Map();
    const map365d = multiData ? new Map(multiData['365d'].map(d => [d.timestamp, d.vwap])) : new Map();
    
    // Legacy single data support
    const mapSingle = data ? new Map(data.map(d => [d.timestamp, d.vwap])) : new Map();

    return klines.map(k => ({
      timestamp: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      rvwap30: map30d.get(k.openTime),
      rvwap90: map90d.get(k.openTime),
      rvwap365: map365d.get(k.openTime),
      rvwapSingle: mapSingle.get(k.openTime),
    }));
  }, [klines, multiData, data]);

  const overlays = useMemo<Overlay[]>(() => {
    if (multiData) {
      return [
        { id: '30D', label: 'RVWAP 30D', type: 'line', dataKey: 'rvwap30', color: '#3B82F6', width: 2 },
        { id: '90D', label: 'RVWAP 90D', type: 'line', dataKey: 'rvwap90', color: '#22D3EE', width: 2 },
        { id: '365D', label: 'RVWAP 365D', type: 'line', dataKey: 'rvwap365', color: '#0EA5E9', width: 2 },
      ];
    }
    return [
      { id: 'RVWAP', label: 'RVWAP', type: 'line', dataKey: 'rvwapSingle', color: '#22D3EE', width: 2 }
    ];
  }, [multiData]);

  if (klines.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading chart data...</div>;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute top-2 right-12 z-20">
        <ShareChartDialog targetRef={chartRef} title="RVWAP Analysis" />
      </div>
      <div ref={chartRef} className="w-full h-full bg-background">
        <QuantChart 
          data={chartData} 
          overlays={overlays} 
          height={height} 
          className={className}
          mainSeriesName="Price"
        />
        <Watermark visible={true} />
      </div>
    </div>
  );
}
