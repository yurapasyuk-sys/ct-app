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
function parseKlineResponse(raw: any[]): Kline[] {
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
 * Fetch klines in multiple batches to overcome 1000-limit
 * Fetches in reverse chronological order (most recent first)
 */
export async function fetchKlinesMultiBatch(
  params: FetchKlinesParams,
  totalCandles: number,
  signal?: AbortSignal
): Promise<Kline[]> {
  const { symbol, interval, dataSource = 'spot' } = params;
  
  const batchSize = 1000;
  const batchesNeeded = Math.ceil(totalCandles / batchSize);
  
  console.log(`[fetchKlinesMultiBatch] Fetching ${totalCandles} candles in ${batchesNeeded} batches`);

  const allKlines: Kline[] = [];
  let endTime = Date.now();

  for (let i = 0; i < batchesNeeded; i++) {
    console.log(`[fetchKlinesMultiBatch] Batch ${i + 1}/${batchesNeeded}`);

    const batch = await fetchKlines(
      {
        symbol,
        interval,
        endTime,
        limit: batchSize,
        dataSource,
      },
      signal
    );

    if (batch.length === 0) {
      console.warn(`[fetchKlinesMultiBatch] Batch ${i + 1} returned 0 candles, stopping`);
      break;
    }

    // Add to beginning of array (since we're fetching backwards)
    allKlines.unshift(...batch);

    // Set next endTime to first candle's openTime - 1ms
    endTime = batch[0].openTime - 1;

    console.log(`[fetchKlinesMultiBatch] Batch ${i + 1} fetched ${batch.length} candles, total: ${allKlines.length}`);

    // Small delay to avoid rate limits (except for last batch)
    if (i < batchesNeeded - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  console.log(`[fetchKlinesMultiBatch] Total fetched: ${allKlines.length} candles`);
  return allKlines;
}

