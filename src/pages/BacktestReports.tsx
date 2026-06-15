import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, PlayIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BklitTradeReviewPanel } from "@/components/charts-kit/BklitTradeReviewPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpandableResultCard } from "@/components/ui/expandable-result-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchKlinesMultiBatch } from "@/lib/binance";
import type { Kline } from "@/lib/binance";
import {
  runFxDonchianBacktest,
  runFxLondonSweepBacktest,
  runCenturionNativeBacktestLazy,
  runUniversalBbAtrBacktest,
  calculateNativeBacktestMetrics,
  calculateNativeBacktestValidationReport,
  BIOS_ORDERFLOW_EXPERIMENT_VARIANTS,
  ICT_EXPERIMENT_VARIANTS,
  runIctExperimentVariant,
  type IctExperimentReport,
  type NativeBacktestMetrics,
  type NativeBacktestReport,
  type NativeBacktestTrade,
} from "@/lib/data-handlers";
import {
  aggregateKlines,
  getLocalCsvKlinesForRange,
  parseLocalCsvKlines,
} from "@/lib/data-handlers/local-csv-market-data";

type BacktestMarket = "crypto" | "forex";
type BacktestRangeMode = "lookback" | "custom";
type ForexDataMode = "remote" | "csv" | "workspace";
type BacktestStrategy =
  | "centurion_ict"
  | "centurion_ict_kyiv_killzones"
  | "ict_ema_atr_fvg"
  | "ict_improved_v2"
  | "ict_improved_v3"
  | "ict_v3_adx_regime_filter"
  | "order_flow_proxy_1_5r"
  | "order_flow_proxy_2r"
  | "order_flow_proxy_partial_tp"
  | "order_flow_proxy_2r_prev_day"
  | "order_flow_proxy_2r_prev_day_target15"
  | "order_flow_proxy_2r_prev_day_short"
  | "order_flow_proxy_2r_prev_day_short_target15"
  | "order_flow_proxy_2r_prev_day_short_mr10"
  | "order_flow_proxy_1_5r_prev_day_short_mr10"
  | "universal_bb_atr_mean_reversion"
  | "universal_bb_atr_target15"
  | "research_2026_adaptive_pack"
  | "fx_donchian"
  | "fx_london_sweep";

const MARKET_CONFIG = {
  crypto: {
    label: "Crypto",
    requestedExchange: "BINANCE",
    marketType: "crypto perpetual futures",
    marketDataProvider: "OKX_SWAP",
    dataSource: "okx-swap" as const,
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  },
  forex: {
    label: "Forex",
    requestedExchange: "FOREX",
    marketType: "spot forex",
    marketDataProvider: "YAHOO_FINANCE_CHART",
    dataSource: "yahoo-fx" as const,
    symbols: ["EURUSD", "GBPUSD", "USDJPY", "GER40", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURJPY", "GBPJPY"],
  },
} satisfies Record<
  BacktestMarket,
  {
    label: string;
    requestedExchange: string;
    marketType: string;
    marketDataProvider: string;
    dataSource: "okx-swap" | "yahoo-fx";
    symbols: string[];
  }
>;

const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WORKSPACE_FOREX_CSV: Partial<Record<string, string>> = {
  EURUSD: "/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  GER40: "/data/forex/GER40_1m_2024-01-01_2026-06-15.csv",
};
const LOOKBACK_OPTIONS = [
  { label: "3D", value: "3", days: 3 },
  { label: "14D", value: "14", days: 14 },
  { label: "30D", value: "30", days: 30 },
  { label: "90D", value: "90", days: 90 },
];
const STRATEGY_OPTIONS = [
  { label: "Centurion ICT Sweep", value: "centurion_ict" },
  { label: "Centurion ICT Sweep + Kyiv Kill Zones", value: "centurion_ict_kyiv_killzones" },
  { label: "ICT Sweep EMA200 + ATR FVG", value: "ict_ema_atr_fvg" },
  { label: "EURUSD ICT Sweep + FVG Improved v2", value: "ict_improved_v2" },
  { label: "Forex ICT Sweep + FVG Improved v3", value: "ict_improved_v3" },
  { label: "ICT Experiments v3 ADX Regime Filter", value: "ict_v3_adx_regime_filter" },
  { label: "Order Flow Proxy 1.5R", value: "order_flow_proxy_1_5r" },
  { label: "Order Flow Proxy 2R", value: "order_flow_proxy_2r" },
  { label: "Order Flow Proxy Partial TP", value: "order_flow_proxy_partial_tp" },
  { label: "Order Flow Proxy 2R PD", value: "order_flow_proxy_2r_prev_day" },
  { label: "Order Flow Proxy 2R PD Target 15", value: "order_flow_proxy_2r_prev_day_target15" },
  { label: "Order Flow Proxy 2R PD Short", value: "order_flow_proxy_2r_prev_day_short" },
  { label: "Order Flow Proxy 2R PD Short Target 15", value: "order_flow_proxy_2r_prev_day_short_target15" },
  { label: "Order Flow Proxy 2R PD Short MR10", value: "order_flow_proxy_2r_prev_day_short_mr10" },
  { label: "Order Flow Proxy 1.5R PD Short MR10", value: "order_flow_proxy_1_5r_prev_day_short_mr10" },
  { label: "Universal BB ATR Mean Reversion", value: "universal_bb_atr_mean_reversion" },
  { label: "Universal BB ATR Target 15", value: "universal_bb_atr_target15" },
  { label: "Research 2026 Adaptive Pack", value: "research_2026_adaptive_pack" },
  { label: "FX Donchian Trend", value: "fx_donchian" },
  { label: "London Sweep + FVG", value: "fx_london_sweep" },
] satisfies Array<{ label: string; value: BacktestStrategy }>;

function initialSearchParams() {
  return new URLSearchParams(window.location.search);
}

function allSymbols() {
  return [...MARKET_CONFIG.crypto.symbols, ...MARKET_CONFIG.forex.symbols];
}

function inferMarketFromSymbol(symbol: string | null): BacktestMarket {
  if (symbol && MARKET_CONFIG.forex.symbols.includes(symbol)) {
    return "forex";
  }

  return "crypto";
}

function initialMarket(): BacktestMarket {
  const value = initialSearchParams().get("market")?.toLowerCase();
  if (value === "crypto" || value === "forex") return value;

  return inferMarketFromSymbol(initialSearchParams().get("symbol")?.toUpperCase() ?? null);
}

function initialSymbol(market: BacktestMarket) {
  const value = initialSearchParams().get("symbol")?.toUpperCase();
  const symbols = MARKET_CONFIG[market].symbols;

  if (value && symbols.includes(value)) return value;
  if (value && allSymbols().includes(value)) return value;

  return symbols[0];
}

function initialLookback() {
  const value = initialSearchParams().get("lookback");
  return value && LOOKBACK_OPTIONS.some((option) => option.value === value) ? value : "3";
}

function initialIncludePlanB() {
  const value = initialSearchParams().get("planB");
  return value === "1" || value === "true";
}

function initialMinRiskPips() {
  const value = Number(initialSearchParams().get("min_risk_pips"));
  return Number.isFinite(value) && value >= 0 ? String(value) : "5";
}

function isoDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function initialRangeMode(): BacktestRangeMode {
  const params = initialSearchParams();
  const value = params.get("range");
  if (value === "custom" || (params.get("start") && params.get("end"))) return "custom";

  return "lookback";
}

function initialStartDate() {
  return initialSearchParams().get("start") ?? isoDate(Date.now() - 30 * ONE_DAY_MS);
}

function initialEndDate() {
  return initialSearchParams().get("end") ?? isoDate(Date.now());
}

function initialForexDataMode(): ForexDataMode {
  const value = initialSearchParams().get("source");
  if (value === "csv" || value === "workspace") return value;

  return "remote";
}

function initialStrategy(): BacktestStrategy {
  const value = initialSearchParams().get("strategy");
  if (
    value === "centurion_ict_kyiv_killzones" ||
    value === "ict_ema_atr_fvg" ||
    value === "ict_improved_v2" ||
    value === "ict_improved_v3" ||
    value === "ict_v3_adx_regime_filter" ||
    value === "order_flow_proxy_1_5r" ||
    value === "order_flow_proxy_2r" ||
    value === "order_flow_proxy_partial_tp" ||
    value === "order_flow_proxy_2r_prev_day" ||
    value === "order_flow_proxy_2r_prev_day_target15" ||
    value === "order_flow_proxy_2r_prev_day_short" ||
    value === "order_flow_proxy_2r_prev_day_short_target15" ||
    value === "order_flow_proxy_2r_prev_day_short_mr10" ||
    value === "order_flow_proxy_1_5r_prev_day_short_mr10" ||
    value === "universal_bb_atr_mean_reversion" ||
    value === "universal_bb_atr_target15" ||
    value === "research_2026_adaptive_pack" ||
    value === "fx_donchian" ||
    value === "fx_london_sweep"
  ) {
    return value;
  }

  return "centurion_ict";
}

function isCenturionStrategy(strategy: BacktestStrategy) {
  return (
    strategy === "centurion_ict" ||
    strategy === "centurion_ict_kyiv_killzones" ||
    strategy === "ict_ema_atr_fvg" ||
    strategy === "ict_improved_v2" ||
    strategy === "ict_improved_v3" ||
    strategy === "ict_v3_adx_regime_filter" ||
    strategy === "order_flow_proxy_1_5r" ||
    strategy === "order_flow_proxy_2r" ||
    strategy === "order_flow_proxy_partial_tp" ||
    strategy === "order_flow_proxy_2r_prev_day" ||
    strategy === "order_flow_proxy_2r_prev_day_target15" ||
    strategy === "order_flow_proxy_2r_prev_day_short" ||
    strategy === "order_flow_proxy_2r_prev_day_short_target15" ||
    strategy === "order_flow_proxy_2r_prev_day_short_mr10" ||
    strategy === "order_flow_proxy_1_5r_prev_day_short_mr10"
  );
}

function experimentVariantForStrategy(strategy: BacktestStrategy) {
  if (strategy === "ict_v3_adx_regime_filter") return "v3_adx_regime_filter";
  if (strategy === "order_flow_proxy_1_5r") return "order_flow_proxy_1_5r";
  if (strategy === "order_flow_proxy_2r") return "order_flow_proxy_2r";
  if (strategy === "order_flow_proxy_partial_tp") return "order_flow_proxy_partial_tp";
  if (strategy === "order_flow_proxy_2r_prev_day") return "order_flow_proxy_2r_prev_day";
  if (strategy === "order_flow_proxy_2r_prev_day_target15") return "order_flow_proxy_2r_prev_day_target15";
  if (strategy === "order_flow_proxy_2r_prev_day_short") return "order_flow_proxy_2r_prev_day_short";
  if (strategy === "order_flow_proxy_2r_prev_day_short_target15") return "order_flow_proxy_2r_prev_day_short_target15";
  if (strategy === "order_flow_proxy_2r_prev_day_short_mr10") return "order_flow_proxy_2r_prev_day_short_mr10";
  if (strategy === "order_flow_proxy_1_5r_prev_day_short_mr10") return "order_flow_proxy_1_5r_prev_day_short_mr10";
  return null;
}

function experimentStrategyMetadata(strategy: BacktestStrategy) {
  if (strategy === "ict_v3_adx_regime_filter") {
    return {
      displayName: "ICT Experiments v3 ADX Regime Filter",
      rewardRMultiple: 2,
      setupVariant: "ict_experiment_v3_adx_regime_filter" as const,
      version: "experiment.v3.adx-regime-filter.1",
    };
  }
  if (strategy === "order_flow_proxy_1_5r") {
    return {
      displayName: "Order Flow Proxy 1.5R",
      rewardRMultiple: 1.5,
      setupVariant: "order_flow_proxy_1_5r" as const,
      version: "experiment.order-flow-proxy.1_5r.1",
    };
  }
  if (strategy === "order_flow_proxy_2r") {
    return {
      displayName: "Order Flow Proxy 2R",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r" as const,
      version: "experiment.order-flow-proxy.2r.1",
    };
  }
  if (strategy === "order_flow_proxy_partial_tp") {
    return {
      displayName: "Order Flow Proxy Partial TP",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_partial_tp" as const,
      version: "experiment.order-flow-proxy.partial-tp.1",
    };
  }
  if (strategy === "order_flow_proxy_2r_prev_day") {
    return {
      displayName: "Order Flow Proxy 2R Previous Day",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r_prev_day" as const,
      version: "experiment.order-flow-proxy.2r.previous-day.1",
    };
  }
  if (strategy === "order_flow_proxy_2r_prev_day_target15") {
    return {
      displayName: "Order Flow Proxy 2R Previous Day Target 15",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r_prev_day_target15" as const,
      version: "experiment.order-flow-proxy.2r.previous-day-target15.1",
    };
  }
  if (strategy === "order_flow_proxy_2r_prev_day_short") {
    return {
      displayName: "Order Flow Proxy 2R Previous Day Short",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r_prev_day_short" as const,
      version: "experiment.order-flow-proxy.2r.previous-day-short.1",
    };
  }
  if (strategy === "order_flow_proxy_2r_prev_day_short_target15") {
    return {
      displayName: "Order Flow Proxy 2R Previous Day Short Target 15",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r_prev_day_short_target15" as const,
      version: "experiment.order-flow-proxy.2r.previous-day-short-target15.1",
    };
  }
  if (strategy === "order_flow_proxy_2r_prev_day_short_mr10") {
    return {
      displayName: "Order Flow Proxy 2R Previous Day Short MR10",
      rewardRMultiple: 2,
      setupVariant: "order_flow_proxy_2r_prev_day_short_mr10" as const,
      version: "experiment.order-flow-proxy.2r.previous-day-short-mr10.1",
    };
  }
  if (strategy === "order_flow_proxy_1_5r_prev_day_short_mr10") {
    return {
      displayName: "Order Flow Proxy 1.5R Previous Day Short MR10",
      rewardRMultiple: 1.5,
      setupVariant: "order_flow_proxy_1_5r_prev_day_short_mr10" as const,
      version: "experiment.order-flow-proxy.1_5r.previous-day-short-mr10.1",
    };
  }
  return null;
}

function supportsPlanB(strategy: BacktestStrategy) {
  return strategy === "centurion_ict" || strategy === "centurion_ict_kyiv_killzones";
}

function parseDateStart(date: string) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseDateEndExclusive(date: string) {
  const timestamp = parseDateStart(date);

  return timestamp == null ? null : timestamp + ONE_DAY_MS;
}

function intervalMinutes(interval: string) {
  if (interval.endsWith("m")) return Number(interval.slice(0, -1));
  if (interval.endsWith("h")) return Number(interval.slice(0, -1)) * 60;
  return 60;
}

function candlesForLookback(days: number, interval: string) {
  return Math.ceil((days * 24 * 60) / intervalMinutes(interval));
}

function candlesForRange(startTime: number, endTime: number, interval: string) {
  return Math.ceil((endTime - startTime) / (intervalMinutes(interval) * ONE_MINUTE_MS));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatForexPrice(value: number, symbol: string) {
  if (!Number.isFinite(value)) return "-";

  const fractionDigits = symbol.includes("JPY") ? 3 : 5;

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "Infinity";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)}%`;
}

function formatTime(value: number | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: number | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function metricCards(metrics: NativeBacktestMetrics) {
  return [
    ["Total trades", formatNumber(metrics.total_trades, 0)],
    ["Win rate", formatPercent(metrics.win_rate)],
    ["Net profit", formatCurrency(metrics.net_profit)],
    ["Profit factor", formatNumber(metrics.profit_factor, 2)],
    ["Expectancy", `${formatNumber(metrics.expectancy, 2)}R`],
    ["Max drawdown (from peak)", formatCurrency(metrics.max_drawdown)],
    ["Winners", formatNumber(metrics.winning_trades, 0)],
    ["Losers", formatNumber(metrics.losing_trades, 0)],
    ["Breakeven", formatNumber(metrics.breakeven_trades, 0)],
    ["Average trade", formatCurrency(metrics.average_trade)],
    ["Best trade", formatCurrency(metrics.best_trade)],
    ["Worst trade", formatCurrency(metrics.worst_trade)],
  ];
}

type ValidationCellValue = string | number;

function ValidationTable({
  emptyLabel = "No rows.",
  headers,
  maxHeightClassName,
  rows,
}: {
  emptyLabel?: string;
  headers: string[];
  maxHeightClassName?: string;
  rows: ValidationCellValue[][];
}) {
  return (
    <div className={`overflow-auto ${maxHeightClassName ?? ""}`}>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} className="whitespace-nowrap">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} className="whitespace-nowrap font-mono text-xs">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={headers.length}>
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function statusBadge(report: NativeBacktestReport | null, isLoading: boolean) {
  if (isLoading) {
    return <Badge variant="secondary">RUNNING</Badge>;
  }

  if (!report) {
    return <Badge variant="outline">READY</Badge>;
  }

  if (report.metadata.status === "failed") {
    return <Badge variant="destructive">FAILED</Badge>;
  }

  return <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">SUCCESS</Badge>;
}

function metadataRows(report: NativeBacktestReport) {
  const metadata = report.metadata;

  return [
    ["native_backtest_run_id", metadata.native_backtest_run_id],
    ["strategy_name", metadata.strategy_name],
    ["strategy_version", metadata.strategy_version],
    ["symbol", metadata.symbol],
    ["requested_exchange", metadata.requested_exchange],
    ["market_type", metadata.market_type],
    ["market_data_provider_used", metadata.market_data_provider_used],
    ["start_date", metadata.start_date],
    ["end_date", metadata.end_date],
    ["initial_capital", formatCurrency(metadata.initial_capital)],
    ["risk_per_trade_percent", formatPercent(metadata.risk_per_trade_percent)],
    ["reward_r_multiple", `${formatNumber(metadata.reward_r_multiple, 2)}R`],
    ["include_plan_b", metadata.include_plan_b ? "true" : "false"],
    ["entry_window_mode", metadata.entry_window_mode ?? "all"],
    ["strategy_profile", metadata.strategy_profile ?? "-"],
    ["break_even_enabled", metadata.break_even_enabled == null ? "-" : metadata.break_even_enabled ? "true" : "false"],
    ["ema_period", metadata.ema_period == null ? "-" : formatNumber(metadata.ema_period, 0)],
    ["sweep_atr_period", metadata.sweep_atr_period == null ? "-" : formatNumber(metadata.sweep_atr_period, 0)],
    [
      "sweep_depth_atr_multiple",
      metadata.sweep_depth_atr_multiple == null ? "-" : formatNumber(metadata.sweep_depth_atr_multiple, 2),
    ],
    ["fvg_atr_period", metadata.fvg_atr_period == null ? "-" : formatNumber(metadata.fvg_atr_period, 0)],
    [
      "fvg_size_atr_multiple",
      metadata.fvg_size_atr_multiple == null ? "-" : formatNumber(metadata.fvg_size_atr_multiple, 2),
    ],
    ["min_risk_pips", metadata.min_risk_pips == null ? "-" : formatNumber(metadata.min_risk_pips, 1)],
    ["status", metadata.status],
    ["error_message", metadata.error_message ?? "-"],
  ];
}

function metadataRowsForStrategy(report: NativeBacktestReport, strategy: BacktestStrategy) {
  if (isCenturionStrategy(strategy)) return metadataRows(report);
  const centurionOnlyRows = new Set([
    "entry_window_mode",
    "strategy_profile",
    "break_even_enabled",
    "ema_period",
    "sweep_atr_period",
    "sweep_depth_atr_multiple",
    "fvg_atr_period",
    "fvg_size_atr_multiple",
    "min_risk_pips",
  ]);
  if (strategy === "fx_london_sweep") {
    return metadataRows(report).filter(
      ([label]) => label !== "include_plan_b" && !centurionOnlyRows.has(label)
    );
  }

  return metadataRows(report).filter(
    ([label]) =>
      label !== "reward_r_multiple" &&
      label !== "include_plan_b" &&
      !centurionOnlyRows.has(label)
  );
}

function tradeCells(trade: NativeBacktestTrade, formatPrice: (value: number) => string) {
  return [
    trade.direction,
    trade.setup_variant,
    formatTime(trade.entry_time),
    formatPrice(trade.entry_price),
    formatPrice(trade.stop_loss),
    formatPrice(trade.take_profit),
    formatTime(trade.exit_time),
    formatPrice(trade.exit_price),
    trade.result_status,
    formatCurrency(trade.profit),
    `${formatNumber(trade.r_multiple, 2)}R`,
    formatNumber(trade.quantity, 4),
    formatCurrency(trade.risk_amount),
    formatTime(trade.setup_time),
    formatPrice(trade.fvg_low),
    formatPrice(trade.fvg_high),
    formatTime(trade.fvg_candle_1_time ?? null),
    formatTime(trade.fvg_candle_2_time ?? null),
    formatTime(trade.fvg_candle_3_time ?? null),
    formatTime(trade.fvg_formed_time),
    formatTime(trade.fvg_test_time),
    formatTime(trade.engulfing_time),
    formatPrice(trade.ema_value ?? Number.NaN),
    formatPrice(trade.sweep_depth ?? Number.NaN),
    formatPrice(trade.sweep_atr ?? Number.NaN),
    formatPrice(trade.fvg_size ?? Number.NaN),
    formatPrice(trade.fvg_atr ?? Number.NaN),
  ];
}

function ictExperimentToNativeReport({
  activeMarketDataProvider,
  config,
  endTime,
  experiment,
  requestedExchange,
  rewardRMultiple,
  setupVariant,
  startTime,
  strategyName,
  strategyVersion,
}: {
  activeMarketDataProvider: string;
  config: {
    marketType: string;
    symbol: string;
  };
  endTime: number;
  experiment: IctExperimentReport;
  requestedExchange: string;
  rewardRMultiple: number;
  setupVariant: NativeBacktestTrade["setup_variant"];
  startTime: number;
  strategyName: string;
  strategyVersion: string;
}): NativeBacktestReport {
  const trades: NativeBacktestTrade[] = experiment.trades.map((trade) => ({
    direction: trade.direction,
    setup_variant: setupVariant,
    entry_time: trade.entry_time,
    entry_price: trade.entry_price,
    stop_loss: trade.stop_loss,
    take_profit: trade.take_profit,
    exit_time: trade.exit_time,
    exit_price: trade.exit_price,
    result_status:
      trade.result_status === "partial_take_profit"
        ? "take_profit"
        : trade.result_status,
    profit: trade.profit,
    r_multiple: trade.r_multiple,
    quantity: trade.quantity,
    risk_amount: trade.risk_amount,
    setup_time: trade.setup_time,
    fvg_low: trade.fvg_low,
    fvg_high: trade.fvg_high,
    fvg_formed_time: trade.fvg_formed_time,
    fvg_test_time: trade.fvg_test_time,
    engulfing_time: trade.confirmation_time,
    fvg_candle_1_time: trade.fvg_candle_1_time,
    fvg_candle_2_time: trade.fvg_candle_2_time,
    fvg_candle_3_time: trade.fvg_candle_3_time,
    atr_value: trade.atr_1h,
    sweep_time: trade.sweep_time,
    sweep_depth: trade.sweep_depth,
    sweep_atr: trade.sweep_atr,
    fvg_size:
      trade.fvg_high != null && trade.fvg_low != null
        ? Math.abs(trade.fvg_high - trade.fvg_low)
        : undefined,
  }));

  return {
    metadata: {
      native_backtest_run_id: [
        setupVariant,
        config.symbol.toLowerCase(),
        startTime,
        endTime,
      ].join("-"),
      strategy_name: strategyName,
      strategy_version: strategyVersion,
      symbol: config.symbol,
      requested_exchange: requestedExchange,
      market_type: config.marketType,
      market_data_provider_used: activeMarketDataProvider,
      start_date: new Date(startTime).toISOString(),
      end_date: new Date(endTime).toISOString(),
      initial_capital: 10_000,
      risk_per_trade_percent: 1,
      reward_r_multiple: rewardRMultiple,
      include_plan_b: false,
      entry_window_mode: "all",
      strategy_profile:
        setupVariant === "ict_experiment_v3_adx_regime_filter" ? "ict_improved_v3" : undefined,
      break_even_enabled: true,
      sweep_atr_period: 14,
      status: "success",
    },
    metrics: calculateNativeBacktestMetrics(trades, 10_000),
    trades,
    validation_report: calculateNativeBacktestValidationReport(trades, 10_000, config.symbol),
  };
}

function donchianTradeCells(trade: NativeBacktestTrade, formatPrice: (value: number) => string) {
  return [
    trade.direction,
    formatTime(trade.entry_time),
    formatPrice(trade.entry_price),
    formatPrice(trade.stop_loss),
    formatPrice(trade.atr_value ?? Number.NaN),
    formatTime(trade.exit_time),
    formatPrice(trade.exit_price),
    trade.result_status,
    formatCurrency(trade.profit),
    `${formatNumber(trade.r_multiple, 2)}R`,
    formatNumber(trade.quantity, 4),
    formatCurrency(trade.risk_amount),
    formatTime(trade.setup_time),
    formatPrice(trade.entry_channel_high ?? Number.NaN),
    formatPrice(trade.entry_channel_low ?? Number.NaN),
    Number.isFinite(trade.exit_channel_high ?? Number.NaN)
      ? formatPrice(trade.exit_channel_high ?? Number.NaN)
      : "-",
    Number.isFinite(trade.exit_channel_low ?? Number.NaN)
      ? formatPrice(trade.exit_channel_low ?? Number.NaN)
      : "-",
  ];
}

function londonTradeCells(trade: NativeBacktestTrade, formatPrice: (value: number) => string) {
  return [
    trade.direction,
    formatTime(trade.sweep_time ?? null),
    formatTime(trade.entry_time),
    formatPrice(trade.entry_price),
    formatPrice(trade.stop_loss),
    formatPrice(trade.take_profit),
    formatTime(trade.exit_time),
    formatPrice(trade.exit_price),
    trade.result_status,
    formatCurrency(trade.profit),
    `${formatNumber(trade.r_multiple, 2)}R`,
    formatNumber(trade.quantity, 4),
    formatCurrency(trade.risk_amount),
    formatPrice(trade.asian_high ?? Number.NaN),
    formatPrice(trade.asian_low ?? Number.NaN),
    formatPrice(trade.asian_range ?? Number.NaN),
    formatPrice(trade.asian_atr ?? Number.NaN),
    formatPrice(trade.fvg_low),
    formatPrice(trade.fvg_high),
    formatTime(trade.fvg_candle_1_time ?? null),
    formatTime(trade.fvg_candle_2_time ?? null),
    formatTime(trade.fvg_candle_3_time ?? null),
    formatTime(trade.fvg_formed_time),
    formatTime(trade.fvg_test_time),
    formatTime(trade.engulfing_time),
  ];
}

function tradeHeadersForStrategy(strategy: BacktestStrategy) {
  if (strategy === "fx_donchian") {
    return [
      "direction",
      "entry_time",
      "entry_price",
      "stop_loss",
      "atr_14",
      "exit_time",
      "exit_price",
      "result_status",
      "profit",
      "r_multiple",
      "quantity",
      "risk_amount",
      "setup_time",
      "entry_high_55",
      "entry_low_55",
      "exit_high_20",
      "exit_low_20",
    ];
  }

  if (strategy === "fx_london_sweep") {
    return [
      "direction",
      "sweep_time",
      "entry_time",
      "entry_price",
      "stop_loss",
      "take_profit",
      "exit_time",
      "exit_price",
      "result_status",
      "profit",
      "r_multiple",
      "quantity",
      "risk_amount",
      "asian_high",
      "asian_low",
      "asian_range",
      "asian_atr_14",
      "5m_fvg_low",
      "5m_fvg_high",
      "5m_fvg_c1",
      "5m_fvg_c2",
      "5m_fvg_c3",
      "5m_fvg_formed_time",
      "5m_fvg_test_time",
      "engulfing_time",
    ];
  }

  return [
    "direction",
    "setup_variant",
    "entry_time",
    "entry_price",
    "stop_loss",
    "take_profit",
    "exit_time",
    "exit_price",
    "result_status",
    "profit",
    "r_multiple",
    "quantity",
    "risk_amount",
    "setup_time",
    "5m_fvg_low",
    "5m_fvg_high",
    "5m_fvg_c1",
    "5m_fvg_c2",
    "5m_fvg_c3",
    "5m_fvg_formed_time",
    "5m_fvg_test_time",
    "engulfing_time",
    "ema200",
    "sweep_depth",
    "sweep_atr_1h",
    "5m_fvg_size",
    "5m_fvg_atr",
  ];
}

function tradeCellsForStrategy(
  strategy: BacktestStrategy,
  trade: NativeBacktestTrade,
  formatPrice: (value: number) => string
) {
  if (strategy === "fx_donchian") return donchianTradeCells(trade, formatPrice);
  if (strategy === "fx_london_sweep") return londonTradeCells(trade, formatPrice);

  return tradeCells(trade, formatPrice);
}

export default function BacktestReports() {
  const [strategy, setStrategy] = useState<BacktestStrategy>(initialStrategy);
  const [market, setMarket] = useState<BacktestMarket>(initialMarket);
  const [symbol, setSymbol] = useState(() => initialSymbol(initialMarket()));
  const [rangeMode, setRangeMode] = useState<BacktestRangeMode>(initialRangeMode);
  const [forexDataMode, setForexDataMode] = useState<ForexDataMode>(initialForexDataMode);
  const [lookbackDays, setLookbackDays] = useState(initialLookback);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [includePlanB, setIncludePlanB] = useState(initialIncludePlanB);
  const [minRiskPips, setMinRiskPips] = useState(initialMinRiskPips);
  const [report, setReport] = useState<NativeBacktestReport | null>(null);
  const [klines1h, setKlines1h] = useState<Kline[]>([]);
  const [klines5m, setKlines5m] = useState<Kline[]>([]);
  const [localCsvKlines1m, setLocalCsvKlines1m] = useState<Kline[]>([]);
  const [localCsvFileName, setLocalCsvFileName] = useState("");
  const [localCsvError, setLocalCsvError] = useState<string | null>(null);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [selectedTradeIndex, setSelectedTradeIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const didAutoRun = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedMarket = MARKET_CONFIG[market];
  const selectedStrategyLabel =
    STRATEGY_OPTIONS.find((option) => option.value === strategy)?.label ?? STRATEGY_OPTIONS[0].label;
  const activeMarketDataProvider =
    market === "forex" && forexDataMode !== "remote"
      ? forexDataMode === "workspace"
        ? "WORKSPACE_CSV_1M"
        : "LOCAL_CSV_1M"
      : selectedMarket.marketDataProvider;
  const availableLookbacks = useMemo(
    () =>
      market === "forex"
        ? LOOKBACK_OPTIONS.filter((option) => option.days <= 30)
        : LOOKBACK_OPTIONS,
    [market]
  );

  const selectedLookback = useMemo(
    () => availableLookbacks.find((option) => option.value === lookbackDays) ?? availableLookbacks[0],
    [availableLookbacks, lookbackDays]
  );

  useEffect(() => {
    if (
      (strategy === "fx_donchian" ||
        strategy === "fx_london_sweep" ||
        strategy === "ict_improved_v3" ||
        strategy === "research_2026_adaptive_pack") &&
      market !== "forex"
    ) {
      setMarket("forex");
    }

    if (!selectedMarket.symbols.includes(symbol)) {
      setSymbol(selectedMarket.symbols[0]);
    }

    if (!availableLookbacks.some((option) => option.value === lookbackDays)) {
      setLookbackDays(availableLookbacks[0].value);
    }
  }, [availableLookbacks, lookbackDays, market, selectedMarket.symbols, strategy, symbol]);

  const localCsvSummary = useMemo(() => {
    if (!localCsvKlines1m.length) return null;

    return {
      count: localCsvKlines1m.length,
      firstTime: localCsvKlines1m[0].openTime,
      lastTime: localCsvKlines1m[localCsvKlines1m.length - 1].openTime,
    };
  }, [localCsvKlines1m]);

  const handleLocalCsvFile = useCallback(async (file: File | undefined) => {
    if (!file) return;

    setIsParsingCsv(true);
    setLocalCsvError(null);

    try {
      const text = await file.text();
      const parsed = parseLocalCsvKlines(text);
      setLocalCsvKlines1m(parsed);
      setLocalCsvFileName(file.name);
    } catch (caught) {
      setLocalCsvKlines1m([]);
      setLocalCsvFileName("");
      setLocalCsvError(caught instanceof Error ? caught.message : "Failed to parse CSV file.");
    } finally {
      setIsParsingCsv(false);
    }
  }, []);

  useEffect(() => {
    if (market !== "forex" || forexDataMode !== "workspace") return;

    const fileUrl = WORKSPACE_FOREX_CSV[symbol];
    if (!fileUrl) {
      setLocalCsvKlines1m([]);
      setLocalCsvFileName("");
      setLocalCsvError(`No workspace CSV file found for ${symbol}.`);
      return;
    }

    let cancelled = false;
    setIsParsingCsv(true);
    setLocalCsvError(null);

    fetch(fileUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Workspace CSV load failed: ${response.status} ${response.statusText}`);
        }

        return response.text();
      })
      .then((text) => {
        const parsed = parseLocalCsvKlines(text);
        if (cancelled) return;

        setLocalCsvKlines1m(parsed);
        setLocalCsvFileName(fileUrl.split("/").pop() ?? fileUrl);
      })
      .catch((caught) => {
        if (cancelled) return;

        setLocalCsvKlines1m([]);
        setLocalCsvFileName("");
        setLocalCsvError(caught instanceof Error ? caught.message : "Failed to load workspace CSV.");
      })
      .finally(() => {
        if (!cancelled) setIsParsingCsv(false);
      });

    return () => {
      cancelled = true;
    };
  }, [forexDataMode, market, symbol]);

  const runBacktest = useCallback(async () => {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const customStartTime = parseDateStart(startDate);
      const customEndTime = parseDateEndExclusive(endDate);
      const runEndTime = rangeMode === "custom" ? customEndTime : Date.now();
      const runStartTime =
        rangeMode === "custom"
          ? customStartTime
          : runEndTime == null
            ? null
            : runEndTime - selectedLookback.days * ONE_DAY_MS;

      if (runStartTime == null || runEndTime == null || runStartTime >= runEndTime) {
        throw new Error("Select a valid backtest date range.");
      }

      const oneHourCandles = candlesForRange(runStartTime, runEndTime, "1h");
      const fiveMinuteCandles = candlesForRange(runStartTime, runEndTime, "5m");
      const useLocalCsv = market === "forex" && forexDataMode !== "remote";
      const isIctEmaAtrStrategy = strategy === "ict_ema_atr_fvg";
      const isIctImprovedV2Strategy = strategy === "ict_improved_v2";
      const isIctImprovedV3Strategy = strategy === "ict_improved_v3";
      const experimentVariantName = experimentVariantForStrategy(strategy);
      const experimentMetadata = experimentStrategyMetadata(strategy);
      const isIctImprovedStrategy = isIctImprovedV2Strategy || isIctImprovedV3Strategy;
      const parsedMinRiskPips = Number(minRiskPips);

      if (useLocalCsv && !localCsvKlines1m.length) {
        throw new Error("Load a 1M CSV file before running a CSV backtest.");
      }

      if (isIctImprovedV3Strategy && (!Number.isFinite(parsedMinRiskPips) || parsedMinRiskPips < 0)) {
        throw new Error("Enter a valid min_risk_pips value.");
      }

      if (
        (strategy === "fx_donchian" ||
          strategy === "fx_london_sweep" ||
          strategy === "ict_improved_v3" ||
          experimentVariantName != null) &&
        market !== "forex"
      ) {
        throw new Error("This strategy requires Forex market data.");
      }

      if (experimentVariantName && experimentMetadata) {
        if (!useLocalCsv) {
          throw new Error(`${experimentMetadata.displayName} requires 1M Forex CSV/workspace data.`);
        }

        const experimentRows = getLocalCsvKlinesForRange(localCsvKlines1m, "1m", runStartTime, runEndTime);
        if (!experimentRows.length) {
          throw new Error("No 1M CSV candles found for the selected period.");
        }

        const variant = [...ICT_EXPERIMENT_VARIANTS, ...BIOS_ORDERFLOW_EXPERIMENT_VARIANTS].find(
          (item) => item.name === experimentVariantName
        );
        if (!variant) {
          throw new Error(`${experimentVariantName} variant is not available.`);
        }

        const experimentReport = runIctExperimentVariant(symbol, experimentRows, variant, 10_000);
        const nextReport = ictExperimentToNativeReport({
          activeMarketDataProvider,
          config: {
            marketType: selectedMarket.marketType,
            symbol,
          },
          endTime: runEndTime,
          experiment: experimentReport,
          requestedExchange: selectedMarket.requestedExchange,
          rewardRMultiple: experimentMetadata.rewardRMultiple,
          setupVariant: experimentMetadata.setupVariant,
          startTime: runStartTime,
          strategyName: experimentMetadata.displayName,
          strategyVersion: experimentMetadata.version,
        });
        const reviewKlines1h = aggregateKlines(experimentRows, "1h");
        const reviewKlines5m = aggregateKlines(experimentRows, "5m");

        setKlines1h(reviewKlines1h);
        setKlines5m(reviewKlines5m);
        setSelectedTradeIndex(0);
        setReport(nextReport);
        return;
      }

      if (strategy === "universal_bb_atr_mean_reversion" || strategy === "universal_bb_atr_target15") {
        const isUniversalTarget15 = strategy === "universal_bb_atr_target15";
        const universalDataStartTime = runStartTime - 120 * ONE_DAY_MS;
        const klines4h = useLocalCsv
          ? getLocalCsvKlinesForRange(localCsvKlines1m, "4h", universalDataStartTime, runEndTime)
          : aggregateKlines(
              await fetchKlinesMultiBatch(
                {
                  symbol,
                  interval: "1h",
                  startTime: universalDataStartTime,
                  endTime: runEndTime,
                  dataSource: selectedMarket.dataSource,
                },
                candlesForRange(universalDataStartTime, runEndTime, "1h"),
                abortController.signal
              ),
              "4h"
            );

        const nextReport = runUniversalBbAtrBacktest({
          klines4h,
          config: {
            symbol,
            requestedExchange: selectedMarket.requestedExchange,
            marketType: selectedMarket.marketType,
            marketDataProvider: activeMarketDataProvider,
            initialCapital: 10_000,
            riskPerTradePercent: isUniversalTarget15 ? 2 : 1,
            rewardRMultiple: 0,
            includePlanB: false,
            bbPeriod: isUniversalTarget15 ? 80 : 40,
            bandDeviation: isUniversalTarget15 ? 1.5 : 2,
            atrPeriod: 14,
            atrMultiplier: isUniversalTarget15 ? 1 : 3,
            maxHoldBars: isUniversalTarget15 ? 48 : 12,
            directionMode: isUniversalTarget15 ? "long_only" : "all",
            emaPeriod: isUniversalTarget15 ? 200 : 0,
            emaFilter: isUniversalTarget15 ? "countertrend" : "none",
            setupVariant: isUniversalTarget15
              ? "universal_bb_atr_target15"
              : "universal_bb_atr_mean_reversion",
            strategyName: isUniversalTarget15
              ? "Universal BB ATR Target 15"
              : "Universal BB ATR Mean Reversion",
            strategyVersion: isUniversalTarget15
              ? "mvp.4h-bb80-k1_5-atr14-stop1-long-countertrend-risk2.1"
              : undefined,
            tradeStartTime: runStartTime,
            tradeEndTime: runEndTime,
          },
        });

        setKlines1h(klines4h);
        setKlines5m([]);
        setSelectedTradeIndex(0);
        setReport(nextReport);
        return;
      }

      if (strategy === "research_2026_adaptive_pack") {
        if (!["EURUSD", "GBPUSD", "USDJPY", "GER40"].includes(symbol)) {
          throw new Error("Research 2026 Adaptive Pack is currently available for EURUSD, GBPUSD, USDJPY, and GER40.");
        }

        const researchDataStartTime = runStartTime - 180 * ONE_DAY_MS;
        const klines1h = useLocalCsv
          ? getLocalCsvKlinesForRange(localCsvKlines1m, "1h", researchDataStartTime, runEndTime)
          : await fetchKlinesMultiBatch(
              {
                symbol,
                interval: "1h",
                startTime: researchDataStartTime,
                endTime: runEndTime,
                dataSource: selectedMarket.dataSource,
              },
              candlesForRange(researchDataStartTime, runEndTime, "1h"),
              abortController.signal
            );

        if (symbol === "EURUSD") {
          const nextReport = runFxDonchianBacktest({
            klines4h: klines1h,
            config: {
              symbol,
              requestedExchange: selectedMarket.requestedExchange,
              marketType: selectedMarket.marketType,
              marketDataProvider: activeMarketDataProvider,
              initialCapital: 10_000,
              riskPerTradePercent: 1,
              rewardRMultiple: 0,
              includePlanB: false,
              entryLookback: 80,
              exitLookback: 10,
              atrPeriod: 14,
              atrMultiplier: 1,
              directionMode: "all",
              setupVariant: "research_2026_donchian_1h_80_10",
              strategyName: "Research 2026 EURUSD Donchian 1H 80/10",
              strategyVersion: "research.2026-ytd.in-sample.eurusd-donchian-1h-80-10-atr1.1",
              tradeStartTime: runStartTime,
              tradeEndTime: runEndTime,
            },
          });

          setKlines1h(klines1h);
          setKlines5m([]);
          setSelectedTradeIndex(0);
          setReport(nextReport);
          return;
        }

        const adaptiveParams = {
          GBPUSD: {
            bbPeriod: 80,
            bandDeviation: 1.5,
            atrMultiplier: 1,
            maxHoldBars: 96,
            directionMode: "short_only" as const,
            emaFilter: "none" as const,
            exitTarget: "mean" as const,
            strategyVersion: "research.2026-ytd.in-sample.gbpusd-bb80-dev1_5-short-mean.1",
          },
          USDJPY: {
            bbPeriod: 40,
            bandDeviation: 2,
            atrMultiplier: 1,
            maxHoldBars: 96,
            directionMode: "long_only" as const,
            emaFilter: "none" as const,
            exitTarget: "opposite_band" as const,
            strategyVersion: "research.2026-ytd.in-sample.usdjpy-bb40-dev2-long-opposite.1",
          },
          GER40: {
            bbPeriod: 80,
            bandDeviation: 2,
            atrMultiplier: 1,
            maxHoldBars: 96,
            directionMode: "short_only" as const,
            emaFilter: "none" as const,
            exitTarget: "opposite_band" as const,
            strategyVersion: "research.2026-ytd.in-sample.ger40-bb80-dev2-short-opposite.1",
          },
        }[symbol as "GBPUSD" | "USDJPY" | "GER40"];

        const nextReport = runUniversalBbAtrBacktest({
          klines4h: klines1h,
          config: {
            symbol,
            requestedExchange: selectedMarket.requestedExchange,
            marketType: selectedMarket.marketType,
            marketDataProvider: activeMarketDataProvider,
            initialCapital: 10_000,
            riskPerTradePercent: 1,
            rewardRMultiple: 0,
            includePlanB: false,
            bbPeriod: adaptiveParams.bbPeriod,
            bandDeviation: adaptiveParams.bandDeviation,
            atrPeriod: 14,
            atrMultiplier: adaptiveParams.atrMultiplier,
            maxHoldBars: adaptiveParams.maxHoldBars,
            directionMode: adaptiveParams.directionMode,
            emaPeriod: 200,
            emaFilter: adaptiveParams.emaFilter,
            exitTarget: adaptiveParams.exitTarget,
            setupVariant: "research_2026_bb_atr_adaptive",
            strategyName: `Research 2026 ${symbol} BB/ATR Adaptive`,
            strategyVersion: adaptiveParams.strategyVersion,
            tradeStartTime: runStartTime,
            tradeEndTime: runEndTime,
          },
        });

        setKlines1h(klines1h);
        setKlines5m([]);
        setSelectedTradeIndex(0);
        setReport(nextReport);
        return;
      }

      if (strategy === "fx_donchian") {
        const klines4h = useLocalCsv
          ? getLocalCsvKlinesForRange(localCsvKlines1m, "4h", runStartTime, runEndTime)
          : aggregateKlines(
              await fetchKlinesMultiBatch(
                {
                  symbol,
                  interval: "1h",
                  startTime: runStartTime,
                  endTime: runEndTime,
                  dataSource: selectedMarket.dataSource,
                },
                oneHourCandles,
                abortController.signal
              ),
              "4h"
            );

        const nextReport = runFxDonchianBacktest({
          klines4h,
          config: {
            symbol,
            requestedExchange: selectedMarket.requestedExchange,
            marketType: selectedMarket.marketType,
            marketDataProvider: activeMarketDataProvider,
            initialCapital: 10_000,
            riskPerTradePercent: 1,
            rewardRMultiple: 0,
            includePlanB: false,
          },
        });

        setKlines1h(klines4h);
        setKlines5m([]);
        setSelectedTradeIndex(0);
        setReport(nextReport);
        return;
      }

      if (strategy === "fx_london_sweep") {
        const londonWarmupStartTime = runStartTime - 21 * ONE_DAY_MS;
        const londonFiveMinuteCandles = candlesForRange(
          londonWarmupStartTime,
          runEndTime,
          "5m"
        );
        const klines5m = useLocalCsv
          ? getLocalCsvKlinesForRange(
              localCsvKlines1m,
              "5m",
              londonWarmupStartTime,
              runEndTime
            )
          : await fetchKlinesMultiBatch(
              {
                symbol,
                interval: "5m",
                startTime: londonWarmupStartTime,
                endTime: runEndTime,
                dataSource: selectedMarket.dataSource,
              },
              londonFiveMinuteCandles,
              abortController.signal
            );

        const nextReport = runFxLondonSweepBacktest({
          klines5m,
          config: {
            symbol,
            requestedExchange: selectedMarket.requestedExchange,
            marketType: selectedMarket.marketType,
            marketDataProvider: activeMarketDataProvider,
            initialCapital: 10_000,
            riskPerTradePercent: 1,
            rewardRMultiple: 2,
            includePlanB: false,
            tradeStartTime: runStartTime,
            tradeEndTime: runEndTime,
          },
        });

        setKlines1h([]);
        setKlines5m(klines5m);
        setSelectedTradeIndex(0);
        setReport(nextReport);
        return;
      }

      const centurionDataStartTime = isIctEmaAtrStrategy || isIctImprovedStrategy
        ? runStartTime - 14 * ONE_DAY_MS
        : runStartTime;
      const centurionOneHourCandles = candlesForRange(centurionDataStartTime, runEndTime, "1h");
      const centurionFiveMinuteCandles = candlesForRange(
        centurionDataStartTime,
        runEndTime,
        "5m"
      );

      const [klines1h, klines5m] = useLocalCsv
        ? [
            getLocalCsvKlinesForRange(localCsvKlines1m, "1h", centurionDataStartTime, runEndTime),
            getLocalCsvKlinesForRange(localCsvKlines1m, "5m", centurionDataStartTime, runEndTime),
          ]
        : await Promise.all([
            fetchKlinesMultiBatch(
              {
                symbol,
                interval: "1h",
                startTime: centurionDataStartTime,
                endTime: runEndTime,
                dataSource: selectedMarket.dataSource,
              },
              centurionOneHourCandles,
              abortController.signal
            ),
            fetchKlinesMultiBatch(
              {
                symbol,
                interval: "5m",
                startTime: centurionDataStartTime,
                endTime: runEndTime,
                dataSource: selectedMarket.dataSource,
              },
              centurionFiveMinuteCandles,
              abortController.signal
            ),
          ]);

      const nextReport = await runCenturionNativeBacktestLazy({
        klines1h,
        klines5m,
        config: {
          symbol,
          requestedExchange: selectedMarket.requestedExchange,
          marketType: selectedMarket.marketType,
          marketDataProvider: activeMarketDataProvider,
          initialCapital: 10_000,
          riskPerTradePercent: 1,
          rewardRMultiple: isIctEmaAtrStrategy ? 1.5 : isIctImprovedStrategy ? 2 : 2.2,
          includePlanB: supportsPlanB(strategy) ? includePlanB : false,
          entryWindowMode:
            strategy === "centurion_ict_kyiv_killzones" ? "kyiv_killzones" : "all",
          strategyProfile: isIctEmaAtrStrategy
            ? "ict_ema_atr"
            : isIctImprovedStrategy
              ? isIctImprovedV3Strategy
                ? "ict_improved_v3"
                : "ict_improved_v2"
              : "centurion_ict",
          breakEvenEnabled: !isIctEmaAtrStrategy,
          emaPeriod: isIctEmaAtrStrategy ? 200 : undefined,
          sweepAtrPeriod: isIctEmaAtrStrategy || isIctImprovedStrategy ? 14 : undefined,
          sweepDepthAtrMultiple: isIctEmaAtrStrategy
            ? 0.05
            : isIctImprovedStrategy
              ? 0.1
              : undefined,
          fvgAtrPeriod: isIctEmaAtrStrategy ? 14 : undefined,
          fvgSizeAtrMultiple: isIctEmaAtrStrategy ? 0.05 : undefined,
          confirmationLookback: isIctImprovedStrategy ? 3 : 1,
          minRiskPips: isIctImprovedV3Strategy ? parsedMinRiskPips : undefined,
          tradeStartTime: isIctEmaAtrStrategy || isIctImprovedStrategy ? runStartTime : undefined,
          tradeEndTime: isIctEmaAtrStrategy || isIctImprovedStrategy ? runEndTime : undefined,
        },
        loadExecutionKlines1m: async (startTime, endTime) => {
          if (useLocalCsv) {
            return getLocalCsvKlinesForRange(localCsvKlines1m, "1m", startTime, endTime);
          }

          const paddedEndTime = endTime + 5 * ONE_MINUTE_MS;
          const requestedCandles = Math.max(
            20,
            Math.ceil((paddedEndTime - startTime) / ONE_MINUTE_MS) + 8
          );
          const candles = await fetchKlinesMultiBatch(
            {
              symbol,
              interval: "1m",
              dataSource: selectedMarket.dataSource,
              startTime,
              endTime: paddedEndTime,
            },
            requestedCandles,
            abortController.signal
          );

          return candles.filter(
            (kline) => kline.openTime >= startTime && kline.openTime <= paddedEndTime
          );
        },
      });

      setKlines1h(klines1h);
      setKlines5m(klines5m);
      setSelectedTradeIndex(0);
      setReport(nextReport);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;

      const message = caught instanceof Error ? caught.message : "Backtest run failed";
      setError(message);
      setReport(null);
      setKlines1h([]);
      setKlines5m([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeMarketDataProvider,
    endDate,
    forexDataMode,
    includePlanB,
    localCsvKlines1m,
    market,
    minRiskPips,
    rangeMode,
    selectedLookback.days,
    selectedMarket,
    startDate,
    strategy,
    symbol,
  ]);

  useEffect(() => {
    if (didAutoRun.current) return;
    if (market === "forex" && forexDataMode !== "remote" && !localCsvKlines1m.length) return;

    didAutoRun.current = true;
    runBacktest();

    return () => {
      abortRef.current?.abort();
    };
  }, [forexDataMode, localCsvKlines1m.length, market, runBacktest]);

  const metrics = report?.metrics;
  const selectedTrade = report?.trades[selectedTradeIndex] ?? null;
  const riskModelText =
    strategy === "fx_donchian"
      ? "1% / 2ATR SL"
      : strategy === "fx_london_sweep"
        ? "1% / 2R"
          : strategy === "ict_ema_atr_fvg"
            ? "1% / 1.5R / no BE"
          : strategy === "ict_improved_v3"
            ? `1% / 2R / BE / min ${formatNumber(Number(minRiskPips), 1)} pips`
          : strategy === "ict_v3_adx_regime_filter"
            ? "1% / 2R / BE / ADX > 18"
          : strategy === "order_flow_proxy_1_5r"
            ? "1% / 1.5R / BE after 1R / OHLCV proxy"
          : strategy === "order_flow_proxy_2r"
            ? "1% / 2R / BE after 1R / OHLCV proxy"
          : strategy === "order_flow_proxy_partial_tp"
            ? "1% / partial TP / OHLCV proxy"
          : strategy === "order_flow_proxy_2r_prev_day"
            ? "1% / 2R / previous-day liquidity / OHLCV proxy"
          : strategy === "order_flow_proxy_2r_prev_day_target15"
            ? "2.25% / 2R / previous-day liquidity / OHLCV proxy"
          : strategy === "order_flow_proxy_2r_prev_day_short"
            ? "1% / 2R / previous-day short only / OHLCV proxy"
          : strategy === "order_flow_proxy_2r_prev_day_short_target15"
            ? "2.25% / 2R / previous-day short only / OHLCV proxy"
          : strategy === "order_flow_proxy_2r_prev_day_short_mr10"
            ? "1% / 2R / previous-day short only / min 10 pips-points"
          : strategy === "order_flow_proxy_1_5r_prev_day_short_mr10"
            ? "1% / 1.5R / previous-day short only / min 10 pips-points"
          : strategy === "universal_bb_atr_mean_reversion"
            ? "1% / 4H BB40 2σ / ATR14 SL x3 / mean exit"
          : strategy === "universal_bb_atr_target15"
            ? "2% / 4H BB80 1.5σ / long-only below EMA200 / ATR14 SL x1"
          : strategy === "research_2026_adaptive_pack"
            ? "1% / in-sample 2026 adaptive research pack"
          : strategy === "ict_improved_v2"
            ? "1% / 2R / BE"
        : strategy === "centurion_ict_kyiv_killzones"
          ? "1% / 2.2R / Kyiv KZ"
          : "1% / 2.2R";
  const formatSelectedPrice = useCallback(
    (value: number) => (market === "forex" ? formatForexPrice(value, symbol) : formatCurrency(value)),
    [market, symbol]
  );

  return (
    <div className="flex min-h-[720px] flex-col gap-4">
      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-w-0 rounded-lg">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-lg">Run {selectedStrategyLabel}</CardTitle>
              {statusBadge(report, isLoading)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Strategy</Label>
              <Select
                value={strategy}
                onValueChange={(value) => setStrategy(value as BacktestStrategy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Market</Label>
              <Select value={market} onValueChange={(value) => setMarket(value as BacktestMarket)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MARKET_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectedMarket.symbols.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {market === "forex" ? (
              <div className="grid gap-2">
                <Label>Data source</Label>
                <Select value={forexDataMode} onValueChange={(value) => setForexDataMode(value as ForexDataMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Yahoo Finance</SelectItem>
                    <SelectItem value="workspace">Workspace CSV 1M</SelectItem>
                    <SelectItem value="csv">Local CSV 1M</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {market === "forex" && forexDataMode !== "remote" ? (
              <div className="grid gap-2">
                <Label>{forexDataMode === "workspace" ? "Workspace file" : "CSV file"}</Label>
                {forexDataMode === "csv" ? (
                  <Input
                    accept=".csv,text/csv"
                    disabled={isParsingCsv}
                    onChange={(event) => handleLocalCsvFile(event.target.files?.[0])}
                    type="file"
                  />
                ) : null}
                {localCsvSummary ? (
                  <div className="rounded-md border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                    <div className="break-words font-medium text-foreground">{localCsvFileName}</div>
                    <div>
                      {formatNumber(localCsvSummary.count, 0)} 1M candles, {formatDate(localCsvSummary.firstTime)} -{" "}
                      {formatDate(localCsvSummary.lastTime)}
                    </div>
                  </div>
                ) : null}
                {localCsvError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {localCsvError}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Lookback</Label>
              <Select value={rangeMode} onValueChange={(value) => setRangeMode(value as BacktestRangeMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lookback">Recent range</SelectItem>
                  <SelectItem value="custom">Date range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rangeMode === "lookback" ? (
              <div className="grid gap-2">
                <Label>Recent range</Label>
                <Select value={lookbackDays} onValueChange={setLookbackDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLookbacks.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="grid gap-2">
                  <Label>Start date</Label>
                  <Input
                    max={endDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    value={startDate}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>End date</Label>
                  <Input
                    min={startDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    value={endDate}
                  />
                </div>
              </div>
            )}

            {strategy === "ict_improved_v3" ? (
              <div className="grid gap-2">
                <Label>min_risk_pips</Label>
                <Input
                  min="0"
                  onChange={(event) => setMinRiskPips(event.target.value)}
                  step="0.5"
                  type="number"
                  value={minRiskPips}
                />
              </div>
            ) : null}

            {supportsPlanB(strategy) ? (
              <label className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm">
                <Checkbox
                  checked={includePlanB}
                  onCheckedChange={(checked) => setIncludePlanB(checked === true)}
                />
                <span>Include Plan B entries</span>
              </label>
            ) : null}

            <Button className="w-full" disabled={isLoading} onClick={runBacktest}>
              <PlayIcon className="mr-2 size-4" />
              {isLoading ? "Running" : "Run"}
            </Button>
          </CardContent>
        </Card>

        <section className="grid min-w-0 gap-4 md:grid-cols-3">
          <Card className="min-w-0 rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Requested exchange</CardTitle>
            </CardHeader>
            <CardContent className="break-words text-2xl font-semibold">
              {selectedMarket.requestedExchange}
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Provider used</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-lg font-semibold">
              {activeMarketDataProvider}
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Risk model</CardTitle>
            </CardHeader>
            <CardContent className="break-words text-2xl font-semibold">{riskModelText}</CardContent>
          </Card>
        </section>
      </section>

      {error ? (
        <section className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{error}</span>
        </section>
      ) : null}

      {report?.metadata.status === "failed" ? (
        <section className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{report.metadata.error_message}</span>
        </section>
      ) : null}

      {metrics ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricCards(metrics).map(([label, value]) => (
            <Card key={label} className="min-w-0 rounded-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value}</CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {report?.validation_report ? (
        <section className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <ExpandableResultCard title="Yearly breakdown">
                <ValidationTable
                  headers={[
                    "year",
                    "trades",
                    "winners",
                    "losers",
                    "breakeven",
                    "win_rate",
                    "net_profit",
                    "profit_factor",
                    "expectancy_r",
                    "max_drawdown_from_peak",
                  ]}
                  rows={report.validation_report.yearly_breakdown.map((row) => [
                    row.year,
                    formatNumber(row.trades, 0),
                    formatNumber(row.winners, 0),
                    formatNumber(row.losers, 0),
                    formatNumber(row.breakeven, 0),
                    formatPercent(row.win_rate),
                    formatCurrency(row.net_profit),
                    formatNumber(row.profit_factor, 2),
                    `${formatNumber(row.expectancy_r, 2)}R`,
                    formatCurrency(row.max_drawdown),
                  ])}
                />
            </ExpandableResultCard>

            <ExpandableResultCard title="Direction breakdown">
                <ValidationTable
                  headers={[
                    "direction",
                    "trades",
                    "win_rate",
                    "net_profit",
                    "profit_factor",
                    "expectancy_r",
                    "max_drawdown_from_peak",
                  ]}
                  rows={report.validation_report.direction_breakdown.map((row) => [
                    row.direction,
                    formatNumber(row.trades, 0),
                    formatPercent(row.win_rate),
                    formatCurrency(row.net_profit),
                    formatNumber(row.profit_factor, 2),
                    `${formatNumber(row.expectancy_r, 2)}R`,
                    formatCurrency(row.max_drawdown),
                  ])}
                />
            </ExpandableResultCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ExpandableResultCard title="Execution cost simulation">
                <ValidationTable
                  headers={[
                    "cost_pips",
                    "net_profit",
                    "profit_factor",
                    "expectancy_r",
                    "win_rate",
                    "max_drawdown_from_peak",
                  ]}
                  rows={report.validation_report.execution_cost_simulation.map((row) => [
                    formatNumber(row.cost_pips, 1),
                    formatCurrency(row.net_profit),
                    formatNumber(row.profit_factor, 2),
                    `${formatNumber(row.expectancy_r, 2)}R`,
                    formatPercent(row.win_rate),
                    formatCurrency(row.max_drawdown),
                  ])}
                />
            </ExpandableResultCard>

            {report.validation_report.min_risk_pips_simulation ? (
              <ExpandableResultCard title="Min risk pips validation">
                  <ValidationTable
                    headers={[
                      "min_risk_pips",
                      "trades",
                      "win_rate",
                      "net_profit",
                      "profit_factor",
                      "expectancy_r",
                      "max_drawdown_from_peak",
                    ]}
                    rows={report.validation_report.min_risk_pips_simulation.map((row) => [
                      formatNumber(row.min_risk_pips, 1),
                      formatNumber(row.trades, 0),
                      formatPercent(row.win_rate),
                      formatCurrency(row.net_profit),
                      formatNumber(row.profit_factor, 2),
                      `${formatNumber(row.expectancy_r, 2)}R`,
                      formatCurrency(row.max_drawdown),
                    ])}
                  />
              </ExpandableResultCard>
            ) : null}

            <ExpandableResultCard title="Outlier dependency">
                <ValidationTable
                  headers={["metric", "value"]}
                  rows={[
                    ["total_net_profit", formatCurrency(report.validation_report.outlier_dependency.total_net_profit)],
                    [
                      "net_profit_without_best_trade",
                      formatCurrency(report.validation_report.outlier_dependency.net_profit_without_best_trade),
                    ],
                    [
                      "net_profit_without_top_3_trades",
                      formatCurrency(report.validation_report.outlier_dependency.net_profit_without_top_3_trades),
                    ],
                    [
                      "percent_profit_from_top_3_trades",
                      formatPercent(report.validation_report.outlier_dependency.percent_profit_from_top_3_trades),
                    ],
                    ["best_trade", formatCurrency(report.validation_report.outlier_dependency.best_trade)],
                    ["worst_trade", formatCurrency(report.validation_report.outlier_dependency.worst_trade)],
                  ]}
                />
            </ExpandableResultCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ExpandableResultCard title="Monthly breakdown">
                <ValidationTable
                  headers={["year_month", "trades", "net_profit", "expectancy_r", "profit_factor"]}
                  maxHeightClassName="max-h-96"
                  rows={report.validation_report.monthly_breakdown.map((row) => [
                    row.year_month,
                    formatNumber(row.trades, 0),
                    formatCurrency(row.net_profit),
                    `${formatNumber(row.expectancy_r, 2)}R`,
                    formatNumber(row.profit_factor, 2),
                  ])}
                />
            </ExpandableResultCard>

            <ExpandableResultCard title="Equity curve data">
                <ValidationTable
                  headers={["trade_number", "timestamp", "equity", "drawdown_from_peak"]}
                  maxHeightClassName="max-h-96"
                  rows={report.validation_report.equity_curve.map((row) => [
                    formatNumber(row.trade_number, 0),
                    formatDateTime(row.timestamp),
                    formatCurrency(row.equity),
                    formatCurrency(row.drawdown),
                  ])}
                />
            </ExpandableResultCard>
          </div>
        </section>
      ) : null}

      {report && isCenturionStrategy(strategy) ? (
        <ExpandableResultCard
          title="Model review"
          expandedContentClassName="flex flex-col"
          actions={
            report.trades.length ? (
              <Select
                value={String(selectedTradeIndex)}
                onValueChange={(value) => setSelectedTradeIndex(Number(value))}
              >
                <SelectTrigger className="w-full lg:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {report.trades.map((trade, index) => (
                    <SelectItem key={`${trade.entry_time}-${index}`} value={String(index)}>
                      #{index + 1} {trade.direction} {formatTime(trade.entry_time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          }
        >
            <BklitTradeReviewPanel
              className="h-full"
              formatPrice={formatSelectedPrice}
              klines1h={klines1h}
              klines5m={klines5m}
              trade={selectedTrade}
            />
        </ExpandableResultCard>
      ) : null}

      {report ? (
        <section className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <ExpandableResultCard
            title={
              <span className="flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-emerald-500" />
                Native Backtest Detail
              </span>
            }
          >
              <dl className="grid gap-3 text-sm">
                {metadataRowsForStrategy(report, strategy).map(([label, value]) => (
                  <div key={label} className="grid gap-1">
                    <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
                    <dd className="break-words font-mono text-xs">{value}</dd>
                  </div>
                ))}
              </dl>
          </ExpandableResultCard>

          <ExpandableResultCard title="Trades table">
            <div className="max-w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {tradeHeadersForStrategy(strategy).map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.trades.length ? (
                    report.trades.map((trade, index) => (
                      <TableRow
                        data-state={index === selectedTradeIndex ? "selected" : undefined}
                        key={`${trade.entry_time}-${index}`}
                        onClick={() => setSelectedTradeIndex(index)}
                      >
                        {tradeCellsForStrategy(strategy, trade, formatSelectedPrice).map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="whitespace-nowrap font-mono text-xs">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="h-32 text-center text-muted-foreground"
                        colSpan={tradeHeadersForStrategy(strategy).length}
                      >
                        No trades found for this run.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ExpandableResultCard>
        </section>
      ) : null}
    </div>
  );
}
