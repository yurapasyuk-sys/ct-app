/**
 * Market Tension Map Panel Component
 * Displays three timeframe panels with OHLC charts and tension histograms
 */

import { useState, useRef, useEffect } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { OhlcChart } from '@/components/ohlc/OhlcChart';
import { SnapshotButton } from '@/components/SnapshotButton';
import { getRecommendedThreshold } from '@/lib/tension';
import type { DataSource } from '@/lib/binance';

// Timeframe configurations
const TIMEFRAMES = [
  {
    id: 'm15',
    label: 'M15',
    interval: '15m',
    lookbackDays: 4,
    description: 'Last 4 Days',
  },
  {
    id: '1h',
    label: '1H',
    interval: '1h',
    lookbackDays: 10,
    description: 'Last 10 Days',
  },
  {
    id: '4h',
    label: '4H',
    interval: '4h',
    lookbackDays: 40,
    description: 'Last 40 Days',
  },
];

interface SinglePanelProps {
  timeframe: typeof TIMEFRAMES[0];
  symbol: string;
  dataSource: DataSource;
}

function SinglePanel({ timeframe, symbol, dataSource }: SinglePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { klines, tensionData, isLoading, error, lastUpdated, nextRefreshIn } =
    useKlines({
      symbol,
      interval: timeframe.interval,
      lookbackDays: timeframe.lookbackDays,
      minRefreshMs: 15000,
      dataSource,
    });

  const recommendedThreshold = getRecommendedThreshold(timeframe.interval);

  return (
    <div
      ref={containerRef}
      className="bg-card border border-border rounded-lg p-4 shadow-sm"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <h2 className="text-base lg:text-lg font-semibold">
              {timeframe.label} <span className="text-muted-foreground">({timeframe.description})</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SnapshotButton 
            containerRef={containerRef} 
            symbol={symbol}
            timeframe={timeframe.label}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-1">
          <span>Candles:</span>
          <span className="font-mono text-foreground">{klines.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Tension Points:</span>
          <span className="font-mono text-foreground">{tensionData.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Latest:</span>
          <span className="font-mono text-foreground">
            {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'N/A'}
          </span>
        </div>
        {nextRefreshIn > 0 && (
          <div className="flex items-center gap-1">
            <span>Next refresh:</span>
            <span className="font-mono text-foreground">{Math.ceil(nextRefreshIn / 1000)}s</span>
          </div>
        )}
      </div>

      {/* Chart */}
      {error ? (
        <div className="text-sm text-red-500 p-4 bg-red-500/10 rounded border border-red-500/20">
          Error: {error}
        </div>
      ) : (
        <OhlcChart
          klines={klines}
          tensionData={tensionData}
          threshold={recommendedThreshold}
          height={300}
          className="w-full"
        />
      )}
    </div>
  );
}

interface MTMPanelProps {
  symbol: string;
  dataSource?: DataSource;
}

export function MTMPanel({ symbol, dataSource = 'futures' }: MTMPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <span className="text-white text-sm font-bold">📊</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">Market Tension Map</h2>
            <p className="text-xs text-muted-foreground">
              Real-time OHLC analysis with tension indicators
            </p>
          </div>
        </div>
      </div>

      {/* Three Timeframe Panels */}
      {TIMEFRAMES.map((tf) => (
        <SinglePanel key={tf.id} timeframe={tf} symbol={symbol} dataSource={dataSource} />
      ))}
    </div>
  );
}
