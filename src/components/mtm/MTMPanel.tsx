/**
 * Market Tension Map Panel Component
 * Displays three timeframe panels with OHLC charts and tension histograms
 */

import { useState, useRef, useEffect, memo } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { OhlcChart } from '@/components/ohlc/OhlcChart';
import { SnapshotButton } from '@/components/SnapshotButton';
import { getRecommendedThreshold } from '@/lib/tension';
import type { DataSource } from '@/lib/binance';
import { Activity, RefreshCw } from 'lucide-react';

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

const SinglePanel = memo(function SinglePanel({ timeframe, symbol, dataSource }: SinglePanelProps) {
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
      className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500' : 'bg-green-500'} ${isLoading ? 'animate-pulse' : ''}`} />
          <div>
            <h2 className="text-lg font-semibold leading-none">
              {timeframe.label}
            </h2>
            <span className="text-xs text-muted-foreground">{timeframe.description}</span>
          </div>
        </div>

        <SnapshotButton 
          containerRef={containerRef} 
          symbol={symbol}
          timeframe={timeframe.label}
        />
      </div>

      {/* Chart Area */}
      <div className="flex-grow min-h-[400px] relative bg-secondary/5 rounded-lg border border-border/50 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive p-4 text-center">
            Error: {error}
          </div>
        ) : (
          <OhlcChart
            klines={klines}
            tensionData={tensionData}
            threshold={recommendedThreshold}
            height={400}
            className="w-full h-full"
          />
        )}
      </div>

      {/* Footer Stats */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-3">
        <div className="flex gap-3">
          <span>Candles: <span className="text-foreground font-mono">{klines.length}</span></span>
          <span>Tension: <span className="text-foreground font-mono">{tensionData.length}</span></span>
        </div>
        <div className="font-mono opacity-70">
          {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--:--'}
        </div>
      </div>
    </div>
  );
});

interface MTMPanelProps {
  symbol: string;
  dataSource?: DataSource;
}

export function MTMPanel({ symbol, dataSource = 'futures' }: MTMPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Market Tension Map</h2>
            <p className="text-sm text-muted-foreground">
              Real-time OHLC analysis with tension indicators
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
          <RefreshCw className="w-3 h-3 animate-spin-slow" />
          <span>Auto-refresh active (15s)</span>
        </div>
      </div>

      {/* Grid Layout for Timeframes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {TIMEFRAMES.map((tf) => (
          <SinglePanel key={tf.id} timeframe={tf} symbol={symbol} dataSource={dataSource} />
        ))}
      </div>
    </div>
  );
}
