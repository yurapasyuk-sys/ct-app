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

        // Use 365d lookback to cover all periods
        const lookbackDays = getLookbackDays('365d');
        const endTime = Date.now();
        const startTime = endTime - (lookbackDays * 24 * 60 * 60 * 1000);
        
        // Always fetch 1h data
        const fetchedKlines = await fetchKlines({
          symbol,
          interval: '1h',
          startTime,
          endTime,
          dataSource,
        });

        console.log('[useMultiRvwap] Fetched klines:', fetchedKlines.length);

        if (fetchedKlines.length === 0) {
          throw new Error('No klines data received');
        }

        // Calculate RVWAP for each period
        const periods = ['30d', '90d', '365d'] as const;
        const results: Partial<MultiRvwapData> = {};

        for (const period of periods) {
          const windowSize = getWindowSize(period, '1h');
          const rvwap = calculateRollingVwap(fetchedKlines, windowSize);
          const smoothed = smoothRvwapData(rvwap, 3); // Consistent smoothing
          results[period] = smoothed;
          
          console.log(`[useMultiRvwap] Calculated ${period}:`, smoothed.length, 'points');
        }

        setRvwapData(results as MultiRvwapData);
        setKlines(fetchedKlines);
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
