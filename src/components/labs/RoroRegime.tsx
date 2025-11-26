import React, { useMemo } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuantChart, ChartDataPoint, Overlay } from "@/components/charts/QuantChart";
import { Loader2, Activity, AlertTriangle } from "lucide-react";

// Types based on the API contract
interface RiskRegimeResponse {
  history: {
    date: string;      // Format: "YYYY-MM-DD"
    score: number;     // -100 to 100
    btc_price: number; // Price on that date
  }[];
  current_breakdown: {
    name: string;      // Indicator name
    value: number;     // Raw value
    signal: string;    // "Risk On" | "Risk Off" | "Neutral"
    score: number;     // Contribution to total score
  }[];
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const API_BASE_URL = 'https://api.borkiss.trade/api/v1';

export const RoroRegime = () => {
  const { data, error, isLoading } = useSWR<RiskRegimeResponse>(`${API_BASE_URL}/risk-regime`, fetcher);

  const chartData = useMemo(() => {
    if (!data || !data.history) return [];
    return data.history.map(h => ({
      timestamp: new Date(h.date).getTime(),
      open: h.score, // Map Score to OHLC for Main Chart (Histogram/Area)
      high: h.score,
      low: h.score,
      close: h.score,
      score: h.score,
      btc_price: h.btc_price
    }));
  }, [data]);

  const currentScore = useMemo(() => {
    if (!data) return 0;
    if (data.history && data.history.length > 0) {
      return data.history[data.history.length - 1].score;
    }
    // Fallback: sum of breakdown scores
    return data.current_breakdown.reduce((acc, item) => acc + item.score, 0);
  }, [data]);
  
  const getRegime = (score: number) => {
    if (score > 20) return { label: "RISK ON", color: "text-emerald-500", bg: "bg-emerald-500/10" };
    if (score < -20) return { label: "RISK OFF", color: "text-rose-500", bg: "bg-rose-500/10" };
    return { label: "NEUTRAL", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  };

  const regime = getRegime(currentScore);

  const overlays: Overlay[] = useMemo(() => [
    {
      id: 'BTC Price',
      type: 'line',
      dataKey: 'btc_price',
      color: '#f59e0b', // Amber
      yAxisId: 'right', // Price on right
      width: 2
    }
  ], []);

  if (isLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-destructive">
        Failed to load RORO data
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
      {/* Side Panel - Stats */}
      <Card className="lg:col-span-1 border-border/40 bg-card/50 backdrop-blur-sm h-full overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Risk Regime
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Score */}
          <div className={`p-4 rounded-lg border ${regime.bg} border-border/50 text-center space-y-2`}>
            <div className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Current Status</div>
            <div className={`text-3xl font-bold ${regime.color}`}>{regime.label}</div>
            <div className="text-4xl font-mono font-bold">{currentScore.toFixed(1)}</div>
          </div>

          {/* Breakdown */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Component Breakdown</h3>
            <div className="space-y-3">
              {data?.current_breakdown.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors">
                  <div className="space-y-0.5">
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.signal}</div>
                  </div>
                  <div className={`font-mono font-bold ${item.score > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {item.score > 0 ? '+' : ''}{item.score.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="p-3 rounded bg-muted/20 text-xs text-muted-foreground border border-border/30">
            <div className="flex items-center gap-2 mb-1 text-foreground font-medium">
              <AlertTriangle className="w-3 h-3" />
              About this metric
            </div>
            The RORO (Risk-On / Risk-Off) score aggregates data from volatility markets, credit spreads, and funding rates to determine the current market appetite for risk assets.
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      <Card className="lg:col-span-3 border-border/40 bg-card/50 backdrop-blur-sm h-full flex flex-col">
        <CardHeader className="py-3 px-4 border-b border-border/40 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium">Historical Regime Analysis</CardTitle>
          <div className="flex items-center gap-4 text-xs">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 bg-violet-500/60 rounded-sm"></div>
               <span>Risk Score</span>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
               <span>BTC Price</span>
             </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0">
          <div className="w-full h-full bg-background/50">
            <QuantChart
              data={chartData}
              overlays={overlays}
              height="100%"
              className="w-full h-full"
              chartType="area" // Main series is Score (Area)
              mainSeriesName="Risk Score"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
