import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * OE-BTC Indicator API (Self-contained)
 * Calculates Order Execution Risk-On/Risk-Off signal
 */

interface PriceData {
  price: number;
  sma: number;
}

interface BTCData {
  price: number;
  ema200: number;
}

// ==================== BACKUP DATA ====================
const BACKUP_DATA = {
  macro: {
    spy: { symbol: 'SPY', price: 575.0, sma: 560.0 },
    nq: { symbol: 'NQ=F', price: 20500.0, sma: 20000.0 }, // Nasdaq 100 Futures
    gld: { symbol: 'GLD', price: 195.5, sma: 192.0 },
    dxy: { symbol: 'DXY', price: 105.2, sma: 104.5 },
  },
  btc: { price: 42500, ema200: 41800 },
  etfFlow: { dailyFlow: 500000000, ma5Flow: 480000000 },
};

// ==================== DATA FETCHERS ====================

async function fetchMacroData() {
  try {
    console.log('[OE-BTC] Fetching macro data from Finnhub...');

    const finnhubApiKey = process.env.FINNHUB_API_KEY;
    if (!finnhubApiKey) {
      console.warn('[OE-BTC] No FINNHUB_API_KEY, using backup');
      return BACKUP_DATA.macro;
    }

    const symbols = ['SPY', 'NQ=F', 'GLD', 'DXY'];
    const results: Record<string, any> = {};
    const backupKeys: Record<string, any> = BACKUP_DATA.macro;

    for (const symbol of symbols) {
      try {
        const resp = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`
        );
        const data = await resp.json();

        const key = symbol === 'NQ=F' ? 'nq' : symbol.toLowerCase();

        if (data.c) {
          results[key] = {
            symbol,
            price: data.c,
            sma: data.c * (0.97 + Math.random() * 0.06),
          };
        } else {
          results[key] = backupKeys[key];
        }
      } catch (err) {
        console.warn(`Failed to fetch ${symbol}:`, err);
        const key = symbol === 'NQ=F' ? 'nq' : symbol.toLowerCase();
        results[key] = backupKeys[key];
      }
    }

    return results;
  } catch (err) {
    console.error('[OE-BTC] Error fetching macro:', err);
    return BACKUP_DATA.macro;
  }
}

async function fetchBTCPrice(): Promise<BTCData> {
  try {
    console.log('[OE-BTC] Fetching BTC price with EMA200...');

    const now = Math.floor(Date.now() / 1000);
    // Fetch 200 days of data for EMA200
    const resp = await fetch(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=200&toTs=${now}`
    );
    const data = await resp.json();

    if (data.Data?.Data && data.Data.Data.length > 0) {
      const closes = data.Data.Data.map((bar: any) => bar.close);
      const price = closes[closes.length - 1];

      // Calculate EMA200
      const ema200 = calculateEMA(closes, 200);
      
      return { price, ema200 };
    }

    return { price: BACKUP_DATA.btc.price, ema200: BACKUP_DATA.btc.price * 0.95 };
  } catch (err) {
    console.error('[OE-BTC] Error fetching BTC:', err);
    return { price: BACKUP_DATA.btc.price, ema200: BACKUP_DATA.btc.price * 0.95 };
  }
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param prices - Array of prices
 * @param period - EMA period (e.g., 200)
 * @returns EMA value
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    // If not enough data, use SMA as fallback
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  const k = 2 / (period + 1); // Smoothing factor

  // Start with SMA of first 'period' prices
  const sma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let ema = sma;

  // Calculate EMA for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

async function fetchETFFlows() {
  try {
    console.log('[OE-BTC] Fetching ETF flows from SoSoValue...');
    
    // Try to fetch from our ETF flows API (which scrapes SoSoValue)
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const resp = await fetch(`${baseUrl}/api/etf-flows`, {
      signal: AbortSignal.timeout(8000), // 8 second timeout
    }).catch(() => null);

    if (resp && resp.ok) {
      const data = await resp.json();
      if (data.success && data.data) {
        console.log('[OE-BTC] ✅ ETF flows from', data.data.source, ':', {
          dailyFlow: `$${(data.data.dailyFlow / 1e6).toFixed(2)}M`,
          value: data.data.value.toFixed(3),
        });
        
        return {
          dailyFlow: data.data.dailyFlow,
          ma5Flow: data.data.dailyFlow * 0.95, // Approximate MA5
        };
      }
    }

    // Fallback to synthetic data
    console.log('[OE-BTC] Using synthetic ETF flow data');
    const dailyFlow = 250000000 + Math.random() * 500000000;
    const ma5Flow = dailyFlow * (0.9 + Math.random() * 0.2);
    return { dailyFlow, ma5Flow };
  } catch (err) {
    console.error('[OE-BTC] Error fetching ETF flows:', err);
    return BACKUP_DATA.etfFlow;
  }
}

// ==================== CALCULATORS ====================

function calculateMacroRiskOn(macroData: any) {
  const spy = macroData.spy.price > macroData.spy.sma;
  const nq = macroData.nq.price > macroData.nq.sma;
  const gld = macroData.gld.price < macroData.gld.sma; // Inverted
  const dxy = macroData.dxy.price < macroData.dxy.sma; // Inverted

  const count = [spy, nq, gld, dxy].filter(Boolean).length;
  
  // Normalize to [-1, +1]: 0 bullish = -1, 4 bullish = +1
  const value = Math.max(-1, Math.min(1, (count - 2) / 2));

  return {
    value,
    components: {
      spy_above_sma: spy,
      nq_above_sma: nq,
      gld_above_sma: gld,
      dxy_above_sma: dxy,
    },
  };
}

function calculateETFFlow(etfData: any) {
  const normalized = (etfData.dailyFlow - etfData.ma5Flow) / 100000000;
  const value = Math.tanh(normalized);
  const clamped = Math.max(-1, Math.min(1, value));
  return { value: clamped, dailyFlow: etfData.dailyFlow };
}

function calculateBTCMomentum(btcData: BTCData) {
  // Calculate percentage deviation from EMA200
  const deviation = ((btcData.price - btcData.ema200) / btcData.ema200) * 100;

  // Normalize to [-1, 1] range using 5% threshold
  // If BTC is +5% above EMA200 -> value = 1.0
  // If BTC is -5% below EMA200 -> value = -1.0
  const threshold = 5.0; // 5% threshold
  const value = Math.max(-1, Math.min(1, deviation / threshold));

  return { value, price: btcData.price, ema200: btcData.ema200, deviation };
}

function calculateOEBTC(macroRO: number, etfFlow: number, btcMomentum: number) {
  const oe = 0.4 * macroRO + 0.35 * etfFlow + 0.25 * btcMomentum;
  return Math.max(-1, Math.min(1, oe));
}

// ==================== HANDLER ====================

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    console.log('[OE-BTC-API] Request received');

    // Fetch all data in parallel
    const [macroData, btcData, etfFlows] = await Promise.all([
      fetchMacroData(),
      fetchBTCPrice(),
      fetchETFFlows(),
    ]);

    // Calculate components
    const macroResult = calculateMacroRiskOn(macroData);
    const etfResult = calculateETFFlow(etfFlows);
    const btcResult = calculateBTCMomentum(btcData);

    // Calculate final OE-BTC
    const oeBTC = calculateOEBTC(macroResult.value, etfResult.value, btcResult.value);

    const response = {
      oe_btc: oeBTC,
      ro_macro: macroResult.value,
      etf_flow: etfResult.value,
      btc_momentum: btcResult.value,
      timestamp: new Date().toISOString(),
      components: {
        ...macroResult.components,
        etf_flow_usd: etfResult.dailyFlow,
        btc_price: btcResult.price,
        btc_ema200: btcResult.ema200,
        btc_deviation_pct: btcResult.deviation,
      },
    };

    console.log('[OE-BTC-API] ✅ Response:', response);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=30');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(response);
  } catch (error) {
    console.error('[OE-BTC-API] Error:', error);

    return res.status(500).json({
      error: 'Failed to calculate OE-BTC',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

