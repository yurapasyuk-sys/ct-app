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

const STRATEGY_NAME = "FX Donchian Trend Following";
const STRATEGY_VERSION = "mvp.4h-donchian-55-20-atr14.1";

interface FxDonchianBacktestConfig extends NativeBacktestConfig {
  entryLookback?: number;
  exitLookback?: number;
  atrPeriod?: number;
  atrMultiplier?: number;
  directionMode?: "all" | "long_only" | "short_only";
  setupVariant?: NativeBacktestSetupVariant;
  strategyName?: string;
  strategyVersion?: string;
}

interface OpenPosition {
  direction: NativeBacktestDirection;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  atrValue: number;
  entryChannelHigh: number;
  entryChannelLow: number;
  riskAmount: number;
  quantity: number;
  setupVariant: NativeBacktestSetupVariant;
}

function sortKlines(klines: Kline[]) {
  return [...klines].sort((a, b) => a.openTime - b.openTime);
}

function iso(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString() : "";
}

function buildRunId(config: NativeBacktestConfig, firstTime: number, lastTime: number) {
  return ["fx-donchian", config.symbol.toLowerCase(), firstTime, lastTime].join("-");
}

function highestHigh(klines: Kline[]) {
  return Math.max(...klines.map((kline) => kline.high));
}

function lowestLow(klines: Kline[]) {
  return Math.min(...klines.map((kline) => kline.low));
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

function directionAllowed(
  mode: "all" | "long_only" | "short_only",
  direction: NativeBacktestDirection
) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";

  return true;
}

function finalizeTrade({
  position,
  exitTime,
  exitPrice,
  resultStatus,
  exitChannelHigh,
  exitChannelLow,
}: {
  position: OpenPosition;
  exitTime: number;
  exitPrice: number;
  resultStatus: NativeBacktestResultStatus;
  exitChannelHigh: number;
  exitChannelLow: number;
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
    take_profit: Number.NaN,
    exit_time: exitTime,
    exit_price: exitPrice,
    result_status: resultStatus,
    profit,
    r_multiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
    quantity: position.quantity,
    risk_amount: position.riskAmount,
    setup_time: position.entryTime,
    fvg_low: position.entryChannelLow,
    fvg_high: position.entryChannelHigh,
    fvg_formed_time: position.entryTime,
    fvg_test_time: exitTime,
    engulfing_time: exitTime,
    atr_value: position.atrValue,
    entry_channel_high: position.entryChannelHigh,
    entry_channel_low: position.entryChannelLow,
    exit_channel_high: exitChannelHigh,
    exit_channel_low: exitChannelLow,
  };
}

export function runFxDonchianBacktest({
  klines4h,
  config,
}: {
  klines4h: Kline[];
  config: FxDonchianBacktestConfig;
}): NativeBacktestReport {
  const fourHour = sortKlines(klines4h);
  const firstTime = fourHour[0]?.openTime;
  const lastTime = fourHour[fourHour.length - 1]?.openTime;
  const entryLookback = config.entryLookback ?? 55;
  const exitLookback = config.exitLookback ?? 20;
  const atrPeriod = config.atrPeriod ?? 14;
  const atrMultiplier = config.atrMultiplier ?? 2;
  const directionMode = config.directionMode ?? "all";
  const setupVariant = config.setupVariant ?? "donchian_55_20";
  const tradeStartTime = config.tradeStartTime ?? -Infinity;
  const tradeEndTime = config.tradeEndTime ?? Infinity;
  const metadataBase = {
    native_backtest_run_id: buildRunId(config, firstTime, lastTime),
    strategy_name: config.strategyName ?? STRATEGY_NAME,
    strategy_version: config.strategyVersion ?? STRATEGY_VERSION,
    symbol: config.symbol,
    requested_exchange: config.requestedExchange,
    market_type: config.marketType,
    market_data_provider_used: config.marketDataProvider,
    start_date: iso(firstTime),
    end_date: iso(lastTime),
    initial_capital: config.initialCapital,
    risk_per_trade_percent: config.riskPerTradePercent,
    reward_r_multiple: 0,
    include_plan_b: false,
  };

  if (fourHour.length < entryLookback + 2 || fourHour.length < atrPeriod + 2) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient 4H market data for FX Donchian Trend Following.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let position: OpenPosition | null = null;

  for (let index = 1; index < fourHour.length; index += 1) {
    const current = fourHour[index];
    const signalIndex = index - 1;
    const signal = fourHour[signalIndex];

    if (position) {
      let exitChannelHigh = Number.NaN;
      let exitChannelLow = Number.NaN;

      if (signalIndex - exitLookback >= 0) {
        const exitWindow = fourHour.slice(signalIndex - exitLookback, signalIndex);
        exitChannelHigh = highestHigh(exitWindow);
        exitChannelLow = lowestLow(exitWindow);
        const exitLong = position.direction === "long" && signal.close < exitChannelLow;
        const exitShort = position.direction === "short" && signal.close > exitChannelHigh;

        if (exitLong || exitShort) {
          const trade = finalizeTrade({
            position,
            exitTime: current.openTime,
            exitPrice: current.open,
            resultStatus: "channel_exit",
            exitChannelHigh,
            exitChannelLow,
          });
          trades.push(trade);
          equity += trade.profit;
          position = null;
        }
      }

      if (position) {
        const hitStop =
          position.direction === "long"
            ? current.low <= position.stopLoss
            : current.high >= position.stopLoss;

        if (hitStop) {
          const trade = finalizeTrade({
            position,
            exitTime: current.openTime,
            exitPrice: position.stopLoss,
            resultStatus: "stop_loss",
            exitChannelHigh,
            exitChannelLow,
          });
          trades.push(trade);
          equity += trade.profit;
          position = null;
        }
      }
    }

    if (position || signalIndex - entryLookback < 0 || index >= fourHour.length) {
      continue;
    }
    if (current.openTime < tradeStartTime || current.openTime >= tradeEndTime) continue;

    const entryWindow = fourHour.slice(signalIndex - entryLookback, signalIndex);
    const entryChannelHigh = highestHigh(entryWindow);
    const entryChannelLow = lowestLow(entryWindow);
    const atrValue = atrAt(fourHour, signalIndex, atrPeriod);
    if (atrValue == null || atrValue <= 0) continue;

    const direction =
      signal.close > entryChannelHigh
        ? "long"
        : signal.close < entryChannelLow
          ? "short"
          : null;

    if (!direction) continue;
    if (!directionAllowed(directionMode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * atrMultiplier;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const riskAmount = equity * (config.riskPerTradePercent / 100);

    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      atrValue,
      entryChannelHigh,
      entryChannelLow,
      riskAmount,
      quantity: riskAmount / riskDistance,
      setupVariant,
    };
  }

  if (position) {
    const last = fourHour[fourHour.length - 1];
    const trade = finalizeTrade({
      position,
      exitTime: last.openTime,
      exitPrice: last.close,
      resultStatus: "open_at_end",
      exitChannelHigh: Number.NaN,
      exitChannelLow: Number.NaN,
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
