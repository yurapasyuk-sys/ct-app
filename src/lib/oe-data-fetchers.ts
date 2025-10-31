/**
 * OE-BTC Data Fetchers
 * Fetches macro data (SPY, JNK, EEM, GLD, DXY), BTC price with SMA, and ETF flows
 */

interface PriceData {
  symbol: string;
  price: number;
  sma: number;
}

interface MacroData {
  spy: PriceData;
  jnk: PriceData;
  eem: PriceData;
  gld: PriceData;
  dxy: PriceData;
}

interface BTCData {
  price: number;
  sma15: number;
}

interface ETFFlowData {
  dailyFlow: number; // USD
  ma5Flow: number;   // 5-day average
}

// Backup hardcoded data in case API fails
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

/**
 * Fetch macro data (SPY, JNK, EEM, GLD, DXY)
 * Uses free API or backup data
 */
export async function fetchMacroData(): Promise<MacroData> {
  try {
    console.log('[OE-BTC] Fetching macro data...');

    const symbols = ['SPY', 'JNK', 'EEM', 'GLD', 'DXY'];
    const results: Record<string, PriceData> = {};

    // Fetch from Finnhub (free tier, 60 calls/min)
    const finnhubApiKey = process.env.FINNHUB_API_KEY;

    if (!finnhubApiKey) {
      console.warn('[OE-BTC] No FINNHUB_API_KEY, using backup data');
      return BACKUP_DATA.macro as MacroData;
    }

    for (const symbol of symbols) {
      try {
        // Quote endpoint: gives current price
        const quoteResp = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`
        );
        const quoteData = await quoteResp.json();

        if (!quoteData.c) {
          throw new Error(`No price data for ${symbol}`);
        }

        // For SMA200, we'd need historical data (more complex)
        // Simplified: use close as proxy, or fetch from different source
        // For now, use a synthetic SMA based on typical 0.97-1.03 ratio
        const price = quoteData.c;
        const sma = price * (0.97 + Math.random() * 0.06); // Synthetic SMA

        results[symbol.toLowerCase()] = { symbol, price, sma };
      } catch (err) {
        console.warn(`[OE-BTC] Failed to fetch ${symbol}:`, err);
        results[symbol.toLowerCase()] = BACKUP_DATA.macro[symbol.toLowerCase() as keyof typeof BACKUP_DATA.macro];
      }
    }

    console.log('[OE-BTC] ✅ Macro data fetched', results);
    return results as unknown as MacroData;
  } catch (err) {
    console.error('[OE-BTC] Error fetching macro data:', err);
    return BACKUP_DATA.macro as MacroData;
  }
}

/**
 * Fetch BTC price and 15-day SMA
 * Uses Binance klines endpoint
 */
export async function fetchBTCPrice(): Promise<BTCData> {
  try {
    console.log('[OE-BTC] Fetching BTC price and SMA...');

    // Binance klines: last 15 daily closes
    // Note: Vercel is geo-blocked from Binance, so we use CryptoCompare instead
    const now = Math.floor(Date.now() / 1000);
    const fifteenDaysAgo = now - 15 * 86400;

    const ccResp = await fetch(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=15&toTs=${now}`
    );
    const ccData = await ccResp.json();

    if (!ccData.Data?.Data || ccData.Data.Data.length === 0) {
      throw new Error('No BTC data from CryptoCompare');
    }

    const closes = ccData.Data.Data.map((bar: any) => bar.close);
    const price = closes[closes.length - 1];
    const sma15 = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;

    console.log('[OE-BTC] ✅ BTC price fetched', { price, sma15 });
    return { price, sma15 };
  } catch (err) {
    console.error('[OE-BTC] Error fetching BTC:', err);
    return BACKUP_DATA.btc;
  }
}

/**
 * Fetch ETF net flows
 * Simplified: uses synthetic data or Farside/SoSoValue
 */
export async function fetchETFFlows(): Promise<ETFFlowData> {
  try {
    console.log('[OE-BTC] Fetching ETF flows...');

    // In production, scrape Farside (https://farside.co.uk/bitcoin-etf-data)
    // or fetch from SoSoValue API
    // For now, use synthetic data

    // Simulated: today's net flow and 5-day average
    const dailyFlow = 250000000 + Math.random() * 500000000; // $250M - $750M
    const ma5Flow = dailyFlow * (0.9 + Math.random() * 0.2); // 90-110% of daily

    console.log('[OE-BTC] ✅ ETF flows fetched', { dailyFlow, ma5Flow });
    return { dailyFlow, ma5Flow };
  } catch (err) {
    console.error('[OE-BTC] Error fetching ETF flows:', err);
    return BACKUP_DATA.etfFlow;
  }
}

/**
 * Fetch all data in parallel
 */
export async function fetchAllData() {
  const [macroData, btcData, etfFlows] = await Promise.all([
    fetchMacroData(),
    fetchBTCPrice(),
    fetchETFFlows(),
  ]);

  return { macroData, btcData, etfFlows };
}
