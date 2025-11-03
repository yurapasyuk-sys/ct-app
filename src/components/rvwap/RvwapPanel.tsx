/**
 * RVWAP Panel with controls and chart
 */

import { useState, useEffect, useRef } from 'react';
import { RvwapChart } from './RvwapChart';
import { useMultiRvwap } from '@/hooks/useMultiRvwap';
import { Card } from '@/components/ui/card';
import { SnapshotButton } from '@/components/SnapshotButton';
import { TrendingUp } from 'lucide-react';
import type { DataSource } from '@/lib/binance';

interface RvwapPanelProps {
  symbol: string;
  dataSource: DataSource;
}

export function RvwapPanel({ symbol, dataSource }: RvwapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { rvwapData, klines, isLoading, error, lastUpdated } = useMultiRvwap(symbol, 'spot');

  // Debug logging
  useEffect(() => {
    console.log('[RvwapPanel] 🎨 Mounted and rendering');
    console.log('[RvwapPanel] 📊 State:', {
      symbol,
      dataPoints30d: rvwapData['30d'].length,
      dataPoints90d: rvwapData['90d'].length,
      dataPoints365d: rvwapData['365d'].length,
      isLoading,
      error,
    });
    const hasData = rvwapData['30d'].length > 0 || rvwapData['90d'].length > 0 || rvwapData['365d'].length > 0;
    console.log('[RvwapPanel] 🔍 Will render chart?', !isLoading && hasData);
  }, [symbol, rvwapData, isLoading, error]);

  // Status color
  const statusColor = error ? 'bg-red-500' : isLoading ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div ref={containerRef} className="relative">
      <Card 
        className="p-4 bg-card border border-border w-full relative" 
        data-testid="rvwap-root"
      >
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-blue-400" />
          <h3 className="text-lg font-semibold">
            Rolling VWAP
          </h3>
          <div className={`w-2 h-2 rounded-full ${statusColor}`} title={error ? 'Error' : isLoading ? 'Loading' : 'OK'} />
        </div>
        
        <div className="flex items-center gap-4">
          {/* Snapshot Button */}
          <div data-snapshot-hide>
            <SnapshotButton
              containerRef={containerRef}
              symbol={symbol}
              timeframe="RVWAP_Multi"
            />
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground font-mono">
              Updated: {lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Chart */}
      {!isLoading && (rvwapData['30d'].length > 0 || rvwapData['90d'].length > 0 || rvwapData['365d'].length > 0) && (
        <>
          <div className="mb-2" style={{ minHeight: '400px' }}>
            <RvwapChart multiData={rvwapData} klines={klines} height={400} />
          </div>
          
          {/* Legend */}
          <div className="mb-3 flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-blue-500"></div>
              <span className="text-muted-foreground">30D RVWAP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-cyan-400"></div>
              <span className="text-muted-foreground">90D RVWAP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-sky-500"></div>
              <span className="text-muted-foreground">365D RVWAP</span>
            </div>
          </div>
        </>
      )}

      {/* Loading placeholder to prevent layout shift */}
      {isLoading && (
        <div className="mb-3 flex items-center justify-center bg-[#1a1a1a] rounded-lg" style={{ minHeight: '400px', height: '400px' }}>
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="text-sm text-muted-foreground">Loading RVWAP data...</span>
          </div>
        </div>
      )}
      
      {/* Debug: why chart not rendering */}
      {isLoading && (rvwapData['30d'].length > 0 || rvwapData['90d'].length > 0) && (
        <div className="text-xs text-yellow-500">
          ⚠️ DEBUG: isLoading=true blocks chart (data ready: {rvwapData['30d'].length}/{rvwapData['90d'].length}/{rvwapData['365d'].length} points)
        </div>
      )}
      {!isLoading && rvwapData['30d'].length === 0 && rvwapData['90d'].length === 0 && rvwapData['365d'].length === 0 && (
        <div className="text-xs text-red-500">
          ⚠️ DEBUG: No data (isLoading=false, all periods empty)
        </div>
      )}

      {/* Stats */}
      {(rvwapData['30d'].length > 0 || rvwapData['90d'].length > 0 || rvwapData['365d'].length > 0) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <div className="font-mono">
            <span className="text-muted-foreground">30D Points:</span>{' '}
            <span className="text-blue-400 font-semibold">{rvwapData['30d'].length}</span>
          </div>
          <div className="font-mono">
            <span className="text-muted-foreground">90D Points:</span>{' '}
            <span className="text-cyan-400 font-semibold">{rvwapData['90d'].length}</span>
          </div>
          <div className="font-mono">
            <span className="text-muted-foreground">365D Points:</span>{' '}
            <span className="text-sky-400 font-semibold">{rvwapData['365d'].length}</span>
          </div>
          {rvwapData['90d'].length > 0 && (
            <div className="font-mono">
              <span className="text-muted-foreground">90D VWAP:</span>{' '}
              <span className="text-foreground">
                ${rvwapData['90d'][rvwapData['90d'].length - 1]?.vwap.toFixed(2) || 'N/A'}
              </span>
            </div>
          )}
          <div className="font-mono">
            <span className="text-muted-foreground">Base:</span>{' '}
            <span className="text-foreground">1H</span>
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
