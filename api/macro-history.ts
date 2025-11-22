
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYMBOL_MAP: Record<string, string> = {
  'ES': 'ES=F',       // S&P 500 Futures
  'NQ': 'NQ=F',       // Nasdaq 100 Futures
  'DXY': 'DX-Y.NYB',  // US Dollar Index
  'RTY': 'RTY=F',     // Russell 2000 Futures
  'GC': 'GC=F',       // Gold Futures
  'NIKKEI': '^N225',  // Nikkei 225
  'US10Y': '^TNX',    // 10 Year Treasury Yield
  'US05Y': '^FVX'     // 5 Year Treasury Yield
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { symbol, interval } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const yahooSymbol = SYMBOL_MAP[symbol] || symbol;
  
  // Map Binance intervals to Yahoo intervals
  // Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
  // Yahoo: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
  
  let yahooInterval = '1d';
  let range = '1y'; // Default range

  switch (interval) {
    case '15m':
      yahooInterval = '15m';
      range = '60d'; // Max for intraday
      break;
    case '1h':
      yahooInterval = '60m';
      range = '730d'; // Max for hourly is 730 days
      break;
    case '4h':
      // Yahoo doesn't have 4h. We can use 1h and aggregate, or just use 1h.
      // For simplicity, let's use 1h and let the frontend handle it or just return 1h data.
      // Actually, returning 1h data when 4h is requested might be fine if we just want trend.
      // But for GARCH it changes things.
      // Let's stick to 1d for macro usually, but if they ask for 4h, we give 60m.
      yahooInterval = '60m';
      range = '730d';
      break;
    case '1d':
      yahooInterval = '1d';
      range = '5y';
      break;
    case '1w':
      yahooInterval = '1wk';
      range = '10y';
      break;
    default:
      yahooInterval = '1d';
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=${yahooInterval}`
    );
    const data = await response.json();

    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    const klines = timestamps.map((t: number, i: number) => ({
      openTime: t * 1000,
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i] || 0,
      closeTime: t * 1000 + (interval === '1d' ? 86400000 : 3600000) - 1 // Approx
    })).filter((k: any) => k.close !== null && k.close !== undefined);

    res.status(200).json(klines);
  } catch (error) {
    console.error('Yahoo API Error:', error);
    res.status(500).json({ error: 'Failed to fetch macro data' });
  }
}
