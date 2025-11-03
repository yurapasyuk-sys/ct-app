/**
 * OE-BTC Indicator Component
 * Beautiful, animated gauge-style widget for Risk-On/Risk-Off signal
 */

import { useMemo, useEffect, useState, memo } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Activity, TrendingUp, TrendingDown, Info, Gauge, TrendingUp as ChartIcon, Bell, Grid3x3, Sliders } from 'lucide-react';
import { OEBTCHistoricalChart } from './OEBTCHistoricalChart';
import { OEBTCAlertConfig } from './OEBTCAlertConfig';
import { OEBTCCorrelationMatrix } from './OEBTCCorrelationMatrix';
import { OEBTCWeightConfigurator } from './OEBTCWeightConfigurator';

interface OEBTCData {
  oe_btc: number;
  ro_macro: number;
  etf_flow: number;
  btc_momentum: number;
  timestamp: string;
  components: {
    spy_above_sma: boolean;
    nq_above_sma: boolean;
    gld_above_sma: boolean;
    dxy_above_sma: boolean;
    etf_flow_usd: number;
    btc_price: number;
    btc_ema200: number;
    btc_deviation_pct: number;
  };
}

const fetcher = async (url: string): Promise<OEBTCData> => {
  // Use production API in dev mode
  const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const baseUrl = isDev ? 'https://borkiss-site.vercel.app' : '';
  const fullUrl = `${baseUrl}${url}`;
  
  console.log('[OEBTCIndicator] Fetching from:', fullUrl);
  
  const response = await fetch(fullUrl);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Failed to fetch OE-BTC');
  }
  return response.json();
};

/**
 * Animated mini bar component
 */
const MiniBar = memo(function MiniBar({
  title,
  value,
  icon: Icon,
  tooltip
}: {
  title: string;
  value: number;
  icon: any;
  tooltip: string;
}) {
  const percentage = ((value + 1) / 2) * 100;
  const isPositive = value > 0;
  
  // Determine color
  let bgColor = 'from-red-600 to-red-400';
  let textColor = 'text-red-400';
  if (value > -0.2) {
    bgColor = 'from-yellow-600 to-yellow-400';
    textColor = 'text-yellow-400';
  }
  if (value > 0.2) {
    bgColor = 'from-green-600 to-green-400';
    textColor = 'text-green-400';
  }

  return (
    <div className="group">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </span>
        </div>
        <span className={`text-sm font-bold ${textColor}`}>
          {value.toFixed(2)}
        </span>
      </div>
      
      {/* Bar */}
      <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${bgColor} transition-all duration-500 ease-out shadow-lg`}
          style={{ width: `${percentage}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 animate-pulse" />
        </div>
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-background border border-border rounded px-2 py-1 text-xs text-muted-foreground whitespace-nowrap z-10">
        {tooltip}
      </div>
    </div>
  );
});

/**
 * Enhanced Gauge Chart with Animation
 */
const GaugeChart = memo(function GaugeChart({ value, isLoading }: { value: number; isLoading: boolean }) {
  const [animatedValue, setAnimatedValue] = useState(-1);
  
  useEffect(() => {
    if (isLoading) return;
    
    // Animate gauge needle
    const interval = setInterval(() => {
      setAnimatedValue((prev) => {
        if (Math.abs(prev - value) < 0.02) {
          clearInterval(interval);
          return value;
        }
        return prev + (value - prev) * 0.1;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [value, isLoading]);

  const percentage = ((animatedValue + 1) / 2) * 100;
  
  // Determine colors
  let needleColor = '#EF4444'; // Red
  let arcColor1 = '#EF4444';
  let arcColor2 = '#F59E0B';
  let arcColor3 = '#10B981';
  
  if (animatedValue > -0.5) needleColor = '#F59E0B'; // Yellow
  if (animatedValue > 0.5) needleColor = '#10B981'; // Green

  const angle = -90 + (percentage / 100) * 180;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Gauge SVG */}
      <div className="relative w-64 h-32">
        <svg className="absolute inset-0 w-full h-full drop-shadow-lg" viewBox="0 0 240 120">
          {/* Risk-off arc (red) */}
          <path
            d="M 30 100 A 70 70 0 0 1 80 15"
            stroke={arcColor1}
            strokeWidth="12"
            fill="none"
            opacity="0.3"
            strokeLinecap="round"
          />
          {/* Neutral arc (yellow) */}
          <path
            d="M 80 15 A 70 70 0 0 1 160 15"
            stroke={arcColor2}
            strokeWidth="12"
            fill="none"
            opacity="0.3"
            strokeLinecap="round"
          />
          {/* Risk-on arc (green) */}
          <path
            d="M 160 15 A 70 70 0 0 1 210 100"
            stroke={arcColor3}
            strokeWidth="12"
            fill="none"
            opacity="0.3"
            strokeLinecap="round"
          />

          {/* Needle with animation */}
          <g style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: '120px 100px',
            transition: 'transform 0.1s ease-out'
          }}>
            <line
              x1="120"
              y1="100"
              x2="120"
              y2="30"
              stroke={needleColor}
              strokeWidth="4"
              strokeLinecap="round"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
            />
          </g>

          {/* Center circle */}
          <circle 
            cx="120" 
            cy="100" 
            r="8" 
            fill={needleColor}
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
          />
          
          {/* Glow effect */}
          <circle 
            cx="120" 
            cy="100" 
            r="12" 
            fill="none"
            stroke={needleColor}
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>

        {/* Value display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-black" style={{ color: needleColor }}>
            {animatedValue.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Risk Signal</div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between w-full text-xs font-semibold text-muted-foreground px-6 tracking-wide">
        <span>📉 Risk-Off</span>
        <span>↔️ Neutral</span>
        <span>📈 Risk-On</span>
      </div>
    </div>
  );
});

/**
 * Main OE-BTC Indicator Component
 */
export const OEBTCIndicator = memo(function OEBTCIndicator() {
  const [activeTab, setActiveTab] = useState<'gauge' | 'history' | 'alerts' | 'correlations' | 'customize'>('gauge');
  
  const { data, error, isLoading } = useSWR<OEBTCData>(
    '/api/oe-btc',
    fetcher,
    {
      refreshInterval: 300000, // 5 minutes
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const tabs = [
    { id: 'gauge' as const, label: 'Overview', icon: Gauge },
    { id: 'history' as const, label: 'History', icon: ChartIcon },
    { id: 'alerts' as const, label: 'Alerts', icon: Bell },
    { id: 'correlations' as const, label: 'Correlations', icon: Grid3x3 },
    { id: 'customize' as const, label: 'Customize', icon: Sliders },
  ];

  const statusColor = useMemo(() => {
    if (error) return 'bg-red-600';
    if (isLoading) return 'bg-yellow-500 animate-pulse';
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

  const signalColor = useMemo(() => {
    if (!data) return 'text-muted-foreground';
    if (data.oe_btc > 0.5) return 'text-green-400';
    if (data.oe_btc < -0.5) return 'text-red-400';
    return 'text-yellow-400';
  }, [data]);

  return (
    <div className="relative">
      <Card className="p-8 bg-gradient-to-br from-card to-card/80 border border-border/50 backdrop-blur-sm w-full overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-full blur-3xl -z-10" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">OE-BTC</h3>
              <p className="text-sm text-muted-foreground">Order Execution Risk Signal</p>
            </div>
            <div className={`w-3 h-3 rounded-full ${statusColor}`} />
          </div>
          {data && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-mono mb-1">
                Updated {new Date(data.timestamp).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className={`text-sm font-bold ${signalColor}`}>{signal}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-background/40 text-muted-foreground hover:bg-background/60 border border-border/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Failed to load OE-BTC</p>
              <p className="text-red-300/80">{error.message}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-500 border-r-purple-500/50 animate-spin" />
              </div>
              <span className="text-sm text-muted-foreground">Calculating signal...</span>
            </div>
          </div>
        )}

        {/* Tab content */}
        {data && !error && (
          <>
            {/* Gauge Tab */}
            {activeTab === 'gauge' && (
              <>
                {/* Gauge */}
                <div className="mb-8">
                  <GaugeChart value={data.oe_btc} isLoading={isLoading} />
                </div>

                {/* Component breakdown grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                  {/* Macro Risk-On */}
                  <div className="space-y-4 p-4 bg-background/40 rounded-lg border border-border/50 backdrop-blur-sm">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      {data.ro_macro > 0 ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      Macro Risk-On
                    </h4>
                    
                    <MiniBar
                      title="Value"
                      value={data.ro_macro}
                      icon={data.ro_macro > 0 ? TrendingUp : TrendingDown}
                      tooltip={`Macro risk-on component: ${data.ro_macro.toFixed(2)}`}
                    />

                    {/* Asset checklist */}
                    <div className="text-xs space-y-2 pt-2 border-t border-border/30">
                      <div className={`flex items-center gap-2 ${data.components.spy_above_sma ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{data.components.spy_above_sma ? '✓' : '✗'}</span>
                        <span>SPY above SMA</span>
                      </div>
                      <div className={`flex items-center gap-2 ${data.components.nq_above_sma ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{data.components.nq_above_sma ? '✓' : '✗'}</span>
                        <span>NQ (US100) above SMA</span>
                      </div>
                      <div className={`flex items-center gap-2 ${data.components.gld_above_sma ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{data.components.gld_above_sma ? '✓' : '✗'}</span>
                        <span>GLD below SMA ↓</span>
                      </div>
                      <div className={`flex items-center gap-2 ${data.components.dxy_above_sma ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{data.components.dxy_above_sma ? '✓' : '✗'}</span>
                        <span>DXY below SMA ↓</span>
                      </div>
                    </div>
                  </div>

                  {/* ETF Flow */}
                  <div className="space-y-4 p-4 bg-background/40 rounded-lg border border-border/50 backdrop-blur-sm">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      {data.etf_flow > 0 ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      ETF Flow
                    </h4>

                    <MiniBar
                      title="Value"
                      value={data.etf_flow}
                      icon={data.etf_flow > 0 ? TrendingUp : TrendingDown}
                      tooltip={`ETF flow component: ${data.etf_flow.toFixed(2)}`}
                    />

                    <div className="text-xs space-y-2 pt-2 border-t border-border/30 text-muted-foreground">
                      <div>
                        <span className="font-semibold">Daily Flow:</span><br />
                        <span className="text-base font-bold text-foreground">
                          ${(data.components.etf_flow_usd / 1e9).toFixed(2)}B
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70 pt-2">
                        Net inflow from BTC ETFs. Positive = accumulation.
                      </p>
                    </div>
                  </div>

                  {/* BTC Momentum */}
                  <div className="space-y-4 p-4 bg-background/40 rounded-lg border border-border/50 backdrop-blur-sm">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      {data.btc_momentum > 0 ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      BTC Momentum
                    </h4>

                    <MiniBar
                      title="Value"
                      value={data.btc_momentum}
                      icon={data.btc_momentum > 0 ? TrendingUp : TrendingDown}
                      tooltip={`BTC vs EMA200: ${data.btc_momentum > 0 ? 'bullish' : 'bearish'} (${data.components.btc_deviation_pct.toFixed(2)}%)`}
                    />

                    <div className="text-xs space-y-2 pt-2 border-t border-border/30 text-muted-foreground">
                      <div>
                        <span className="font-semibold">Price:</span><br />
                        <span className="text-base font-bold text-foreground">
                          ${data.components.btc_price.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">EMA200:</span><br />
                        <span className="text-base font-bold text-foreground">
                          ${data.components.btc_ema200.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold">Deviation:</span><br />
                        <span className={`text-base font-bold ${
                          data.components.btc_deviation_pct > 0 ? 'text-green-400' :
                          data.components.btc_deviation_pct < 0 ? 'text-red-400' : 'text-yellow-400'
                        }`}>
                          {data.components.btc_deviation_pct > 0 ? '+' : ''}{data.components.btc_deviation_pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formula */}
                <div className="text-xs text-muted-foreground bg-background/60 rounded-lg p-4 border border-border/30 font-mono">
                  <p className="font-semibold mb-2 text-foreground">Formula:</p>
                  <p className="leading-relaxed">
                    OE-BTC = <span className="text-green-400">0.40 × Macro</span> + <span className="text-blue-400">0.35 × ETF</span> + <span className="text-cyan-400">0.25 × BTC</span>
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    Clamped to [-1, 1]. Positive = Risk-On, Negative = Risk-Off
                  </p>
                </div>
              </>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <OEBTCHistoricalChart />
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <OEBTCAlertConfig currentValue={data.oe_btc} />
            )}

            {/* Correlations Tab */}
            {activeTab === 'correlations' && (
              <OEBTCCorrelationMatrix />
            )}

            {/* Customize Tab */}
            {activeTab === 'customize' && (
              <OEBTCWeightConfigurator
                roMacro={data.ro_macro}
                etfFlow={data.etf_flow}
                btcMomentum={data.btc_momentum}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
});
