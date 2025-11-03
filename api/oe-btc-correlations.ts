import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * OE-BTC Correlations API
 * Calculates correlations between OE-BTC and various markets
 */

interface CorrelationPair {
  pair: string;
  label: string;
  correlation: number;
}

/**
 * Fetch historical prices for a symbol
 */
async function fetchHistoricalPrices(symbol: string, days: number): Promise<number[]> {
  try {
    const finnhubApiKey = process.env.FINNHUB_API_KEY;
    if (!finnhubApiKey) {
      return [];
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 24 * 60 * 60;

    const resp = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${now}&token=${finnhubApiKey}`
    );
    const data = await resp.json();

    if (data.c && data.c.length > 0) {
      return data.c;
    }

    return [];
  } catch (err) {
    console.warn(`[Correlations] Error fetching ${symbol}:`, err);
    return [];
  }
}

/**
 * Fetch historical BTC prices
 */
async function fetchHistoricalBTC(days: number): Promise<number[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const resp = await fetch(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=${days}&toTs=${now}`
    );
    const data = await resp.json();

    if (data.Data?.Data && data.Data.Data.length > 0) {
      return data.Data.Data.map((bar: any) => bar.close);
    }

    return [];
  } catch (err) {
    console.error('[Correlations] Error fetching BTC:', err);
    return [];
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  // Align arrays
  const x_aligned = x.slice(-n);
  const y_aligned = y.slice(-n);

  // Calculate means
  const mean_x = x_aligned.reduce((a, b) => a + b, 0) / n;
  const mean_y = y_aligned.reduce((a, b) => a + b, 0) / n;

  // Calculate correlation
  let numerator = 0;
  let sum_sq_x = 0;
  let sum_sq_y = 0;

  for (let i = 0; i < n; i++) {
    const diff_x = x_aligned[i] - mean_x;
    const diff_y = y_aligned[i] - mean_y;
    numerator += diff_x * diff_y;
    sum_sq_x += diff_x * diff_x;
    sum_sq_y += diff_y * diff_y;
  }

  const denominator = Math.sqrt(sum_sq_x * sum_sq_y);
  
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}

/**
 * Calculate OE-BTC historical values (simplified)
 */
function calculateHistoricalOEBTC(btc: number[], spy: number[], nq: number[], gld: number[], dxy: number[]): number[] {
  try {
    if (!btc.length) return [];

    const n = Math.min(btc.length, spy.length, nq.length, gld.length, dxy.length);
    if (n < 5) return [];
    
    const oebtc: number[] = [];

    // Calculate EMA200 for BTC (use all available data)
    const calculateEMA = (prices: number[], period: number): number => {
      if (prices.length < period) {
        return prices.reduce((a, b) => a + b, 0) / prices.length;
      }
      const k = 2 / (period + 1);
      const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
      let ema = sma;
      for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
      }
      return ema;
    };

    const btcEMA200 = calculateEMA(btc, Math.min(200, btc.length));

    for (let i = 0; i < n; i++) {
      // Simplified macro calculation (bullish count) with SMA-50
      const smaWindow = Math.min(50, i + 1);
      const spySMA = spy.slice(Math.max(0, i - smaWindow + 1), i + 1).reduce((a, b) => a + b, 0) / smaWindow;
      const nqSMA = nq.slice(Math.max(0, i - smaWindow + 1), i + 1).reduce((a, b) => a + b, 0) / smaWindow;
      const gldSMA = gld.slice(Math.max(0, i - smaWindow + 1), i + 1).reduce((a, b) => a + b, 0) / smaWindow;
      const dxySMA = dxy.slice(Math.max(0, i - smaWindow + 1), i + 1).reduce((a, b) => a + b, 0) / smaWindow;

      const spyBullish = spy[i] > spySMA;
      const nqBullish = nq[i] > nqSMA;
      const gldBearish = gld[i] < gldSMA;
      const dxyBearish = dxy[i] < dxySMA;

      const macroCount = [spyBullish, nqBullish, gldBearish, dxyBearish].filter(Boolean).length;
      const ro_macro = Math.max(-1, Math.min(1, (macroCount - 2) / 2));

      // BTC momentum
      const btcDeviation = ((btc[i] - btcEMA200) / btcEMA200) * 100;
      const btc_momentum = Math.max(-1, Math.min(1, btcDeviation / 10));

      // ETF flow (simplified - using BTC price momentum)
      const etf_flow = i > 0 ? Math.max(-1, Math.min(1, (btc[i] - btc[i - 1]) / btc[i] * 10)) : 0;

      // Calculate OE-BTC
      const oe_btc = 0.40 * ro_macro + 0.35 * etf_flow + 0.25 * btc_momentum;
      oebtc.push(Math.max(-1, Math.min(1, oe_btc)));
    }

    return oebtc;
  } catch (err) {
    console.error('[Correlations] Error calculating OE-BTC:', err);
    return [];
  }
}

/**
 * API Handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const days = 30; // Fixed 30-day window

    console.log('[Correlations] Starting calculation...');
    const startTime = Date.now();

    // Fetch all data in parallel
    const [spy, nq, gld, dxy, btc] = await Promise.all([
      fetchHistoricalPrices('SPY', days).catch(() => []),
      fetchHistoricalPrices('NQ=F', days).catch(() => []),
      fetchHistoricalPrices('GLD', days).catch(() => []),
      fetchHistoricalPrices('DXY', days).catch(() => []),
      fetchHistoricalBTC(days).catch(() => []),
    ]);

    console.log(`[Correlations] Data fetched in ${Date.now() - startTime}ms`);
    console.log(`[Correlations] Data lengths: SPY=${spy.length}, NQ=${nq.length}, BTC=${btc.length}`);

    // Calculate OE-BTC from fetched data
    const oebtc = calculateHistoricalOEBTC(btc, spy, nq, gld, dxy);
    
    console.log(`[Correlations] OE-BTC calculated: ${oebtc.length} points`);

    if (!oebtc.length || oebtc.length < 5) {
      console.error('[Correlations] Insufficient OE-BTC data');
      throw new Error('Failed to calculate OE-BTC historical data');
    }

    // Calculate correlations
    const correlations: CorrelationPair[] = [
      {
        pair: 'OE-BTC vs SPY',
        label: 'S&P 500',
        correlation: spy.length >= 5 ? parseFloat(calculateCorrelation(oebtc, spy).toFixed(3)) : 0,
      },
      {
        pair: 'OE-BTC vs NQ',
        label: 'Nasdaq 100',
        correlation: nq.length >= 5 ? parseFloat(calculateCorrelation(oebtc, nq).toFixed(3)) : 0,
      },
      {
        pair: 'OE-BTC vs GLD',
        label: 'Gold',
        correlation: gld.length >= 5 ? parseFloat(calculateCorrelation(oebtc, gld).toFixed(3)) : 0,
      },
      {
        pair: 'OE-BTC vs DXY',
        label: 'US Dollar Index',
        correlation: dxy.length >= 5 ? parseFloat(calculateCorrelation(oebtc, dxy).toFixed(3)) : 0,
      },
      {
        pair: 'OE-BTC vs BTC',
        label: 'Bitcoin Price',
        correlation: btc.length >= 5 ? parseFloat(calculateCorrelation(oebtc, btc).toFixed(3)) : 0,
      },
      {
        pair: 'SPY vs BTC',
        label: 'SPY-BTC',
        correlation: spy.length >= 5 && btc.length >= 5 ? parseFloat(calculateCorrelation(spy, btc).toFixed(3)) : 0,
      },
      {
        pair: 'NQ vs BTC',
        label: 'NQ-BTC',
        correlation: nq.length >= 5 && btc.length >= 5 ? parseFloat(calculateCorrelation(nq, btc).toFixed(3)) : 0,
      },
    ];

    console.log(`[Correlations] Calculation completed in ${Date.now() - startTime}ms`);

    return res.status(200).json({
      success: true,
      days,
      timestamp: new Date().toISOString(),
      correlations,
      calculationTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[Correlations] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
