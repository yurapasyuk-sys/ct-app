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
            barSpacing: 3,
            rightOffset: 0,
            fixLeftEdge: true,
            fixRightEdge: false,
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

        // Always add histogram series in separate pane (will be populated when data arrives)
        const histogramSeries = chart.addSeries(HistogramSeries, {
          color: 'rgba(128, 128, 128, 0.5)',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'histogram',
        }, 1); // paneIndex: 1 = separate pane below

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        histogramSeriesRef.current = histogramSeries;
        isInitializedRef.current = true;

        console.log('[OhlcChart] Chart initialized successfully with histogram pane');
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
    if (!candlestickSeriesRef.current || !chartRef.current || !isInitializedRef.current || klines.length === 0) return;

    try {
      const candleData: CandlestickData[] = klines.map((k) => ({
        time: (k.openTime / 1000) as any, // Convert to seconds
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      candlestickSeriesRef.current.setData(candleData);

      // Expose data to window for console debugging
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_OHLC_DATA = candleData;
        (window as any).__DEBUG_KLINES = klines;
      }

      // Calculate optimal bar spacing based on data points
      // More data = smaller spacing to fit everything
      const dataPointCount = candleData.length;
      const baseSpacing = 3;
      const dynamicSpacing = Math.max(1, baseSpacing - Math.floor(dataPointCount / 200));
      
      // Apply time scale options to show full range
      chartRef.current.timeScale().applyOptions({
        barSpacing: dynamicSpacing,
        rightOffset: 5,
        fixLeftEdge: false,
        fixRightEdge: false,
      });

      // Fit all content in view
      chartRef.current.timeScale().fitContent();

      console.log('[OhlcChart] Updated candlestick data:', {
        points: candleData.length,
        barSpacing: dynamicSpacing,
        firstTime: new Date((candleData[0]?.time as number) * 1000).toISOString(),
        lastTime: new Date((candleData[candleData.length - 1]?.time as number) * 1000).toISOString(),
      });
    } catch (error) {
      console.error('[OhlcChart] Error setting candlestick data:', error);
    }
  }, [klines]);

  // Update histogram data when tensionData changes
  useEffect(() => {
    if (!histogramSeriesRef.current || !chartRef.current || !isInitializedRef.current) {
      console.log('[OhlcChart] Histogram update skipped:', {
        hasHistogramRef: !!histogramSeriesRef.current,
        hasChartRef: !!chartRef.current,
        isInitialized: isInitializedRef.current,
        hasTensionData: !!tensionData,
        tensionDataLength: tensionData?.length || 0,
      });
      return;
    }

    if (!tensionData || tensionData.length === 0 || klines.length === 0) {
      console.log('[OhlcChart] No tension data or klines to display');
      // Clear histogram if no data
      histogramSeriesRef.current.setData([]);
      return;
    }

    try {
      // Create a time-aligned histogram dataset
      // Both klines and tensionData now use openTime, so they should align 1:1
      const histogramData: HistogramData[] = [];
      
      // Build histogram from tension data (already aligned with klines)
      for (let i = 0; i < tensionData.length; i++) {
        const tensionPoint = tensionData[i];
        const timeSeconds = Math.floor(tensionPoint.timestamp / 1000);
        
        histogramData.push({
          time: timeSeconds as any,
          value: tensionPoint.tensionIndex,
          color: tensionPoint.tensionIndex > threshold ? '#26a69a' : 'rgba(128, 128, 128, 0.5)',
        });
      }

      // Set histogram data
      histogramSeriesRef.current.setData(histogramData);

      // Expose data to window for console debugging
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_HISTOGRAM_DATA = histogramData;
        (window as any).__DEBUG_TENSION_DATA = tensionData;
        
        // Add verification helper function
        (window as any).__VERIFY_ALIGNMENT = () => {
          const ohlc = (window as any).__DEBUG_OHLC_DATA;
          const hist = (window as any).__DEBUG_HISTOGRAM_DATA;
          
          console.group('📊 Data Alignment Verification');
          
          console.log('📈 Dataset Counts:');
          console.log('  Candles:', ohlc?.length || 0);
          console.log('  Histogram:', hist?.length || 0);
          console.log('  Match:', ohlc?.length === hist?.length ? '✅' : '❌');
          
          if (ohlc && hist) {
            console.log('\n⏰ First 5 Timestamps:');
            console.log('  Candles:', ohlc.slice(0, 5).map((d: any) => new Date(d.time * 1000).toISOString()));
            console.log('  Histogram:', hist.slice(0, 5).map((d: any) => new Date(d.time * 1000).toISOString()));
            
            console.log('\n⏰ Last 5 Timestamps:');
            console.log('  Candles:', ohlc.slice(-5).map((d: any) => new Date(d.time * 1000).toISOString()));
            console.log('  Histogram:', hist.slice(-5).map((d: any) => new Date(d.time * 1000).toISOString()));
            
            console.log('\n🔍 Time Alignment Check:');
            const allMatch = ohlc.every((c: any, i: number) => c.time === hist[i]?.time);
            console.log('  All timestamps match:', allMatch ? '✅' : '❌');
            
            if (!allMatch) {
              console.log('\n❌ Mismatched Indices:');
              ohlc.forEach((c: any, i: number) => {
                if (c.time !== hist[i]?.time) {
                  console.log(`  Index ${i}:`, 
                    'Candle:', new Date(c.time * 1000).toISOString(),
                    'Histogram:', hist[i] ? new Date(hist[i].time * 1000).toISOString() : 'MISSING'
                  );
                }
              });
            }
            
            console.log('\n⏱️ Time Difference (first candle):');
            if (ohlc[0] && hist[0]) {
              const diff = ohlc[0].time - hist[0].time;
              console.log('  Seconds difference:', diff);
              console.log('  Status:', diff === 0 ? '✅ Perfect alignment' : `❌ ${Math.abs(diff)}s offset`);
            }
          }
          
          console.groupEnd();
          
          console.log('\n💡 Tip: Access raw data with:');
          console.log('  window.__DEBUG_OHLC_DATA');
          console.log('  window.__DEBUG_HISTOGRAM_DATA');
          console.log('  window.__DEBUG_TENSION_DATA');
          console.log('  window.__DEBUG_KLINES');
        };
        
        console.log('🔧 Debug mode enabled. Run window.__VERIFY_ALIGNMENT() to check data alignment.');
      }

      // Fit content to ensure alignment
      chartRef.current.timeScale().fitContent();

      // Verification logging
      const firstCandleTime = Math.floor(klines[0].openTime / 1000);
      const lastCandleTime = Math.floor(klines[klines.length - 1].openTime / 1000);
      const missingCount = klines.length - tensionData.length;

      console.log('[OhlcChart] Updated histogram data:', {
        candleCount: klines.length,
        tensionCount: tensionData.length,
        histogramBars: histogramData.length,
        missingCount: missingCount,
        aligned: missingCount === 0 ? '✓ Perfect alignment' : `⚠ ${missingCount} bars missing`,
        firstCandleTime: new Date(firstCandleTime * 1000).toISOString(),
        firstHistogramTime: histogramData[0] ? new Date((histogramData[0].time as number) * 1000).toISOString() : 'N/A',
        lastCandleTime: new Date(lastCandleTime * 1000).toISOString(),
        lastHistogramTime: histogramData[histogramData.length - 1] ? new Date((histogramData[histogramData.length - 1].time as number) * 1000).toISOString() : 'N/A',
        threshold,
        timeDiffStart: histogramData[0] ? (histogramData[0].time as number) - firstCandleTime : 'N/A',
      });

      // Log backfill info if applicable
      if (missingCount < 0) {
        console.warn('[OhlcChart] More tension data than candles - this should not happen');
      } else if (missingCount === 0) {
        console.log('[OhlcChart] ✓ All candles have tension data - perfect 1:1 alignment');
      }
    } catch (error) {
      console.error('[OhlcChart] Error setting histogram data:', error);
    }
  }, [tensionData, threshold, klines]);

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
