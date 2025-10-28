/**
 * Hook for fetching multiple RVWAP periods simultaneously
 */

import { useState, useEffect } from 'react';
import { fetchKlines, type DataSource, type Kline } from '@/lib/binance';
import { calculateRollingVwap, getWindowSize, getLookbackDays, smoothRvwapData, type RvwapDataPoint } from '@/lib/rvwap';

export interface MultiRvwapData {
  '30d': RvwapDataPoint[];
  '90d': RvwapDataPoint[];
  '365d': RvwapDataPoint[];
}

interface UseMultiRvwapResult {
  rvwapData: MultiRvwapData;
  klines: Kline[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useMultiRvwap(
  symbol: string,
  dataSource: DataSource = 'spot'
): UseMultiRvwapResult {
  const [rvwapData, setRvwapData] = useState<MultiRvwapData>({
    '30d': [],
    '90d': [],
    '365d': [],
  });
  const [klines, setKlines] = useState<Kline[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log('[useMultiRvwap] Fetching data for all periods:', { symbol, dataSource });

        const endTime = Date.now();
        const results: Partial<MultiRvwapData> = {};

        // Fetch 30D and 90D using 1h data
        console.log('[useMultiRvwap] Fetching 1h data for 30D/90D...');
        const lookbackDays90 = getLookbackDays('90d');
        const startTime90 = endTime - (lookbackDays90 * 24 * 60 * 60 * 1000);
        
        const klines1h = await fetchKlines({
          symbol,
          interval: '1h',
          startTime: startTime90,
          endTime,
          limit: 1000,
          dataSource,
        });

        console.log('[useMultiRvwap] Fetched 1h klines:', klines1h.length);

        // Calculate 30D RVWAP (720 1h candles)
        const windowSize30d = getWindowSize('30d', '1h');
        const rvwap30d = calculateRollingVwap(klines1h, windowSize30d);
        results['30d'] = smoothRvwapData(rvwap30d, 3);
        console.log(`[useMultiRvwap] Calculated 30d:`, results['30d'].length, 'points');

        // Calculate 90D RVWAP (2160 1h candles, but limited by fetch)
        const windowSize90d = getWindowSize('90d', '1h');
        const rvwap90d = calculateRollingVwap(klines1h, windowSize90d);
        results['90d'] = smoothRvwapData(rvwap90d, 3);
        console.log(`[useMultiRvwap] Calculated 90d:`, results['90d'].length, 'points');

        // Fetch 365D using 1d data
        console.log('[useMultiRvwap] Fetching 1d data for 365D...');
        const lookbackDays365 = getLookbackDays('365d');
        const startTime365 = endTime - (lookbackDays365 * 24 * 60 * 60 * 1000);
        
        const klines1d = await fetchKlines({
          symbol,
          interval: '1d',
          startTime: startTime365,
          endTime,
          limit: 1000,
          dataSource,
        });

        console.log('[useMultiRvwap] Fetched 1d klines:', klines1d.length);

        // Calculate 365D RVWAP (365 1d candles)
        const windowSize365d = getWindowSize('365d', '1d');
        const rvwap365d = calculateRollingVwap(klines1d, windowSize365d);
        results['365d'] = smoothRvwapData(rvwap365d, 3);
        console.log(`[useMultiRvwap] Calculated 365d:`, results['365d'].length, 'points');

        setRvwapData(results as MultiRvwapData);
        setKlines(klines1h); // Use 1h klines for candlesticks
        setLastUpdated(new Date());
        setError(null);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to fetch RVWAP data';
        console.error('[useMultiRvwap] Error:', errorMessage, err);
        setError(errorMessage);
        setRvwapData({ '30d': [], '90d': [], '365d': [] });
        setKlines([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [symbol, dataSource]);

  return {
    rvwapData,
    klines,
    isLoading,
    error,
    lastUpdated,
  };
}
