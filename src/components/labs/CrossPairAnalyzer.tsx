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

      // Calculate ATRs for full datasets
      const atrA = calculateATR(klinesA);
      const atrB = calculateATR(klinesB);
      const atrA_map = new Map(klinesA.map((k, i) => [k.openTime, atrA[i]]));
      const atrB_map = new Map(klinesB.map((k, i) => [k.openTime, atrB[i]]));

      const combined: ChartDataPoint[] = [];

      commonTimestamps.forEach(timestamp => {
        const kA = mapA.get(timestamp)!;
        const kB = mapB.get(timestamp)!;
        const volA = atrA_map.get(timestamp) || 1;
        const volB = atrB_map.get(timestamp) || 1;

        if (volA === 0 || volB === 0 || kB.close === 0) return;

        const adjPriceA = kA.close / volA;
        const adjPriceB = kB.close / volB;

        const open = (kA.open / volA) / (kB.open / volB);
        const close = (kA.close / volA) / (kB.close / volB);
        const high = (kA.high / volA) / (kB.low / volB);
        const low = (kA.low / volA) / (kB.high / volB);

        combined.push({
          timestamp,
          open,
          high,
          low,
          close,
          rawRatio: kA.close / kB.close
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
          Displaying <strong>Volatility Adjusted Ratio</strong>: (Price A / ATR A) ÷ (Price B / ATR B). 
          This normalizes the spread by the volatility of each asset. Data is trimmed to the shorter asset's history.
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
              overlays={[]}
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
