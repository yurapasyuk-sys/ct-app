/**
 * OE-BTC Indicator Component
 * Gauge-style widget displaying Risk-On/Risk-Off signal
 * Auto-refreshes every 5 minutes
 */

import { useMemo } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Activity } from 'lucide-react';

interface OEBTCData {
  oe_btc: number;
  ro_macro: number;
  etf_flow: number;
  btc_momentum: number;
  timestamp: string;
  components: {
    spy_above_sma: boolean;
    jnk_above_sma: boolean;
    eem_above_sma: boolean;
    gld_above_sma: boolean;
    dxy_above_sma: boolean;
    etf_flow_usd: number;
    btc_price: number;
    btc_sma15: number;
  };
}

const fetcher = async (url: string): Promise<OEBTCData> => {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch OE-BTC');
  }
  return response.json();
};

/**
 * Mini bar component for displaying sub-components
 */
function MiniBar({ title, value, color }: { title: string; value: number; color: string }) {
  const percentage = ((value + 1) / 2) * 100; // Normalize -1..1 to 0..100

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-medium">{title}</span>
        <span className="text-foreground font-mono font-bold">{value.toFixed(2)}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Gauge chart simulation using CSS
 */
function GaugeChart({ value }: { value: number }) {
  const percentage = ((value + 1) / 2) * 100; // -1..1 -> 0..100
  
  // Determine color based on value
  let gaugeColor = '#D32F2F'; // Red (risk-off)
  if (value > -0.5) gaugeColor = '#FBC02D'; // Yellow (neutral)
  if (value > 0.5) gaugeColor = '#43A047'; // Green (risk-on)

  // Angle: -90 to +90 degrees for -1 to +1
  const angle = -90 + (percentage / 100) * 180;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Gauge arc */}
      <div className="relative w-48 h-24">
        {/* Background arc */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 100">
          {/* Risk-off (red) */}
          <path
            d="M 20 80 A 60 60 0 0 1 60 20"
            stroke="#D32F2F"
            strokeWidth="8"
            fill="none"
            opacity="0.3"
          />
          {/* Neutral (yellow) */}
          <path
            d="M 60 20 A 60 60 0 0 1 140 20"
            stroke="#FBC02D"
            strokeWidth="8"
            fill="none"
            opacity="0.3"
          />
          {/* Risk-on (green) */}
          <path
            d="M 140 20 A 60 60 0 0 1 180 80"
            stroke="#43A047"
            strokeWidth="8"
            fill="none"
            opacity="0.3"
          />

          {/* Needle */}
          <line
            x1="100"
            y1="80"
            x2={100 + 50 * Math.cos((angle - 90) * (Math.PI / 180))}
            y2={80 + 50 * Math.sin((angle - 90) * (Math.PI / 180))}
            stroke={gaugeColor}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Center circle */}
          <circle cx="100" cy="80" r="5" fill={gaugeColor} />
        </svg>

        {/* Value display */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center mt-4">
            <div className="text-3xl font-bold" style={{ color: gaugeColor }}>
              {value.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between w-full text-xs text-muted-foreground px-8">
        <span>Risk-Off</span>
        <span>Neutral</span>
        <span>Risk-On</span>
      </div>
    </div>
  );
}

export function OEBTCIndicator() {
  const { data, error, isLoading } = useSWR<OEBTCData>(
    '/api/oe-btc',
    fetcher,
    {
      refreshInterval: 300000, // 5 minutes
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const statusColor = useMemo(() => {
    if (error) return 'bg-red-500';
    if (isLoading) return 'bg-amber-500';
    if (data) {
      if (data.oe_btc > 0.5) return 'bg-green-500';
      if (data.oe_btc < -0.5) return 'bg-red-500';
      return 'bg-yellow-500';
    }
    return 'bg-gray-500';
  }, [data, error, isLoading]);

  const signal = useMemo(() => {
    if (!data) return 'Loading...';
    if (data.oe_btc > 0.5) return 'Risk-On 📈';
    if (data.oe_btc < -0.5) return 'Risk-Off 📉';
    return 'Neutral ↔️';
  }, [data]);

  return (
    <div className="relative">
      <Card className="p-6 bg-card border border-border w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-purple-500" />
            <div>
              <h3 className="text-xl font-semibold">OE-BTC</h3>
              <p className="text-xs text-muted-foreground">Order Execution Risk Signal</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          </div>
          {data && (
            <span className="text-xs text-muted-foreground font-mono">
              Updated: {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            Failed to load OE-BTC: {error.message}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center" style={{ minHeight: '300px' }}>
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
              <span className="text-sm text-muted-foreground">Calculating signal...</span>
            </div>
          </div>
        )}

        {/* Gauge and components */}
        {data && (
          <>
            {/* Gauge */}
            <div className="mb-6">
              <GaugeChart value={data.oe_btc} />
            </div>

            {/* Signal */}
            <div className="text-center mb-6">
              <div className="text-lg font-semibold">{signal}</div>
            </div>

            {/* Component breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Macro Risk-On</h4>
                <MiniBar
                  title="Value"
                  value={data.ro_macro}
                  color={data.ro_macro > 0 ? 'bg-green-500' : 'bg-red-500'}
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>SPY: {data.components.spy_above_sma ? '✓' : '✗'}</div>
                  <div>JNK: {data.components.jnk_above_sma ? '✓' : '✗'}</div>
                  <div>EEM: {data.components.eem_above_sma ? '✓' : '✗'}</div>
                  <div>GLD ↓: {data.components.gld_above_sma ? '✓' : '✗'}</div>
                  <div>DXY ↓: {data.components.dxy_above_sma ? '✓' : '✗'}</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">ETF Flow</h4>
                <MiniBar
                  title="Value"
                  value={data.etf_flow}
                  color={data.etf_flow > 0 ? 'bg-green-500' : 'bg-red-500'}
                />
                <div className="text-xs text-muted-foreground">
                  <div>Daily Flow: ${(data.components.etf_flow_usd / 1e9).toFixed(2)}B</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">BTC Momentum</h4>
                <MiniBar
                  title="Value"
                  value={data.btc_momentum}
                  color={data.btc_momentum > 0 ? 'bg-green-500' : 'bg-red-500'}
                />
                <div className="text-xs text-muted-foreground">
                  <div>Price: ${data.components.btc_price.toLocaleString()}</div>
                  <div>SMA15: ${data.components.btc_sma15.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
              <p className="font-semibold mb-1">Formula:</p>
              <p>OE-BTC = 0.4 × Macro + 0.35 × ETF Flow + 0.25 × BTC Momentum</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
