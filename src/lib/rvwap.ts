/**
 * Rolling VWAP (Volume Weighted Average Price) calculation utilities
 */

import type { Kline } from './binance';

export interface RvwapDataPoint {
  timestamp: number; // milliseconds
  vwap: number;
  volume: number;
  price: number; // typical price for reference
}

export interface RvwapResult {
  data: RvwapDataPoint[];
  meta: {
    period: string;
    interval: string;
    candles: number;
    firstTimestamp: number;
    lastTimestamp: number;
  };
}

/**
 * Calculate rolling VWAP over a sliding window
 * VWAP = Σ(Typical Price × Volume) / Σ(Volume)
 * Typical Price = (High + Low + Close) / 3
 */
export function calculateRollingVwap(
  klines: Kline[],
  windowSize: number
): RvwapDataPoint[] {
  if (klines.length === 0) return [];

  const result: RvwapDataPoint[] = [];

  for (let i = 0; i < klines.length; i++) {
    // Define window boundaries
    const start = Math.max(0, i - windowSize + 1);
    const end = i + 1;
    const window = klines.slice(start, end);

    // Calculate VWAP for this window
    let totalPriceVolume = 0;
    let totalVolume = 0;

    for (const candle of window) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      const volume = candle.volume;
      
      totalPriceVolume += typicalPrice * volume;
      totalVolume += volume;
    }

    const vwap = totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
    const currentTypicalPrice = (klines[i].high + klines[i].low + klines[i].close) / 3;

    result.push({
      timestamp: klines[i].openTime,
      vwap,
      volume: totalVolume,
      price: currentTypicalPrice,
    });
  }

  return result;
}

/**
 * Smooth RVWAP data using Simple Moving Average (SMA)
 * This helps reduce noise and makes the line cleaner across different timeframes
 */
export function smoothRvwapData(
  data: RvwapDataPoint[],
  smoothingPeriod: number = 3
): RvwapDataPoint[] {
  if (data.length === 0 || smoothingPeriod <= 1) return data;

  const smoothed: RvwapDataPoint[] = [];

  for (let i = 0; i < data.length; i++) {
    // Calculate average over smoothing window
    const start = Math.max(0, i - smoothingPeriod + 1);
    const end = i + 1;
    const window = data.slice(start, end);

    const avgVwap = window.reduce((sum, d) => sum + d.vwap, 0) / window.length;

    smoothed.push({
      ...data[i],
      vwap: avgVwap,
    });
  }

  return smoothed;
}

/**
 * Get recommended window size based on period and interval
 */
export function getWindowSize(period: string, interval: string): number {
  const periodDays = parseInt(period.replace('d', ''));
  
  // Calculate how many candles per day based on interval
  const candlesPerDay: Record<string, number> = {
    '15m': 96,  // 24 * 4
    '1h': 24,
    '4h': 6,
  };

  const candlesPerDayForInterval = candlesPerDay[interval] || 24;
  
  // Window size = period in days * candles per day
  return periodDays * candlesPerDayForInterval;
}

/**
 * Calculate lookback days needed to populate the rolling window
 */
export function getLookbackDays(period: string): number {
  const periodDays = parseInt(period.replace('d', ''));
  
  // Add extra days to ensure we have enough data for the full rolling window
  // For 30d RVWAP, we need at least 30 days + buffer
  return periodDays + Math.ceil(periodDays * 0.1); // Add 10% buffer
}

/**
 * Format RVWAP result for API response
 */
export function formatRvwapResult(
  rvwapData: RvwapDataPoint[],
  period: string,
  interval: string
): RvwapResult {
  return {
    data: rvwapData,
    meta: {
      period,
      interval,
      candles: rvwapData.length,
      firstTimestamp: rvwapData[0]?.timestamp || 0,
      lastTimestamp: rvwapData[rvwapData.length - 1]?.timestamp || 0,
    },
  };
}
