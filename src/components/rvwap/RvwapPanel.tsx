/**
 * RVWAP Panel with controls and chart
 */

import { useEffect, useRef, memo } from 'react';
import { RvwapChart } from './RvwapChart';
import { useMultiRvwap } from '@/hooks/useMultiRvwap';
import { Card } from '@/components/ui/card';
import { SnapshotButton } from '@/components/SnapshotButton';
import { TrendingUp, RefreshCw } from 'lucide-react';
import type { DataSource } from '@/lib/binance';

interface RvwapPanelProps {
  symbol: string;
  dataSource: DataSource;
}

export const RvwapPanel = memo(function RvwapPanel({ symbol, dataSource }: RvwapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { rvwapData, klines, isLoading, error, lastUpdated } = useMultiRvwap(symbol, 'spot');

  const hasData = rvwapData['30d'].length > 0 || rvwapData['90d'].length > 0 || rvwapData['365d'].length > 0;

  return (
    <div ref={containerRef} className="relative space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Rolling VWAP</h2>
            <p className="text-sm text-muted-foreground">
              Volume-Weighted Average Price models
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border">
              <RefreshCw className="w-3 h-3" />
              <span>Updated: {lastUpdated.toLocaleTimeString('en-US', { hour12: false })}</span>
            </div>
          )}
          
          <div data-snapshot-hide>
            <SnapshotButton
              containerRef={containerRef}
              symbol={symbol}
              timeframe="RVWAP_Multi"
            />
          </div>
        </div>
      </div>

      <Card 
        className="p-1 bg-card border border-border w-full relative overflow-hidden shadow-sm" 
        data-testid="rvwap-root"
      >
        {/* Error display */}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center gap-2">
              <span>Error loading data: {error}</span>
            </div>
          </div>
        )}

        {/* Chart Container */}
        <div className="relative min-h-[500px] bg-secondary/5 rounded-lg">
          {isLoading && !hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground animate-pulse">Calculating VWAP models...</span>
            </div>
          )}

          {hasData && (
            <RvwapChart multiData={rvwapData} klines={klines} height={500} />
          )}
        </div>
      </Card>

      {/* Legend & Stats */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm font-medium">30D RVWAP</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{rvwapData['30d'].length} pts</span>
          </div>
          
          <div className="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400" />
              <span className="text-sm font-medium">90D RVWAP</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono text-muted-foreground">{rvwapData['90d'].length} pts</span>
              {rvwapData['90d'].length > 0 && (
                <span className="text-xs font-mono font-semibold text-foreground">
                  ${rvwapData['90d'][rvwapData['90d'].length - 1]?.vwap.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-sky-500" />
              <span className="text-sm font-medium">365D RVWAP</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{rvwapData['365d'].length} pts</span>
          </div>
        </div>
      )}
    </div>
  );
});
