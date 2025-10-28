/**
 * Hook for fetching and managing RVWAP data
 */

import { useState, useEffect, useRef } from 'react';
import { fetchKlines, type DataSource, type Kline } from '@/lib/binance';
import { calculateRollingVwap, getWindowSize, getLookbackDays, smoothRvwapData, type RvwapDataPoint } from '@/lib/rvwap';

interface UseRvwapOptions {
  symbol: string;
  interval: string;
  period: string; // "30d", "90d", "365d"
  dataSource?: DataSource;
  enabled?: boolean;
}

interface UseRvwapResult {
  rvwapData: RvwapDataPoint[];
  klines: Kline[]; // Add klines to return
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useRvwap({
  symbol,
  interval,
  period,
  dataSource = 'spot',
  enabled = true,
}: UseRvwapOptions): UseRvwapResult {
  const [rvwapData, setRvwapData] = useState<RvwapDataPoint[]>([]);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      console.log('[useRvwap] Disabled, skipping fetch');
      return;
    }

    const fetchData = async () => {
      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setError(null);

      try {
        console.log('[useRvwap] Fetching data:', { symbol, interval, period, dataSource });

        // Always fetch 1h data for consistent RVWAP calculation
        const fetchInterval = '1h';
        console.log('[useRvwap] 🔧 Using 1h base for RVWAP calculation (requested:', interval, ')');

        // Calculate lookback days needed
        const lookbackDays = getLookbackDays(period);
        const endTime = Date.now();
        const startTime = endTime - (lookbackDays * 24 * 60 * 60 * 1000);
        
        console.log('[useRvwap] Time range:', {
          lookbackDays,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        });
        
        // Fetch klines from Binance (always 1h for RVWAP)
        const klines = await fetchKlines({
          symbol,
          interval: fetchInterval,
          startTime,
          endTime,
          dataSource,
        });

        console.log('[useRvwap] Fetched klines:', klines.length);

        if (klines.length === 0) {
          throw new Error('No klines data received');
        }

        // Calculate rolling VWAP (always on 1h data)
        const windowSize = getWindowSize(period, fetchInterval);
        const rvwap = calculateRollingVwap(klines, windowSize);

        // Apply smoothing for cleaner display
        const smoothingPeriod = interval === '15m' ? 4 : interval === '4h' ? 2 : 3;
        const smoothedRvwap = smoothRvwapData(rvwap, smoothingPeriod);

        console.log('[useRvwap] Calculated RVWAP:', {
          dataPoints: smoothedRvwap.length,
          windowSize,
          period,
          smoothing: smoothingPeriod,
        });
        console.log('[useRvwap] ✅ points', smoothedRvwap.length, { period, interval });

        setRvwapData(smoothedRvwap);
        setKlines(klines);
        setLastUpdated(new Date());
        setError(null);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[useRvwap] Request aborted');
          return;
        }

        const errorMessage = err.message || 'Failed to fetch RVWAP data';
        console.error('[useRvwap] Error:', errorMessage, err);
        setError(errorMessage);
        setRvwapData([]);
        setKlines([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [symbol, interval, period, dataSource, enabled]);

  return {
    rvwapData,
    klines,
    isLoading,
    error,
    lastUpdated,
  };
}
