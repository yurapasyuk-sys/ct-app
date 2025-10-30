/**
 * VPIN API Route with Redis caching
 * Vercel Serverless Function
 */

import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ==================== TYPES ====================

interface AggTrade {
  a: number;
  p: string;
  q: string;
  f: number;
  l: number;
  T: number;
  m: boolean;
  M: boolean;
}

interface VPINBucket {
  time: number;
  vpin: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  trades: number;
  imbalance: number;
}

interface VPINData {
  symbol: string;
  timeframe: string;
  period: number;
  buckets: VPINBucket[];
  lastUpdate: number;
  stats: {
    avgVPIN: number;
    maxVPIN: number;
    minVPIN: number;
    currentVPIN: number;
  };
}

// ==================== BINANCE API ====================

async function fetchAggTrades(
  symbol: string,
  hours: number = 24
): Promise<AggTrade[]> {
  const url = 'https://fapi.binance.com/fapi/v1/aggTrades';
  const endTime = Date.now();
  const startTime = endTime - hours * 60 * 60 * 1000;
  
  console.log(`[binanceAPI] Fetching aggTrades for ${symbol} (last ${hours}h)`);
  
  const allTrades: AggTrade[] = [];
  let fromId: number | null = null;
  let iterationCount = 0;
  const maxIterations = 150;

  try {
    while (iterationCount < maxIterations) {
      iterationCount++;
      
      const params = new URLSearchParams({
        symbol,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        limit: '1000',
      });
      
      if (fromId !== null) {
        params.append('fromId', fromId.toString());
      }

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      }
      
      const trades = await response.json() as AggTrade[];

      if (!trades.length) {
        console.log(`[binanceAPI] No more trades, stopping at iteration ${iterationCount}`);
        break;
      }
      
      allTrades.push(...trades);
      
      const lastTradeTime = trades[trades.length - 1].T;
      if (lastTradeTime >= endTime) {
        console.log(`[binanceAPI] Reached end time at iteration ${iterationCount}`);
        break;
      }
      
      fromId = trades[trades.length - 1].a + 1;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[binanceAPI] ✅ Fetched ${allTrades.length} trades in ${iterationCount} iterations`);
    
    const filteredTrades = allTrades.filter(
      trade => trade.T >= startTime && trade.T <= endTime
    );
    
    console.log(`[binanceAPI] ✅ After filtering: ${filteredTrades.length} trades`);
    
    return filteredTrades;
  } catch (error) {
    console.error('[binanceAPI] Error fetching aggTrades:', error);
    throw error;
  }
}

// ==================== VPIN CALCULATION ====================

function getTimeframeMs(timeframe: string): number {
  const map: Record<string, number> = {
    'm1': 60 * 1000,
    'm5': 5 * 60 * 1000,
    'm15': 15 * 60 * 1000,
    'm30': 30 * 60 * 1000,
    'h1': 60 * 60 * 1000,
    'h4': 4 * 60 * 60 * 1000,
  };
  return map[timeframe.toLowerCase()] || 5 * 60 * 1000;
}

function calculateVPIN(
  trades: AggTrade[],
  timeframe: string = 'm5'
): VPINData {
  if (!trades.length) {
    throw new Error('No trades provided for VPIN calculation');
  }

  const bucketMs = getTimeframeMs(timeframe);
  const bucketMap = new Map<number, {
    buyVolume: number;
    sellVolume: number;
    trades: number;
  }>();

  console.log(`[calculateVPIN] Processing ${trades.length} trades with ${timeframe} buckets (${bucketMs}ms)`);

  for (const trade of trades) {
    const bucketTime = Math.floor(trade.T / bucketMs) * bucketMs;
    
    if (!bucketMap.has(bucketTime)) {
      bucketMap.set(bucketTime, {
        buyVolume: 0,
        sellVolume: 0,
        trades: 0,
      });
    }

    const bucket = bucketMap.get(bucketTime)!;
    const volume = parseFloat(trade.q) * parseFloat(trade.p);

    if (trade.m) {
      bucket.sellVolume += volume;
    } else {
      bucket.buyVolume += volume;
    }
    
    bucket.trades += 1;
  }

  const buckets: VPINBucket[] = Array.from(bucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, data]) => {
      const totalVolume = data.buyVolume + data.sellVolume;
      const imbalance = Math.abs(data.buyVolume - data.sellVolume);
      const vpin = totalVolume > 0 ? imbalance / totalVolume : 0;

      return {
        time,
        vpin: parseFloat(vpin.toFixed(4)),
        buyVolume: parseFloat(data.buyVolume.toFixed(2)),
        sellVolume: parseFloat(data.sellVolume.toFixed(2)),
        totalVolume: parseFloat(totalVolume.toFixed(2)),
        imbalance: parseFloat(imbalance.toFixed(2)),
        trades: data.trades,
      };
    });

  const vpinValues = buckets.map(b => b.vpin).filter(v => v > 0);
  const avgVPIN = vpinValues.length > 0
    ? vpinValues.reduce((sum, v) => sum + v, 0) / vpinValues.length
    : 0;
  const maxVPIN = vpinValues.length > 0 ? Math.max(...vpinValues) : 0;
  const minVPIN = vpinValues.length > 0 ? Math.min(...vpinValues) : 0;
  const currentVPIN = buckets.length > 0 ? buckets[buckets.length - 1].vpin : 0;

  console.log(`[calculateVPIN] ✅ Created ${buckets.length} buckets`);
  console.log(`[calculateVPIN] Stats: avg=${avgVPIN.toFixed(4)}, max=${maxVPIN.toFixed(4)}, current=${currentVPIN.toFixed(4)}`);

  return {
    symbol: 'BTCUSDT',
    timeframe,
    period: 24,
    buckets,
    lastUpdate: Date.now(),
    stats: {
      avgVPIN: parseFloat(avgVPIN.toFixed(4)),
      maxVPIN: parseFloat(maxVPIN.toFixed(4)),
      minVPIN: parseFloat(minVPIN.toFixed(4)),
      currentVPIN: parseFloat(currentVPIN.toFixed(4)),
    },
  };
}

// ==================== API HANDLER ====================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Redis client inside handler
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });

    const { symbol = 'BTCUSDT', tf = 'm5', hours = '24' } = req.query;
    const hoursNum = parseInt(hours as string);
    const cacheKey = `vpin:${symbol}:${tf}:${hoursNum}h`;

    console.log(`[VPIN API] Request: ${symbol} ${tf} ${hoursNum}h`);

    // 1. Check Redis cache
    console.log(`[VPIN API] Checking cache: ${cacheKey}`);
    const cached = await redis.get(cacheKey);

    if (cached) {
      console.log(`[VPIN API] ✅ Cache HIT: ${cacheKey}`);
      
      // Set cache headers
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
      res.setHeader('X-Cache-Status', 'HIT');
      
      return res.status(200).json(cached);
    }

    console.log(`[VPIN API] ❌ Cache MISS: ${cacheKey}`);
    console.log(`[VPIN API] Computing VPIN for ${symbol}...`);

    // 2. Fetch aggTrades from Binance
    const startTime = Date.now();
    const trades = await fetchAggTrades(symbol as string, hoursNum);
    const fetchTime = Date.now() - startTime;

    console.log(`[VPIN API] Fetched ${trades.length} trades in ${fetchTime}ms`);

    if (!trades.length) {
      return res.status(404).json({
        error: 'No trades found',
        symbol,
        timeframe: tf,
        hours: hoursNum,
      });
    }

    // 3. Calculate VPIN
    const calcStartTime = Date.now();
    const vpin = calculateVPIN(trades, tf as string);
    const calcTime = Date.now() - calcStartTime;

    console.log(`[VPIN API] Calculated VPIN in ${calcTime}ms`);
    console.log(`[VPIN API] Result: ${vpin.buckets.length} buckets, avg VPIN: ${vpin.stats.avgVPIN}`);

    // 4. Cache for 1 hour (3600 seconds)
    await redis.setex(cacheKey, 3600, JSON.stringify(vpin));
    console.log(`[VPIN API] ✅ Cached result for 1 hour`);

    // 5. Return response
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.setHeader('X-Cache-Status', 'MISS');
    res.setHeader('X-Fetch-Time', fetchTime.toString());
    res.setHeader('X-Calc-Time', calcTime.toString());

    return res.status(200).json(vpin);
  } catch (error) {
    console.error('[VPIN API] Error:', error);
    console.error('[VPIN API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[VPIN API] Env check:', {
      hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    
    return res.status(500).json({
      error: 'Failed to calculate VPIN',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined,
    });
  }
}
