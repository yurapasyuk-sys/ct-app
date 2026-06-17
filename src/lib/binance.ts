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

export type DataSource = 'spot' | 'futures' | 'okx-swap' | 'yahoo-fx' | 'yahoo-stock';

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

type OkxCandleTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

interface OkxCandlesResponse {
  code: string;
  msg: string;
  data: OkxCandleTuple[];
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
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

const YAHOO_ONE_MINUTE_CHUNK_MS = 7 * 24 * 60 * 60 * 1000;

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
  if (dataSource === 'okx-swap') {
    return 'https://www.okx.com/api/v5';
  }

  if (dataSource === 'yahoo-fx' || dataSource === 'yahoo-stock') {
    return typeof window === 'undefined'
      ? 'https://query1.finance.yahoo.com'
      : '/api/yahoo-chart';
  }

  return dataSource === 'futures'
    ? 'https://fapi.binance.com/fapi/v1'
    : 'https://api.binance.com/api/v3';
}

function getOkxInstrumentId(symbol: string) {
  const normalized = symbol.replace('/', '').toUpperCase();

  if (!normalized.endsWith('USDT')) {
    return `${normalized}-SWAP`;
  }

  return `${normalized.replace('USDT', '')}-USDT-SWAP`;
}

function getOkxBar(interval: string) {
  if (interval.endsWith('h')) {
    return `${interval.slice(0, -1)}H`;
  }

  return interval;
}

function getYahooSymbol(symbol: string, dataSource: DataSource = 'yahoo-fx') {
  if (dataSource === 'yahoo-stock') {
    const mapped: Record<string, string> = {
      XAUUSD: 'GC=F',
      XAGUSD: 'SI=F',
      US100: 'NQ=F',
      US30: 'YM=F',
      SPX500: 'ES=F',
      UK100: '^FTSE',
      FRA40: '^FCHI',
      JP225: '^N225',
      WTI: 'CL=F',
      BRENT: 'BZ=F',
    };
    const normalized = symbol.replace(/[/_-]/g, '').toUpperCase();
    return mapped[normalized] ?? symbol.toUpperCase();
  }

  const normalized = symbol.replace(/[/_-]/g, '').toUpperCase();

  return normalized.endsWith('=X') ? normalized : `${normalized}=X`;
}

function getYahooInterval(interval: string) {
  if (interval === '1h') return '60m';

  return interval;
}

function parseYahooChartResponse(payload: YahooChartResponse, interval: string): Kline[] {
  const error = payload.chart?.error;
  if (error) {
    throw new Error(error.description || error.code || 'Yahoo Finance chart error');
  }

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || !timestamps.length) {
    return [];
  }

  const intervalMs = getIntervalMs(interval);
  const klines: Kline[] = [];

  for (let index = 0; index < timestamps.length; index++) {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];

    if (open == null || high == null || low == null || close == null) {
      continue;
    }

    const openTime = timestamps[index] * 1000;
    const volume = quote.volume?.[index] ?? 0;
    klines.push({
      openTime,
      open,
      high,
      low,
      close,
      volume,
      closeTime: openTime + intervalMs - 1,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    });
  }

  return klines.sort((a, b) => a.openTime - b.openTime);
}

async function fetchYahooFxKlines(
  params: FetchKlinesParams,
  signal?: AbortSignal
): Promise<Kline[]> {
  const { symbol, interval, startTime, endTime = Date.now(), limit = 1000, dataSource = 'yahoo-fx' } = params;
  const intervalMs = getIntervalMs(interval);
  const fallbackStartTime = endTime - Math.ceil(limit * intervalMs * 3);
  const period1 = Math.floor((startTime ?? fallbackStartTime) / 1000);
  const period2 = Math.floor(endTime / 1000);
  const url = new URL(
    `${getBaseUrl(dataSource ?? 'yahoo-fx')}/v8/finance/chart/${encodeURIComponent(
      getYahooSymbol(symbol, dataSource)
    )}`,
    typeof window === 'undefined' ? undefined : window.location.origin
  );

  url.searchParams.set('interval', getYahooInterval(interval));
  url.searchParams.set('period1', period1.toString());
  url.searchParams.set('period2', period2.toString());
  url.searchParams.set('includePrePost', dataSource === 'yahoo-stock' ? 'false' : 'true');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < DEFAULT_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url.toString(), { signal });

      if (response.status === 429 || response.status >= 500) {
        const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
        console.warn(
          `[Yahoo FX] ${response.status} error on attempt ${attempt + 1}/${
            DEFAULT_RETRY_CONFIG.maxRetries
          }. Retrying in ${delay.toFixed(0)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as YahooChartResponse | null;
        const chartError = errorPayload?.chart?.error;
        const message = chartError?.description || chartError?.code || response.statusText;

        throw new Error(`Yahoo API error: ${response.status} ${message}`);
      }

      const payload = (await response.json()) as YahooChartResponse;
      return parseYahooChartResponse(payload, interval).slice(-limit);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'AbortError') {
        throw lastError;
      }

      if (attempt === DEFAULT_RETRY_CONFIG.maxRetries - 1) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
      console.warn(
        `[Yahoo FX] Error on attempt ${attempt + 1}/${
          DEFAULT_RETRY_CONFIG.maxRetries
        }: ${lastError.message}. Retrying in ${delay.toFixed(0)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to fetch klines from Yahoo');
}

function parseOkxCandleResponse(raw: OkxCandleTuple[], interval: string): Kline[] {
  const intervalMs = getIntervalMs(interval);

  return raw
    .filter((candle) => candle[8] === '1')
    .map((candle) => {
      const openTime = Number(candle[0]);
      return {
        openTime,
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        closeTime: openTime + intervalMs - 1,
        quoteVolume: parseFloat(candle[7]),
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      };
    })
    .sort((a, b) => a.openTime - b.openTime);
}

async function fetchOkxKlines(
  params: FetchKlinesParams,
  signal?: AbortSignal
): Promise<Kline[]> {
  const { symbol, interval, endTime, limit = 100 } = params;
  const url = new URL(`${getBaseUrl('okx-swap')}/market/history-candles`);

  url.searchParams.set('instId', getOkxInstrumentId(symbol));
  url.searchParams.set('bar', getOkxBar(interval));
  url.searchParams.set('limit', Math.min(limit, 300).toString());
  if (endTime) url.searchParams.set('after', endTime.toString());

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < DEFAULT_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url.toString(), { signal });

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const delay = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
        console.warn(
          `[OKX] ${response.status} error on attempt ${attempt + 1}/${
            DEFAULT_RETRY_CONFIG.maxRetries
          }. Retrying in ${delay.toFixed(0)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OKX API error: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as OkxCandlesResponse;

      if (payload.code !== '0' || !Array.isArray(payload.data)) {
        throw new Error(payload.msg || 'Invalid response format from OKX API');
      }

      return parseOkxCandleResponse(payload.data, interval);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'AbortError') {
        throw lastError;
      }

      if (attempt === DEFAULT_RETRY_CONFIG.maxRetries - 1) {
        break;
      }

      const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
      console.warn(
        `[OKX] Error on attempt ${attempt + 1}/${
          DEFAULT_RETRY_CONFIG.maxRetries
        }: ${lastError.message}. Retrying in ${delay.toFixed(0)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to fetch klines from OKX');
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

  if (dataSource === 'okx-swap') {
    return fetchOkxKlines(params, signal);
  }

  if (dataSource === 'yahoo-fx' || dataSource === 'yahoo-stock') {
    return fetchYahooFxKlines(params, signal);
  }

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

  if (dataSource === 'okx-swap') {
    const batchSize = 300;
    const allKlines: Kline[] = [];
    const seenTimestamps = new Set<number>();
    let cursor: number | undefined = params.endTime;
    let iterations = 0;
    const maxIterations = Math.ceil(totalCandles / batchSize) + 20;

    console.log(`[fetchKlinesMultiBatch] Fetching ${totalCandles} OKX candles sequentially`);

    while (allKlines.length < totalCandles && iterations < maxIterations) {
      const batch = await fetchOkxKlines(
        {
          symbol,
          interval,
          endTime: cursor,
          limit: batchSize,
          dataSource,
        },
        signal
      );

      if (batch.length === 0) {
        break;
      }

      const previousCursor = cursor;

      for (const kline of batch) {
        if (!seenTimestamps.has(kline.openTime)) {
          seenTimestamps.add(kline.openTime);
          allKlines.push(kline);
        }
      }

      const oldest = batch[0];
      cursor = oldest.openTime;
      iterations += 1;

      await new Promise((resolve) => setTimeout(resolve, 140));

      if (previousCursor === cursor) {
        break;
      }
    }

    const sorted = allKlines.sort((a, b) => a.openTime - b.openTime).slice(-totalCandles);
    console.log(`[fetchKlinesMultiBatch] Total fetched from OKX: ${sorted.length} candles`);
    return sorted;
  }

  if (dataSource === 'yahoo-fx' || dataSource === 'yahoo-stock') {
    const intervalMs = getIntervalMs(interval);
    const endTime = params.endTime ?? Date.now();
    const startTime = params.startTime ?? endTime - Math.ceil(totalCandles * intervalMs);
    const needsChunking =
      interval === '1m' && endTime - startTime > YAHOO_ONE_MINUTE_CHUNK_MS;

    if (needsChunking) {
      const allKlines: Kline[] = [];
      const seenTimestamps = new Set<number>();
      let cursor = startTime;

      while (cursor < endTime) {
        const chunkEnd = Math.min(cursor + YAHOO_ONE_MINUTE_CHUNK_MS, endTime);
        const chunkLimit = Math.ceil((chunkEnd - cursor) / intervalMs) + 10;
        const chunk = await fetchYahooFxKlines(
          {
            symbol,
            interval,
            startTime: cursor,
            endTime: chunkEnd,
            limit: chunkLimit,
            dataSource,
          },
          signal
        );

        for (const kline of chunk) {
          if (!seenTimestamps.has(kline.openTime)) {
            seenTimestamps.add(kline.openTime);
            allKlines.push(kline);
          }
        }

        cursor = chunkEnd + intervalMs;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      const sorted = allKlines.sort((a, b) => a.openTime - b.openTime).slice(-totalCandles);
      console.log(`[fetchKlinesMultiBatch] Total fetched from Yahoo: ${sorted.length} candles`);
      return sorted;
    }

    const klines = await fetchYahooFxKlines(
      {
        symbol,
        interval,
        startTime,
        endTime,
        limit: totalCandles,
        dataSource,
      },
      signal
    );

    console.log(`[fetchKlinesMultiBatch] Total fetched from Yahoo: ${klines.length} candles`);
    return klines;
  }
  
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
