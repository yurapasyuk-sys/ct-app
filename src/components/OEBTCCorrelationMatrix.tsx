/**
 * OE-BTC Correlation Matrix Component
 * Displays correlations between OE-BTC and various markets
 */

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Grid3x3, AlertCircle } from 'lucide-react';

interface CorrelationPair {
  pair: string;
  label: string;
  correlation: number;
}

interface CorrelationsAPIResponse {
  success: boolean;
  days: number;
  timestamp: string;
  correlations: CorrelationPair[];
}

// Fetcher for SWR
const fetcher = async (url: string): Promise<CorrelationsAPIResponse> => {
  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const baseUrl = isDev ? 'https://borkiss-site.vercel.app' : '';
  const fullUrl = `${baseUrl}${url}`;
  
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch correlations');
  }
  return response.json();
};

// Mock data as fallback
const MOCK_CORRELATIONS: CorrelationPair[] = [
  { pair: 'OE-BTC vs SPY', correlation: 0.72, label: 'S&P 500' },
  { pair: 'OE-BTC vs NQ', correlation: 0.68, label: 'Nasdaq 100' },
  { pair: 'OE-BTC vs GLD', correlation: -0.34, label: 'Gold' },
  { pair: 'OE-BTC vs DXY', correlation: -0.41, label: 'Dollar Index' },
  { pair: 'OE-BTC vs BTC', correlation: 0.51, label: 'Bitcoin' },
  { pair: 'SPY vs BTC', correlation: 0.45, label: 'SPY-BTC' },
  { pair: 'NQ vs BTC', correlation: 0.52, label: 'NQ-BTC' },
];

export function OEBTCCorrelationMatrix() {
  // Fetch real correlation data from API
  const { data: apiResponse, error, isLoading } = useSWR<CorrelationsAPIResponse>(
    '/api/oe-btc-correlations',
    fetcher,
    {
      refreshInterval: 3600000, // Refresh every hour
      revalidateOnFocus: false,
      dedupingInterval: 1800000, // Dedupe for 30 minutes
    }
  );

  // Use API data or fallback to mock
  const correlations = apiResponse?.correlations || MOCK_CORRELATIONS;

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Grid3x3 className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-semibold">Correlation Matrix</h4>
          {/* Status indicator */}
          {isLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
          )}
          {error && !isLoading && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="w-3 h-3" />
              <span>Fallback mode</span>
            </div>
          )}
          {!error && !isLoading && apiResponse && (
            <span className="text-xs text-emerald-400">● Live</span>
          )}
        </div>
      </div>

      {/* Correlation grid */}
      <div className="space-y-2">
        {correlations.map((item, idx) => (
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

      {/* Status messages */}
      {(error || !apiResponse) && (
        <div className="mt-4 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
          <strong>⚠️ Fallback Data:</strong> API unavailable, showing simulated correlations. Real implementation calculates from 30-day historical data.
        </div>
      )}
      {apiResponse && !error && (
        <div className="mt-4 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-400">
          <strong>✓ Real Data:</strong> Calculated from {apiResponse.days}-day rolling window using Pearson correlation coefficient.
        </div>
      )}
    </Card>
  );
}
