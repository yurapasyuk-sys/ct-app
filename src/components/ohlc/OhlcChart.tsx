/**
 * OHLC candlestick chart using lightweight-charts
 */

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
} from 'lightweight-charts';
import type { Kline } from '@/lib/binance';
import type { TensionDataPoint } from '@/lib/tension';

export interface OhlcChartProps {
  klines: Kline[];
  tensionData?: TensionDataPoint[];
  threshold?: number;
  height?: number;
  className?: string;
}

export function OhlcChart({ klines, tensionData, threshold = 0, height = 300, className = '' }: OhlcChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
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
          // Disable user interactions for synchronized scrolling
          handleScroll: false,
          handleScale: false,
        });

        // Add candlestick series in main pane
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          priceScaleId: 'right',
        });

        // Add histogram series in separate pane if tensionData is provided
        let histogramSeries: ISeriesApi<'Histogram'> | null = null;
        if (tensionData && tensionData.length > 0) {
          histogramSeries = chart.addSeries(HistogramSeries, {
            color: 'rgba(128, 128, 128, 0.5)',
            priceFormat: {
              type: 'volume',
            },
            priceScaleId: 'histogram',
          }, 1); // paneIndex: 1 = separate pane below
        }

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        histogramSeriesRef.current = histogramSeries;
        isInitializedRef.current = true;

        console.log('[OhlcChart] Chart initialized successfully', {
          hasTensionData: !!tensionData,
          hasHistogram: !!histogramSeries,
        });
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
        candlestickSeriesRef.current = null;
        histogramSeriesRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []); // Run only once

  // Update data when klines change
  useEffect(() => {
    if (!candlestickSeriesRef.current || !isInitializedRef.current || klines.length === 0) return;

    try {
      const candleData: CandlestickData[] = klines.map((k) => ({
        time: (k.openTime / 1000) as any, // Convert to seconds
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      candlestickSeriesRef.current.setData(candleData);
    } catch (error) {
      console.error('[OhlcChart] Error setting candlestick data:', error);
    }
  }, [klines]);

  // Update histogram data when tensionData changes
  useEffect(() => {
    if (!histogramSeriesRef.current || !isInitializedRef.current || !tensionData || tensionData.length === 0) return;

    try {
      const histogramData: HistogramData[] = tensionData.map((t) => ({
        time: (t.timestamp / 1000) as any, // Convert to seconds
        value: t.tensionIndex,
        color: t.tensionIndex > threshold ? '#26a69a' : 'rgba(128, 128, 128, 0.5)',
      }));

      histogramSeriesRef.current.setData(histogramData);
      console.log('[OhlcChart] Updated histogram data:', histogramData.length, 'points');
    } catch (error) {
      console.error('[OhlcChart] Error setting histogram data:', error);
    }
  }, [tensionData, threshold]);

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
