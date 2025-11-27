import React, { useMemo, useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SnapshotButton } from "@/components/SnapshotButton";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { format } from 'date-fns';

// Types based on the API contract
interface RiskRegimeResponse {
  data: {
    date: string;      // Format: "YYYY-MM-DD"
    score: number;     // -100 to 100
    components: {
      cyc_def: number;
      rty_dji: number;
      es_gc: number;
      hg_gc: number;
      btc_nq: number;
      etf_flow: number;
    };
  }[];
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const RISK_API_URL = 'https://api.borkiss.trade/api/risk-regime';
const BINANCE_API_URL = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365'; // Fetch more to ensure overlap

export const RoroRegime = () => {
  const { profile, loading: authLoading, signInWithGoogle } = useAuth();
  const { data: riskData, error: riskError, isLoading: riskLoading } = useSWR<RiskRegimeResponse>(RISK_API_URL, fetcher);
  const [btcHistory, setBtcHistory] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Debug: Log incoming data
  useEffect(() => {
    if (riskData) {
      console.log("Risk Data Received:", riskData);
    }
  }, [riskData]);

  // Fetch Binance Data
  useEffect(() => {
    const fetchBinance = async () => {
      try {
        const res = await fetch(BINANCE_API_URL);
        const data = await res.json();
        // Binance kline: [time, open, high, low, close, ...]
        const history: Record<string, number> = {};
        data.forEach((k: any) => {
          const dateStr = format(new Date(k[0]), 'yyyy-MM-dd');
          history[dateStr] = parseFloat(k[4]);
        });
        setBtcHistory(history);
      } catch (e) {
        console.error("Failed to fetch Binance data", e);
      }
    };
    fetchBinance();
  }, []);

  const chartData = useMemo(() => {
    if (!riskData || !riskData.data) return [];
    
    return riskData.data.map(h => {
      // Prefer Binance price if available
      const price = btcHistory[h.date];
      return {
        date: h.date,
        timestamp: new Date(h.date).getTime(),
        score: h.score,
        btc_price: price
      };
    });
  }, [riskData, btcHistory]);

  const currentScore = useMemo(() => {
    if (!riskData || !riskData.data || riskData.data.length === 0) return 0;
    return riskData.data[riskData.data.length - 1].score;
  }, [riskData]);

  const currentBreakdown = useMemo(() => {
    if (!riskData || !riskData.data || riskData.data.length === 0) return [];
    const last = riskData.data[riskData.data.length - 1];
    const comps = last.components;
    
    const mapping: Record<string, string> = {
      cyc_def: "Cyclicals vs Defensives",
      rty_dji: "Small Caps vs Large Caps",
      es_gc: "Stocks vs Gold",
      hg_gc: "Copper vs Gold",
      btc_nq: "Bitcoin vs Nasdaq",
      etf_flow: "ETF Flows"
    };

    return Object.entries(comps).map(([key, val]) => ({
      name: mapping[key] || key,
      value: val,
      signal: val > 0 ? "Risk On" : val < 0 ? "Risk Off" : "Neutral",
      score: val // Assuming raw value is the score contribution or similar
    }));
  }, [riskData]);
  
  const getRegime = (score: number) => {
    if (score > 20) return { label: "RISK ON", color: "text-emerald-500", bg: "bg-emerald-500/10" };
    if (score < -20) return { label: "RISK OFF", color: "text-rose-500", bg: "bg-rose-500/10" };
    return { label: "NEUTRAL", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  };

  const regime = getRegime(currentScore);

  // Gradient Offsets Calculation
  // Range: -200 to 200. Total = 400.
  // Top (200) is 0%. Bottom (-200) is 100%.
  // 0 score is at 50%.
  // 50 score: (200 - 50) / 400 = 0.375 (37.5%)
  // 20 score: (200 - 20) / 400 = 0.45 (45%)
  // -20 score: (200 - (-20)) / 400 = 0.55 (55%)
  // -50 score: (200 - (-50)) / 400 = 0.625 (62.5%)
  
  const gradientOffset = () => {
    // This function is static for fixed domain [-200, 200]
    return {
      off50: 0.375,
      off20: 0.45,
      offMinus20: 0.55,
      offMinus50: 0.625
    };
  };

  const off = gradientOffset();

  if (authLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile?.tier !== 'ultra') {
    return (
      <div className="h-[calc(100vh-100px)] flex flex-col items-center justify-center gap-6 border border-border/40 bg-card/50 backdrop-blur-sm rounded-lg p-8 text-center">
        <div className="p-4 rounded-full bg-muted/30">
          <Lock className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold tracking-tight">Available only for Ultra!</h2>
          <p className="text-muted-foreground">
            The Risk-On/Risk-Off Regime indicator is an exclusive feature for Ultra tier members.
            It provides institutional-grade market regime analysis.
          </p>
        </div>
        {!profile && (
          <Button onClick={signInWithGoogle} size="lg" className="gap-2">
            Sign In to Access
          </Button>
        )}
      </div>
    );
  }

  if (riskLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (riskError) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-destructive">
        Failed to load RORO data
      </div>
    );
  }

  const CustomLegend = () => (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs mb-6 px-4">
      <div className="flex items-center gap-2">
        <div className="w-4 h-0.5 bg-foreground"></div>
        <span className="text-muted-foreground font-medium">BTC Price</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#d1c4e9]"></div>
        <span className="text-muted-foreground">Neutral risk-on</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#d7ccc8]"></div>
        <span className="text-muted-foreground">Neutral risk-off</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#9575cd]"></div>
        <span className="text-muted-foreground">Basic risk-on</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#8d6e63]"></div>
        <span className="text-muted-foreground">Basic risk-off</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#673ab7]"></div>
        <span className="text-muted-foreground">Strong bull</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[#4e342e]"></div>
        <span className="text-muted-foreground">Strong bear</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] gap-4" ref={containerRef}>
      {/* Top Bar - Stats */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm shrink-0">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Main Score */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <span className="font-medium">Risk Regime</span>
            </div>
            <div className={`px-3 py-1 rounded border ${regime.bg} border-border/50 flex items-center gap-3`}>
              <span className={`text-lg font-bold ${regime.color}`}>{regime.label}</span>
              <span className="text-xl font-mono font-bold">{currentScore.toFixed(1)}</span>
            </div>
          </div>

          {/* Breakdown Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {currentBreakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 border border-border/30 text-xs">
                <span className="text-muted-foreground">{item.name}</span>
                <span className={`font-mono font-bold ${item.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {item.score > 0 ? '+' : ''}{item.score.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          
          {/* Snapshot Button */}
          <div className="flex items-center">
            <SnapshotButton 
              containerRef={containerRef}
              symbol="RORO_Regime"
              timeframe="1D"
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm flex-1 min-h-0 flex flex-col">
        <CardHeader className="py-3 border-b border-border/40 shrink-0">
          <CardTitle className="text-center text-lg font-medium">Risk-on/Risk-off regime</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
          <div className="pt-2">
            <CustomLegend />
          </div>
          <div className="w-full flex-1 min-h-0 px-4 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGradientCorrected" x1="0" y1="0" x2="0" y2="1">
                     {/* Strong Bull (>50) */}
                    <stop offset="0%" stopColor="#673ab7" stopOpacity={0.85} />
                    <stop offset={`${off.off50 * 100}%`} stopColor="#673ab7" stopOpacity={0.85} />
                    
                    {/* Basic Risk-On (20-50) */}
                    <stop offset={`${off.off50 * 100}%`} stopColor="#9575cd" stopOpacity={0.85} />
                    <stop offset={`${off.off20 * 100}%`} stopColor="#9575cd" stopOpacity={0.85} />
                    
                    {/* Neutral Risk-On (0-20) */}
                    <stop offset={`${off.off20 * 100}%`} stopColor="#d1c4e9" stopOpacity={0.85} />
                    <stop offset="50%" stopColor="#d1c4e9" stopOpacity={0.85} />
                    
                    {/* Neutral Risk-Off (-20-0) */}
                    <stop offset="50%" stopColor="#d7ccc8" stopOpacity={0.85} />
                    <stop offset={`${off.offMinus20 * 100}%`} stopColor="#d7ccc8" stopOpacity={0.85} />
                    
                    {/* Basic Risk-Off (-50--20) */}
                    <stop offset={`${off.offMinus20 * 100}%`} stopColor="#8d6e63" stopOpacity={0.85} />
                    <stop offset={`${off.offMinus50 * 100}%`} stopColor="#8d6e63" stopOpacity={0.85} />
                    
                    {/* Strong Bear (<-50) */}
                    <stop offset={`${off.offMinus50 * 100}%`} stopColor="#4e342e" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#4e342e" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(new Date(val), 'yyyy-MM-dd')}
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                  dy={10}
                />
                
                <YAxis 
                  yAxisId="left"
                  domain={[-200, 200]}
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  ticks={[100, 50, 0, -50, -100]}
                />
                
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  domain={['auto', 'auto']}
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val.toLocaleString()}
                />
                
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const score = payload[0].value as number;
                      const price = payload[1]?.value as number;
                      return (
                        <div className="bg-background/95 backdrop-blur border border-border p-3 rounded shadow-xl text-xs">
                          <div className="font-medium mb-2 text-muted-foreground">{format(new Date(label), 'EEE, dd MMM yyyy')}</div>
                          <div className="flex items-center gap-3 mb-1">
                            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                            <span className="text-muted-foreground">Risk Score:</span>
                            <span className={`font-bold ${score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {score.toFixed(1)}
                            </span>
                          </div>
                          {price && (
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-foreground"></div>
                              <span className="text-muted-foreground">BTC Price:</span>
                              <span className="font-mono font-medium text-foreground">
                                ${price.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                
                <ReferenceLine y={0} yAxisId="left" stroke="rgba(255,255,255,0.1)" />
                
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="score"
                  stroke="none"
                  fill="url(#scoreGradientCorrected)"
                  animationDuration={1000}
                />
                
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="btc_price"
                  stroke="currentColor" 
                  className="text-foreground"
                  strokeWidth={1.5}
                  dot={false}
                  animationDuration={1000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
