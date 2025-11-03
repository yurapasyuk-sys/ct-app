/**
 * RVWAP Chart Component using lightweight-charts
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineSeries,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type CandlestickData,
} from 'lightweight-charts';
import type { RvwapDataPoint } from '@/lib/rvwap';
import type { Kline } from '@/lib/binance';
import type { MultiRvwapData } from '@/hooks/useMultiRvwap';
import { Watermark } from '@/components/Watermark';

export interface RvwapChartProps {
  data?: RvwapDataPoint[]; // Single period (legacy)
  multiData?: MultiRvwapData; // Multiple periods
  klines: Kline[];
  height?: number;
  className?: string;
}

export function RvwapChart({ data, multiData, klines, height = 400, className = '' }: RvwapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const line30dRef = useRef<ISeriesApi<'Line'> | null>(null);
  const line90dRef = useRef<ISeriesApi<'Line'> | null>(null);
  const line365dRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const isInitializedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);

  const dataLength = data?.length || (multiData ? Math.max(multiData['30d'].length, multiData['90d'].length, multiData['365d'].length) : 0);
  console.log('[RvwapChart] 🔴 Component render called with data:', dataLength, 'klines:', klines.length, 'multiData:', !!multiData);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;

    const initChart = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
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
            barSpacing: 6,
            rightOffset: 12,
            fixLeftEdge: false,
            fixRightEdge: false,
          },
          rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.2)',
          },
          handleScroll: true,
          handleScale: true,
        });

        console.log('[RvwapChart] 📊 Chart object created:', {
          width: rect.width,
          height,
          hasChart: !!chart,
        });

        // Add candlestick series first (background)
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });

        console.log('[RvwapChart] 🕯️ CandlestickSeries added');

        // Add RVWAP line series (on top)
        if (multiData) {
          // Multi-period mode: 3 lines
          const line30d = chart.addSeries(LineSeries, {
            color: '#3B82F6', // blue-500
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            title: '30D',
          });

          const line90d = chart.addSeries(LineSeries, {
            color: '#22D3EE', // cyan-400
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            title: '90D',
          });

          const line365d = chart.addSeries(LineSeries, {
            color: '#0EA5E9', // sky-500
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            title: '365D',
          });

          line30dRef.current = line30d;
          line90dRef.current = line90d;
          line365dRef.current = line365d;

          console.log('[RvwapChart] 📈 3 RVWAP LineSeries added (30d/90d/365d)');
        } else {
          // Single period mode (legacy)
          const lineSeries = chart.addSeries(LineSeries, {
            color: '#22D3EE',
            lineWidth: 2,
            priceLineVisible: true,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
          });

          lineSeriesRef.current = lineSeries;
          console.log('[RvwapChart] � Single LineSeries added');
        }

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        isInitializedRef.current = true;

        console.log('[RvwapChart] ✅ Chart initialized successfully');

        // 🔥 CRITICAL: If data is already available, set it now!
        if (multiData) {
          // Multi-period mode
          const hasData = multiData['30d']?.length > 0 && multiData['90d']?.length > 0 && multiData['365d']?.length > 0;
          
          if (hasData && klines.length > 0) {
            console.log('[RvwapChart] 🔥 Multi-period data already available, setting immediately:', {
              '30d': multiData['30d'].length,
              '90d': multiData['90d'].length,
              '365d': multiData['365d'].length,
              klines: klines.length,
            });

            // Set RVWAP data for all 3 periods
            const data30d: LineData[] = multiData['30d'].map((d) => ({
              time: (d.timestamp / 1000) as any,
              value: d.vwap,
            }));

            const data90d: LineData[] = multiData['90d'].map((d) => ({
              time: (d.timestamp / 1000) as any,
              value: d.vwap,
            }));

            const data365d: LineData[] = multiData['365d'].map((d) => ({
              time: (d.timestamp / 1000) as any,
              value: d.vwap,
            }));

            const candleData: CandlestickData[] = klines.map((k) => ({
              time: (k.openTime / 1000) as any,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            }));

            line30dRef.current?.setData(data30d);
            line90dRef.current?.setData(data90d);
            line365dRef.current?.setData(data365d);
            candlestickSeries.setData(candleData);
            chart.timeScale().fitContent();

            console.log('[RvwapChart] ✅ Initial multi-period data set successfully (3 RVWAP lines + Candles)');
            setIsLoading(false);
          }
        } else if (data.length > 0 && klines.length > 0) {
          // Single period mode (legacy)
          console.log('[RvwapChart] 🔥 Single-period data already available, setting immediately:', {
            rvwap: data.length,
            klines: klines.length,
          });

          const lineData: LineData[] = data.map((d) => ({
            time: (d.timestamp / 1000) as any,
            value: d.vwap,
          }));

          const candleData: CandlestickData[] = klines.map((k) => ({
            time: (k.openTime / 1000) as any,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
          }));

          lineSeriesRef.current?.setData(lineData);
          candlestickSeries.setData(candleData);
          chart.timeScale().fitContent();

          console.log('[RvwapChart] ✅ Initial data set successfully (RVWAP + Candles)');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('[RvwapChart] ❌ Failed to initialize:', error);
      }
    };

    requestAnimationFrame(initChart);

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        lineSeriesRef.current = null;
        line30dRef.current = null;
        line90dRef.current = null;
        line365dRef.current = null;
        candlestickSeriesRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [height]);

  // Update data
  useEffect(() => {
    console.log('[RvwapChart] 🔄 Update effect triggered:', {
      mode: multiData ? 'multi-period' : 'single-period',
      dataLength: multiData ? `30d:${multiData['30d']?.length || 0}, 90d:${multiData['90d']?.length || 0}, 365d:${multiData['365d']?.length || 0}` : data.length,
      klinesLength: klines.length,
      hasLine30d: !!line30dRef.current,
      hasLine90d: !!line90dRef.current,
      hasLine365d: !!line365dRef.current,
      hasLineSeries: !!lineSeriesRef.current,
      hasCandlestickSeries: !!candlestickSeriesRef.current,
      hasChart: !!chartRef.current,
      isInitialized: isInitializedRef.current,
    });

    if (!candlestickSeriesRef.current || !chartRef.current || klines.length === 0) {
      console.log('[RvwapChart] ⚠️ Update skipped (missing chart/candles)');
      return;
    }

    if (multiData) {
      // Multi-period mode
      const hasData = multiData['30d']?.length > 0 && multiData['90d']?.length > 0 && multiData['365d']?.length > 0;
      if (!hasData || !line30dRef.current || !line90dRef.current || !line365dRef.current) {
        console.log('[RvwapChart] ⚠️ Update skipped (multi-period mode, missing data or series)');
        return;
      }

      setIsLoading(true);

      try {
        const data30d: LineData[] = multiData['30d'].map((d) => ({
          time: (d.timestamp / 1000) as any,
          value: d.vwap,
        }));

        const data90d: LineData[] = multiData['90d'].map((d) => ({
          time: (d.timestamp / 1000) as any,
          value: d.vwap,
        }));

        const data365d: LineData[] = multiData['365d'].map((d) => ({
          time: (d.timestamp / 1000) as any,
          value: d.vwap,
        }));

        const candleData: CandlestickData[] = klines.map((k) => ({
          time: (k.openTime / 1000) as any,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        }));

        console.log('[RvwapChart] 📝 Calling setData (multi-period) with:', {
          rvwap30d: data30d.length,
          rvwap90d: data90d.length,
          rvwap365d: data365d.length,
          candles: candleData.length,
        });

        line30dRef.current.setData(data30d);
        line90dRef.current.setData(data90d);
        line365dRef.current.setData(data365d);
        candlestickSeriesRef.current.setData(candleData);

        console.log('[RvwapChart] ✅ setData completed (3 RVWAP lines + Candles)');

        chartRef.current.timeScale().fitContent();
        console.log('[RvwapChart] ✅ fitContent completed');

        setTimeout(() => setIsLoading(false), 300);
      } catch (error) {
        console.error('[RvwapChart] ❌ Error setting multi-period data:', error);
        setIsLoading(false);
      }
    } else {
      // Single period mode (legacy)
      if (!lineSeriesRef.current || data.length === 0) {
        console.log('[RvwapChart] ⚠️ Update skipped (single-period mode, missing data or series)');
        return;
      }

      setIsLoading(true);

      try {
        const lineData: LineData[] = data.map((d) => ({
          time: (d.timestamp / 1000) as any,
          value: d.vwap,
        }));

        const candleData: CandlestickData[] = klines.map((k) => ({
          time: (k.openTime / 1000) as any,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        }));

        console.log('[RvwapChart] 📝 Calling setData (single-period) with:', {
          rvwapPoints: lineData.length,
          candlePoints: candleData.length,
        });

        lineSeriesRef.current.setData(lineData);
        candlestickSeriesRef.current.setData(candleData);

        console.log('[RvwapChart] ✅ setData completed (RVWAP + Candles)');

        chartRef.current.timeScale().fitContent();
        console.log('[RvwapChart] ✅ fitContent completed');

        setTimeout(() => setIsLoading(false), 300);
      } catch (error) {
        console.error('[RvwapChart] ❌ Error setting data:', error);
        setIsLoading(false);
      }
    }
  }, [data, klines, multiData]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !isInitializedRef.current) return;

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({ width: rect.width });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: `${height}px`,
        background: '#1a1a1a', // Lighter background so chart is visible
        borderRadius: '8px',
      }}
    >
      <Watermark visible={!isLoading} text="borkiss.trade" opacity={0.04} fontSize={48} />
    </div>
  );
}
