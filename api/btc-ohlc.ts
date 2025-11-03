import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * BTC OHLC Data API
 * Fetches historical OHLC data from Binance
 * Returns: (Open + High + Low + Close) / 4 as typical price
 */

interface OHLCData {
  timestamp: number;
  date: string;
  typicalPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fetch OHLC data from Binance
 */
async function fetchBinanceOHLC(days: number): Promise<OHLCData[]> {
  try {
    console.log(`[BTC-OHLC] Fetching ${days} days from Binance...`);

    // Binance 1-day klines endpoint
    // interval: 1d (1 day)
    // limit: max 1000 per request
    const now = Date.now();
    const from = now - days * 24 * 60 * 60 * 1000;

    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime=${Math.floor(from)}&endTime=${Math.floor(now)}`,
      {
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();

    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error('No data from Binance');
    }

    console.log(`[BTC-OHLC] ✓ Fetched ${klines.length} candles from Binance`);

    // Parse Binance klines format: [time, open, high, low, close, volume, ...]
    return klines.map((kline: any[]) => {
      const timestamp = parseInt(kline[0]);
      const open = parseFloat(kline[1]);
      const high = parseFloat(kline[2]);
      const low = parseFloat(kline[3]);
      const close = parseFloat(kline[4]);

      // Typical price = (O + H + L + C) / 4
      const typicalPrice = (open + high + low + close) / 4;

      return {
        timestamp,
        date: new Date(timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        }),
        typicalPrice,
        open,
        high,
        low,
        close,
      };
    });
  } catch (err) {
    console.error('[BTC-OHLC] Error fetching from Binance:', err);
    throw err;
  }
}

/**
 * Generate mock OHLC data (fallback)
 */
function generateMockOHLC(days: number): OHLCData[] {
  const data: OHLCData[] = [];
  const now = Date.now();

  let price = 100000; // Start at 100k

  for (let i = days; i >= 0; i--) {
    const timestamp = now - i * 24 * 60 * 60 * 1000;
    const date = new Date(timestamp);

    // Random walk
    const change = (Math.random() - 0.48) * 3000;
    price = Math.max(70000, Math.min(130000, price + change));

    // OHLC with some range
    const open = price;
    const range = Math.random() * 2000;
    const high = price + range;
    const low = price - Math.random() * range;
    const close = price + (Math.random() - 0.5) * 1000;

    const typicalPrice = (open + high + low + close) / 4;

    data.push({
      timestamp,
      date: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      }),
      typicalPrice,
      open,
      high,
      low,
      close,
    });
  }

  return data;
}

// ==================== HANDLER ====================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Set CORS and cache headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    const days = Math.min(parseInt(req.query.days as string) || 365, 1000);

    if (days < 1) {
      return res.status(400).json({ error: 'Days must be at least 1' });
    }

    let data: OHLCData[];

    try {
      // Try real data first
      data = await fetchBinanceOHLC(days);
    } catch (err) {
      console.warn('[BTC-OHLC] Falling back to mock data:', err);
      // Fallback to mock
      data = generateMockOHLC(days);
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      days: data.length,
      source: data.length > 500 ? 'binance' : 'fallback',
      data,
    });
  } catch (err: any) {
    console.error('[BTC-OHLC] Handler error:', err);

    // Emergency fallback
    const mockData = generateMockOHLC(365);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      days: mockData.length,
      source: 'fallback',
      data: mockData,
      error: err.message,
    });
  }
}
