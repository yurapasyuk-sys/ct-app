/**
 * useScreenerData Hook
 * Fetches and processes Binance data for the Screener
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScreenerRow,
  SymbolInfo,
  BinanceFuturesTicker,
  BinanceMarkPrice,
  BinanceBookTicker,
  KlineData,
} from '@/lib/screener/types';
import {
  fetchFuturesSymbols,
  fetchFuturesTickers,
  fetchMarkPrices,
  fetchFuturesBookTickers,
  fetchFuturesKlines,
  fetchOpenInterestHistory,
} from '@/lib/screener/api';
import {
  calculateVolatility,
  calculatePriceChange,
  calculateVolumeSum,
  calculateVolumeDelta,
  calculateOIChange,
} from '@/lib/screener/calculations';

// ============================================
// TYPES
// ============================================

interface UseScreenerDataResult {
  data: ScreenerRow[];
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  refresh: () => void;
}

interface SymbolKlinesCache {
  [symbol: string]: {
    klines1m: KlineData[];
    klines5m: KlineData[];
    klines1h: KlineData[];
    lastFetch: number;
  };
}

// ============================================
// CONSTANTS
// ============================================

const REFRESH_INTERVAL = 10000; // 10 seconds
const KLINE_CACHE_TTL = 10000; // 10 seconds (refresh cache more often)
const BATCH_SIZE = 20; // Process symbols in batches

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useScreenerData(): UseScreenerDataResult {
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  
  const klinesCache = useRef<SymbolKlinesCache>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Build screener row from API data
  const buildScreenerRow = useCallback((
    symbolInfo: SymbolInfo,
    ticker: BinanceFuturesTicker | undefined,
    markPrice: BinanceMarkPrice | undefined,
    bookTicker: BinanceBookTicker | undefined,
    klines1m: KlineData[],
    klines5m: KlineData[],
    klines1h: KlineData[],
    oiData: { oiChange: number | null; currentOI: number | null } | null
  ): ScreenerRow => {
    const price = ticker ? parseFloat(ticker.lastPrice) : 0;
    const mark = markPrice ? parseFloat(markPrice.markPrice) : null;
    
    // Order book data
    const bid = bookTicker ? parseFloat(bookTicker.bidPrice) : null;
    const ask = bookTicker ? parseFloat(bookTicker.askPrice) : null;
    const spread = bid && ask ? ask - bid : null;
    const spreadPercent = bid && ask && bid > 0 ? ((ask - bid) / bid) * 100 : null;
    
    // Calculate metrics from klines
    // Ticks 5m: sum of trades from last 5 x 1m candles
    const ticks5m = klines1m.length >= 5 
      ? klines1m.slice(-5).reduce((sum, k) => sum + k.trades, 0) 
      : (klines1m.length > 0 ? klines1m.reduce((sum, k) => sum + k.trades, 0) : null);
    
    // Change 5m: price change over last 5 minutes using 1m klines
    const change5m = klines1m.length >= 5 
      ? ((klines1m[klines1m.length - 1].close - klines1m[klines1m.length - 5].open) / klines1m[klines1m.length - 5].open) * 100
      : (klines5m.length >= 2 ? ((klines5m[klines5m.length - 1].close - klines5m[klines5m.length - 2].open) / klines5m[klines5m.length - 2].open) * 100 : null);
    
    const volume5m = calculateVolumeSum(klines1m, 5);
    // Volatility 15m: using last 15 x 1m candles
    const volatility15m = calculateVolatility(klines1m.slice(-15));
    const volume1h = calculateVolumeSum(klines1m, 60);
    // Vdelta 1h: (buyVolume - sellVolume) for last hour
    const vdelta1h = calculateVolumeDelta(klines1m.length >= 60 ? klines1m.slice(-60) : klines1m);
    
    // 1d change from ticker
    const change1d = ticker ? parseFloat(ticker.priceChangePercent) : null;
    
    // Funding rate
    const fundingRate = markPrice ? parseFloat(markPrice.lastFundingRate) : null;
    const nextFundingTime = markPrice ? markPrice.nextFundingTime : null;
    
    // OI data from history
    const openInterest = oiData?.currentOI ?? null;
    const openInterestValue = oiData?.currentOI ?? null; // Same value (already in USDT)
    const oiChange8h = oiData?.oiChange ?? null;
    
    // Market cap estimation (not available directly from Binance)
    const marketCap = null;
    
    return {
      symbol: symbolInfo.symbol,
      baseAsset: symbolInfo.baseAsset,
      quoteAsset: symbolInfo.quoteAsset,
      price,
      markPrice: mark,
      priceChangePercent24h: ticker ? parseFloat(ticker.priceChangePercent) : 0,
      volume24h: ticker ? parseFloat(ticker.volume) : 0,
      quoteVolume24h: ticker ? parseFloat(ticker.quoteVolume) : 0,
      highPrice24h: ticker ? parseFloat(ticker.highPrice) : 0,
      lowPrice24h: ticker ? parseFloat(ticker.lowPrice) : 0,
      trades24h: ticker ? ticker.count : 0,
      bidPrice: bid,
      askPrice: ask,
      spread,
      spreadPercent,
      openInterest,
      openInterestValue,
      fundingRate,
      nextFundingTime,
      ticks5m,
      change5m,
      volume5m,
      volatility15m,
      volume1h,
      vdelta1h,
      oiChange8h,
      change1d,
      marketCap,
      imbalance: null,
      tickVolatility: volatility15m,
      microtrend: null,
      lastUpdate: Date.now(),
      isFutures: true,
    };
  }, []);
  
  // Fetch klines for a batch of symbols
  const fetchKlinesForSymbols = useCallback(async (
    symbols: string[],
    signal: AbortSignal
  ): Promise<void> => {
    const now = Date.now();
    
    for (const symbol of symbols) {
      // Check cache
      const cached = klinesCache.current[symbol];
      if (cached && now - cached.lastFetch < KLINE_CACHE_TTL) {
        continue;
      }
      
      try {
        const [klines1m, klines5m, klines1h] = await Promise.all([
          fetchFuturesKlines(symbol, '1m', 60, signal),
          fetchFuturesKlines(symbol, '5m', 12, signal),
          fetchFuturesKlines(symbol, '1h', 24, signal),
        ]);
        
        klinesCache.current[symbol] = {
          klines1m,
          klines5m,
          klines1h,
          lastFetch: now,
        };
      } catch (err) {
        // Silently skip failed symbols
        console.warn(`Failed to fetch klines for ${symbol}`);
      }
    }
  }, []);
  
  // Fetch OI history for symbols
  const fetchOIHistory = useCallback(async (
    symbols: string[],
    signal: AbortSignal
  ): Promise<Map<string, { oiChange: number | null; currentOI: number | null }>> => {
    const result = new Map<string, { oiChange: number | null; currentOI: number | null }>();
    
    // Fetch in small batches to avoid rate limits
    for (let i = 0; i < symbols.length; i += 5) {
      const batch = symbols.slice(i, i + 5);
      
      const promises = batch.map(async (symbol) => {
        try {
          // Fetch 10 hourly records to ensure we have 8+ hours of history
          const history = await fetchOpenInterestHistory(symbol, '1h', 10, signal);
          
          if (history.length === 0) {
            return { symbol, oiChange: null, currentOI: null };
          }
          
          // Sort by timestamp ascending to get correct current value
          const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
          
          const oiChange = calculateOIChange(history, 8);
          // Get current OI from the latest (sorted) history entry
          const currentOI = parseFloat(sorted[sorted.length - 1].sumOpenInterestValue);
          
          return { symbol, oiChange, currentOI: isNaN(currentOI) ? null : currentOI };
        } catch {
          return { symbol, oiChange: null, currentOI: null };
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(r => result.set(r.symbol, { oiChange: r.oiChange, currentOI: r.currentOI }));
      
      // Small delay between batches
      if (i + 5 < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return result;
  }, []);
  
  // Main data fetching function
  const fetchData = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch base data in parallel
      const [symbols, tickers, markPrices, bookTickers] = await Promise.all([
        fetchFuturesSymbols(signal),
        fetchFuturesTickers(signal),
        fetchMarkPrices(signal),
        fetchFuturesBookTickers(signal),
      ]);
      
      // Create lookup maps
      const tickerMap = new Map(tickers.map(t => [t.symbol, t]));
      const markPriceMap = new Map(markPrices.map(m => [m.symbol, m]));
      const bookTickerMap = new Map(bookTickers.map(b => [b.symbol, b]));
      
      // Filter to USDT pairs only and sort alphabetically, take first 50
      const usdtSymbols = symbols
        .filter(s => s.quoteAsset === 'USDT')
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .slice(0, 50);
      
      // Fetch klines for all 50 symbols
      await fetchKlinesForSymbols(usdtSymbols.map(s => s.symbol), signal);
      
      // Fetch OI history for all 50 symbols
      const oiMap = await fetchOIHistory(usdtSymbols.map(s => s.symbol), signal);
      
      // Build screener rows
      const rows: ScreenerRow[] = usdtSymbols.map(symbolInfo => {
        const cached = klinesCache.current[symbolInfo.symbol] || {
          klines1m: [],
          klines5m: [],
          klines1h: [],
        };
        
        return buildScreenerRow(
          symbolInfo,
          tickerMap.get(symbolInfo.symbol),
          markPriceMap.get(symbolInfo.symbol),
          bookTickerMap.get(symbolInfo.symbol),
          cached.klines1m,
          cached.klines5m,
          cached.klines1h,
          oiMap.get(symbolInfo.symbol) ?? null
        );
      });
      
      // Keep alphabetical order (already sorted)
      setData(rows);
      setLastUpdate(Date.now());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      console.error('Screener fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [buildScreenerRow, fetchKlinesForSymbols, fetchOIHistory]);
  
  // Initial fetch and interval
  useEffect(() => {
    fetchData();
    
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData]);
  
  return {
    data,
    loading,
    error,
    lastUpdate,
    refresh: fetchData,
  };
}
