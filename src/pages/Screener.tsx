import React, { useState, useMemo, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useScreenerData } from "@/hooks/useScreenerData";
import { ScreenerRow } from "@/lib/screener/types";
import {
  formatLargeNumber,
  formatPrice,
  formatPercent,
  formatFundingRate,
} from "@/lib/screener/calculations";

// ============================================
// TYPES
// ============================================

type SortField = keyof ScreenerRow;
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// ============================================
// COMPONENT
// ============================================

const Screener = () => {
  const { data, loading, error, lastUpdate, refresh } = useScreenerData();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'quoteVolume24h',
    direction: 'desc'
  });

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = data;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = data.filter(row =>
        row.symbol.toLowerCase().includes(query) ||
        row.baseAsset.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.field];
      const bVal = b[sortConfig.field];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, searchQuery, sortConfig]);

  // Handle column sort
  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Render sort indicator
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    }
    return sortConfig.direction === 'desc'
      ? <ArrowDown className="ml-1 h-3 w-3 text-primary" />
      : <ArrowUp className="ml-1 h-3 w-3 text-primary" />;
  };

  // Helper function to determine color based on value
  const getColorClass = (value: number | null): string => {
    if (value === null) return 'text-muted-foreground';
    if (value < 0) return 'text-red-500';
    if (value > 0) return 'text-green-500';
    return 'text-muted-foreground';
  };

  // Format last update time
  const [, forceUpdate] = useState(0);
  
  // Force re-render every second to update "Updated X seconds ago"
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const formatLastUpdate = () => {
    if (!lastUpdate) return '';
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Screener</h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-xs text-muted-foreground">
              {data.length} pairs • Updated {formatLastUpdate()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search symbols..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            className="h-9 w-9"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="flex-1 overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Binance Futures Perpetuals
            {loading && <RefreshCw className="h-3 w-3 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-full overflow-auto">
          <div className="min-w-max">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead
                  className="w-[160px] font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('symbol')}
                >
                  <div className="flex items-center">
                    Symbol
                    <SortIndicator field="symbol" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center justify-end">
                    Price
                    <SortIndicator field="price" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('ticks5m')}
                >
                  <div className="flex items-center justify-end">
                    Ticks 5m
                    <SortIndicator field="ticks5m" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('change5m')}
                >
                  <div className="flex items-center justify-end">
                    Change 5m
                    <SortIndicator field="change5m" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('volume5m')}
                >
                  <div className="flex items-center justify-end">
                    Volume 5m
                    <SortIndicator field="volume5m" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('volatility15m')}
                >
                  <div className="flex items-center justify-end">
                    Vol 15m
                    <SortIndicator field="volatility15m" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('volume1h')}
                >
                  <div className="flex items-center justify-end">
                    Volume 1h
                    <SortIndicator field="volume1h" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('vdelta1h')}
                >
                  <div className="flex items-center justify-end">
                    Vdelta 1h
                    <SortIndicator field="vdelta1h" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('oiChange8h')}
                >
                  <div className="flex items-center justify-end">
                    OI Δ 8h
                    <SortIndicator field="oiChange8h" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('change1d')}
                >
                  <div className="flex items-center justify-end">
                    Change 1d
                    <SortIndicator field="change1d" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('fundingRate')}
                >
                  <div className="flex items-center justify-end">
                    Funding
                    <SortIndicator field="fundingRate" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('openInterestValue')}
                >
                  <div className="flex items-center justify-end">
                    Open Interest
                    <SortIndicator field="openInterestValue" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('quoteVolume24h')}
                >
                  <div className="flex items-center justify-end">
                    Vol 24h
                    <SortIndicator field="quoteVolume24h" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('dayOpen')}
                >
                  <div className="flex items-center justify-end">
                    Day
                    <SortIndicator field="dayOpen" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold text-xs uppercase tracking-wider text-foreground/70 bg-card cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('weekOpen')}
                >
                  <div className="flex items-center justify-end">
                    Week
                    <SortIndicator field="weekOpen" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && data.length === 0 ? (
                // Loading skeleton
                Array.from({ length: 20 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/30">
                    {Array.from({ length: 15 }).map((_, j) => (
                      <TableCell key={j} className="py-2">
                        <div className="h-4 bg-muted/50 rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                    {searchQuery ? 'No symbols match your search' : 'No data available'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((row, index) => (
                  <TableRow
                    key={row.symbol}
                    className="hover:bg-muted/50 border-b border-border/30 even:bg-muted/10 transition-colors"
                  >
                    <TableCell className="font-medium py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[10px]">▶</span>
                        <span className="text-sm text-foreground font-medium">{row.symbol}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-foreground">
                      {formatPrice(row.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {row.ticks5m ?? '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${getColorClass(row.change5m)}`}>
                      {row.change5m !== null ? formatPercent(row.change5m) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {row.volume5m !== null ? formatLargeNumber(row.volume5m) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {row.volatility15m !== null ? (row.volatility15m * 100).toFixed(3) + '%' : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {row.volume1h !== null ? formatLargeNumber(row.volume1h) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${getColorClass(row.vdelta1h)}`}>
                      {row.vdelta1h !== null ? formatLargeNumber(row.vdelta1h) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${getColorClass(row.oiChange8h)}`}>
                      {row.oiChange8h !== null ? formatLargeNumber(row.oiChange8h) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${getColorClass(row.change1d)}`}>
                      {row.change1d !== null ? formatPercent(row.change1d) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${getColorClass(row.fundingRate)}`}>
                      {row.fundingRate !== null ? formatFundingRate(row.fundingRate) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {row.openInterest !== null ? formatLargeNumber(row.openInterest) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm py-2 whitespace-nowrap text-muted-foreground">
                      {formatLargeNumber(row.quoteVolume24h)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${row.dayOpen !== null ? (row.price >= row.dayOpen ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                      {row.dayOpen !== null ? (
                        ((row.price - row.dayOpen) / row.dayOpen * 100) >= 0 
                          ? `+${((row.price - row.dayOpen) / row.dayOpen * 100).toFixed(2)}%`
                          : `${((row.price - row.dayOpen) / row.dayOpen * 100).toFixed(2)}%`
                      ) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm py-2 whitespace-nowrap ${row.weekOpen !== null ? (row.price >= row.weekOpen ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                      {row.weekOpen !== null ? (
                        ((row.price - row.weekOpen) / row.weekOpen * 100) >= 0 
                          ? `+${((row.price - row.weekOpen) / row.weekOpen * 100).toFixed(2)}%`
                          : `${((row.price - row.weekOpen) / row.weekOpen * 100).toFixed(2)}%`
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Screener;
