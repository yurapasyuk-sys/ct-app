/**
 * React hook for fetching klines with caching and rate limiting
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchKlines,
  fetchKlinesMultiBatch,
  calculateStartTime,
  type Kline,
  type DataSource,
} from '@/lib/binance';
import {
  calculateTensionIndicators,
  getRecommendedPeriod,
  type TensionDataPoint,
} from '@/lib/tension';

export interface UseKlinesParams {
  symbol: string;
  interval: string;
  lookbackDays: number;
  minRefreshMs?: number;
  dataSource?: DataSource;
  enabled?: boolean;
  calculateTension?: boolean;
}

export interface UseKlinesResult {
  klines: Kline[];
  tensionData: TensionDataPoint[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  nextRefreshIn: number; // milliseconds until next refresh
  refetch: () => void;
}

interface CacheEntry {
  data: Kline[];
  timestamp: number;
  symbol: string;
  interval: string;
  lookbackDays: number;
  dataSource: DataSource;
}

// Global in-memory cache shared across all hook instances
const klinesCache = new Map<string, CacheEntry>();

/**
 * Generate cache key from parameters
 */
function getCacheKey(
  symbol: string,
  interval: string,
  lookbackDays: number,
  dataSource: DataSource
): string {
  return `${symbol}_${interval}_${lookbackDays}_${dataSource}`;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry: CacheEntry, minRefreshMs: number): boolean {
  const now = Date.now();
  return now - entry.timestamp < minRefreshMs;
}

/**
 * Calculate total candles needed for lookback
 */
function calculateTotalCandles(lookbackDays: number, interval: string): number {
  const minutesPerDay = 24 * 60;
  let intervalMinutes = 60; // default 1h
  
  if (interval.endsWith('m')) {
    intervalMinutes = parseInt(interval.replace('m', ''));
  } else if (interval.endsWith('h')) {
    intervalMinutes = parseInt(interval.replace('h', '')) * 60;
  } else if (interval.endsWith('d')) {
    intervalMinutes = parseInt(interval.replace('d', '')) * 24 * 60;
  }
  
  return Math.ceil((lookbackDays * minutesPerDay) / intervalMinutes);
}

export function useKlines({
  symbol,
  interval,
  lookbackDays,
  minRefreshMs = 15000,
  dataSource = 'spot',
  enabled = true,
  calculateTension = true,
}: UseKlinesParams): UseKlinesResult {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [tensionData, setTensionData] = useState<TensionDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(minRefreshMs);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const cacheKey = getCacheKey(symbol, interval, lookbackDays, dataSource);

  /**
   * Fetch klines data
   */
  const fetchData = useCallback(async () => {
    // Check cache first
    const cached = klinesCache.get(cacheKey);
    if (cached && isCacheValid(cached, minRefreshMs)) {
      setKlines(cached.data);
      setLastUpdated(new Date(cached.timestamp));
      setError(null);

      if (calculateTension) {
        const period = getRecommendedPeriod(interval);
        const tension = calculateTensionIndicators(cached.data, period);
        setTensionData(tension);
      } else {
        setTensionData([]);
      }

      return;
    }

    // Cancel any existing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      // Check if we have existing data in cache to do an incremental update
      const cached = klinesCache.get(cacheKey);
      let data: Kline[] = [];

      if (cached && cached.data.length > 0) {
        // Incremental update: fetch only new candles since last update
        // We fetch a bit more overlap to ensure continuity
        const lastCandleTime = cached.data[cached.data.length - 1].openTime;
        const newCandles = await fetchKlines(
          {
            symbol,
            interval,
            startTime: lastCandleTime, // Fetch from last known candle
            limit: 100, // Should be enough for 5s updates
            dataSource,
          },
          abortControllerRef.current.signal
        );

        // Merge new candles with cached data
        // Remove the last candle from cache (it might have been incomplete) and append new ones
        // Or better: use a Map to dedupe by openTime
        const dataMap = new Map<number, Kline>();
        cached.data.forEach(k => dataMap.set(k.openTime, k));
        newCandles.forEach(k => dataMap.set(k.openTime, k));
        
        data = Array.from(dataMap.values()).sort((a, b) => a.openTime - b.openTime);
        
        // Trim to lookback period if needed (optional, to keep memory usage stable)
        const totalCandles = calculateTotalCandles(lookbackDays, interval);
        if (data.length > totalCandles + 100) {
             data = data.slice(-totalCandles);
        }

      } else {
        // Full fetch
        const totalCandles = calculateTotalCandles(lookbackDays, interval);
        data = await fetchKlinesMultiBatch(
            {
            symbol,
            interval,
            dataSource,
            },
            totalCandles,
            abortControllerRef.current.signal
        );
      }

      // Update cache
      klinesCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        symbol,
        interval,
        lookbackDays,
        dataSource,
      });

      setKlines(data);
      setLastUpdated(new Date());

      if (calculateTension) {
        const period = getRecommendedPeriod(interval);
        const tension = calculateTensionIndicators(data, period);
        setTensionData(tension);
      } else {
        setTensionData([]);
      }

      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Ignore abort errors
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      console.error(`[useKlines] Error fetching ${symbol} ${interval}:`, err);

      // Keep previous data on error
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, lookbackDays, dataSource, minRefreshMs, cacheKey, calculateTension]);

  /**
   * Manual refetch
   */
  const refetch = useCallback(() => {
    // Clear cache for this key to force refetch
    klinesCache.delete(cacheKey);
    fetchData();
  }, [cacheKey, fetchData]);

  /**
   * Update countdown timer
   */
  useEffect(() => {
    if (!enabled || !lastUpdated) return;

    // Clear existing countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Start countdown
    countdownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastUpdated.getTime();
      const remaining = Math.max(0, minRefreshMs - elapsed);
      setNextRefreshIn(remaining);
    }, 100);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [enabled, lastUpdated, minRefreshMs]);

  /**
   * Auto-refresh data
   */
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    fetchData();

    // Set up refresh interval
    intervalIdRef.current = setInterval(() => {
      fetchData();
    }, minRefreshMs);

    // Cleanup
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [enabled, fetchData, minRefreshMs]);

  return {
    klines,
    tensionData,
    isLoading,
    error,
    lastUpdated,
    nextRefreshIn,
    refetch,
  };
}
