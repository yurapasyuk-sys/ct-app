
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYMBOLS = {
  'BTC': 'BTC-USD',
  'ES': 'ES=F',       // S&P 500 Futures
  'NQ': 'NQ=F',       // Nasdaq 100 Futures
  'DXY': 'DX-Y.NYB',  // US Dollar Index
  'RTY': 'RTY=F',     // Russell 2000 Futures
  'GOLD': 'GC=F',     // Gold Futures
  'NIKKEI': '^N225',  // Nikkei 225
  'US10Y': '^TNX',    // 10 Year Treasury Yield
  'US02Y': '^IRX'     // Using 13 Week Bill as proxy or try to find 2Y. 
                      // Actually, let's use ZT=F (2-Year T-Note Futures) or just skip if unreliable.
                      // Yahoo has ^IRX (13 week), ^FVX (5 year), ^TNX (10 year), ^TYX (30 year).
                      // Let's use ^FVX (5 Year) as a proxy for short term if 2Y is missing, 
                      // or just stick to what we can find. 
                      // Let's try 'ZT=F' for 2-Year Note Futures.
};

// Map for display names
const DISPLAY_NAMES = {
  'ES': 'S&P 500',
  'NQ': 'Nasdaq 100',
  'DXY': 'DXY',
  'RTY': 'Russell 2000',
  'GOLD': 'Gold',
  'NIKKEI': 'Nikkei 225',
  'US10Y': 'US 10Y Yield',
  'US02Y': 'US 2Y Note'
};

async function fetchYahooData(symbol: string, range: string = '90d') {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`
    );
    const data = await response.json();
    
    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
      return null;
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const close = result.indicators.quote[0].close;

    return timestamps.map((t: number, i: number) => ({
      timestamp: t,
      close: close[i]
    })).filter((d: any) => d.close !== null && d.close !== undefined);
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return null;
  }
}

function calculateCorrelation(x: number[], y: number[]) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const days = parseInt(req.query.days as string) || 30;
    // Ensure we fetch enough data. If days is 90, we need at least 90 days.
    // Yahoo ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    // 90d is approx 3mo.
    let fetchRange = '3mo';
    if (days <= 15) fetchRange = '1mo';
    else if (days <= 30) fetchRange = '3mo';
    else if (days <= 60) fetchRange = '3mo';
    else if (days <= 90) fetchRange = '6mo'; // Use 6mo to be safe for 90 trading days
    else fetchRange = '1y';

    // 1. Fetch BTC Data
    const btcData = await fetchYahooData(SYMBOLS.BTC, fetchRange);
    if (!btcData) {
      return res.status(500).json({ error: 'Failed to fetch BTC data' });
    }

    const results = [];

    // 2. Fetch and Calculate for each symbol
    for (const [key, symbol] of Object.entries(SYMBOLS)) {
      if (key === 'BTC') continue;

      const assetData = await fetchYahooData(symbol, fetchRange);
      
      if (assetData) {
        // Align data
        // We need to match timestamps (daily closes)
        // Since crypto trades 24/7 and stocks don't, we'll use the dates that exist in both.
        
        const btcMap = new Map(btcData.map((d: any) => {
            // Normalize to date string YYYY-MM-DD to ignore time differences
            const date = new Date(d.timestamp * 1000).toISOString().split('T')[0];
            return [date, d.close];
        }));

        const alignedX: number[] = []; // BTC
        const alignedY: number[] = []; // Asset

        assetData.forEach((d: any) => {
            const date = new Date(d.timestamp * 1000).toISOString().split('T')[0];
            if (btcMap.has(date)) {
                alignedX.push(btcMap.get(date) as number);
                alignedY.push(d.close);
            }
        });

        // Calculate correlation on the last N data points
        // Note: These are trading days, not calendar days.
        // 30 trading days is approx 45 calendar days.
        // The user likely means "last 30 days" as in "last 30 data points" or "last 30 calendar days"?
        // Usually in finance "30 day correlation" means on a window of 30 days.
        // If we have daily data, let's assume 'days' param means 'number of data points' (trading days) for simplicity and robustness,
        // or we can filter by date.
        // Given the previous code used `lookback = 30` on the array, it meant 30 data points.
        // Let's stick to data points as it's more consistent for correlation calc.
        const lookback = days;
        const sliceX = alignedX.slice(-lookback);
        const sliceY = alignedY.slice(-lookback);
        
        // Get dates for the slice
        const dates = [];
        let dateIndex = 0;
        // Re-iterate to find dates matching the slice (a bit inefficient but safe)
        // Better: store dates in alignment
        const alignedDates: string[] = [];
        assetData.forEach((d: any) => {
            const date = new Date(d.timestamp * 1000).toISOString().split('T')[0];
            if (btcMap.has(date)) {
                alignedDates.push(date);
            }
        });
        const sliceDates = alignedDates.slice(-lookback);

        const correlation = calculateCorrelation(sliceX, sliceY);

        const history = sliceDates.map((date, i) => ({
            date,
            btcPrice: sliceX[i],
            assetPrice: sliceY[i]
        }));

        results.push({
          id: key,
          name: DISPLAY_NAMES[key as keyof typeof DISPLAY_NAMES] || key,
          symbol: symbol,
          correlation: correlation,
          lastPrice: assetData[assetData.length - 1].close,
          dataPoints: sliceY.length,
          history: history
        });
      }
    }

    res.status(200).json({ 
      btcPrice: btcData[btcData.length - 1].close,
      correlations: results 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
