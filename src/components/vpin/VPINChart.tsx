/**
 * VPIN Chart Component
 * Displays VPIN values over time with Recharts
 */

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

interface VPINBucket {
  timestamp: number;
  vpin: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  imbalance: number;
  trades: number;
}

interface VPINData {
  symbol: string;
  timeframe: string;
  timestamp: number;
  currentVPIN: number;
  avgVPIN: number;
  buckets: VPINBucket[];
  totalTrades: number;
  hours: number;
}

interface VPINChartProps {
  data: VPINData;
  height?: number;
}

export function VPINChart({ data, height = 400 }: VPINChartProps) {
  // Prepare chart data
  const chartData = data.buckets.map((bucket) => ({
    time: new Date(bucket.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    timestamp: bucket.timestamp,
    vpin: bucket.vpin,
    buyVolume: bucket.buyVolume,
    sellVolume: bucket.sellVolume,
    totalVolume: bucket.totalVolume,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const date = new Date(data.timestamp);

    return (
      <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
        <div className="text-xs text-muted-foreground mb-2">
          {date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-cyan-400">VPIN:</span>
            <span className="text-sm font-mono">{data.vpin.toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-green-500">Buy Vol:</span>
            <span className="text-xs font-mono">${(data.buyVolume / 1000).toFixed(1)}K</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-red-500">Sell Vol:</span>
            <span className="text-xs font-mono">${(data.sellVolume / 1000).toFixed(1)}K</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Total:</span>
            <span className="text-xs font-mono">${(data.totalVolume / 1000).toFixed(1)}K</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
          
          <XAxis
            dataKey="time"
            stroke="#888"
            tick={{ fill: '#888', fontSize: 11 }}
            tickLine={{ stroke: '#888' }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          
          <YAxis
            stroke="#888"
            tick={{ fill: '#888', fontSize: 11 }}
            tickLine={{ stroke: '#888' }}
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(value) => value.toFixed(2)}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {/* Reference lines for VPIN thresholds */}
          <ReferenceLine
            y={0.5}
            stroke="#fbbf24"
            strokeDasharray="5 5"
            label={{ value: 'High', position: 'right', fill: '#fbbf24', fontSize: 10 }}
          />
          <ReferenceLine
            y={0.75}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: 'Critical', position: 'right', fill: '#ef4444', fontSize: 10 }}
          />
          
          <Line
            type="monotone"
            dataKey="vpin"
            stroke="#22D3EE"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22D3EE' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
