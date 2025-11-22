import React, { useState, useMemo, useEffect } from 'react';
import { fetchFuturesSymbols, fetchAllKlines, type BinanceSymbol } from '@/lib/binance';
import { QuantChart, type ChartDataPoint, type Overlay } from '@/components/charts/QuantChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Helper to calculate GARCH(1,1) volatility
const calculateGARCH = (klines: any[]) => {
  if (klines.length < 2) return new Array(klines.length).fill(0.01);

  const returns = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(Math.log(klines[i].close / klines[i - 1].close));
  }

  // GARCH(1,1) parameters
  const omega = 0.000002;
  const alpha = 0.05;
  const beta = 0.90;

  const vars = [];
  // Initial variance estimate (first 30)
  let sumSq = 0;
  const initN = Math.min(returns.length, 30);
  for (let i = 0; i < initN; i++) sumSq += returns[i] * returns[i];
  let currentVar = sumSq / initN;
  
  vars.push(currentVar);

  for (let i = 1; i < returns.length; i++) {
    const r = returns[i - 1];
    currentVar = omega + alpha * (r * r) + beta * currentVar;
    vars.push(currentVar);
  }

  // Map back to klines length
  return klines.map((_, i) => {
    if (i === 0) return Math.sqrt(vars[0]);
    return Math.sqrt(vars[i - 1]);
  });
};

// Helper to calculate rolling correlation of log returns
const calculateCorrelation = (klinesA: any[], klinesB: any[], period: number = 20) => {
  // Calculate log returns first
  const returnsA = [];
  const returnsB = [];
  
  for (let i = 1; i < klinesA.length; i++) {
    returnsA.push(Math.log(klinesA[i].close / klinesA[i-1].close));
    returnsB.push(Math.log(klinesB[i].close / klinesB[i-1].close));
  }

  const correlations = new Array(klinesA.length).fill(0);

  // We need at least 'period' returns to calculate correlation
  // returns array is 1 shorter than klines
  for (let i = period; i < returnsA.length; i++) {
    const sliceA = returnsA.slice(i - period, i);
    const sliceB = returnsB.slice(i - period, i);

    const meanA = sliceA.reduce((a, b) => a + b, 0) / period;
    const meanB = sliceB.reduce((a, b) => a + b, 0) / period;

    let num = 0;
    let denA = 0;
    let denB = 0;

    for (let j = 0; j < period; j++) {
      const diffA = sliceA[j] - meanA;
      const diffB = sliceB[j] - meanB;
      num += diffA * diffB;
      denA += diffA * diffA;
      denB += diffB * diffB;
    }

    const correlation = num / Math.sqrt(denA * denB);
    // Map to the corresponding kline index (i + 1 because returns are shifted)
    correlations[i + 1] = isNaN(correlation) ? 0 : correlation;
  }

  return correlations;
};

export const CrossPairAnalyzer = () => {
  const [symbolA, setSymbolA] = useState('BTCUSDT');
  const [symbolB, setSymbolB] = useState('ETHUSDT');
  const [interval, setInterval] = useState('4h');
  const [symbols, setSymbols] = useState<BinanceSymbol[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [openA, setOpenA] = useState(false);
  const [openB, setOpenB] = useState(false);

  // Fetch available symbols on mount
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const data = await fetchFuturesSymbols();
        setSymbols(data);
      } catch (error) {
        console.error('Failed to load symbols:', error);
      } finally {
        setLoadingSymbols(false);
      }
    };
    loadSymbols();
  }, []);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setChartData([]);
    
    try {
      // Fetch all available data for both symbols
      const [klinesA, klinesB] = await Promise.all([
        fetchAllKlines({ symbol: symbolA, interval, dataSource: 'futures' }),
        fetchAllKlines({ symbol: symbolB, interval, dataSource: 'futures' })
      ]);

      if (!klinesA.length || !klinesB.length) {
        console.warn('No data available for one or both symbols');
        return;
      }

      // Align by timestamp and trim to shorter dataset
      const mapB = new Map(klinesB.map(k => [k.openTime, k]));
      const mapA = new Map(klinesA.map(k => [k.openTime, k]));
      
      // Find common timestamps
      const commonTimestamps = klinesA
        .map(k => k.openTime)
        .filter(t => mapB.has(t))
        .sort((a, b) => a - b);

      if (commonTimestamps.length === 0) {
        console.warn('No overlapping data between the two symbols');
        return;
      }

      // Calculate GARCH sigmas on full history to preserve volatility memory
      const sigmaA = calculateGARCH(klinesA);
      const sigmaB = calculateGARCH(klinesB);
      const sigmaA_map = new Map(klinesA.map((k, i) => [k.openTime, sigmaA[i]]));
      const sigmaB_map = new Map(klinesB.map((k, i) => [k.openTime, sigmaB[i]]));

      // Create aligned arrays for correlation calculation
      const alignedA = commonTimestamps.map(t => mapA.get(t)!);
      const alignedB = commonTimestamps.map(t => mapB.get(t)!);
      
      // Calculate Correlation on aligned data
      const correlations = calculateCorrelation(alignedA, alignedB, 20);

      const combined: ChartDataPoint[] = [];

      commonTimestamps.forEach((timestamp, i) => {
        const kA = mapA.get(timestamp)!;
        const kB = mapB.get(timestamp)!;
        const sA = sigmaA_map.get(timestamp) || 0.01;
        const sB = sigmaB_map.get(timestamp) || 0.01;

        // Normalize by volatility in price units (Price * Sigma)
        const volA = kA.close * sA;
        const volB = kB.close * sB;

        if (volA === 0 || volB === 0 || kB.close === 0 || kB.open === 0 || kB.high === 0 || kB.low === 0) return;

        const open = (kA.open / volA) / (kB.open / volB);
        const close = (kA.close / volA) / (kB.close / volB);
        
        // Fix for "crooked" wicks:
        // Instead of worst-case (High/Low), we assume positive correlation for crypto pairs.
        // We calculate tentative high/low based on High/High and Low/Low ratios.
        const rawHigh = (kA.high / volA) / (kB.high / volB);
        const rawLow = (kA.low / volA) / (kB.low / volB);

        // Ensure High/Low encompass the Open/Close (basic candle validity)
        const vals = [open, close, rawHigh, rawLow].filter(v => !isNaN(v) && isFinite(v));
        if (vals.length < 2) return;

        const high = Math.max(...vals);
        const low = Math.min(...vals);

        combined.push({
          timestamp,
          open,
          high,
          low,
          close,
          rawRatio: kA.close / kB.close,
          correlation: correlations[i]
        });
      });

      setChartData(combined.sort((a, b) => a.timestamp - b.timestamp));
    } catch (error) {
      console.error('Error analyzing pair:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="grid gap-2 flex-1">
          <Label>Asset A (Numerator)</Label>
          <Popover open={openA} onOpenChange={setOpenA}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openA}
                className="justify-between font-mono"
              >
                {symbolA}
                <ArrowRightLeft className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Search symbol..." />
                <CommandEmpty>No symbol found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-auto">
                  {symbols.map((sym) => (
                    <CommandItem
                      key={sym.symbol}
                      value={sym.symbol}
                      onSelect={() => {
                        setSymbolA(sym.symbol);
                        setOpenA(false);
                      }}
                    >
                      <span className="font-mono">{sym.symbol}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex items-center justify-center pb-2">
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        </div>
        
        <div className="grid gap-2 flex-1">
          <Label>Asset B (Denominator)</Label>
          <Popover open={openB} onOpenChange={setOpenB}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={openB}
                className="justify-between font-mono"
              >
                {symbolB}
                <ArrowRightLeft className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Search symbol..." />
                <CommandEmpty>No symbol found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-auto">
                  {symbols.map((sym) => (
                    <CommandItem
                      key={sym.symbol}
                      value={sym.symbol}
                      onSelect={() => {
                        setSymbolB(sym.symbol);
                        setOpenB(false);
                      }}
                    >
                      <span className="font-mono">{sym.symbol}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid gap-2 w-[120px]">
          <Label>Timeframe</Label>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4h">4 Hours</SelectItem>
              <SelectItem value="1d">1 Day</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <Button onClick={handleAnalyze} disabled={isLoading || loadingSymbols}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Analyze Pair
        </Button>
      </div>

      <Alert className="bg-secondary/20 border-primary/20">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs text-muted-foreground">
          Displaying <strong>Volatility Adjusted Ratio</strong>: Normalized using GARCH(1,1) volatility model. 
          This normalizes the spread by the conditional volatility of each asset. Data is trimmed to the shorter asset's history.
        </AlertDescription>
      </Alert>

      <Card className="h-[500px] border-border/40 bg-card/50 backdrop-blur-sm">
        <CardHeader className="py-3 border-b border-border/40">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {symbolA} / {symbolB} <span className="text-muted-foreground text-xs font-normal">(Vol Adjusted, {interval})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[450px]">
          {chartData.length > 0 ? (
            <QuantChart 
              data={chartData} 
              height="100%" 
              className="w-full h-full"
              overlays={[
                {
                  id: 'correlation',
                  type: 'oscillator',
                  dataKey: 'correlation',
                  color: '#fbbf24', // Amber
                  domain: [-1, 1],
                  width: 2
                }
              ]}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              {isLoading ? 'Loading market data...' : 'Select symbols and click "Analyze Pair" to view the cross pair chart'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
