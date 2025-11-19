import { Kline } from './binance';

export interface VwapZScorePoint {
  timestamp: number;
  price: number;
  vwap: number;
  stdDev: number;
  zScore: number;
}

export interface MultiVwapZScore {
  timestamp: number;
  price: number;
  z30: number;
  z90: number;
  z180: number;
  z365: number;
}

/**
 * Calculates VWAP, Standard Deviation, and Z-Score over a rolling window.
 * 
 * VWAP = Σ(Typical Price * Volume) / Σ(Volume)
 * Typical Price = (High + Low + Close) / 3
 * Z-Score = (Close - VWAP) / StdDev(Close)
 */
export function calculateVwapZScore(klines: Kline[], windowSize: number): VwapZScorePoint[] {
  if (!klines.length) return [];

  const results: VwapZScorePoint[] = [];
  
  // Pre-calculate typical prices and tp*volume
  const typicalPrices = klines.map(k => (k.high + k.low + k.close) / 3);
  const volumes = klines.map(k => k.volume);
  const tpVolumes = typicalPrices.map((tp, i) => tp * volumes[i]);
  const closes = klines.map(k => k.close);

  // We need to maintain rolling sums
  // Since window can be large (365), iterating for each point is O(N*W).
  // Optimization: Use sliding window sum (subtract old, add new).
  
  let sumTpVol = 0;
  let sumVol = 0;
  
  // For StdDev, we need rolling standard deviation of CLOSE price.
  // StdDev = sqrt( E[x^2] - (E[x])^2 ) is prone to precision issues but faster.
  // Or just re-calculate for stability if window isn't too huge. 
  // 365 is small enough for a loop if N is small (1000 candles).
  // But if we have 5000 candles, 365*5000 = 1.8M ops. Fast enough in JS.
  // Let's use a simple loop for StdDev to ensure accuracy.

  for (let i = 0; i < klines.length; i++) {
    // Add new value
    sumTpVol += tpVolumes[i];
    sumVol += volumes[i];

    // Remove old value if window exceeded
    if (i >= windowSize) {
      sumTpVol -= tpVolumes[i - windowSize];
      sumVol -= volumes[i - windowSize];
    }

    // We only have a valid full window if i >= windowSize - 1
    // But the python code uses min_periods=1, so it calculates from the start.
    // Let's follow min_periods=1 logic (accumulate until window is full).
    
    // VWAP
    const vwap = sumVol > 0 ? sumTpVol / sumVol : 0;

    // Rolling StdDev of Close
    // We need the slice of closes for the current window
    const startIdx = Math.max(0, i - windowSize + 1);
    const windowCloses = closes.slice(startIdx, i + 1);
    
    // Calculate StdDev
    const mean = windowCloses.reduce((a, b) => a + b, 0) / windowCloses.length;
    const variance = windowCloses.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / windowCloses.length;
    const stdDev = Math.sqrt(variance);

    // Z-Score
    // z = (P - VWAP) / σ
    const zScore = stdDev > 0 ? (closes[i] - vwap) / stdDev : 0;

    results.push({
      timestamp: klines[i].openTime,
      price: closes[i],
      vwap,
      stdDev,
      zScore
    });
  }

  return results;
}

/**
 * Calculates Z-Scores for multiple windows (30, 90, 180, 365).
 */
export function calculateMultiVwapZScore(klines: Kline[]): MultiVwapZScore[] {
  const z30 = calculateVwapZScore(klines, 30);
  const z90 = calculateVwapZScore(klines, 90);
  const z180 = calculateVwapZScore(klines, 180);
  const z365 = calculateVwapZScore(klines, 365);

  // Merge results
  return klines.map((k, i) => ({
    timestamp: k.openTime,
    price: k.close,
    z30: z30[i]?.zScore || 0,
    z90: z90[i]?.zScore || 0,
    z180: z180[i]?.zScore || 0,
    z365: z365[i]?.zScore || 0,
  }));
}
