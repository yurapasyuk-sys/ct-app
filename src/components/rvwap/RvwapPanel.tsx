/**
 * RVWAP Panel with controls and chart
 */

import { useState, useEffect } from 'react';
import { RvwapChart } from './RvwapChart';
import { useRvwap } from '@/hooks/useRvwap';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DataSource } from '@/lib/binance';

interface RvwapPanelProps {
  symbol: string;
  dataSource: DataSource;
}

const PERIODS = [
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '365d', label: '365 Days' },
];

const TIMEFRAMES = [
  { value: '15m', label: 'M15' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
];

export function RvwapPanel({ symbol, dataSource }: RvwapPanelProps) {
  const [period, setPeriod] = useState('90d');
  const [timeframe, setTimeframe] = useState('1h');

  const { rvwapData, isLoading, error, lastUpdated } = useRvwap({
    symbol,
    interval: timeframe,
    period,
    dataSource,
    enabled: true,
  });

  // Debug logging
  useEffect(() => {
    console.log('[RvwapPanel] Mounted and rendering');
    console.log('[RvwapPanel] State:', {
      symbol,
      period,
      timeframe,
      dataPoints: rvwapData.length,
      isLoading,
      error,
    });
  }, [symbol, period, timeframe, rvwapData, isLoading, error]);

  // Status color
  const statusColor = error ? 'bg-red-500' : isLoading ? 'bg-amber-500' : 'bg-green-500';

  return (
    <Card 
      className="p-4 bg-card border border-border w-full relative" 
      data-testid="rvwap-root"
    >
      {/* Visible Debug Badge */}
      <div className="absolute top-4 right-4 z-50 px-3 py-1 bg-emerald-500/20 border-2 border-emerald-500 rounded-md text-emerald-400 text-xs font-bold shadow-lg">
        RVWAP ACTIVE
      </div>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            Rolling VWAP
          </h3>
          <div className={`w-2 h-2 rounded-full ${statusColor}`} title={error ? 'Error' : isLoading ? 'Loading' : 'OK'} />
        </div>
        
        <div className="flex items-center gap-4">
          {/* Period Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Period:</span>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Timeframe:</span>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-[100px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* Loading state */}
      {isLoading && rvwapData.length === 0 && (
        <div className="flex items-center justify-center h-[400px] text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="text-sm">Loading RVWAP data...</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {!isLoading && rvwapData.length > 0 && (
        <div className="mb-3">
          <RvwapChart data={rvwapData} height={400} />
        </div>
      )}

      {/* Stats */}
      {rvwapData.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="font-mono">
            <span className="text-muted-foreground">Data Points:</span>{' '}
            <span className="text-foreground">{rvwapData.length}</span>
          </div>
          <div className="font-mono">
            <span className="text-muted-foreground">Current VWAP:</span>{' '}
            <span className="text-foreground">
              ${rvwapData[rvwapData.length - 1]?.vwap.toFixed(2) || 'N/A'}
            </span>
          </div>
          <div className="font-mono">
            <span className="text-muted-foreground">Window:</span>{' '}
            <span className="text-foreground">{period} × {timeframe}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
