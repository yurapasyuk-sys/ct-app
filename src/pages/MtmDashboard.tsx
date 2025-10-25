/**
 * Market Tension Map Dashboard
 * Displays three panels with OHLC charts and tension histograms
 */

import { useState, useEffect } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { OhlcChart } from '@/components/ohlc/OhlcChart';
import { getRecommendedThreshold } from '@/lib/tension';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import type { DataSource } from '@/lib/binance';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
];

const DATA_SOURCES: { value: DataSource; label: string }[] = [
  { value: 'spot', label: 'Spot' },
  { value: 'futures', label: 'Futures' },
];

interface PanelProps {
  timeframe: typeof TIMEFRAMES[0];
  symbol: string;
  dataSource: DataSource;
}

function Panel({ timeframe, symbol, dataSource }: PanelProps) {
  // Debug logging
  useEffect(() => {
    console.log(`[Panel ${timeframe.label}] Rendering with:`, { symbol, dataSource, timeframe });
  }, [symbol, dataSource, timeframe]);

  const { klines, tensionData, isLoading, error, lastUpdated, nextRefreshIn } =
    useKlines({
      symbol,
      interval: timeframe.interval,
      lookbackDays: timeframe.lookbackDays,
      minRefreshMs: 15000,
      dataSource,
      enabled: true,
    });

  // Debug data state
  useEffect(() => {
    console.log(`[Panel ${timeframe.label}] Data state:`, {
      klinesCount: klines.length,
      tensionCount: tensionData.length,
      isLoading,
      error,
      lastUpdated,
    });
  }, [klines, tensionData, isLoading, error, lastUpdated, timeframe.label]);

  const threshold = getRecommendedThreshold(timeframe.interval);

  // Format countdown
  const secondsRemaining = Math.ceil(nextRefreshIn / 1000);

  // Status color
  const statusColor = error ? 'bg-red-500' : isLoading ? 'bg-amber-500' : 'bg-green-500';

  return (
    <Card className="p-4 bg-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            {timeframe.label} <span className="text-sm text-muted-foreground font-normal">({timeframe.description})</span>
          </h3>
          <div className={`w-2 h-2 rounded-full ${statusColor}`} title={error ? 'Error' : isLoading ? 'Loading' : 'OK'} />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {lastUpdated && (
            <span className="font-mono">
              Last: {lastUpdated.toLocaleTimeString('en-US', { hour12: false })} UTC
            </span>
          )}
          <span className="font-mono">
            Next: {secondsRemaining}s
          </span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Combined OHLC Chart with Tension Histogram */}
      <div className="mb-3">
        <OhlcChart 
          klines={klines} 
          tensionData={tensionData}
          threshold={threshold}
          height={350} 
        />
      </div>

      {/* Legend */}
      <div className="mb-2 text-xs text-muted-foreground">
        <span className="font-mono">
          Tension Map (Threshold: {threshold}) - 
          <span className="text-muted-foreground/60"> Gray: normal</span>
          <span className="text-green-500"> Green: above threshold</span>
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs">
        <div className="font-mono">
          <span className="text-muted-foreground">Candles:</span>{' '}
          <span className="text-foreground">{klines.length}</span>
        </div>
        <div className="font-mono">
          <span className="text-muted-foreground">Tension Points:</span>{' '}
          <span className="text-foreground">{tensionData.length}</span>
        </div>
        {tensionData.length > 0 && (
          <div className="font-mono">
            <span className="text-muted-foreground">Latest:</span>{' '}
            <span className="text-foreground">
              {tensionData[tensionData.length - 1].tensionIndex.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function MtmDashboard() {
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState<string>(() => {
    return localStorage.getItem('mtm_symbol') || 'BTCUSDT';
  });
  const [dataSource, setDataSource] = useState<DataSource>(() => {
    return (localStorage.getItem('mtm_dataSource') as DataSource) || 'spot';
  });

  // Debug logging
  useEffect(() => {
    console.log('[MtmDashboard] Component mounted');
    console.log('[MtmDashboard] Symbol:', symbol);
    console.log('[MtmDashboard] DataSource:', dataSource);
  }, [symbol, dataSource]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem('mtm_symbol', symbol);
  }, [symbol]);

  useEffect(() => {
    localStorage.setItem('mtm_dataSource', dataSource);
  }, [dataSource]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Market Tension Map</h1>
                <p className="text-sm text-muted-foreground">
                  Real-time OHLC analysis with tension indicators
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Symbol:</span>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYMBOLS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Source:</span>
                <Select value={dataSource} onValueChange={(v) => setDataSource(v as DataSource)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_SOURCES.map((ds) => (
                      <SelectItem key={ds.value} value={ds.value}>
                        {ds.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {TIMEFRAMES.map((tf) => (
            <Panel key={tf.id} timeframe={tf} symbol={symbol} dataSource={dataSource} />
          ))}
        </div>

        {/* Info Footer */}
        <div className="mt-6 p-4 bg-muted/50 rounded border border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>Auto-refresh:</strong> Data updates every 15 seconds with strict rate limiting
            </p>
            <p>
              <strong>Tension Index:</strong> Combines volatility and volume scores (0-100). Higher values indicate
              market compression
            </p>
            <p>
              <strong>Color coding:</strong> Gray bars = normal tension, Green bars = above threshold (potential
              volatility expansion)
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
