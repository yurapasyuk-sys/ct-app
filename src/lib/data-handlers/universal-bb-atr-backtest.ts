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

const STRATEGY_NAME = "Universal BB ATR Mean Reversion";
const STRATEGY_VERSION = "mvp.4h-bb40-k2-atr14-stop3-mean-exit.1";

interface UniversalBbAtrBacktestConfig extends NativeBacktestConfig {
  bbPeriod?: number;
  bandDeviation?: number;
  atrPeriod?: number;
  atrMultiplier?: number;
  maxHoldBars?: number;
  directionMode?: "all" | "long_only" | "short_only";
  emaPeriod?: number;
  emaFilter?: "none" | "countertrend" | "trend";
  exitTarget?: "mean" | "opposite_band";
  setupVariant?: NativeBacktestSetupVariant;
  strategyName?: string;
  strategyVersion?: string;
}

interface OpenPosition {
  direction: NativeBacktestDirection;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  atrValue: number;
  bandHigh: number;
  bandLow: number;
  meanValue: number;
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

function buildRunId(config: NativeBacktestConfig, firstTime: number, lastTime: number) {
  return ["universal-bb-atr", config.symbol.toLowerCase(), firstTime, lastTime].join("-");
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function buildAtrSeries(klines: Kline[], period: number) {
  return klines.map((_, index) => {
    if (index - period < 0) return null;

    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += trueRange(klines[cursor], klines[cursor - 1]);
    }

    return sum / period;
  });
}

function buildBandSeries(klines: Kline[], period: number, deviation: number) {
  return klines.map((_, index) => {
    if (index - period + 1 < 0) return null;

    const window = klines.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, row) => sum + row.close, 0) / period;
    const variance = window.reduce((sum, row) => sum + (row.close - mean) ** 2, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    return {
      mean,
      upper: mean + deviation * standardDeviation,
      lower: mean - deviation * standardDeviation,
    };
  });
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

function directionAllowed(
  mode: "all" | "long_only" | "short_only",
  direction: NativeBacktestDirection
) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";

  return true;
}

function emaFilterAllowed({
  direction,
  ema,
  filter,
  signalClose,
}: {
  direction: NativeBacktestDirection;
  ema: number | null;
  filter: "none" | "countertrend" | "trend";
  signalClose: number;
}) {
  if (filter === "none") return true;
  if (ema == null) return false;

  if (filter === "trend") {
    return direction === "long" ? signalClose > ema : signalClose < ema;
  }

  return direction === "long" ? signalClose < ema : signalClose > ema;
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
    setup_time: position.entryTime,
    fvg_low: position.bandLow,
    fvg_high: position.bandHigh,
    fvg_formed_time: position.entryTime,
    fvg_test_time: exitTime,
    engulfing_time: exitTime,
    atr_value: position.atrValue,
    entry_channel_high: position.bandHigh,
    entry_channel_low: position.bandLow,
    exit_channel_high: position.meanValue,
    exit_channel_low: position.meanValue,
  };
}

export function runUniversalBbAtrBacktest({
  klines4h,
  config,
}: {
  klines4h: Kline[];
  config: UniversalBbAtrBacktestConfig;
}): NativeBacktestReport {
  const fourHour = sortKlines(klines4h);
  const firstTime = fourHour[0]?.openTime;
  const lastTime = fourHour[fourHour.length - 1]?.openTime;
  const bbPeriod = config.bbPeriod ?? 40;
  const bandDeviation = config.bandDeviation ?? 2;
  const atrPeriod = config.atrPeriod ?? 14;
  const atrMultiplier = config.atrMultiplier ?? 3;
  const maxHoldBars = config.maxHoldBars ?? 12;
  const directionMode = config.directionMode ?? "all";
  const emaPeriod = config.emaPeriod ?? 0;
  const emaFilter = config.emaFilter ?? "none";
  const exitTarget = config.exitTarget ?? "mean";
  const setupVariant = config.setupVariant ?? "universal_bb_atr_mean_reversion";
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

  if (fourHour.length < Math.max(bbPeriod, atrPeriod, emaPeriod) + 2) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient 4H market data for Universal BB ATR Mean Reversion.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const atr = buildAtrSeries(fourHour, atrPeriod);
  const bands = buildBandSeries(fourHour, bbPeriod, bandDeviation);
  const ema = buildEmaSeries(fourHour, emaPeriod);
  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let position: OpenPosition | null = null;

  for (let index = Math.max(bbPeriod, atrPeriod, emaPeriod) + 1; index < fourHour.length; index += 1) {
    const signalIndex = index - 1;
    const signal = fourHour[signalIndex];
    const current = fourHour[index];
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

    const band = bands[signalIndex];
    const atrValue = atr[signalIndex];
    if (!band || atrValue == null || atrValue <= 0) continue;

    const direction =
      signal.close < band.lower
        ? "long"
        : signal.close > band.upper
          ? "short"
          : null;
    if (!direction) continue;
    if (!directionAllowed(directionMode, direction)) continue;
    if (
      !emaFilterAllowed({
        direction,
        ema: ema[signalIndex],
        filter: emaFilter,
        signalClose: signal.close,
      })
    ) {
      continue;
    }

    const entryPrice = current.open;
    const riskDistance = atrValue * atrMultiplier;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const riskAmount = equity * (config.riskPerTradePercent / 100);

    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      takeProfit: exitTarget === "opposite_band"
        ? direction === "long"
          ? band.upper
          : band.lower
        : band.mean,
      atrValue,
      bandHigh: band.upper,
      bandLow: band.lower,
      meanValue: band.mean,
      riskAmount,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
      setupVariant,
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
    const last = fourHour[fourHour.length - 1];
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
