import React, { useState, useMemo } from 'react';
import { useKlines } from '@/hooks/useKlines';
import { QuantChart, type ChartDataPoint, type Overlay } from '@/components/charts/QuantChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Helper to calculate ATR
const calculateATR = (klines: any[], period: number = 14) => {
  if (klines.length < period + 1) return new Array(klines.length).fill(1); // Fallback

  const trs = klines.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prevClose = klines[i - 1].close;
    return Math.max(
      k.high - k.low,
      Math.abs(k.high - prevClose),
      Math.abs(k.low - prevClose)
    );
  });

  const atrs = [];
  let sum = 0;
  // Initial SMA
  for (let i = 0; i < period; i++) {
    sum += trs[i];
    atrs.push(sum / (i + 1)); // Approximate for start
  }
  
  // Wilder's Smoothing
  let prevATR = sum / period;
  atrs[period - 1] = prevATR; // Correct the last one

  for (let i = period; i < klines.length; i++) {
    const currentTR = trs[i];
    const currentATR = (prevATR * (period - 1) + currentTR) / period;
    atrs.push(currentATR);
    prevATR = currentATR;
  }

  return atrs;
};

export const CrossPairAnalyzer = () => {
  const [symbolA, setSymbolA] = useState('BTCUSDT');
  const [symbolB, setSymbolB] = useState('ETHUSDT');
  const [inputA, setInputA] = useState('BTCUSDT');
  const [inputB, setInputB] = useState('ETHUSDT');
  const [interval] = useState('4h'); // Fixed interval for stability

  const { klines: klinesA, isLoading: loadingA } = useKlines({
    symbol: symbolA,
    interval,
    lookbackDays: 90,
    dataSource: 'futures',
  });

  const { klines: klinesB, isLoading: loadingB } = useKlines({
    symbol: symbolB,
    interval,
    lookbackDays: 90,
    dataSource: 'futures',
  });

  const handleUpdate = () => {
    setSymbolA(inputA.toUpperCase());
    setSymbolB(inputB.toUpperCase());
  };

  const chartData = useMemo(() => {
    if (!klinesA.length || !klinesB.length) return [];

    // Align by timestamp
    const mapB = new Map(klinesB.map(k => [k.openTime, k]));
    
    // Calculate ATRs
    const atrA = calculateATR(klinesA);
    // We need to map ATRs to timestamps to align correctly, but since klinesA is sequential, we can index.
    // However, if we filter klinesA, we break the index.
    // Let's assume klinesA is continuous for ATR calc, then we filter for intersection.
    
    // We need to calculate ATR for B as well, but B might have different timestamps?
    // Ideally we calculate ATR on the full dataset of B, then match.
    const atrB_full = calculateATR(klinesB);
    const atrB_map = new Map(klinesB.map((k, i) => [k.openTime, atrB_full[i]]));

    const combined: ChartDataPoint[] = [];

    klinesA.forEach((kA, i) => {
      const kB = mapB.get(kA.openTime);
      if (!kB) return;

      const volA = atrA[i];
      const volB = atrB_map.get(kA.openTime) || 1;

      // Avoid division by zero
      if (volA === 0 || volB === 0 || kB.close === 0) return;

      // Volatility Adjusted Ratio
      // (PriceA / VolA) / (PriceB / VolB)
      const adjPriceA = kA.close / volA;
      const adjPriceB = kB.close / volB;
      const ratio = adjPriceA / adjPriceB;

      // Raw Ratio for OHLC construction (approximation)
      // We construct a synthetic candle for the ratio
      // Open = (OpenA/VolA) / (OpenB/VolB) ... this is getting complex.
      // Let's just stick to Close ratio for the line, and maybe build a simple candle based on High/Low ratios?
      // Synthetic High = Max of ratios? No.
      // Let's just plot the Close Ratio as a line or simple candle.
      // For "Candle" representation of a spread/ratio:
      // Open = (OpenA/VolA) / (OpenB/VolB)
      // Close = (CloseA/VolA) / (CloseB/VolB)
      // High = Max(Open, Close) * 1.01 (Fake wicks? No, let's try to be accurate)
      // Accurate High of a ratio is hard without tick data.
      // Let's approximate: High = (HighA/VolA) / (LowB/VolB) -> Max possible numerator / Min possible denominator gives Max Ratio
      // Low = (LowA/VolA) / (HighB/VolB) -> Min possible numerator / Max possible denominator gives Min Ratio
      
      const open = (kA.open / volA) / (kB.open / volB);
      const close = (kA.close / volA) / (kB.close / volB);
      const high = (kA.high / volA) / (kB.low / volB); // Max ratio
      const low = (kA.low / volA) / (kB.high / volB); // Min ratio

      combined.push({
        timestamp: kA.openTime,
        open,
        high,
        low,
        close,
        rawRatio: kA.close / kB.close
      });
    });

    return combined.sort((a, b) => a.timestamp - b.timestamp);
  }, [klinesA, klinesB]);

  const overlays: Overlay[] = [
    {
      id: 'Raw Ratio',
      type: 'line',
      dataKey: 'rawRatio',
      color: '#94a3b8', // Slate
      opacity: 0.2,
      width: 1
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="grid gap-2 flex-1">
          <Label>Asset A (Numerator)</Label>
          <Input 
            value={inputA} 
            onChange={(e) => setInputA(e.target.value)} 
            placeholder="BTCUSDT"
            className="font-mono uppercase"
          />
        </div>
        <div className="flex items-center justify-center pb-2">
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="grid gap-2 flex-1">
          <Label>Asset B (Denominator)</Label>
          <Input 
            value={inputB} 
            onChange={(e) => setInputB(e.target.value)} 
            placeholder="ETHUSDT"
            className="font-mono uppercase"
          />
        </div>
        <Button onClick={handleUpdate} disabled={loadingA || loadingB}>
          {(loadingA || loadingB) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Analyze Pair
        </Button>
      </div>

      <Alert className="bg-secondary/20 border-primary/20">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs text-muted-foreground">
          Displaying <strong>Volatility Adjusted Ratio</strong>: (Price A / ATR A) ÷ (Price B / ATR B). 
          This normalizes the spread by the volatility of each asset.
        </AlertDescription>
      </Alert>

      <Card className="h-[500px] border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader className="py-3 border-b border-border/40">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {symbolA} / {symbolB} <span className="text-muted-foreground text-xs font-normal">(Vol Adjusted)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[450px]">
          {chartData.length > 0 ? (
            <QuantChart 
              data={chartData} 
              height="100%" 
              className="w-full h-full"
              overlays={[]} // No overlays for now, just the candles of the ratio
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              {(loadingA || loadingB) ? 'Loading market data...' : 'No data available for this pair intersection'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
