/**
import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
} from 'lightweight-charts';
import type { Kline } from '../../lib/binance';candlestick chart using lightweight-charts
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
  const isInitializedRef = useRef(false);

  // Initialize chart only once when container is ready
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;

    // Wait for next frame to ensure DOM is fully ready
    const initChart = () => {
      if (!containerRef.current) return;

      // Verify container has dimensions
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.warn('[OhlcChart] Container has no dimensions yet, retrying...');
        requestAnimationFrame(initChart);
        return;
      }

      try {
        const chart = createChart(containerRef.current, {
          width: rect.width,
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

        // Add candlestick series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;
        isInitializedRef.current = true;

        console.log('[OhlcChart] Chart initialized successfully');
      } catch (error) {
        console.error('[OhlcChart] Failed to initialize chart:', error);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(initChart);

    // Cleanup on unmount
    return () => {
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (error) {
          console.error('[OhlcChart] Error removing chart:', error);
        }
        chartRef.current = null;
        seriesRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []); // Run only once

  // Update data when klines change
  useEffect(() => {
    if (!seriesRef.current || !isInitializedRef.current || klines.length === 0) return;

    try {
      const candleData: CandlestickData[] = klines.map((k) => ({
        time: (k.openTime / 1000) as any, // Convert to seconds
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      seriesRef.current.setData(candleData);
    } catch (error) {
      console.error('[OhlcChart] Error setting data:', error);
    }
  }, [klines]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !isInitializedRef.current) return;

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        try {
          const rect = containerRef.current.getBoundingClientRect();
          chartRef.current.applyOptions({
            width: rect.width,
          });
        } catch (error) {
          console.error('[OhlcChart] Error resizing chart:', error);
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
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
