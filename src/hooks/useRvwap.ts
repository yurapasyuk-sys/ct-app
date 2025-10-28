/**
 * Hook for fetching and managing RVWAP data
 */

import { useState, useEffect, useRef } from 'react';
import { fetchKlines, type DataSource } from '@/lib/binance';
import { calculateRollingVwap, getWindowSize, getLookbackDays, type RvwapDataPoint } from '@/lib/rvwap';

interface UseRvwapOptions {
  symbol: string;
  interval: string;
  period: string; // "30d", "90d", "365d"
  dataSource?: DataSource;
  enabled?: boolean;
}

interface UseRvwapResult {
  rvwapData: RvwapDataPoint[];
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

        // Calculate lookback days needed
        const lookbackDays = getLookbackDays(period);
        const endTime = Date.now();
        const startTime = endTime - (lookbackDays * 24 * 60 * 60 * 1000);
        
        console.log('[useRvwap] Time range:', {
          lookbackDays,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        });
        
        // Fetch klines from Binance
        const klines = await fetchKlines({
          symbol,
          interval,
          startTime,
          endTime,
          dataSource,
        });

        console.log('[useRvwap] Fetched klines:', klines.length);

        if (klines.length === 0) {
          throw new Error('No klines data received');
        }

        // Calculate rolling VWAP
        const windowSize = getWindowSize(period, interval);
        const rvwap = calculateRollingVwap(klines, windowSize);

        console.log('[useRvwap] Calculated RVWAP:', {
          dataPoints: rvwap.length,
          windowSize,
          period,
        });
        console.log('[useRvwap] ✅ points', rvwap.length, { period, interval });

        setRvwapData(rvwap);
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
    isLoading,
    error,
    lastUpdated,
  };
}
