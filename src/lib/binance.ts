/**
 * Binance API client for fetching klines with rate limiting and error handling
 */

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export type DataSource = 'spot' | 'futures';

export interface FetchKlinesParams {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  dataSource?: DataSource;
}

export interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

type BinanceKlineTuple = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  ...unknown[],
];

interface BinanceExchangeInfoSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  contractType: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  baseDelay: 500,
  maxDelay: 4000,
};

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(2, attempt),
    config.maxDelay
  );
  // Add jitter: random value between 0 and exponentialDelay
  const jitter = Math.random() * exponentialDelay;
  return jitter;
}

/**
 * Get base URL for Binance API based on data source
 */
function getBaseUrl(dataSource: DataSource): string {
  return dataSource === 'futures'
    ? 'https://fapi.binance.com/fapi/v1'
    : 'https://api.binance.com/api/v3';
}

/**
 * Parse raw Binance kline response into typed Kline objects
 */
function parseKlineResponse(raw: BinanceKlineTuple[]): Kline[] {
  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
    takerBuyBaseVolume: parseFloat(k[9]),
    takerBuyQuoteVolume: parseFloat(k[10]),
  }));
}

/**
 * Fetch klines from Binance with retry logic and exponential backoff
 */
export async function fetchKlines(
  params: FetchKlinesParams,
  signal?: AbortSignal
): Promise<Kline[]> {
  const {
    symbol,
    interval,
    startTime,
    endTime,
    limit = 1000,
    dataSource = 'spot',
  } = params;

  const baseUrl = getBaseUrl(dataSource);
  const url = new URL(`${baseUrl}/klines`);

  url.searchParams.set('symbol', symbol.replace('/', ''));
  url.searchParams.set('interval', interval);
  if (startTime) url.searchParams.set('startTime', startTime.toString());
  if (endTime) url.searchParams.set('endTime', endTime.toString());
  url.searchParams.set('limit', limit.toString());

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < DEFAULT_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url.toString(), { signal });

      // Handle rate limiting (HTTP 429) and server errors (5xx)
      if (response.status === 429 || response.status >= 500) {
        const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
        console.warn(
          `[Binance] ${response.status} error on attempt ${attempt + 1}/${
            DEFAULT_RETRY_CONFIG.maxRetries
          }. Retrying in ${delay.toFixed(0)}ms...`
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Handle other HTTP errors
      if (!response.ok) {
        throw new Error(
          `Binance API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from Binance API');
      }

      return parseKlineResponse(data);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If request was aborted, don't retry
      if (lastError.name === 'AbortError') {
        throw lastError;
      }

      // If this is the last attempt, throw the error
      if (attempt === DEFAULT_RETRY_CONFIG.maxRetries - 1) {
        break;
      }

      // Otherwise, wait and retry
      const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
      console.warn(
        `[Binance] Error on attempt ${attempt + 1}/${
          DEFAULT_RETRY_CONFIG.maxRetries
        }: ${lastError.message}. Retrying in ${delay.toFixed(0)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error('Failed to fetch klines from Binance');
}

/**
 * Calculate lookback start time from days ago
 */
export function calculateStartTime(daysBack: number): number {
  const now = Date.now();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return now - daysBack * millisecondsPerDay;
}

/**
 * Helper to get interval in milliseconds
 */
function getIntervalMs(interval: string): number {
  const unit = interval.slice(-1);
  const value = parseInt(interval.slice(0, -1));
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  if (unit === 'w') return value * 7 * 24 * 60 * 60 * 1000;
  return 0;
}

/**
 * Fetch list of all symbols from Binance Futures
 */
export async function fetchFuturesSymbols(signal?: AbortSignal): Promise<BinanceSymbol[]> {
  const baseUrl = getBaseUrl('futures');
  const url = `${baseUrl}/exchangeInfo`;

  try {
    const response = await fetch(url, { signal });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange info: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.symbols || !Array.isArray(data.symbols)) {
      throw new Error('Invalid exchange info response');
    }

    // Filter only TRADING symbols
    return (data.symbols as BinanceExchangeInfoSymbol[])
      .filter((s) => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
      .map((s) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
      }));
  } catch (error) {
    console.error('[fetchFuturesSymbols] Error:', error);
    throw error;
  }
}

/**
 * Fetch all available klines for a symbol from its listing date
 */
export async function fetchAllKlines(
  params: FetchKlinesParams,
  signal?: AbortSignal
): Promise<Kline[]> {
  const { symbol, interval, dataSource = 'futures' } = params;
  
  // Start from a very early date (Binance Futures launched in 2019)
  const earlyStartTime = new Date('2019-01-01').getTime();
  const now = Date.now();
  const intervalMs = getIntervalMs(interval);
  const batchSize = 1000;
  
  console.log(`[fetchAllKlines] Fetching complete history for ${symbol}`);

  const allKlines: Kline[] = [];
  let currentEndTime = now;
  let iterations = 0;
  const maxIterations = 500; // Safety limit

  while (iterations < maxIterations) {
    const batch = await fetchKlines(
      {
        symbol,
        interval,
        endTime: currentEndTime,
        limit: batchSize,
        dataSource,
      },
      signal
    );

    if (batch.length === 0) {
      break; // No more data
    }

    // Prepend to maintain chronological order
    allKlines.unshift(...batch);

    // Move endTime to the oldest candle we just fetched
    const oldestTime = batch[0].openTime;
    
    if (oldestTime <= earlyStartTime) {
      break; // Reached the beginning
    }

    // Set next endTime to 1ms before the oldest candle
    currentEndTime = oldestTime - 1;
    iterations++;

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Remove duplicates based on openTime
  const seenTimestamps = new Set<number>();
  const uniqueKlines = allKlines.filter(k => {
    if (seenTimestamps.has(k.openTime)) return false;
    seenTimestamps.add(k.openTime);
    return true;
  });

  console.log(`[fetchAllKlines] Fetched ${uniqueKlines.length} candles for ${symbol}`);
  return uniqueKlines.sort((a, b) => a.openTime - b.openTime);
}

/**
 * Fetch klines in multiple batches to overcome 1000-limit
 * Uses parallel requests for maximum speed
 */
export async function fetchKlinesMultiBatch(
  params: FetchKlinesParams,
  totalCandles: number,
  signal?: AbortSignal
): Promise<Kline[]> {
  const { symbol, interval, dataSource = 'spot' } = params;
  
  const batchSize = 1000;
  const batchesNeeded = Math.ceil(totalCandles / batchSize);
  const intervalMs = getIntervalMs(interval);
  
  console.log(`[fetchKlinesMultiBatch] Fetching ${totalCandles} candles in ${batchesNeeded} batches (Parallel)`);

  const now = Date.now();
  const promises: Promise<Kline[]>[] = [];

  // Generate all requests in parallel
  for (let i = 0; i < batchesNeeded; i++) {
    // Calculate endTime for this batch
    // Batch 0: ends at Now
    // Batch 1: ends at Now - (1000 * interval)
    // Batch 2: ends at Now - (2000 * interval)
    const endTime = now - (i * batchSize * intervalMs);
    
    promises.push(
      fetchKlines(
        {
          symbol,
          interval,
          endTime,
          limit: batchSize,
          dataSource,
        },
        signal
      )
    );
  }

  try {
    const results = await Promise.all(promises);
    
    // Merge all results
    const allKlines: Kline[] = [];
    const seenTimestamps = new Set<number>();
    
    // Process results (they might be out of order if we didn't await Promise.all, but Promise.all preserves order of input array)
    // However, let's be safe and sort everything at the end
    results.forEach(batch => {
      batch.forEach(k => {
        if (!seenTimestamps.has(k.openTime)) {
          seenTimestamps.add(k.openTime);
          allKlines.push(k);
        }
      });
    });
    
    // Sort by time ascending
    allKlines.sort((a, b) => a.openTime - b.openTime);
    
    console.log(`[fetchKlinesMultiBatch] Total fetched: ${allKlines.length} candles`);
    return allKlines;
    
  } catch (error) {
    console.error('[fetchKlinesMultiBatch] Error in parallel fetch:', error);
    throw error;
  }
}
