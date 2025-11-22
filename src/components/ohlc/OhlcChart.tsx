/**
 * OHLC candlestick chart using custom QuantChart
 */

import { useMemo, useRef } from 'react';
import type { Kline } from '@/lib/binance';
import type { TensionDataPoint } from '@/lib/tension';
import { QuantChart, type ChartDataPoint, type Overlay } from '@/components/charts/QuantChart';
import { Watermark } from '@/components/Watermark';
import { ShareChartDialog } from '@/components/charts/ShareChartDialog';

export interface OhlcChartProps {
  klines: Kline[];
  tensionData?: TensionDataPoint[];
  threshold?: number;
  height?: number;
  className?: string;
}

export function OhlcChart({ klines, tensionData, threshold = 0, height = 300, className = '' }: OhlcChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return klines.map((k, i) => ({
      timestamp: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      tension: tensionData?.[i]?.tensionIndex || 0
    }));
  }, [klines, tensionData]);

  const overlays = useMemo<Overlay[]>(() => [
    { 
      id: 'Tension', 
      label: 'Tension',
      type: 'histogram', 
      dataKey: 'tension', 
      color: 'rgba(59, 130, 246, 0.3)', 
      threshold: threshold 
    }
  ], [threshold]);

  if (klines.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading chart data...</div>;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute top-2 right-12 z-20">
        <ShareChartDialog targetRef={chartRef} title="OHLC Analysis" />
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
