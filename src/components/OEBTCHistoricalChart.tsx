/**
 * OE-BTC Historical Chart Component
 * Shows past 7-30 days of OE-BTC values with optional BTC price overlay
 */

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface HistoricalDataPoint {
  timestamp: number;
  date: string;
  oe_btc: number;
  btc_price?: number;
}

interface OEBTCHistoricalChartProps {
  data: HistoricalDataPoint[];
  showBTCOverlay?: boolean;
}

export function OEBTCHistoricalChart({ data, showBTCOverlay = false }: OEBTCHistoricalChartProps) {
  const [timeframe, setTimeframe] = useState<7 | 14 | 30>(14);
  const [overlayEnabled, setOverlayEnabled] = useState(showBTCOverlay);

  // Filter data by selected timeframe
  const filteredData = useMemo(() => {
    const now = Date.now();
    const cutoff = now - timeframe * 24 * 60 * 60 * 1000;
    return data.filter(d => d.timestamp >= cutoff);
  }, [data, timeframe]);

  // Normalize BTC price to OE-BTC scale for better comparison
  const normalizedData = useMemo(() => {
    if (!overlayEnabled || !filteredData.length) return filteredData;

    const btcPrices = filteredData.map(d => d.btc_price).filter(Boolean) as number[];
    if (!btcPrices.length) return filteredData;

    const minBTC = Math.min(...btcPrices);
    const maxBTC = Math.max(...btcPrices);
    const minOE = Math.min(...filteredData.map(d => d.oe_btc));
    const maxOE = Math.max(...filteredData.map(d => d.oe_btc));

    return filteredData.map(d => ({
      ...d,
      btc_normalized: d.btc_price 
        ? ((d.btc_price - minBTC) / (maxBTC - minBTC)) * (maxOE - minOE) + minOE
        : undefined
    }));
  }, [filteredData, overlayEnabled]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="bg-background/95 border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">{payload[0].payload.date}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-400"></div>
            <span className="text-sm font-mono">
              OE-BTC: <span className="font-bold text-blue-400">{payload[0].value?.toFixed(2)}</span>
            </span>
          </div>
          {overlayEnabled && payload[1] && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-cyan-400"></div>
              <span className="text-sm font-mono">
                BTC: <span className="font-bold text-cyan-400">
                  ${payload[0].payload.btc_price?.toLocaleString()}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="p-4 bg-card/40 border border-border/50">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-semibold">Historical Trend</h4>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeframe(days as 7 | 14 | 30)}
                className={`
                  px-3 py-1 text-xs font-medium rounded transition-all
                  ${timeframe === days 
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                {days}D
              </button>
            ))}
          </div>

          {/* BTC overlay toggle */}
          <button
            onClick={() => setOverlayEnabled(!overlayEnabled)}
            className={`
              px-3 py-1 text-xs font-medium rounded transition-all
              ${overlayEnabled
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-muted/30 text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {overlayEnabled ? '✓' : ''} BTC Overlay
          </button>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={normalizedData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis 
            dataKey="date" 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            domain={['dataMin - 0.2', 'dataMax + 0.2']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="oe_btc" 
            stroke="#3B82F6" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3B82F6' }}
          />
          {overlayEnabled && (
            <Line 
              type="monotone" 
              dataKey="btc_normalized" 
              stroke="#22D3EE" 
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              activeDot={{ r: 3, fill: '#22D3EE' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-blue-400"></div>
          <span>OE-BTC</span>
        </div>
        {overlayEnabled && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-cyan-400 opacity-70" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #22D3EE 0, #22D3EE 3px, transparent 3px, transparent 6px)' }}></div>
            <span>BTC Price (normalized)</span>
          </div>
        )}
      </div>
    </Card>
  );
}
