/**
 * OHLC candlestick chart using lightweight-charts
 */

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  type IChartApi,
  type CandlestickData,
} from 'lightweight-charts';
import type { Kline } from '@/lib/binance';

export interface OhlcChartProps {
  klines: Kline[];
  height?: number;
  className?: string;
}

export function OhlcChart({ klines, height = 300, className = '' }: OhlcChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create chart if it doesn't exist
    if (!chartRef.current) {
      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(255, 255, 255, 0.6)',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            color: 'rgba(255, 255, 255, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: 'rgba(0, 0, 0, 0.8)',
          },
          horzLine: {
            color: 'rgba(255, 255, 255, 0.3)',
            width: 1,
            style: 2,
            labelBackgroundColor: 'rgba(0, 0, 0, 0.8)',
          },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.2)',
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.2)',
        },
      });

      const candlestickSeries = chart.addSeries({
        type: 'Candlestick',
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      } as any);

      chartRef.current = chart;
      seriesRef.current = candlestickSeries;
    }

    // Update data
    if (seriesRef.current && klines.length > 0) {
      const candleData: CandlestickData[] = klines.map((k) => ({
        time: (k.openTime / 1000) as any, // Convert to seconds
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      seriesRef.current.setData(candleData);
    }

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [klines, height]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: `${height}px` }}
    />
  );
}
