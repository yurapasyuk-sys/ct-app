/**
 * Signal Overview Panel - Displays all indicator statuses at a glance
 * Shows: MTM (latest M15/1H/4H), RVWAP Status with color codes
 * 
 * Note: VPIN data not included as CryptoCompare proxy may not be fully reliable
 * Display focuses on confirmed signals: MTM, RVWAP
 */

import { useEffect, useState } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { Card } from '@/components/ui/card';
import { TrendingUp, AlertCircle, Zap, ChevronRight } from 'lucide-react';

interface SignalStatus {
  name: string;
  icon: React.ReactNode;
  status: 'bullish' | 'neutral' | 'bearish' | 'loading';
  value?: string | number;
  detail?: string;
  timeframe?: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface SignalOverviewProps {
  mtmM15Value?: number;
  mtmM15Status?: 'bullish' | 'neutral' | 'bearish' | 'loading';
  mtm1hValue?: number;
  mtm1hStatus?: 'bullish' | 'neutral' | 'bearish' | 'loading';
  mtm4hValue?: number;
  mtm4hStatus?: 'bullish' | 'neutral' | 'bearish' | 'loading';
  rvwapStatus?: 'bullish' | 'neutral' | 'bearish' | 'loading';
  rvwap90d?: number;
  onIndicatorClick?: (indicator: string) => void;
}

export function SignalOverview({
  mtmM15Value,
  mtmM15Status = 'loading',
  mtm1hValue,
  mtm1hStatus = 'loading',
  mtm4hValue,
  mtm4hStatus = 'loading',
  rvwapStatus = 'loading',
  rvwap90d,
  onIndicatorClick,
}: SignalOverviewProps) {
  const [signals, setSignals] = useState<SignalStatus[]>([]);

  useEffect(() => {
    const getStatusStyle = (status: string) => {
      switch (status) {
        case 'bullish':
          return {
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/30',
          };
        case 'bearish':
          return {
            color: 'text-red-400',
            bgColor: 'bg-red-500/10',
            borderColor: 'border-red-500/30',
          };
        case 'neutral':
          return {
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/10',
            borderColor: 'border-yellow-500/30',
          };
        default:
          return {
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/30',
          };
      }
    };

    const newSignals: SignalStatus[] = [
      {
        name: 'MTM (1H)',
        icon: <Zap className="w-5 h-5" />,
        status: mtm1hStatus,
        value: mtm1hValue?.toFixed(0),
        timeframe: '1H',
        detail: mtm1hStatus === 'bullish' ? 'Tensioning' : mtm1hStatus === 'bearish' ? 'Relaxing' : 'Neutral',
        ...getStatusStyle(mtm1hStatus),
      },
      {
        name: 'RVWAP',
        icon: <TrendingUp className="w-5 h-5" />,
        status: rvwapStatus,
        value: rvwap90d?.toFixed(0),
        detail: rvwapStatus === 'bullish' ? 'Above 90D' : rvwapStatus === 'bearish' ? 'Below 90D' : 'At 90D',
        ...getStatusStyle(rvwapStatus),
      },
    ];

    setSignals(newSignals);
  }, [mtm1hStatus, mtm1hValue, rvwapStatus, rvwap90d]);

  return (
    <Card className="p-6 bg-gradient-to-br from-card to-card/80 border border-border/50 backdrop-blur-sm">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <AlertCircle className="h-5 w-5 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold">Signal Overview</h2>
        </div>

        {/* Signals Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {signals.map((signal) => (
            <button
              key={signal.name}
              onClick={() => onIndicatorClick?.(signal.name.toLowerCase())}
              className={`p-3 rounded-lg border transition-all hover:scale-105 cursor-pointer group ${signal.bgColor} ${signal.borderColor} border`}
            >
              {/* Top: Icon + Name */}
              <div className="flex items-center justify-between mb-2">
                <div className={`${signal.color}`}>
                  {signal.icon}
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  {signal.name}
                </span>
              </div>

              {/* Value */}
              {signal.value !== undefined && (
                <div className={`text-sm font-bold mb-1 ${signal.color}`}>
                  {signal.value}
                </div>
              )}

              {/* Detail/Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {signal.detail}
                </span>
                <ChevronRight className={`w-3 h-3 ${signal.color} transition-transform group-hover:translate-x-0.5`} />
              </div>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="border-t border-border/30 pt-3 mt-4">
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Bullish</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span>Neutral</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Bearish</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
