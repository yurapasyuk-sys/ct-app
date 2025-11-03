import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * OE-BTC Historical Data API
 * Returns historical OE-BTC values for chart visualization
 */

interface HistoricalDataPoint {
  timestamp: number;
  date: string;
  oe_btc: number;
  btc_price: number;
}

/**
 * Fetch historical BTC prices from CryptoCompare
 */
async function fetchHistoricalBTC(days: number): Promise<{ timestamp: number; price: number; volume: number }[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const resp = await fetch(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=${days}&toTs=${now}`
    );
    const data = await resp.json();

    if (data.Data?.Data && data.Data.Data.length > 0) {
      return data.Data.Data.map((bar: any) => ({
        timestamp: bar.time * 1000,
        price: bar.close,
        volume: bar.volumeto || 0, // USD volume
      }));
    }

    return [];
  } catch (err) {
    console.error('[OE-BTC History] Error fetching historical BTC:', err);
    return [];
  }
}

/**
 * Fetch historical macro data from Finnhub
 * Note: Free tier has limitations, using approximation
 */
async function fetchHistoricalMacro(symbol: string, days: number): Promise<{ timestamp: number; price: number; sma: number }[]> {
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

    if (data.c && data.t && data.c.length > 0) {
      // Calculate SMA-50 for each day
      return data.c.map((close: number, idx: number) => {
        const smaWindow = data.c.slice(Math.max(0, idx - 49), idx + 1);
        const sma = smaWindow.reduce((a: number, b: number) => a + b, 0) / smaWindow.length;
        
        return {
          timestamp: data.t[idx] * 1000,
          price: close,
          sma,
        };
      });
    }

    return [];
  } catch (err) {
    console.warn(`[OE-BTC History] Error fetching ${symbol}:`, err);
    return [];
  }
}

/**
 * Calculate historical OE-BTC values
 */
async function calculateHistoricalOEBTC(days: number): Promise<HistoricalDataPoint[]> {
  try {
    console.log(`[OE-BTC History] Calculating ${days} days of historical data...`);

    // Fetch all required data
    const [btcHistory, spyHistory, nqHistory, gldHistory, dxyHistory] = await Promise.all([
      fetchHistoricalBTC(days),
      fetchHistoricalMacro('SPY', days),
      fetchHistoricalMacro('NQ=F', days),
      fetchHistoricalMacro('GLD', days),
      fetchHistoricalMacro('DXY', days),
    ]);

    if (!btcHistory.length) {
      throw new Error('No BTC historical data');
    }

    // Calculate EMA200 for BTC
    const btcPrices = btcHistory.map(d => d.price);
    const btcEMA200 = calculateEMA(btcPrices, 200);

    // Align all data by timestamp
    const result: HistoricalDataPoint[] = [];

    for (let i = 0; i < Math.min(days, btcHistory.length); i++) {
      const btcPoint = btcHistory[btcHistory.length - days + i];
      if (!btcPoint) continue;

      const timestamp = btcPoint.timestamp;
      const date = new Date(timestamp);

      // Find closest macro data (allow ±1 day tolerance)
      const findClosest = (arr: any[]) => {
        if (!arr.length) return null;
        return arr.reduce((prev, curr) => {
          return Math.abs(curr.timestamp - timestamp) < Math.abs(prev.timestamp - timestamp) ? curr : prev;
        });
      };

      const spy = findClosest(spyHistory);
      const nq = findClosest(nqHistory);
      const gld = findClosest(gldHistory);
      const dxy = findClosest(dxyHistory);

      // Calculate components (simplified since we don't have ETF historical data)
      const spyBullish = spy && spy.price > spy.sma;
      const nqBullish = nq && nq.price > nq.sma;
      const gldBearish = gld && gld.price < gld.sma; // Inverted
      const dxyBearish = dxy && dxy.price < dxy.sma; // Inverted

      const macroCount = [spyBullish, nqBullish, gldBearish, dxyBearish].filter(Boolean).length;
      const ro_macro = Math.max(-1, Math.min(1, (macroCount - 2) / 2));

      // BTC momentum (using same threshold as current API: 5%)
      const btcPrice = btcPoint.price;
      const btcVolume = btcPoint.volume;
      const btcDeviation = ((btcPrice - btcEMA200) / btcEMA200) * 100;
      const btc_momentum = Math.max(-1, Math.min(1, btcDeviation / 5));

      // ETF flow approximation: Improved model using price + volume
      // ETF buyers tend to correlate with: price increase + high volume
      let etf_flow = 0;
      if (i > 0) {
        const prevPoint = btcHistory[btcHistory.length - days + i - 1];
        const prevPrice = prevPoint.price;
        const prevVolume = prevPoint.volume;
        
        // Price momentum component
        const priceChange = btcPrice - prevPrice;
        const returnPct = (priceChange / prevPrice) * 100;
        
        // Volume component (relative to average)
        const volumeRatio = prevVolume > 0 ? btcVolume / prevVolume : 1;
        const volumeSignal = Math.log(volumeRatio) / Math.log(2); // Log scale: 2x volume = +1
        
        // Combined signal: price momentum weighted by volume
        // Higher volume amplifies the signal
        const combinedSignal = returnPct * (1 + Math.min(volumeSignal, 1) * 0.5);
        
        // Normalize using tanh (similar to real ETF flow calculation)
        etf_flow = Math.tanh(combinedSignal / 3);
      }

      // Calculate OE-BTC
      const oe_btc = 0.40 * ro_macro + 0.35 * etf_flow + 0.25 * btc_momentum;
      const oe_btc_clamped = Math.max(-1, Math.min(1, oe_btc));

      result.push({
        timestamp,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        oe_btc: parseFloat(oe_btc_clamped.toFixed(3)),
        btc_price: Math.round(btcPrice),
      });
    }

    return result;
  } catch (err) {
    console.error('[OE-BTC History] Error calculating historical data:', err);
    throw err;
  }
}

/**
 * Calculate EMA
 */
function calculateEMA(prices: number[], period: number): number {
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
    const days = parseInt(req.query.days as string) || 30;
    
    if (days < 1 || days > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    const historicalData = await calculateHistoricalOEBTC(days);

    return res.status(200).json({
      success: true,
      days,
      count: historicalData.length,
      data: historicalData,
    });
  } catch (error: any) {
    console.error('[OE-BTC History] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}
