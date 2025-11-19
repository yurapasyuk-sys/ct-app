import { useMemo } from 'react';
import { useKlines } from './useKlines';
import { calculateMultiVwapZScore } from '@/lib/vwap-zscore';

export const useVwapZScore = (symbol: string, interval: string) => {
  // Ensure we have enough data for the largest window (365)
  // 1000 candles is usually enough for 365 window
  const { klines, isLoading } = useKlines({
    symbol,
    interval,
    lookbackDays: interval === '1d' ? 1000 : 90, // Fetch more for daily
    dataSource: 'spot', // The Python mod uses SPOT data
  });

  const data = useMemo(() => {
    if (!klines.length) return [];
    const zScores = calculateMultiVwapZScore(klines);
    
    // Merge OHLC and Z-Scores
    return klines.map((k, i) => ({
      timestamp: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      z30: zScores[i]?.z30 || 0,
      z90: zScores[i]?.z90 || 0,
      z180: zScores[i]?.z180 || 0,
      z365: zScores[i]?.z365 || 0,
    }));
  }, [klines]);

  return {
    data,
    isLoading,
  };
};