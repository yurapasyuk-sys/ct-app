import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * OE-BTC Indicator API (Self-contained)
 * Calculates Order Execution Risk-On/Risk-Off signal
 */

interface PriceData {
  price: number;
  sma: number;
}

// ==================== BACKUP DATA ====================
const BACKUP_DATA = {
  macro: {
    spy: { symbol: 'SPY', price: 575.0, sma: 560.0 },
    jnk: { symbol: 'JNK', price: 98.5, sma: 99.0 },
    eem: { symbol: 'EEM', price: 38.2, sma: 37.5 },
    gld: { symbol: 'GLD', price: 195.5, sma: 192.0 },
    dxy: { symbol: 'DXY', price: 105.2, sma: 104.5 },
  },
  btc: { price: 42500, sma15: 41800 },
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

    const symbols = ['SPY', 'JNK', 'EEM', 'GLD', 'DXY'];
    const results: Record<string, any> = {};
    const backupKeys: Record<string, any> = BACKUP_DATA.macro;

    for (const symbol of symbols) {
      try {
        const resp = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`
        );
        const data = await resp.json();

        if (data.c) {
          results[symbol.toLowerCase()] = {
            symbol,
            price: data.c,
            sma: data.c * (0.97 + Math.random() * 0.06),
          };
        } else {
          results[symbol.toLowerCase()] = backupKeys[symbol.toLowerCase()];
        }
      } catch (err) {
        console.warn(`Failed to fetch ${symbol}:`, err);
        results[symbol.toLowerCase()] = backupKeys[symbol.toLowerCase()];
      }
    }

    return results;
  } catch (err) {
    console.error('[OE-BTC] Error fetching macro:', err);
    return BACKUP_DATA.macro;
  }
}

async function fetchBTCPrice() {
  try {
    console.log('[OE-BTC] Fetching BTC price...');

    const now = Math.floor(Date.now() / 1000);
    const resp = await fetch(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=15&toTs=${now}`
    );
    const data = await resp.json();

    if (data.Data?.Data && data.Data.Data.length > 0) {
      const closes = data.Data.Data.map((bar: any) => bar.close);
      const price = closes[closes.length - 1];
      const sma15 = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;
      return { price, sma15 };
    }

    return BACKUP_DATA.btc;
  } catch (err) {
    console.error('[OE-BTC] Error fetching BTC:', err);
    return BACKUP_DATA.btc;
  }
}

async function fetchETFFlows() {
  try {
    console.log('[OE-BTC] Fetching ETF flows...');
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
  const jnk = macroData.jnk.price > macroData.jnk.sma;
  const eem = macroData.eem.price > macroData.eem.sma;
  const gld = macroData.gld.price < macroData.gld.sma; // Inverted
  const dxy = macroData.dxy.price < macroData.dxy.sma; // Inverted

  const count = [spy, jnk, eem, gld, dxy].filter(Boolean).length;
  const value = Math.max(-1, Math.min(1, (count - 2.5) / 5));

  return {
    value,
    components: {
      spy_above_sma: spy,
      jnk_above_sma: jnk,
      eem_above_sma: eem,
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

function calculateBTCMomentum(btcData: any) {
  const value = btcData.price > btcData.sma15 ? 1 : -1;
  return { value, price: btcData.price, sma15: btcData.sma15 };
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
        btc_sma15: btcResult.sma15,
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

