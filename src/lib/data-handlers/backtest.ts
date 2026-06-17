import type { Kline } from "@/lib/binance";
import { toLineSeries, type TimeValuePoint } from "./chart-data";

export type BacktestSide = "long" | "short" | "flat";
export type BacktestAction = "enterLong" | "enterShort" | "exit" | "hold";

export interface BacktestSignal {
  timestamp: number;
  action: BacktestAction;
  reason?: string;
}

export interface BacktestTrade {
  side: Exclude<BacktestSide, "flat">;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  returnPct: number;
  entryReason?: string;
  exitReason?: string;
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
  close: number;
  side: BacktestSide;
}

export interface BacktestReport {
  strategyName: string;
  symbol: string;
  interval: string;
  assumptions: string[];
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
  equity: BacktestEquityPoint[];
  equitySeries: TimeValuePoint[];
  drawdownSeries: TimeValuePoint[];
}

export interface SignalBacktestParams {
  strategyName: string;
  symbol: string;
  interval: string;
  initialCapital?: number;
  feeRate?: number;
  slippageRate?: number;
  assumptions?: string[];
}

export type NativeBacktestDirection = "long" | "short";
export type NativeBacktestSetupVariant =
  | "plan_a"
  | "plan_b"
  | "donchian_55_20"
  | "research_2026_donchian_1h_80_10"
  | "london_sweep_fvg"
  | "universal_bb_atr_mean_reversion"
  | "universal_bb_atr_target15"
  | "universal_forex_bb_atr_mean_reversion_2026"
  | "audusd_bb_atr_long_reversion_2026"
  | "ger40_bb_atr_short_reversion_2026"
  | "fx_short_pullback_bb_atr_2026"
  | "fx_universal_long_bb_atr_2026"
  | "research_2026_bb_atr_adaptive"
  | "ict_experiment_v3_adx_regime_filter"
  | "order_flow_proxy_1_5r"
  | "order_flow_proxy_2r"
  | "order_flow_proxy_partial_tp"
  | "order_flow_proxy_2r_prev_day"
  | "order_flow_proxy_2r_prev_day_target15"
  | "order_flow_proxy_2r_prev_day_short"
  | "order_flow_proxy_2r_prev_day_short_target15"
  | "order_flow_proxy_2r_prev_day_short_mr10"
  | "order_flow_proxy_1_5r_prev_day_short_mr10";
export type NativeBacktestResultStatus =
  | "take_profit"
  | "stop_loss"
  | "breakeven"
  | "open_at_end"
  | "channel_exit";
export type NativeBacktestRunStatus = "success" | "failed";
export type NativeBacktestEntryWindowMode = "all" | "kyiv_killzones";
export type NativeBacktestStrategyProfile =
  | "centurion_ict"
  | "ict_ema_atr"
  | "ict_improved_v2"
  | "ict_improved_v3";

export interface NativeBacktestConfig {
  symbol: string;
  requestedExchange: string;
  marketType: string;
  marketDataProvider: string;
  initialCapital: number;
  riskPerTradePercent: number;
  rewardRMultiple: number;
  includePlanB: boolean;
  entryWindowMode?: NativeBacktestEntryWindowMode;
  strategyProfile?: NativeBacktestStrategyProfile;
  breakEvenEnabled?: boolean;
  emaPeriod?: number;
  sweepAtrPeriod?: number;
  sweepDepthAtrMultiple?: number;
  fvgAtrPeriod?: number;
  fvgSizeAtrMultiple?: number;
  confirmationLookback?: number;
  minRiskPips?: number;
  minRiskPipsSimulation?: number[];
  skipMinRiskPipsValidation?: boolean;
  tradeStartTime?: number;
  tradeEndTime?: number;
}

export interface NativeBacktestRunMetadata {
  native_backtest_run_id: string;
  strategy_name: string;
  strategy_version: string;
  symbol: string;
  requested_exchange: string;
  market_type: string;
  market_data_provider_used: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  risk_per_trade_percent: number;
  reward_r_multiple: number;
  include_plan_b: boolean;
  entry_window_mode?: NativeBacktestEntryWindowMode;
  strategy_profile?: NativeBacktestStrategyProfile;
  break_even_enabled?: boolean;
  ema_period?: number;
  sweep_atr_period?: number;
  sweep_depth_atr_multiple?: number;
  fvg_atr_period?: number;
  fvg_size_atr_multiple?: number;
  confirmation_lookback?: number;
  min_risk_pips?: number;
  status: NativeBacktestRunStatus;
  error_message?: string;
}

export interface NativeBacktestTrade {
  direction: NativeBacktestDirection;
  setup_variant: NativeBacktestSetupVariant;
  entry_time: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  exit_time: number;
  exit_price: number;
  result_status: NativeBacktestResultStatus;
  profit: number;
  r_multiple: number;
  quantity: number;
  risk_amount: number;
  setup_time: number;
  fvg_low: number;
  fvg_high: number;
  fvg_formed_time: number;
  fvg_test_time: number;
  engulfing_time: number;
  fvg_candle_1_time?: number;
  fvg_candle_2_time?: number;
  fvg_candle_3_time?: number;
  atr_value?: number;
  entry_channel_high?: number;
  entry_channel_low?: number;
  exit_channel_high?: number;
  exit_channel_low?: number;
  asian_high?: number;
  asian_low?: number;
  asian_range?: number;
  asian_atr?: number;
  sweep_time?: number;
  sweep_depth?: number;
  sweep_atr?: number;
  ema_value?: number;
  fvg_size?: number;
  fvg_atr?: number;
}

export interface NativeBacktestMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number;
  loss_rate: number;
  net_profit: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  average_trade: number;
  average_win: number;
  average_loss: number;
  best_trade: number;
  worst_trade: number;
  expectancy: number;
  max_drawdown: number;
  first_trade_time: number | null;
  last_trade_time: number | null;
  final_equity: number;
}

export interface NativeBacktestBreakdownRow {
  trades: number;
  win_rate: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
}

export interface NativeBacktestYearlyBreakdownRow extends NativeBacktestBreakdownRow {
  year: number;
  winners: number;
  losers: number;
  breakeven: number;
}

export interface NativeBacktestDirectionBreakdownRow extends NativeBacktestBreakdownRow {
  direction: NativeBacktestDirection;
}

export interface NativeBacktestExecutionCostRow {
  cost_pips: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  win_rate: number;
  max_drawdown: number;
}

export interface NativeBacktestMinRiskPipsRow extends NativeBacktestBreakdownRow {
  min_risk_pips: number;
}

export interface NativeBacktestOutlierDependency {
  total_net_profit: number;
  net_profit_without_best_trade: number;
  net_profit_without_top_3_trades: number;
  percent_profit_from_top_3_trades: number;
  best_trade: number;
  worst_trade: number;
}

export interface NativeBacktestMonthlyBreakdownRow {
  year_month: string;
  trades: number;
  net_profit: number;
  expectancy_r: number;
  profit_factor: number;
}

export interface NativeBacktestEquityCurvePoint {
  trade_number: number;
  timestamp: number;
  equity: number;
  drawdown: number;
}

export interface NativeBacktestValidationReport {
  yearly_breakdown: NativeBacktestYearlyBreakdownRow[];
  direction_breakdown: NativeBacktestDirectionBreakdownRow[];
  execution_cost_simulation: NativeBacktestExecutionCostRow[];
  min_risk_pips_simulation?: NativeBacktestMinRiskPipsRow[];
  outlier_dependency: NativeBacktestOutlierDependency;
  monthly_breakdown: NativeBacktestMonthlyBreakdownRow[];
  equity_curve: NativeBacktestEquityCurvePoint[];
}

export interface NativeBacktestReport {
  metadata: NativeBacktestRunMetadata;
  metrics: NativeBacktestMetrics;
  trades: NativeBacktestTrade[];
  validation_report?: NativeBacktestValidationReport;
}

interface Position {
  side: Exclude<BacktestSide, "flat">;
  quantity: number;
  entryTime: number;
  entryPrice: number;
  entryReason?: string;
}

function entryExecutionPrice(close: number, side: BacktestAction, slippageRate: number) {
  if (side === "enterLong") {
    return close * (1 + slippageRate);
  }

  if (side === "enterShort") {
    return close * (1 - slippageRate);
  }

  return close;
}

function exitExecutionPrice(close: number, side: Exclude<BacktestSide, "flat">, slippageRate: number) {
  return side === "long" ? close * (1 - slippageRate) : close * (1 + slippageRate);
}

export function runSignalBacktest(
  klines: Kline[],
  signals: BacktestSignal[],
  params: SignalBacktestParams
): BacktestReport {
  const {
    strategyName,
    symbol,
    interval,
    initialCapital = 10_000,
    feeRate = 0.0004,
    slippageRate = 0,
    assumptions = [],
  } = params;

  const signalByTimestamp = new Map(signals.map((signal) => [signal.timestamp, signal]));
  const trades: BacktestTrade[] = [];
  const equity: BacktestEquityPoint[] = [];

  let cash = initialCapital;
  let position: Position | null = null;
  let peakEquity = initialCapital;

  for (const kline of klines) {
    const signal = signalByTimestamp.get(kline.openTime);
    const close = kline.close;

    if (signal?.action === "exit" && position) {
      const price = exitExecutionPrice(close, position.side, slippageRate);
      const gross = position.quantity * price;
      const fee = gross * feeRate;
      const pnl =
        position.side === "long"
          ? gross - fee - position.quantity * position.entryPrice
          : position.quantity * position.entryPrice - gross - fee;

      cash += position.quantity * position.entryPrice + pnl;
      trades.push({
        side: position.side,
        entryTime: position.entryTime,
        exitTime: kline.openTime,
        entryPrice: position.entryPrice,
        exitPrice: price,
        quantity: position.quantity,
        pnl,
        returnPct:
          position.entryPrice > 0
            ? ((price - position.entryPrice) / position.entryPrice) *
              100 *
              (position.side === "long" ? 1 : -1)
            : 0,
        entryReason: position.entryReason,
        exitReason: signal.reason,
      });
      position = null;
    }

    if (!position && (signal?.action === "enterLong" || signal?.action === "enterShort")) {
      const price = entryExecutionPrice(close, signal.action, slippageRate);
      const entryFee = cash * feeRate;
      const side = signal.action === "enterLong" ? "long" : "short";
      position = {
        side,
        quantity: (cash - entryFee) / price,
        entryTime: kline.openTime,
        entryPrice: price,
        entryReason: signal.reason,
      };
      cash = 0;
    }

    const positionValue = position
      ? position.side === "long"
        ? position.quantity * close
        : position.quantity * (2 * position.entryPrice - close)
      : 0;
    const markToMarketEquity = cash + positionValue;
    peakEquity = Math.max(peakEquity, markToMarketEquity);
    const drawdownPct =
      peakEquity > 0 ? ((markToMarketEquity - peakEquity) / peakEquity) * 100 : 0;

    equity.push({
      timestamp: kline.openTime,
      equity: markToMarketEquity,
      drawdownPct,
      close,
      side: position?.side ?? "flat",
    });
  }

  const finalEquity = equity[equity.length - 1]?.equity ?? initialCapital;
  const maxDrawdownPct = Math.min(0, ...equity.map((point) => point.drawdownPct));

  return {
    strategyName,
    symbol,
    interval,
    assumptions,
    initialCapital,
    finalEquity,
    totalReturnPct: ((finalEquity - initialCapital) / initialCapital) * 100,
    maxDrawdownPct,
    trades,
    equity,
    equitySeries: toLineSeries(equity, (point) => point.timestamp, (point) => point.equity),
    drawdownSeries: toLineSeries(
      equity,
      (point) => point.timestamp,
      (point) => point.drawdownPct
    ),
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function profitFactor(profits: number[]) {
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);

  return grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
}

function maxDrawdownFromProfits(profits: number[], initialCapital: number) {
  let equity = initialCapital;
  let peakEquity = initialCapital;
  let maxDrawdown = 0;

  for (const profit of profits) {
    equity += profit;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peakEquity);
  }

  return maxDrawdown;
}

function statsForTrades(trades: NativeBacktestTrade[], initialCapital: number): NativeBacktestBreakdownRow {
  const profits = trades.map((trade) => trade.profit);
  const winners = profits.filter((profit) => profit > 0).length;

  return {
    trades: trades.length,
    win_rate: trades.length ? (winners / trades.length) * 100 : 0,
    net_profit: profits.reduce((sum, profit) => sum + profit, 0),
    profit_factor: profitFactor(profits),
    expectancy_r: average(trades.map((trade) => trade.r_multiple)),
    max_drawdown: maxDrawdownFromProfits(profits, initialCapital),
  };
}

function yearMonth(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function yearFromTimestamp(timestamp: number) {
  return new Date(timestamp).getUTCFullYear();
}

function pipSizeForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized === "GER40") return 1;

  return normalized.includes("JPY") ? 0.01 : 0.0001;
}

function riskDistancePips(trade: NativeBacktestTrade, symbol: string) {
  const riskDistance = Math.abs(trade.entry_price - trade.stop_loss);
  const pipSize = pipSizeForSymbol(symbol);

  return pipSize > 0 ? riskDistance / pipSize : 0;
}

function adjustedTradeProfitForCost(
  trade: NativeBacktestTrade,
  symbol: string,
  executionCostPips: number
) {
  if (executionCostPips <= 0) return { profit: trade.profit, rMultiple: trade.r_multiple };

  const riskPips = riskDistancePips(trade, symbol);
  const costR = riskPips > 0 ? executionCostPips / riskPips : 0;
  const adjustedR = trade.r_multiple - costR;

  return {
    profit: adjustedR * trade.risk_amount,
    rMultiple: adjustedR,
  };
}

function executionCostStats(
  trades: NativeBacktestTrade[],
  initialCapital: number,
  symbol: string,
  costPips: number
): NativeBacktestExecutionCostRow {
  const adjusted = trades.map((trade) => adjustedTradeProfitForCost(trade, symbol, costPips));
  const profits = adjusted.map((trade) => trade.profit);
  const winners = profits.filter((profit) => profit > 0).length;

  return {
    cost_pips: costPips,
    net_profit: profits.reduce((sum, profit) => sum + profit, 0),
    profit_factor: profitFactor(profits),
    expectancy_r: average(adjusted.map((trade) => trade.rMultiple)),
    win_rate: trades.length ? (winners / trades.length) * 100 : 0,
    max_drawdown: maxDrawdownFromProfits(profits, initialCapital),
  };
}

export function calculateNativeBacktestValidationReport(
  trades: NativeBacktestTrade[],
  initialCapital: number,
  symbol: string,
  minRiskPipsSimulation?: NativeBacktestMinRiskPipsRow[]
): NativeBacktestValidationReport {
  const sortedTrades = [...trades].sort((a, b) => a.exit_time - b.exit_time);
  const yearlyGroups = new Map<number, NativeBacktestTrade[]>();
  const monthlyGroups = new Map<string, NativeBacktestTrade[]>();

  for (const trade of sortedTrades) {
    const year = yearFromTimestamp(trade.exit_time);
    const month = yearMonth(trade.exit_time);
    yearlyGroups.set(year, [...(yearlyGroups.get(year) ?? []), trade]);
    monthlyGroups.set(month, [...(monthlyGroups.get(month) ?? []), trade]);
  }

  const yearlyBreakdown = [...yearlyGroups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, group]) => {
      const stats = statsForTrades(group, initialCapital);

      return {
        year,
        ...stats,
        winners: group.filter((trade) => trade.profit > 0).length,
        losers: group.filter((trade) => trade.profit < 0).length,
        breakeven: group.filter((trade) => trade.profit === 0).length,
      };
    });

  const directionBreakdown: NativeBacktestDirectionBreakdownRow[] = (["long", "short"] as const).map(
    (direction) => ({
      direction,
      ...statsForTrades(
        sortedTrades.filter((trade) => trade.direction === direction),
        initialCapital
      ),
    })
  );

  const monthlyBreakdown = [...monthlyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, group]) => ({
      year_month: month,
      trades: group.length,
      net_profit: group.reduce((sum, trade) => sum + trade.profit, 0),
      expectancy_r: average(group.map((trade) => trade.r_multiple)),
      profit_factor: profitFactor(group.map((trade) => trade.profit)),
    }));

  const profits = sortedTrades.map((trade) => trade.profit);
  const totalNetProfit = profits.reduce((sum, profit) => sum + profit, 0);
  const sortedProfitsDesc = [...profits].sort((a, b) => b - a);
  const bestTrade = sortedProfitsDesc[0] ?? 0;
  const worstTrade = sortedProfitsDesc.length ? sortedProfitsDesc[sortedProfitsDesc.length - 1] : 0;
  const top3Profit = sortedProfitsDesc.slice(0, 3).reduce((sum, profit) => sum + profit, 0);

  let equity = initialCapital;
  let peakEquity = initialCapital;
  const equityCurve = sortedTrades.map((trade, index) => {
    equity += trade.profit;
    peakEquity = Math.max(peakEquity, equity);

    return {
      trade_number: index + 1,
      timestamp: trade.exit_time,
      equity,
      drawdown: equity - peakEquity,
    };
  });

  return {
    yearly_breakdown: yearlyBreakdown,
    direction_breakdown: directionBreakdown,
    execution_cost_simulation: [0, 0.5, 1].map((costPips) =>
      executionCostStats(sortedTrades, initialCapital, symbol, costPips)
    ),
    min_risk_pips_simulation: minRiskPipsSimulation,
    outlier_dependency: {
      total_net_profit: totalNetProfit,
      net_profit_without_best_trade: totalNetProfit - bestTrade,
      net_profit_without_top_3_trades: totalNetProfit - top3Profit,
      percent_profit_from_top_3_trades: totalNetProfit !== 0 ? (top3Profit / totalNetProfit) * 100 : 0,
      best_trade: bestTrade,
      worst_trade: worstTrade,
    },
    monthly_breakdown: monthlyBreakdown,
    equity_curve: equityCurve,
  };
}

export function calculateNativeBacktestMetrics(
  trades: NativeBacktestTrade[],
  initialCapital: number
): NativeBacktestMetrics {
  const winningTrades = trades.filter((trade) => trade.profit > 0);
  const losingTrades = trades.filter((trade) => trade.profit < 0);
  const breakevenTrades = trades.filter((trade) => trade.profit === 0);
  const profits = trades.map((trade) => trade.profit);
  const wins = winningTrades.map((trade) => trade.profit);
  const losses = losingTrades.map((trade) => trade.profit);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = losses.reduce((sum, value) => sum + value, 0);

  let equity = initialCapital;
  let peakEquity = initialCapital;
  let maxDrawdown = 0;

  for (const trade of trades) {
    equity += trade.profit;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peakEquity);
  }

  return {
    total_trades: trades.length,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
    breakeven_trades: breakevenTrades.length,
    win_rate: trades.length ? (winningTrades.length / trades.length) * 100 : 0,
    loss_rate: trades.length ? (losingTrades.length / trades.length) * 100 : 0,
    net_profit: profits.reduce((sum, value) => sum + value, 0),
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0,
    average_trade: average(profits),
    average_win: average(wins),
    average_loss: average(losses),
    best_trade: profits.length ? Math.max(...profits) : 0,
    worst_trade: profits.length ? Math.min(...profits) : 0,
    expectancy: average(trades.map((trade) => trade.r_multiple)),
    max_drawdown: maxDrawdown,
    first_trade_time: trades[0]?.entry_time ?? null,
    last_trade_time: trades[trades.length - 1]?.exit_time ?? null,
    final_equity: equity,
  };
}
