/**
 * Pure functions for calculating Market Tension Map indicators
 */

import type { Kline } from './binance';

export interface TensionDataPoint {
  timestamp: number;
  relativeVolatility: number;
  volatilityScore: number;
  volumeScore: number;
  tensionIndex: number;
}

/**
 * Calculate rolling standard deviation
 */
function rollingStd(values: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      result.push(NaN);
      continue;
    }

    const window = values.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((sum, val) => sum + val, 0) / window.length;
    const variance =
      window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      window.length;
    result.push(Math.sqrt(variance));
  }

  return result;
}

/**
 * Calculate rolling minimum
 */
function rollingMin(values: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      result.push(NaN);
      continue;
    }

    const window = values.slice(i - windowSize + 1, i + 1);
    result.push(Math.min(...window));
  }

  return result;
}

/**
 * Calculate rolling maximum
 */
function rollingMax(values: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      result.push(NaN);
      continue;
    }

    const window = values.slice(i - windowSize + 1, i + 1);
    result.push(Math.max(...window));
  }

  return result;
}

/**
 * Safely normalize a score to 0-100 range
 */
function normalizeScore(
  value: number,
  min: number,
  max: number,
  invert = false
): number {
  // Handle edge cases
  if (!isFinite(value) || !isFinite(min) || !isFinite(max)) {
    return 0;
  }

  if (max === min) {
    return 50; // Return midpoint if no range
  }

  const normalized = ((value - min) / (max - min)) * 100;

  // Invert if needed (for volatility score where lower volatility = higher score)
  return invert ? 100 - normalized : normalized;
}

/**
 * Calculate Market Tension Map indicators from klines
 */
export function calculateTensionIndicators(
  klines: Kline[],
  period: number
): TensionDataPoint[] {
  if (klines.length < period) {
    return [];
  }

  // Extract close prices and volumes
  const closePrices = klines.map((k) => k.close);
  const volumes = klines.map((k) => k.volume);
  const timestamps = klines.map((k) => k.closeTime);

  // Calculate relative volatility (rolling std / price)
  const rollingStdValues = rollingStd(closePrices, period);
  const relativeVolatility = rollingStdValues.map((std, i) => {
    if (!isFinite(std) || closePrices[i] === 0) return NaN;
    return std / closePrices[i];
  });

  // Calculate rolling min/max for volatility
  const rvMin = rollingMin(relativeVolatility, period);
  const rvMax = rollingMax(relativeVolatility, period);

  // Calculate volatility score (inverted: lower volatility = higher score)
  const volatilityScore = relativeVolatility.map((rv, i) => {
    if (!isFinite(rv) || !isFinite(rvMin[i]) || !isFinite(rvMax[i])) {
      return NaN;
    }
    return normalizeScore(rv, rvMin[i], rvMax[i], true);
  });

  // Calculate rolling min/max for volume
  const volumeMin = rollingMin(volumes, period);
  const volumeMax = rollingMax(volumes, period);

  // Calculate volume score (higher volume = higher score)
  const volumeScore = volumes.map((vol, i) => {
    if (!isFinite(vol) || !isFinite(volumeMin[i]) || !isFinite(volumeMax[i])) {
      return NaN;
    }
    return normalizeScore(vol, volumeMin[i], volumeMax[i], false);
  });

  // Calculate tension index (average of volatility and volume scores)
  const tensionIndex = volatilityScore.map((vs, i) => {
    if (!isFinite(vs) || !isFinite(volumeScore[i])) {
      return NaN;
    }
    return (vs + volumeScore[i]) / 2;
  });

  // Build result array
  const result: TensionDataPoint[] = [];
  for (let i = 0; i < klines.length; i++) {
    // Skip if any value is NaN
    if (
      !isFinite(relativeVolatility[i]) ||
      !isFinite(volatilityScore[i]) ||
      !isFinite(volumeScore[i]) ||
      !isFinite(tensionIndex[i])
    ) {
      continue;
    }

    result.push({
      timestamp: timestamps[i],
      relativeVolatility: relativeVolatility[i],
      volatilityScore: volatilityScore[i],
      volumeScore: volumeScore[i],
      tensionIndex: tensionIndex[i],
    });
  }

  return result;
}

/**
 * Get recommended period for a given timeframe
 */
export function getRecommendedPeriod(interval: string): number {
  const periodMap: Record<string, number> = {
    '15m': 55,
    '1h': 40,
    '4h': 35,
  };

  return periodMap[interval] || 40;
}

/**
 * Get recommended tension threshold for a given timeframe
 */
export function getRecommendedThreshold(interval: string): number {
  const thresholdMap: Record<string, number> = {
    '15m': 74,
    '1h': 75,
    '4h': 80,
  };

  return thresholdMap[interval] || 75;
}
