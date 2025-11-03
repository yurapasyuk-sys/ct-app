/**
 * VPIN Panel Component
 * Main container for VPIN display with chart and statistics
 */

import { useRef } from 'react';
import { useVPIN } from '@/hooks/useVPIN';
import { VPINChart } from './VPINChart';
import { Card } from '@/components/ui/card';
import { SnapshotButton } from '@/components/SnapshotButton';
import { Watermark } from '@/components/Watermark';
import { Activity } from 'lucide-react';

interface VPINPanelProps {
  symbol?: string;
  timeframe?: string;
  hours?: number;
}

export function VPINPanel({ 
  symbol = 'BTCUSDT', 
  timeframe = 'm5',
  hours = 24 
}: VPINPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error, lastUpdated } = useVPIN({
    symbol,
    timeframe,
    hours,
  });

  // Status indicator color
  const statusColor = error ? 'bg-red-500' : isLoading ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div ref={containerRef} className="relative">
      <Card className="p-6 bg-card border border-border w-full relative">
        {/* Watermark */}
        <div className="absolute inset-0 pointer-events-none">
          <Watermark visible={!isLoading} text="borkiss.trade" opacity={0.04} fontSize={48} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-xl font-semibold">VPIN</h3>
              <p className="text-xs text-muted-foreground">
                Volume-Synchronized Probability of Informed Trading
              </p>
            </div>
            <div className={`w-2 h-2 rounded-full ${statusColor}`} title={error ? 'Error' : isLoading ? 'Loading' : 'OK'} />
          </div>

          <div className="flex items-center gap-4">
            {/* Snapshot Button */}
            <div data-snapshot-hide>
              <SnapshotButton
                containerRef={containerRef}
                symbol={symbol}
                timeframe={`VPIN_${timeframe.toUpperCase()}`}
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
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="mb-4 flex items-center justify-center bg-[#1a1a1a] rounded-lg" style={{ minHeight: '400px', height: '400px' }}>
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <span className="text-sm text-muted-foreground">Fetching trades from Binance...</span>
              <span className="text-xs text-muted-foreground/60">This may take 10-20 seconds</span>
            </div>
          </div>
        )}

        {/* Chart */}
        {!isLoading && data && (
          <>
            <div className="mb-4" style={{ minHeight: '400px' }}>
              <VPINChart data={data} height={400} />
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-[#1a1a1a] rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Current VPIN</div>
                <div className="text-lg font-bold text-cyan-400">
                  {data.currentVPIN.toFixed(4)}
                </div>
              </div>
              
              <div className="bg-[#1a1a1a] rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Average VPIN</div>
                <div className="text-lg font-bold">
                  {data.avgVPIN.toFixed(4)}
                </div>
              </div>
              
              <div className="bg-[#1a1a1a] rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Max VPIN</div>
                <div className="text-lg font-bold text-red-500">
                  {Math.max(...data.buckets.map(b => b.vpin)).toFixed(4)}
                </div>
              </div>
              
              <div className="bg-[#1a1a1a] rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-1">Min VPIN</div>
                <div className="text-lg font-bold text-green-500">
                  {Math.min(...data.buckets.map(b => b.vpin)).toFixed(4)}
                </div>
              </div>
            </div>

            {/* Legend & Info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-muted-foreground">Timeframe:</span>{' '}
                  <span className="text-foreground font-mono">{timeframe.toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Period:</span>{' '}
                  <span className="text-foreground font-mono">{hours}H</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Buckets:</span>{' '}
                  <span className="text-foreground font-mono">{data.buckets.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Source:</span>{' '}
                  <span className="text-foreground font-mono">CryptoCompare</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-amber-500"></div>
                  <span>High (0.5)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-red-500"></div>
                  <span>Critical (0.75)</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* No data state */}
        {!isLoading && !error && !data && (
          <div className="text-center py-8 text-muted-foreground">
            No VPIN data available
          </div>
        )}
      </Card>
    </div>
  );
}
