import type { Kline } from "@/lib/binance";
import { aggregateKlines } from "./local-csv-market-data";

const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export type IctExperimentDirection = "long" | "short";
export type IctLiquiditySource = "previous_1h" | "asian_range" | "previous_day";
export type IctExperimentVariantName =
  | "v3_base"
  | "v3_long_only"
  | "v3_short_only"
  | "v3_short_htf_filter"
  | "v3_atr_regime_filter"
  | "v3_adx_regime_filter"
  | "v3_asian_liquidity"
  | "v3_previous_day_liquidity"
  | "v3_multi_liquidity"
  | "v3_partial_tp"
  | "v3_tp_1_5r"
  | "v3_tp_1_5r_no_be"
  | "v3_min_risk_0"
  | "v3_min_risk_4"
  | "v3_min_risk_5"
  | "v3_min_risk_6"
  | "v3_min_risk_8"
  | "v3_min_risk_10"
  | "bios_v4_multi_liquidity"
  | "bios_v4_long_bias_short_filtered"
  | "bios_v4_partial_tp"
  | "order_flow_proxy_1_5r"
  | "order_flow_proxy_2r"
  | "order_flow_proxy_partial_tp"
  | "order_flow_proxy_2r_prev_day"
  | "order_flow_proxy_2r_prev_day_target15"
  | "order_flow_proxy_2r_prev_day_short"
  | "order_flow_proxy_2r_prev_day_short_target15"
  | "order_flow_proxy_2r_prev_day_short_mr10"
  | "order_flow_proxy_1_5r_prev_day_short_mr10";

export interface IctExperimentVariant {
  name: IctExperimentVariantName;
  directionMode?: "all" | "long_only" | "short_only";
  liquiditySources: IctLiquiditySource[];
  shortHtfFilter?: boolean;
  biosShortFilter?: boolean;
  biosMode?: boolean;
  orderFlowProxy?: boolean;
  atrRegimeFilter?: boolean;
  adxRegimeFilter?: boolean;
  partialTp?: boolean;
  rewardRMultiple: number;
  breakEvenEnabled: boolean;
  minRiskPips: number;
  riskPerTradePercent?: number;
}

export interface IctExperimentTrade {
  symbol: string;
  variant_name: IctExperimentVariantName;
  direction: IctExperimentDirection;
  liquidity_source: IctLiquiditySource;
  entry_time: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  exit_time: number;
  exit_price: number;
  result_status: "take_profit" | "stop_loss" | "breakeven" | "open_at_end" | "partial_take_profit";
  profit: number;
  r_multiple: number;
  risk_amount: number;
  quantity: number;
  setup_time: number;
  fvg_low: number;
  fvg_high: number;
  fvg_candle_1_time: number;
  fvg_candle_2_time: number;
  fvg_candle_3_time: number;
  fvg_formed_time: number;
  fvg_test_time: number;
  confirmation_time: number;
  sweep_time: number;
  sweep_level: number;
  swept_level_price?: number;
  sweep_depth?: number;
  sweep_atr?: number;
  sweep_depth_pips?: number;
  sweep_depth_atr?: number;
  fvg_size_pips?: number;
  fvg_size_atr?: number;
  risk_distance_pips?: number;
  partial_tp_hit?: boolean;
  full_tp_hit?: boolean;
  adx_1h?: number;
  atr_1h?: number;
  atr_sma_1h?: number;
}

export interface IctMetricSummary {
  trades: number;
  winners: number;
  losers: number;
  breakeven: number;
  win_rate: number;
  resolved_win_rate: number;
  net_profit: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
  final_equity: number;
  average_trade: number;
  best_trade: number;
  worst_trade: number;
  partial_win_rate?: number;
  full_tp_rate?: number;
}

export interface IctCostSimulationRow {
  cost_pips: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  win_rate: number;
  resolved_win_rate: number;
  max_drawdown: number;
}

export interface IctBreakdownRow {
  key: string;
  trades: number;
  win_rate: number;
  resolved_win_rate?: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
}

export interface IctOutlierDependency {
  total_net_profit: number;
  net_profit_without_best_trade: number;
  net_profit_without_top_3_trades: number;
  percent_profit_from_top_3_trades: number;
  best_trade: number;
  worst_trade: number;
}

export interface IctPaperTestingAssessment {
  status: "pass" | "fail";
  reasons: string[];
  min_trades: number;
  max_top_3_profit_percent: number;
  min_profit_factor_after_0_5_pip_cost: number;
  min_profit_factor_after_1_pip_cost: number;
  profit_factor_after_0_5_pip_cost: number;
  profit_factor_after_1_pip_cost: number;
  expectancy_r_after_0_5_pip_cost: number;
  expectancy_r_after_1_pip_cost: number;
}

export interface IctExperimentReport {
  symbol: string;
  variant_name: IctExperimentVariantName;
  strategy_family?: "ICT" | "BIOS" | "Order Flow Proxy";
  metrics: IctMetricSummary;
  ranking_score: number;
  warnings: string[];
  paper_testing_assessment?: IctPaperTestingAssessment;
  execution_cost_simulation: IctCostSimulationRow[];
  yearly_breakdown: IctBreakdownRow[];
  direction_breakdown: IctBreakdownRow[];
  liquidity_source_breakdown: IctBreakdownRow[];
  monthly_breakdown: IctBreakdownRow[];
  outlier_dependency: IctOutlierDependency;
  trades: IctExperimentTrade[];
}

interface CandidateSetup {
  direction: IctExperimentDirection;
  liquiditySource: IctLiquiditySource;
  setupTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  fvgLow: number;
  fvgHigh: number;
  fvgCandle1Time: number;
  fvgCandle2Time: number;
  fvgCandle3Time: number;
  fvgFormedTime: number;
  fvgTestTime: number;
  confirmationTime: number;
  sweepTime: number;
  sweepLevel: number;
  sweepDepth?: number;
  sweepAtr?: number;
  atr1h?: number;
  atrSma1h?: number;
  adx1h?: number;
  partialTpHit?: boolean;
  fullTpHit?: boolean;
}

interface RunContext {
  symbol: string;
  oneMinute: Kline[];
  fiveMinute: Kline[];
  oneHour: Kline[];
  fourHour: Kline[];
  oneHourAtr: Array<number | null>;
  oneHourAtrSma: Array<number | null>;
  oneHourAdx: Array<number | null>;
  oneHourEma200: Array<number | null>;
  fourHourEma200: Array<number | null>;
  oneMinuteVolumeSma: Array<number | null>;
  index1m: TimeIndex;
  index5m: TimeIndex;
  startTime: number;
  endTime: number;
}

class TimeIndex {
  readonly rows: Kline[];

  constructor(rows: Kline[]) {
    this.rows = [...rows].sort((a, b) => a.openTime - b.openTime);
  }

  lowerBound(time: number) {
    let lo = 0;
    let hi = this.rows.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.rows[mid].openTime < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  slice(startTime: number, endTime: number, inclusiveEnd = false) {
    const start = this.lowerBound(startTime);
    const end = inclusiveEnd ? this.lowerBound(endTime + 1) : this.lowerBound(endTime);
    return this.rows.slice(start, end);
  }

  atOrAfter(time: number) {
    return this.rows[this.lowerBound(time)] ?? null;
  }
}

export const ICT_EXPERIMENT_VARIANTS: IctExperimentVariant[] = [
  { name: "v3_base", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_long_only", directionMode: "long_only", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_short_only", directionMode: "short_only", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_short_htf_filter", liquiditySources: ["previous_1h"], shortHtfFilter: true, rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_atr_regime_filter", liquiditySources: ["previous_1h"], atrRegimeFilter: true, rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_adx_regime_filter", liquiditySources: ["previous_1h"], adxRegimeFilter: true, rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_asian_liquidity", liquiditySources: ["asian_range"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_previous_day_liquidity", liquiditySources: ["previous_day"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_multi_liquidity", liquiditySources: ["previous_1h", "asian_range", "previous_day"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_partial_tp", liquiditySources: ["previous_1h"], partialTp: true, rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_tp_1_5r", liquiditySources: ["previous_1h"], rewardRMultiple: 1.5, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_tp_1_5r_no_be", liquiditySources: ["previous_1h"], rewardRMultiple: 1.5, breakEvenEnabled: false, minRiskPips: 5 },
  { name: "v3_min_risk_0", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 0 },
  { name: "v3_min_risk_4", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 4 },
  { name: "v3_min_risk_5", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 5 },
  { name: "v3_min_risk_6", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 6 },
  { name: "v3_min_risk_8", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 8 },
  { name: "v3_min_risk_10", liquiditySources: ["previous_1h"], rewardRMultiple: 2, breakEvenEnabled: true, minRiskPips: 10 },
];

export const BIOS_ORDERFLOW_EXPERIMENT_VARIANTS: IctExperimentVariant[] = [
  {
    name: "bios_v4_multi_liquidity",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    biosMode: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "bios_v4_long_bias_short_filtered",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    biosMode: true,
    biosShortFilter: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "bios_v4_partial_tp",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    biosMode: true,
    partialTp: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_1_5r",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 1.5,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_2r",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_partial_tp",
    liquiditySources: ["previous_1h", "asian_range", "previous_day"],
    orderFlowProxy: true,
    partialTp: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_2r_prev_day",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_2r_prev_day_target15",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
    riskPerTradePercent: 2.25,
  },
  {
    name: "order_flow_proxy_2r_prev_day_short",
    directionMode: "short_only",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
  },
  {
    name: "order_flow_proxy_2r_prev_day_short_target15",
    directionMode: "short_only",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 5,
    riskPerTradePercent: 2.25,
  },
  {
    name: "order_flow_proxy_2r_prev_day_short_mr10",
    directionMode: "short_only",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 2,
    breakEvenEnabled: true,
    minRiskPips: 10,
  },
  {
    name: "order_flow_proxy_1_5r_prev_day_short_mr10",
    directionMode: "short_only",
    liquiditySources: ["previous_day"],
    orderFlowProxy: true,
    rewardRMultiple: 1.5,
    breakEvenEnabled: true,
    minRiskPips: 10,
  },
];

function sortKlines(rows: Kline[]) {
  return [...rows].sort((a, b) => a.openTime - b.openTime);
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function buildAtrSeries(rows: Kline[], period: number) {
  return rows.map((_, index) => {
    if (index - period < 0) return null;
    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += trueRange(rows[cursor], rows[cursor - 1]);
    }
    return sum / period;
  });
}

function buildSma(values: Array<number | null>, period: number) {
  return values.map((_, index) => {
    if (index - period + 1 < 0) return null;
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value == null)) return null;
    return window.reduce((sum, value) => sum + (value ?? 0), 0) / period;
  });
}

function buildEmaSeries(rows: Kline[], period: number) {
  const values: Array<number | null> = Array.from({ length: rows.length }, () => null);
  if (rows.length < period) return values;
  const multiplier = 2 / (period + 1);
  let ema = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = ema;
  for (let index = period; index < rows.length; index += 1) {
    ema = (rows[index].close - ema) * multiplier + ema;
    values[index] = ema;
  }
  return values;
}

function buildAdxSeries(rows: Kline[], period: number) {
  const adx: Array<number | null> = Array.from({ length: rows.length }, () => null);
  if (rows.length < period * 2 + 1) return adx;

  const tr: number[] = [0];
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];

  for (let index = 1; index < rows.length; index += 1) {
    const upMove = rows[index].high - rows[index - 1].high;
    const downMove = rows[index - 1].low - rows[index].low;
    tr[index] = trueRange(rows[index], rows[index - 1]);
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothedTr = tr.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlus = plusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinus = minusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dx: Array<number | null> = Array.from({ length: rows.length }, () => null);

  for (let index = period; index < rows.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + tr[index];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[index];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[index];
    }
    const plusDi = smoothedTr > 0 ? (100 * smoothedPlus) / smoothedTr : 0;
    const minusDi = smoothedTr > 0 ? (100 * smoothedMinus) / smoothedTr : 0;
    dx[index] = plusDi + minusDi > 0 ? (100 * Math.abs(plusDi - minusDi)) / (plusDi + minusDi) : 0;
  }

  let firstAdxSum = 0;
  for (let index = period; index < period * 2; index += 1) firstAdxSum += dx[index] ?? 0;
  adx[period * 2 - 1] = firstAdxSum / period;
  for (let index = period * 2; index < rows.length; index += 1) {
    adx[index] = ((adx[index - 1] ?? 0) * (period - 1) + (dx[index] ?? 0)) / period;
  }

  return adx;
}

function pipSize(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized === "GER40") return 1;

  return normalized.includes("JPY") ? 0.01 : 0.0001;
}

export function riskDistancePips(symbol: string, entry: number, stop: number) {
  return Math.abs(entry - stop) / pipSize(symbol);
}

function profitFactor(profits: number[]) {
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
}

function maxDrawdown(profits: number[], initialCapital: number) {
  let equity = initialCapital;
  let peak = initialCapital;
  let drawdown = 0;
  for (const profit of profits) {
    equity += profit;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return drawdown;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function utcDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcMinutes(timestamp: number) {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function dayStart(timestamp: number) {
  return Date.parse(`${utcDayKey(timestamp)}T00:00:00Z`);
}

function isFinalFiveMinuteCandle(row: Kline) {
  return new Date(row.openTime).getUTCMinutes() === 55;
}

function strategyFamily(variantName: IctExperimentVariantName): IctExperimentReport["strategy_family"] {
  if (variantName.startsWith("bios_")) return "BIOS";
  if (variantName.startsWith("order_flow_proxy")) return "Order Flow Proxy";
  return "ICT";
}

function lastClosedIndex(rows: Kline[], timestamp: number) {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].closeTime <= timestamp) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function oneHourAtrAt(context: RunContext, timestamp: number) {
  const index = lastClosedIndex(context.oneHour, timestamp);
  if (index < 0) return { atr: null as number | null, atrSma: null as number | null, adx: null as number | null };
  return {
    atr: context.oneHourAtr[index],
    atrSma: context.oneHourAtrSma[index],
    adx: context.oneHourAdx[index],
  };
}

function inLondonNewYorkWindow(timestamp: number) {
  const minutes = utcMinutes(timestamp);
  return minutes >= 7 * 60 && minutes < 16 * 60;
}

function hasUsableVolume(rows: Kline[]) {
  return rows.some((row) => row.volume > 0);
}

function overlapsFvg(row: Kline, fvgLow: number, fvgHigh: number) {
  return row.low <= fvgHigh && row.high >= fvgLow;
}

function classicFvg(candle1: Kline, candle3: Kline, direction: IctExperimentDirection) {
  if (direction === "long" && candle1.high < candle3.low) {
    return { fvgLow: candle1.high, fvgHigh: candle3.low };
  }
  if (direction === "short" && candle1.low > candle3.high) {
    return { fvgLow: candle3.high, fvgHigh: candle1.low };
  }
  return null;
}

function confirmationBreakout(rows: Kline[], index: number, direction: IctExperimentDirection, lookback = 3) {
  if (index - lookback < 0) return false;
  const previous = rows.slice(index - lookback, index);
  return direction === "long"
    ? rows[index].close > Math.max(...previous.map((row) => row.high))
    : rows[index].close < Math.min(...previous.map((row) => row.low));
}

function allowedDirection(variant: IctExperimentVariant, direction: IctExperimentDirection) {
  if (variant.directionMode === "long_only") return direction === "long";
  if (variant.directionMode === "short_only") return direction === "short";
  return true;
}

function htfShortAllowed(context: RunContext, setupTime: number) {
  const index = lastClosedIndex(context.fourHour, setupTime);
  if (index - 5 < 0) return false;
  const row = context.fourHour[index];
  const ema = context.fourHourEma200[index];
  const emaAgo = context.fourHourEma200[index - 5];
  return ema != null && emaAgo != null && row.close < ema && ema < emaAgo;
}

function oneHourBearishAllowed(context: RunContext, setupTime: number) {
  const index = lastClosedIndex(context.oneHour, setupTime);
  if (index < 0) return false;
  const row = context.oneHour[index];
  const ema = context.oneHourEma200[index];
  return ema != null && row.close < ema;
}

function biosShortAllowed(context: RunContext, setupTime: number) {
  return htfShortAllowed(context, setupTime) && oneHourBearishAllowed(context, setupTime);
}

function findSetupAfterSweep({
  context,
  direction,
  liquiditySource,
  setupTime,
  sweepTime,
  sweepLevel,
  windowStart,
  windowEnd,
  variant,
  sweepDepth,
  sweepAtr,
  atr1h,
  atrSma1h,
  adx1h,
}: {
  context: RunContext;
  direction: IctExperimentDirection;
  liquiditySource: IctLiquiditySource;
  setupTime: number;
  sweepTime: number;
  sweepLevel: number;
  windowStart: number;
  windowEnd: number;
  variant: IctExperimentVariant;
  sweepDepth?: number;
  sweepAtr?: number;
  atr1h?: number;
  atrSma1h?: number;
  adx1h?: number;
}): CandidateSetup | null {
  const window = context.index5m.slice(windowStart, windowEnd, true);
  for (let fvgIndex = 0; fvgIndex <= window.length - 3; fvgIndex += 1) {
    const candle1 = window[fvgIndex];
    const candle2 = window[fvgIndex + 1];
    const candle3 = window[fvgIndex + 2];
    if (candle1.openTime <= sweepTime) continue;
    const fvg = classicFvg(candle1, candle3, direction);
    if (!fvg) continue;

    const fvgFormedTime = candle3.closeTime;
    for (let testIndex = fvgIndex + 3; testIndex < window.length; testIndex += 1) {
      const testCandle = window[testIndex];
      if (testCandle.openTime < fvgFormedTime || !overlapsFvg(testCandle, fvg.fvgLow, fvg.fvgHigh)) continue;
      for (let confirmationIndex = testIndex + 1; confirmationIndex < window.length; confirmationIndex += 1) {
        const confirmationCandle = window[confirmationIndex];
        if (!confirmationBreakout(window, confirmationIndex, direction, 3)) continue;
        const entryCandle = context.index5m.atOrAfter(confirmationCandle.openTime + FIVE_MINUTES_MS);
        if (!entryCandle || entryCandle.openTime > windowEnd) continue;
        const entryPrice = entryCandle.open;
        const stopLoss = direction === "long" ? testCandle.low : testCandle.high;
        const riskDistance = direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;
        if (riskDistance <= 0) break;
        if (riskDistancePips(context.symbol, entryPrice, stopLoss) < variant.minRiskPips) continue;

        return {
          direction,
          liquiditySource,
          setupTime,
          entryTime: entryCandle.openTime,
          entryPrice,
          stopLoss,
          takeProfit:
            direction === "long"
              ? entryPrice + variant.rewardRMultiple * riskDistance
              : entryPrice - variant.rewardRMultiple * riskDistance,
          fvgLow: fvg.fvgLow,
          fvgHigh: fvg.fvgHigh,
          fvgCandle1Time: candle1.openTime,
          fvgCandle2Time: candle2.openTime,
          fvgCandle3Time: candle3.openTime,
          fvgFormedTime,
          fvgTestTime: testCandle.openTime,
          confirmationTime: confirmationCandle.openTime,
          sweepTime,
          sweepLevel,
          sweepDepth,
          sweepAtr,
          atr1h,
          atrSma1h,
          adx1h,
        };
      }
    }
  }
  return null;
}

function previousHourSetups(context: RunContext, variant: IctExperimentVariant) {
  const setups: CandidateSetup[] = [];
  for (let index = 1; index < context.oneHour.length; index += 1) {
    const previous = context.oneHour[index - 1];
    const current = context.oneHour[index];
    if (current.openTime < context.startTime || current.openTime >= context.endTime) continue;
    const sweptLow = current.low < previous.low;
    const sweptHigh = current.high > previous.high;
    if (sweptLow && sweptHigh) continue;
    const atr = context.oneHourAtr[index];
    const atrSma = context.oneHourAtrSma[index];
    const adx = context.oneHourAdx[index];
    if (atr == null || atr <= 0) continue;
    if (variant.atrRegimeFilter && (atrSma == null || atr <= atrSma)) continue;
    if (variant.adxRegimeFilter && (adx == null || adx <= 18)) continue;
    const minDepth = 0.1 * atr;
    const candidates: IctExperimentDirection[] = [];
    if (sweptLow && current.close > previous.low && previous.low - current.low >= minDepth) candidates.push("long");
    if (sweptHigh && current.close < previous.high && current.high - previous.high >= minDepth) candidates.push("short");
    for (const direction of candidates) {
      if (!allowedDirection(variant, direction)) continue;
      if (direction === "short" && variant.shortHtfFilter && !htfShortAllowed(context, current.closeTime)) continue;
      if (direction === "short" && variant.biosShortFilter && !biosShortAllowed(context, current.closeTime)) continue;
      const setup = findSetupAfterSweep({
        context,
        direction,
        liquiditySource: "previous_1h",
        setupTime: current.openTime,
        sweepTime: current.closeTime,
        sweepLevel: direction === "long" ? previous.low : previous.high,
        windowStart: current.openTime + ONE_HOUR_MS,
        windowEnd: current.openTime + ONE_HOUR_MS + 30 * ONE_MINUTE_MS,
        variant,
        sweepDepth: direction === "long" ? previous.low - current.low : current.high - previous.high,
        sweepAtr: atr,
        atr1h: atr,
        atrSma1h: atrSma ?? undefined,
        adx1h: adx ?? undefined,
      });
      if (setup) setups.push(setup);
    }
  }
  return setups;
}

function rangeHigh(rows: Kline[]) {
  return Math.max(...rows.map((row) => row.high));
}

function rangeLow(rows: Kline[]) {
  return Math.min(...rows.map((row) => row.low));
}

function dailyLiquiditySetups(
  context: RunContext,
  variant: IctExperimentVariant,
  source: "asian_range" | "previous_day"
) {
  const setups: CandidateSetup[] = [];
  const byDay = new Map<string, Kline[]>();
  for (const row of context.fiveMinute) {
    const key = utcDayKey(row.openTime);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const days = [...byDay.keys()].sort();
  for (let dayIndex = source === "previous_day" ? 1 : 0; dayIndex < days.length; dayIndex += 1) {
    const key = days[dayIndex];
    const rows = byDay.get(key) ?? [];
    const start = Date.parse(`${key}T00:00:00Z`);
    if (start < dayStart(context.startTime) || start >= context.endTime) continue;
    const rangeRows =
      source === "asian_range"
        ? rows.filter((row) => utcMinutes(row.openTime) >= 0 && utcMinutes(row.openTime) < 7 * 60)
        : byDay.get(days[dayIndex - 1]) ?? [];
    if (!rangeRows.length) continue;
    const high = rangeHigh(rangeRows);
    const low = rangeLow(rangeRows);
    const rawSearchRows =
      source === "asian_range"
        ? rows.filter((row) => utcMinutes(row.openTime) >= 7 * 60)
        : rows;
    const searchRows = variant.biosMode
      ? rawSearchRows.filter((row) => inLondonNewYorkWindow(row.openTime))
      : rawSearchRows;
    for (const direction of ["long", "short"] as const) {
      if (!allowedDirection(variant, direction)) continue;
      const sweep = searchRows.find((row) => {
        const swept = direction === "long" ? row.low < low : row.high > high;
        if (!swept) return false;
        if (direction === "short" && variant.biosShortFilter && !biosShortAllowed(context, row.closeTime)) return false;
        if (variant.biosMode) {
          const returned = direction === "long" ? row.close > low : row.close < high;
          const { atr } = oneHourAtrAt(context, row.closeTime);
          const depth = direction === "long" ? low - row.low : row.high - high;
          if (!returned || atr == null || atr <= 0 || depth < 0.1 * atr) return false;
        }
        return true;
      });
      if (!sweep) continue;
      const { atr, atrSma, adx } = oneHourAtrAt(context, sweep.closeTime);
      const setup = findSetupAfterSweep({
        context,
        direction,
        liquiditySource: source,
        setupTime: sweep.openTime,
        sweepTime: sweep.openTime,
        sweepLevel: direction === "long" ? low : high,
        windowStart: sweep.openTime,
        windowEnd: variant.biosMode ? start + 16 * ONE_HOUR_MS : start + ONE_DAY_MS - FIVE_MINUTES_MS,
        variant,
        sweepDepth: direction === "long" ? low - sweep.low : sweep.high - high,
        sweepAtr: atr ?? undefined,
        atr1h: atr ?? undefined,
        atrSma1h: atrSma ?? undefined,
        adx1h: adx ?? undefined,
      });
      if (setup) setups.push(setup);
    }
  }
  return setups;
}

function profitFor(direction: IctExperimentDirection, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function finalizeTrade(
  context: RunContext,
  variant: IctExperimentVariant,
  setup: CandidateSetup,
  equity: number,
  exitTime: number,
  exitPrice: number,
  status: IctExperimentTrade["result_status"],
  rMultiple?: number,
  partialTpHit?: boolean,
  fullTpHit?: boolean
): IctExperimentTrade {
  const riskDistance = Math.abs(setup.entryPrice - setup.stopLoss);
  const riskAmount = equity * ((variant.riskPerTradePercent ?? 1) / 100);
  const quantity = riskDistance > 0 ? riskAmount / riskDistance : 0;
  const resolvedR = rMultiple ?? (riskAmount > 0 ? profitFor(setup.direction, setup.entryPrice, exitPrice, quantity) / riskAmount : 0);
  const profit = resolvedR * riskAmount;
  const tradePipSize = pipSize(context.symbol);
  const sweepDepthPips = setup.sweepDepth == null ? undefined : setup.sweepDepth / tradePipSize;
  const sweepDepthAtr = setup.sweepDepth != null && setup.sweepAtr && setup.sweepAtr > 0 ? setup.sweepDepth / setup.sweepAtr : undefined;
  const fvgSize = Math.abs(setup.fvgHigh - setup.fvgLow);
  const fvgSizePips = fvgSize / tradePipSize;
  const fvgSizeAtr = setup.atr1h && setup.atr1h > 0 ? fvgSize / setup.atr1h : undefined;
  return {
    symbol: context.symbol,
    variant_name: variant.name,
    direction: setup.direction,
    liquidity_source: setup.liquiditySource,
    entry_time: setup.entryTime,
    entry_price: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    exit_time: exitTime,
    exit_price: exitPrice,
    result_status: status,
    profit,
    r_multiple: resolvedR,
    risk_amount: riskAmount,
    quantity,
    setup_time: setup.setupTime,
    fvg_low: setup.fvgLow,
    fvg_high: setup.fvgHigh,
    fvg_candle_1_time: setup.fvgCandle1Time,
    fvg_candle_2_time: setup.fvgCandle2Time,
    fvg_candle_3_time: setup.fvgCandle3Time,
    fvg_formed_time: setup.fvgFormedTime,
    fvg_test_time: setup.fvgTestTime,
    confirmation_time: setup.confirmationTime,
    sweep_time: setup.sweepTime,
    sweep_level: setup.sweepLevel,
    swept_level_price: setup.sweepLevel,
    sweep_depth: setup.sweepDepth,
    sweep_atr: setup.sweepAtr,
    sweep_depth_pips: sweepDepthPips,
    sweep_depth_atr: sweepDepthAtr,
    fvg_size_pips: fvgSizePips,
    fvg_size_atr: fvgSizeAtr,
    risk_distance_pips: riskDistancePips(context.symbol, setup.entryPrice, setup.stopLoss),
    partial_tp_hit: partialTpHit ?? setup.partialTpHit,
    full_tp_hit: fullTpHit ?? setup.fullTpHit,
    adx_1h: setup.adx1h,
    atr_1h: setup.atr1h,
    atr_sma_1h: setup.atrSma1h,
  };
}

function resolveTrade(context: RunContext, variant: IctExperimentVariant, setup: CandidateSetup, equity: number) {
  const oneMinuteAfterEntry = context.index1m.slice(setup.entryTime, context.endTime, true);
  const fiveMinuteAfterEntry = context.index5m
    .slice(setup.entryTime, context.endTime, true)
    .filter(isFinalFiveMinuteCandle);
  let fiveMinuteCursor = 0;
  let activeStop = setup.stopLoss;
  let beActive = false;
  const riskDistance = Math.abs(setup.entryPrice - setup.stopLoss);
  const partialTarget =
    setup.direction === "long" ? setup.entryPrice + riskDistance : setup.entryPrice - riskDistance;
  let partialHit = false;

  for (const candle of oneMinuteAfterEntry) {
    while (
      fiveMinuteCursor < fiveMinuteAfterEntry.length &&
      fiveMinuteAfterEntry[fiveMinuteCursor].openTime + FIVE_MINUTES_MS <= candle.openTime
    ) {
      const finalCandle = fiveMinuteAfterEntry[fiveMinuteCursor];
      const profitable =
        setup.direction === "long" ? finalCandle.close > setup.entryPrice : finalCandle.close < setup.entryPrice;
      if (variant.breakEvenEnabled && profitable) {
        activeStop = setup.entryPrice;
        beActive = true;
      }
      fiveMinuteCursor += 1;
    }

    const hitStop = setup.direction === "long" ? candle.low <= activeStop : candle.high >= activeStop;
    const hitTarget = setup.direction === "long" ? candle.high >= setup.takeProfit : candle.low <= setup.takeProfit;
    const hitPartial = setup.direction === "long" ? candle.high >= partialTarget : candle.low <= partialTarget;

    if (variant.partialTp) {
      if (!partialHit && hitStop) {
        return finalizeTrade(context, variant, setup, equity, candle.openTime, activeStop, "stop_loss", -1, false, false);
      }
      if (!partialHit && hitPartial) {
        partialHit = true;
        activeStop = setup.entryPrice;
        beActive = true;
        const hitBreakEven = setup.direction === "long" ? candle.low <= activeStop : candle.high >= activeStop;
        if (hitBreakEven) {
          return finalizeTrade(
            context,
            variant,
            setup,
            equity,
            candle.openTime,
            activeStop,
            "partial_take_profit",
            0.5,
            true,
            false
          );
        }
        if (hitTarget) {
          return finalizeTrade(
            context,
            variant,
            setup,
            equity,
            candle.openTime,
            setup.takeProfit,
            "partial_take_profit",
            1.5,
            true,
            true
          );
        }
        continue;
      }
      if (partialHit && hitStop) {
        return finalizeTrade(context, variant, setup, equity, candle.openTime, activeStop, "partial_take_profit", 0.5, true, false);
      }
      if (partialHit && hitTarget) {
        return finalizeTrade(context, variant, setup, equity, candle.openTime, setup.takeProfit, "partial_take_profit", 1.5, true, true);
      }
      continue;
    }

    if (hitStop) {
      return finalizeTrade(
        context,
        variant,
        setup,
        equity,
        candle.openTime,
        activeStop,
        beActive && activeStop === setup.entryPrice ? "breakeven" : "stop_loss"
      );
    }
    if (hitTarget) {
      return finalizeTrade(context, variant, setup, equity, candle.openTime, setup.takeProfit, "take_profit");
    }
  }

  const last = oneMinuteAfterEntry[oneMinuteAfterEntry.length - 1];
  const exitPrice = last?.close ?? setup.entryPrice;
  return finalizeTrade(context, variant, setup, equity, last?.openTime ?? setup.entryTime, exitPrice, "open_at_end");
}

function buildContext(symbol: string, oneMinuteRows: Kline[]): RunContext {
  const oneMinute = sortKlines(oneMinuteRows);
  const startTime = oneMinute[0]?.openTime ?? 0;
  const endTime = (oneMinute[oneMinute.length - 1]?.openTime ?? startTime) + ONE_MINUTE_MS;
  const fiveMinute = aggregateKlines(oneMinute, "5m");
  const oneHour = aggregateKlines(oneMinute, "1h");
  const fourHour = aggregateKlines(oneMinute, "4h");
  const oneHourAtr = buildAtrSeries(oneHour, 14);
  const oneMinuteVolumeSma = buildSma(oneMinute.map((row) => row.volume), 50);
  return {
    symbol,
    oneMinute,
    fiveMinute,
    oneHour,
    fourHour,
    oneHourAtr,
    oneHourAtrSma: buildSma(oneHourAtr, 20),
    oneHourAdx: buildAdxSeries(oneHour, 14),
    oneHourEma200: buildEmaSeries(oneHour, 200),
    fourHourEma200: buildEmaSeries(fourHour, 200),
    oneMinuteVolumeSma,
    index1m: new TimeIndex(oneMinute),
    index5m: new TimeIndex(fiveMinute),
    startTime,
    endTime,
  };
}

function closePosition(row: Kline) {
  const range = row.high - row.low;
  return range > 0 ? (row.close - row.low) / range : 0.5;
}

function makeOrderFlowSetup(
  context: RunContext,
  variant: IctExperimentVariant,
  direction: IctExperimentDirection,
  liquiditySource: IctLiquiditySource,
  sweepCandle: Kline,
  sweepIndex: number,
  sweepLevel: number,
  windowEnd: number
): CandidateSetup | null {
  const rejectionEnd = Math.min(context.oneMinute.length - 1, sweepIndex + 3);
  let rejectionIndex = -1;

  for (let index = sweepIndex; index <= rejectionEnd; index += 1) {
    const row = context.oneMinute[index];
    const volumeSma = context.oneMinuteVolumeSma[index];
    if (volumeSma == null || volumeSma <= 0 || row.volume < 1.5 * volumeSma) continue;
    const position = closePosition(row);
    if (direction === "long" ? position >= 0.65 : position <= 0.35) {
      rejectionIndex = index;
      break;
    }
  }

  if (rejectionIndex < 0) return null;

  const displacementEnd = Math.min(context.oneMinute.length - 2, rejectionIndex + 5);
  let displacementIndex = -1;
  for (let index = rejectionIndex + 1; index <= displacementEnd; index += 1) {
    const row = context.oneMinute[index];
    const displaced =
      direction === "long" ? row.close > sweepCandle.high : row.close < sweepCandle.low;
    if (displaced) {
      displacementIndex = index;
      break;
    }
  }

  if (displacementIndex < 0) return null;

  const entryCandle = context.oneMinute[displacementIndex + 1];
  if (!entryCandle || entryCandle.openTime > windowEnd) return null;

  const entryPrice = entryCandle.open;
  const stopLoss = direction === "long" ? sweepCandle.low : sweepCandle.high;
  const riskDistance = direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (riskDistance <= 0) return null;
  if (riskDistancePips(context.symbol, entryPrice, stopLoss) < variant.minRiskPips) return null;

  const { atr, atrSma, adx } = oneHourAtrAt(context, sweepCandle.closeTime);
  const levelDepth = direction === "long" ? sweepLevel - sweepCandle.low : sweepCandle.high - sweepLevel;

  return {
    direction,
    liquiditySource,
    setupTime: sweepCandle.openTime,
    entryTime: entryCandle.openTime,
    entryPrice,
    stopLoss,
    takeProfit:
      direction === "long"
        ? entryPrice + variant.rewardRMultiple * riskDistance
        : entryPrice - variant.rewardRMultiple * riskDistance,
    fvgLow: sweepCandle.low,
    fvgHigh: sweepCandle.high,
    fvgCandle1Time: sweepCandle.openTime,
    fvgCandle2Time: context.oneMinute[rejectionIndex]?.openTime ?? sweepCandle.openTime,
    fvgCandle3Time: context.oneMinute[displacementIndex]?.openTime ?? sweepCandle.openTime,
    fvgFormedTime: context.oneMinute[displacementIndex]?.closeTime ?? sweepCandle.closeTime,
    fvgTestTime: context.oneMinute[rejectionIndex]?.openTime ?? sweepCandle.openTime,
    confirmationTime: context.oneMinute[displacementIndex]?.openTime ?? sweepCandle.openTime,
    sweepTime: sweepCandle.openTime,
    sweepLevel,
    sweepDepth: levelDepth > 0 ? levelDepth : undefined,
    sweepAtr: atr ?? undefined,
    atr1h: atr ?? undefined,
    atrSma1h: atrSma ?? undefined,
    adx1h: adx ?? undefined,
  };
}

function orderFlowPreviousHourSetups(context: RunContext, variant: IctExperimentVariant) {
  const setups: CandidateSetup[] = [];
  if (!hasUsableVolume(context.oneMinute)) return setups;

  for (let hourIndex = 1; hourIndex < context.oneHour.length; hourIndex += 1) {
    const previous = context.oneHour[hourIndex - 1];
    const current = context.oneHour[hourIndex];
    const atr = context.oneHourAtr[hourIndex];
    if (atr == null || atr <= 0) continue;
    const hourRows = context.index1m.slice(current.openTime, current.openTime + ONE_HOUR_MS, false);
    for (const direction of ["long", "short"] as const) {
      if (!allowedDirection(variant, direction)) continue;
      const level = direction === "long" ? previous.low : previous.high;
      const sweep = hourRows.find((row) => {
        const swept = direction === "long" ? row.low < level : row.high > level;
        const depth = direction === "long" ? level - row.low : row.high - level;
        return swept && depth >= 0.1 * atr;
      });
      if (!sweep) continue;
      const sweepIndex = context.index1m.lowerBound(sweep.openTime);
      const setup = makeOrderFlowSetup(
        context,
        variant,
        direction,
        "previous_1h",
        sweep,
        sweepIndex,
        level,
        current.openTime + ONE_HOUR_MS + 30 * ONE_MINUTE_MS
      );
      if (setup) setups.push(setup);
    }
  }

  return setups;
}

function orderFlowDailySetups(
  context: RunContext,
  variant: IctExperimentVariant,
  source: "asian_range" | "previous_day"
) {
  const setups: CandidateSetup[] = [];
  if (!hasUsableVolume(context.oneMinute)) return setups;

  const byDay = new Map<string, Kline[]>();
  for (const row of context.oneMinute) {
    const key = utcDayKey(row.openTime);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }

  const days = [...byDay.keys()].sort();
  for (let dayIndex = source === "previous_day" ? 1 : 0; dayIndex < days.length; dayIndex += 1) {
    const key = days[dayIndex];
    const rows = byDay.get(key) ?? [];
    const start = Date.parse(`${key}T00:00:00Z`);
    const rangeRows =
      source === "asian_range"
        ? rows.filter((row) => utcMinutes(row.openTime) >= 0 && utcMinutes(row.openTime) < 7 * 60)
        : byDay.get(days[dayIndex - 1]) ?? [];
    if (!rangeRows.length) continue;
    const high = rangeHigh(rangeRows);
    const low = rangeLow(rangeRows);
    const searchRows = rows.filter((row) => inLondonNewYorkWindow(row.openTime));

    for (const direction of ["long", "short"] as const) {
      if (!allowedDirection(variant, direction)) continue;
      const level = direction === "long" ? low : high;
      const sweep = searchRows.find((row) => {
        const { atr } = oneHourAtrAt(context, row.closeTime);
        if (atr == null || atr <= 0) return false;
        const swept = direction === "long" ? row.low < level : row.high > level;
        const depth = direction === "long" ? level - row.low : row.high - level;
        return swept && depth >= 0.1 * atr;
      });
      if (!sweep) continue;
      const setup = makeOrderFlowSetup(
        context,
        variant,
        direction,
        source,
        sweep,
        context.index1m.lowerBound(sweep.openTime),
        level,
        start + 16 * ONE_HOUR_MS
      );
      if (setup) setups.push(setup);
    }
  }

  return setups;
}

function orderFlowSetups(context: RunContext, variant: IctExperimentVariant) {
  const setups: CandidateSetup[] = [];
  if (variant.liquiditySources.includes("previous_1h")) setups.push(...orderFlowPreviousHourSetups(context, variant));
  if (variant.liquiditySources.includes("asian_range")) setups.push(...orderFlowDailySetups(context, variant, "asian_range"));
  if (variant.liquiditySources.includes("previous_day")) setups.push(...orderFlowDailySetups(context, variant, "previous_day"));
  return setups;
}

function buildCandidateSetups(context: RunContext, variant: IctExperimentVariant) {
  const setups: CandidateSetup[] = [];
  if (variant.orderFlowProxy) {
    return orderFlowSetups(context, variant).sort((a, b) => a.entryTime - b.entryTime || a.sweepTime - b.sweepTime);
  }
  if (variant.liquiditySources.includes("previous_1h")) {
    setups.push(...previousHourSetups(context, variant));
  }
  if (variant.liquiditySources.includes("asian_range")) {
    setups.push(...dailyLiquiditySetups(context, variant, "asian_range"));
  }
  if (variant.liquiditySources.includes("previous_day")) {
    setups.push(...dailyLiquiditySetups(context, variant, "previous_day"));
  }
  return setups.sort((a, b) => a.entryTime - b.entryTime || a.sweepTime - b.sweepTime);
}

export function runIctExperimentVariant(
  symbol: string,
  oneMinuteRows: Kline[],
  variant: IctExperimentVariant,
  initialCapital = 10_000
) {
  const context = buildContext(symbol, oneMinuteRows);
  if (variant.orderFlowProxy && !hasUsableVolume(context.oneMinute)) {
    return buildReport(symbol, variant.name, [], initialCapital, ["Order Flow Proxy requires volume column."]);
  }
  const candidateSetups = buildCandidateSetups(context, variant);
  const trades: IctExperimentTrade[] = [];
  const seenEntries = new Set<string>();
  const usedSourceHours = new Set<string>();
  let equity = initialCapital;
  let lastExitTime = -Infinity;

  for (const setup of candidateSetups) {
    if (setup.entryTime <= lastExitTime) continue;
    const duplicateKey = `${setup.entryTime}:${setup.direction}`;
    if (seenEntries.has(duplicateKey)) continue;
    const sourceHourKey = `${setup.liquiditySource}:${Math.floor(setup.entryTime / ONE_HOUR_MS)}`;
    if (
      (variant.name === "v3_multi_liquidity" || variant.biosMode || variant.orderFlowProxy) &&
      usedSourceHours.has(sourceHourKey)
    ) {
      continue;
    }
    const trade = resolveTrade(context, variant, setup, equity);
    trades.push(trade);
    equity += trade.profit;
    lastExitTime = trade.exit_time;
    seenEntries.add(duplicateKey);
    usedSourceHours.add(sourceHourKey);
  }

  return buildReport(symbol, variant.name, trades, initialCapital);
}

function statsForTrades(trades: IctExperimentTrade[], initialCapital: number): IctMetricSummary {
  const profits = trades.map((trade) => trade.profit);
  const winners = trades.filter((trade) => trade.profit > 0).length;
  const losers = trades.filter((trade) => trade.profit < 0).length;
  const breakeven = trades.filter((trade) => trade.profit === 0).length;
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  const netProfit = profits.reduce((sum, value) => sum + value, 0);
  const partialTouches = trades.filter((trade) => trade.partial_tp_hit).length;
  const fullTouches = trades.filter((trade) => trade.full_tp_hit).length;
  return {
    trades: trades.length,
    winners,
    losers,
    breakeven,
    win_rate: trades.length ? (winners / trades.length) * 100 : 0,
    resolved_win_rate: winners + losers ? (winners / (winners + losers)) * 100 : 0,
    net_profit: netProfit,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: profitFactor(profits),
    expectancy_r: average(trades.map((trade) => trade.r_multiple)),
    max_drawdown: maxDrawdown(profits, initialCapital),
    final_equity: initialCapital + netProfit,
    average_trade: average(profits),
    best_trade: profits.length ? Math.max(...profits) : 0,
    worst_trade: profits.length ? Math.min(...profits) : 0,
    partial_win_rate: trades.length ? (partialTouches / trades.length) * 100 : 0,
    full_tp_rate: trades.length ? (fullTouches / trades.length) * 100 : 0,
  };
}

function adjustedProfitForCost(trade: IctExperimentTrade, costPips: number) {
  if (costPips <= 0) return { profit: trade.profit, rMultiple: trade.r_multiple };
  const riskPips = riskDistancePips(trade.symbol, trade.entry_price, trade.stop_loss);
  const costR = riskPips > 0 ? costPips / riskPips : 0;
  const adjustedR = trade.r_multiple - costR;
  return { profit: adjustedR * trade.risk_amount, rMultiple: adjustedR };
}

function costSimulation(trades: IctExperimentTrade[], initialCapital: number) {
  return [0, 0.5, 1, 1.5].map((costPips) => {
    const adjusted = trades.map((trade) => adjustedProfitForCost(trade, costPips));
    const profits = adjusted.map((item) => item.profit);
    const winners = profits.filter((profit) => profit > 0).length;
    const losers = profits.filter((profit) => profit < 0).length;
    return {
      cost_pips: costPips,
      net_profit: profits.reduce((sum, profit) => sum + profit, 0),
      profit_factor: profitFactor(profits),
      expectancy_r: average(adjusted.map((item) => item.rMultiple)),
      win_rate: trades.length ? (winners / trades.length) * 100 : 0,
      resolved_win_rate: winners + losers ? (winners / (winners + losers)) * 100 : 0,
      max_drawdown: maxDrawdown(profits, initialCapital),
    };
  });
}

function groupedBreakdown(
  trades: IctExperimentTrade[],
  initialCapital: number,
  keyFn: (trade: IctExperimentTrade) => string
) {
  const groups = new Map<string, IctExperimentTrade[]>();
  for (const trade of trades) {
    const key = keyFn(trade);
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => {
    const stats = statsForTrades(group, initialCapital);
    return {
      key,
      trades: stats.trades,
      win_rate: stats.win_rate,
      resolved_win_rate: stats.resolved_win_rate,
      net_profit: stats.net_profit,
      profit_factor: stats.profit_factor,
      expectancy_r: stats.expectancy_r,
      max_drawdown: stats.max_drawdown,
    };
  });
}

function outlierDependency(trades: IctExperimentTrade[]) {
  const profits = trades.map((trade) => trade.profit);
  const total = profits.reduce((sum, profit) => sum + profit, 0);
  const sorted = [...profits].sort((a, b) => b - a);
  const best = sorted[0] ?? 0;
  const worst = sorted.length ? sorted[sorted.length - 1] : 0;
  const top3 = sorted.slice(0, 3).reduce((sum, profit) => sum + profit, 0);
  return {
    total_net_profit: total,
    net_profit_without_best_trade: total - best,
    net_profit_without_top_3_trades: total - top3,
    percent_profit_from_top_3_trades: total !== 0 ? (top3 / total) * 100 : 0,
    best_trade: best,
    worst_trade: worst,
  };
}

function rankingScore(metrics: IctMetricSummary, outlier: IctOutlierDependency, costs: IctCostSimulationRow[]) {
  const pfAfterHalfPip = costs.find((cost) => cost.cost_pips === 0.5)?.profit_factor ?? 0;
  const scoreProfitFactor = Number.isFinite(metrics.profit_factor) ? metrics.profit_factor : 5;
  const scoreCostProfitFactor = Number.isFinite(pfAfterHalfPip) ? pfAfterHalfPip : 5;
  return (
    metrics.expectancy_r * 100 +
    Math.max(0, scoreProfitFactor - 1) * 50 +
    Math.max(0, scoreCostProfitFactor - 1) * 50 -
    Math.abs(outlier.percent_profit_from_top_3_trades) * 0.15 -
    Math.max(0, 30 - metrics.trades) * 2 -
    Math.max(0, 1.15 - scoreCostProfitFactor) * 70
  );
}

function warningsFor(
  metrics: IctMetricSummary,
  outlier: IctOutlierDependency,
  costs: IctCostSimulationRow[],
  yearly: IctBreakdownRow[] = [],
  direction: IctBreakdownRow[] = []
) {
  const warnings: string[] = [];
  const pfAfterHalfPip = costs.find((cost) => cost.cost_pips === 0.5)?.profit_factor ?? 0;
  if (metrics.trades < 20) warnings.push("too_few_trades");
  else if (metrics.trades < 40) warnings.push("low_trade_count");
  if (metrics.profit_factor < 1.3) warnings.push("profit_factor_below_1_3");
  if (pfAfterHalfPip < 1.15) warnings.push("cost_adjusted_pf_below_1_15");
  if (pfAfterHalfPip < 1.15) warnings.push("weak_after_cost");
  if (metrics.expectancy_r <= 0) warnings.push("non_positive_expectancy");
  if (outlier.net_profit_without_top_3_trades < 0 && metrics.net_profit > 0) warnings.push("high_outlier_dependency");
  if (Math.abs(outlier.percent_profit_from_top_3_trades) > 100) warnings.push("top_3_over_100_percent_profit");
  if (outlier.percent_profit_from_top_3_trades > 60) warnings.push("outlier_dependent");
  if (yearly.some((row) => row.trades >= 5 && row.profit_factor < 0.8)) warnings.push("unstable_yearly");
  const short = direction.find((row) => row.key === "short");
  const long = direction.find((row) => row.key === "long");
  if (short && short.profit_factor < 1.1) warnings.push("short_weak");
  if (long && long.profit_factor < 1.1) warnings.push("long_weak");
  return warnings;
}

function paperTestingAssessment(
  metrics: IctMetricSummary,
  outlier: IctOutlierDependency,
  costs: IctCostSimulationRow[],
  yearly: IctBreakdownRow[]
): IctPaperTestingAssessment {
  const minTrades = 30;
  const maxTop3 = 60;
  const minPfAfterHalfPip = 1.15;
  const minPfAfterOnePip = 1;
  const halfPip = costs.find((cost) => cost.cost_pips === 0.5);
  const onePip = costs.find((cost) => cost.cost_pips === 1);
  const pfAfterHalfPip = halfPip?.profit_factor ?? 0;
  const pfAfterOnePip = onePip?.profit_factor ?? 0;
  const expectancyAfterHalfPip = halfPip?.expectancy_r ?? 0;
  const expectancyAfterOnePip = onePip?.expectancy_r ?? 0;
  const reasons: string[] = [];

  if (metrics.trades < minTrades) reasons.push("trades_below_30");
  if (pfAfterHalfPip < minPfAfterHalfPip) reasons.push("pf_after_0_5_pip_below_1_15");
  if (pfAfterOnePip < minPfAfterOnePip) reasons.push("pf_after_1_pip_below_1_0");
  if (expectancyAfterHalfPip <= 0) reasons.push("expectancy_after_0_5_pip_not_positive");
  if (outlier.percent_profit_from_top_3_trades > maxTop3) reasons.push("top_3_profit_above_60_percent");
  if (yearly.some((row) => row.trades >= 5 && row.profit_factor < 0.8)) reasons.push("unstable_yearly_pf_below_0_8");

  return {
    status: reasons.length ? "fail" : "pass",
    reasons,
    min_trades: minTrades,
    max_top_3_profit_percent: maxTop3,
    min_profit_factor_after_0_5_pip_cost: minPfAfterHalfPip,
    min_profit_factor_after_1_pip_cost: minPfAfterOnePip,
    profit_factor_after_0_5_pip_cost: pfAfterHalfPip,
    profit_factor_after_1_pip_cost: pfAfterOnePip,
    expectancy_r_after_0_5_pip_cost: expectancyAfterHalfPip,
    expectancy_r_after_1_pip_cost: expectancyAfterOnePip,
  };
}

function buildReport(
  symbol: string,
  variantName: IctExperimentVariantName,
  trades: IctExperimentTrade[],
  initialCapital: number,
  extraWarnings: string[] = []
): IctExperimentReport {
  const metrics = statsForTrades(trades, initialCapital);
  const costs = costSimulation(trades, initialCapital);
  const outlier = outlierDependency(trades);
  const yearly = groupedBreakdown(trades, initialCapital, (trade) =>
    new Date(trade.exit_time).getUTCFullYear().toString()
  );
  const direction = groupedBreakdown(trades, initialCapital, (trade) => trade.direction);
  const liquiditySource = groupedBreakdown(trades, initialCapital, (trade) => trade.liquidity_source);
  const monthly = groupedBreakdown(trades, initialCapital, (trade) =>
    new Date(trade.exit_time).toISOString().slice(0, 7)
  );
  return {
    symbol,
    variant_name: variantName,
    strategy_family: strategyFamily(variantName),
    metrics,
    ranking_score: rankingScore(metrics, outlier, costs),
    warnings: [...new Set([...warningsFor(metrics, outlier, costs, yearly, direction), ...extraWarnings])],
    paper_testing_assessment: paperTestingAssessment(metrics, outlier, costs, yearly),
    execution_cost_simulation: costs,
    yearly_breakdown: yearly,
    direction_breakdown: direction,
    liquidity_source_breakdown: liquiditySource,
    monthly_breakdown: monthly,
    outlier_dependency: outlier,
    trades,
  };
}

export function runIctExperimentSuite(symbol: string, oneMinuteRows: Kline[], initialCapital = 10_000) {
  return ICT_EXPERIMENT_VARIANTS.map((variant) =>
    runIctExperimentVariant(symbol, oneMinuteRows, variant, initialCapital)
  );
}

export function runBiosOrderflowExperimentSuite(symbol: string, oneMinuteRows: Kline[], initialCapital = 10_000) {
  return BIOS_ORDERFLOW_EXPERIMENT_VARIANTS.map((variant) =>
    runIctExperimentVariant(symbol, oneMinuteRows, variant, initialCapital)
  );
}
