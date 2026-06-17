import type { Kline } from "@/lib/binance";
import {
  calculateNativeBacktestMetrics,
  calculateNativeBacktestValidationReport,
  type NativeBacktestConfig,
  type NativeBacktestDirection,
  type NativeBacktestReport,
  type NativeBacktestResultStatus,
  type NativeBacktestSetupVariant,
  type NativeBacktestTrade,
} from "./backtest";

interface PropHtfBreakoutConfig extends NativeBacktestConfig {
  lookback?: number;
  atrPeriod?: number;
  emaPeriod?: number;
  atrMultiplier?: number;
  rewardR?: number;
  maxHoldBars?: number;
  directionMode?: "all" | "long_only" | "short_only";
  setupVariant: Extract<
    NativeBacktestSetupVariant,
    "prop_usdchf_htf_breakout_2026" | "prop_xauusd_htf_breakout_2026"
  >;
  strategyName: string;
  strategyVersion: string;
}

interface OpenPosition {
  direction: NativeBacktestDirection;
  setupTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  atrValue: number;
  emaValue: number;
  channelHigh: number;
  channelLow: number;
  riskAmount: number;
  quantity: number;
  barsHeld: number;
  setupVariant: NativeBacktestSetupVariant;
}

function sortKlines(klines: Kline[]) {
  return [...klines].sort((a, b) => a.openTime - b.openTime);
}

function iso(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString() : "";
}

function buildRunId(config: PropHtfBreakoutConfig, firstTime: number, lastTime: number) {
  return ["prop-htf-breakout", config.symbol.toLowerCase(), firstTime, lastTime].join("-");
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrAt(klines: Kline[], index: number, period: number) {
  if (index - period < 0) return null;

  let sum = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    sum += trueRange(klines[cursor], klines[cursor - 1]);
  }

  return sum / period;
}

function buildEmaSeries(klines: Kline[], period: number) {
  const values: Array<number | null> = Array.from({ length: klines.length }, () => null);
  if (period <= 0 || klines.length < period) return values;

  const multiplier = 2 / (period + 1);
  let ema = klines.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = ema;

  for (let index = period; index < klines.length; index += 1) {
    ema = (klines[index].close - ema) * multiplier + ema;
    values[index] = ema;
  }

  return values;
}

function highestHigh(klines: Kline[], start: number, end: number) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, klines[index].high);
  return value;
}

function lowestLow(klines: Kline[], start: number, end: number) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, klines[index].low);
  return value;
}

function directionAllowed(mode: "all" | "long_only" | "short_only", direction: NativeBacktestDirection) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";
  return true;
}

function profitForTrade(
  direction: NativeBacktestDirection,
  entryPrice: number,
  exitPrice: number,
  quantity: number
) {
  return direction === "long"
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
}

function finalizeTrade({
  position,
  exitTime,
  exitPrice,
  resultStatus,
}: {
  position: OpenPosition;
  exitTime: number;
  exitPrice: number;
  resultStatus: NativeBacktestResultStatus;
}): NativeBacktestTrade {
  const profit = profitForTrade(
    position.direction,
    position.entryPrice,
    exitPrice,
    position.quantity
  );

  return {
    direction: position.direction,
    setup_variant: position.setupVariant,
    entry_time: position.entryTime,
    entry_price: position.entryPrice,
    stop_loss: position.stopLoss,
    take_profit: position.takeProfit,
    exit_time: exitTime,
    exit_price: exitPrice,
    result_status: resultStatus,
    profit,
    r_multiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
    quantity: position.quantity,
    risk_amount: position.riskAmount,
    setup_time: position.setupTime,
    fvg_low: position.channelLow,
    fvg_high: position.channelHigh,
    fvg_formed_time: position.setupTime,
    fvg_test_time: exitTime,
    engulfing_time: exitTime,
    atr_value: position.atrValue,
    ema_value: position.emaValue,
    entry_channel_high: position.channelHigh,
    entry_channel_low: position.channelLow,
    exit_channel_high: position.channelHigh,
    exit_channel_low: position.channelLow,
  };
}

export function runPropHtfBreakoutBacktest({
  klines,
  config,
}: {
  klines: Kline[];
  config: PropHtfBreakoutConfig;
}): NativeBacktestReport {
  const rows = sortKlines(klines);
  const firstTime = rows[0]?.openTime;
  const lastTime = rows[rows.length - 1]?.openTime;
  const lookback = config.lookback ?? 80;
  const atrPeriod = config.atrPeriod ?? 14;
  const emaPeriod = config.emaPeriod ?? 100;
  const atrMultiplier = config.atrMultiplier ?? 1;
  const rewardR = config.rewardR ?? 3;
  const maxHoldBars = config.maxHoldBars ?? 24;
  const directionMode = config.directionMode ?? "all";
  const tradeStartTime = config.tradeStartTime ?? -Infinity;
  const tradeEndTime = config.tradeEndTime ?? Infinity;
  const metadataBase = {
    native_backtest_run_id: buildRunId(config, firstTime, lastTime),
    strategy_name: config.strategyName,
    strategy_version: config.strategyVersion,
    symbol: config.symbol,
    requested_exchange: config.requestedExchange,
    market_type: config.marketType,
    market_data_provider_used: config.marketDataProvider,
    start_date: iso(firstTime),
    end_date: iso(lastTime),
    initial_capital: config.initialCapital,
    risk_per_trade_percent: config.riskPerTradePercent,
    reward_r_multiple: rewardR,
    include_plan_b: false,
  };

  if (rows.length < Math.max(lookback, atrPeriod, emaPeriod) + 2) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient market data for Prop HTF Breakout.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const ema = buildEmaSeries(rows, emaPeriod);
  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let position: OpenPosition | null = null;

  for (let index = Math.max(lookback, atrPeriod, emaPeriod) + 1; index < rows.length; index += 1) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];
    let exitedThisBar = false;

    if (position) {
      position.barsHeld += 1;
      const hitStop =
        position.direction === "long"
          ? current.low <= position.stopLoss
          : current.high >= position.stopLoss;
      const hitTarget =
        position.direction === "long"
          ? current.high >= position.takeProfit
          : current.low <= position.takeProfit;

      if (hitStop || hitTarget || position.barsHeld >= maxHoldBars) {
        const exitPrice = hitStop
          ? position.stopLoss
          : hitTarget
            ? position.takeProfit
            : current.close;
        const trade = finalizeTrade({
          position,
          exitTime: current.openTime,
          exitPrice,
          resultStatus: hitStop ? "stop_loss" : hitTarget ? "take_profit" : "channel_exit",
        });
        trades.push(trade);
        equity += trade.profit;
        position = null;
        exitedThisBar = true;
      }
    }

    if (position || exitedThisBar) continue;
    if (current.openTime < tradeStartTime || current.openTime >= tradeEndTime) continue;

    const channelHigh = highestHigh(rows, signalIndex - lookback, signalIndex);
    const channelLow = lowestLow(rows, signalIndex - lookback, signalIndex);
    const atrValue = atrAt(rows, signalIndex, atrPeriod);
    const emaValue = ema[signalIndex];
    if (atrValue == null || atrValue <= 0 || emaValue == null) continue;

    const direction =
      signal.close > channelHigh && signal.close > emaValue
        ? "long"
        : signal.close < channelLow && signal.close < emaValue
          ? "short"
          : null;
    if (!direction || !directionAllowed(directionMode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * atrMultiplier;
    if (riskDistance <= 0) continue;

    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const takeProfit = direction === "long"
      ? entryPrice + rewardR * riskDistance
      : entryPrice - rewardR * riskDistance;
    const riskAmount = equity * (config.riskPerTradePercent / 100);

    position = {
      direction,
      setupTime: signal.openTime,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      takeProfit,
      atrValue,
      emaValue,
      channelHigh,
      channelLow,
      riskAmount,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
      setupVariant: config.setupVariant,
    };

    const hitStop =
      position.direction === "long"
        ? current.low <= position.stopLoss
        : current.high >= position.stopLoss;
    const hitTarget =
      position.direction === "long"
        ? current.high >= position.takeProfit
        : current.low <= position.takeProfit;

    if (hitStop || hitTarget) {
      const trade = finalizeTrade({
        position,
        exitTime: current.openTime,
        exitPrice: hitStop ? position.stopLoss : position.takeProfit,
        resultStatus: hitStop ? "stop_loss" : "take_profit",
      });
      trades.push(trade);
      equity += trade.profit;
      position = null;
    }
  }

  if (position) {
    const last = rows[rows.length - 1];
    const trade = finalizeTrade({
      position,
      exitTime: last.openTime,
      exitPrice: last.close,
      resultStatus: "open_at_end",
    });
    trades.push(trade);
  }

  return {
    metadata: {
      ...metadataBase,
      status: "success",
    },
    metrics: calculateNativeBacktestMetrics(trades, config.initialCapital),
    trades,
    validation_report: calculateNativeBacktestValidationReport(trades, config.initialCapital, config.symbol),
  };
}
