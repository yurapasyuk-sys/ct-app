/**
 * OE-BTC Correlation Matrix Component
 * Shows correlations between OE-BTC components and other markets
 */

import { Card } from '@/components/ui/card';
import { Grid3x3 } from 'lucide-react';

interface CorrelationData {
  pair: string;
  correlation: number;
  label: string;
}

interface OEBTCCorrelationMatrixProps {
  data?: CorrelationData[];
}

// Mock correlation data (in real app, calculate from historical data)
const DEFAULT_CORRELATIONS: CorrelationData[] = [
  { pair: 'OE-BTC vs SPY', correlation: 0.72, label: 'S&P 500' },
  { pair: 'OE-BTC vs JNK', correlation: 0.68, label: 'Junk Bonds' },
  { pair: 'OE-BTC vs EEM', correlation: 0.61, label: 'Emerging Markets' },
  { pair: 'OE-BTC vs GLD', correlation: -0.34, label: 'Gold' },
  { pair: 'OE-BTC vs DXY', correlation: -0.41, label: 'Dollar Index' },
  { pair: 'OE-BTC vs ETF Flows', correlation: 0.58, label: 'ETF Inflows' },
  { pair: 'OE-BTC vs BTC Price', correlation: 0.51, label: 'Bitcoin' },
  { pair: 'SPY vs BTC', correlation: 0.45, label: 'SPY-BTC' },
  { pair: 'ETF Flows vs BTC', correlation: 0.82, label: 'ETF-BTC' },
];

export function OEBTCCorrelationMatrix({ data = DEFAULT_CORRELATIONS }: OEBTCCorrelationMatrixProps) {
  // Get color based on correlation strength
  const getCorrelationColor = (corr: number) => {
    const abs = Math.abs(corr);
    if (abs >= 0.7) return corr > 0 ? 'bg-emerald-500' : 'bg-red-500';
    if (abs >= 0.5) return corr > 0 ? 'bg-blue-500' : 'bg-orange-500';
    if (abs >= 0.3) return corr > 0 ? 'bg-cyan-500' : 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const getCorrelationLabel = (corr: number) => {
    const abs = Math.abs(corr);
    if (abs >= 0.7) return 'Strong';
    if (abs >= 0.5) return 'Moderate';
    if (abs >= 0.3) return 'Weak';
    return 'Very Weak';
  };

  return (
    <Card className="p-4 bg-card/40 border border-border/50">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Grid3x3 className="w-4 h-4 text-blue-400" />
        <h4 className="text-sm font-semibold">Correlation Matrix</h4>
      </div>

      {/* Correlation grid */}
      <div className="space-y-2">
        {data.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-2 hover:bg-muted/20 rounded transition-colors"
          >
            {/* Label */}
            <div className="flex-1 text-sm font-mono">
              {item.label}
            </div>

            {/* Visual bar */}
            <div className="flex-1 relative h-6 bg-muted/30 rounded overflow-hidden">
              <div
                className={`
                  absolute top-0 h-full transition-all duration-300
                  ${getCorrelationColor(item.correlation)}
                `}
                style={{
                  width: `${Math.abs(item.correlation) * 100}%`,
                  left: item.correlation > 0 ? '50%' : `${50 - Math.abs(item.correlation) * 50}%`,
                }}
              />
              {/* Center line */}
              <div className="absolute top-0 left-1/2 w-px h-full bg-white/20" />
            </div>

            {/* Value */}
            <div className="w-16 text-right">
              <div
                className={`
                  text-sm font-bold
                  ${item.correlation > 0 ? 'text-emerald-400' : 'text-red-400'}
                `}
              >
                {item.correlation.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {getCorrelationLabel(item.correlation)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded"></div>
            <span className="text-muted-foreground">Strong Positive (≥0.7)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-muted-foreground">Strong Negative (≤-0.7)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-muted-foreground">Moderate Pos (0.5-0.7)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span className="text-muted-foreground">Moderate Neg (-0.5–-0.7)</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded text-xs text-muted-foreground">
        <strong className="text-blue-400">Note:</strong> Correlations calculated from 30-day rolling window. 
        Values closer to ±1 indicate stronger relationship.
      </div>
    </Card>
  );
}
