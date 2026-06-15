import type { Kline } from "@/lib/binance";
import {
  calculateNativeBacktestMetrics,
  calculateNativeBacktestValidationReport,
  type NativeBacktestConfig,
  type NativeBacktestDirection,
  type NativeBacktestMinRiskPipsRow,
  type NativeBacktestReport,
  type NativeBacktestResultStatus,
  type NativeBacktestSetupVariant,
  type NativeBacktestTrade,
} from "./backtest";

const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

const STRATEGY_NAME = "Centurion / Candle Range 1H Sweep + 5M FVG Engulfing";
const STRATEGY_VERSION = "mvp.plan-a-plan-b.1";
const ICT_EMA_ATR_STRATEGY_NAME = "ICT Sweep EMA200 ATR Filter + 5M FVG";
const ICT_EMA_ATR_STRATEGY_VERSION = "mvp.1h-ema200-atr14-5m-fvg-1.5r.1";
const ICT_IMPROVED_V2_STRATEGY_NAME = "EURUSD ICT Sweep + FVG Improved v2";
const ICT_IMPROVED_V2_STRATEGY_VERSION = "mvp.1h-sweep-atr14-5m-fvg-3bar-confirm-2r-be.1";
const ICT_IMPROVED_V3_STRATEGY_NAME = "Forex ICT Sweep + FVG Improved v3";
const ICT_IMPROVED_V3_STRATEGY_VERSION = "mvp.1h-sweep-atr14-5m-fvg-3bar-confirm-2r-be-min-risk.1";
const KYIV_TIME_ZONE = "Europe/Kyiv";
const KYIV_KILLZONE_WINDOWS = [
  { start: 9 * 60, end: 9 * 60 + 30 },
  { start: 10 * 60, end: 10 * 60 + 30 },
  { start: 15 * 60, end: 15 * 60 + 30 },
  { start: 16 * 60, end: 16 * 60 + 30 },
];

const kyivTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: KYIV_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface CandidateSetup {
  direction: NativeBacktestDirection;
  setupVariant: NativeBacktestSetupVariant;
  setupTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  fvgLow: number;
  fvgHigh: number;
  fvgFormedTime: number;
  fvgTestTime: number;
  engulfingTime: number;
  fvgCandle1Time: number;
  fvgCandle2Time: number;
  fvgCandle3Time: number;
  sweepDepth?: number;
  sweepAtr?: number;
  emaValue?: number;
  fvgSize?: number;
  fvgAtr?: number;
}

interface OpenTradeState extends CandidateSetup {
  riskAmount: number;
  quantity: number;
}

function sortKlines(klines: Kline[]) {
  return [...klines].sort((a, b) => a.openTime - b.openTime);
}

function iso(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString() : "";
}

function buildRunId(config: NativeBacktestConfig, firstTime: number, lastTime: number) {
  return [
    "native",
    config.strategyProfile ?? "centurion-ict",
    config.symbol.toLowerCase(),
    firstTime,
    lastTime,
    config.includePlanB ? "plan-b" : "plan-a",
    config.entryWindowMode ?? "all",
  ].join("-");
}

function strategyName(config: NativeBacktestConfig) {
  if (config.strategyProfile === "ict_improved_v3") return ICT_IMPROVED_V3_STRATEGY_NAME;
  if (config.strategyProfile === "ict_improved_v2") return ICT_IMPROVED_V2_STRATEGY_NAME;

  return config.strategyProfile === "ict_ema_atr" ? ICT_EMA_ATR_STRATEGY_NAME : STRATEGY_NAME;
}

function strategyVersion(config: NativeBacktestConfig) {
  if (config.strategyProfile === "ict_improved_v3") return ICT_IMPROVED_V3_STRATEGY_VERSION;
  if (config.strategyProfile === "ict_improved_v2") return ICT_IMPROVED_V2_STRATEGY_VERSION;

  return config.strategyProfile === "ict_ema_atr"
    ? ICT_EMA_ATR_STRATEGY_VERSION
    : STRATEGY_VERSION;
}

function isFilteredIctProfile(config: NativeBacktestConfig) {
  return config.strategyProfile === "ict_ema_atr";
}

function usesAtrSweepFilter(config: NativeBacktestConfig) {
  return (
    config.strategyProfile === "ict_ema_atr" ||
    config.strategyProfile === "ict_improved_v2" ||
    config.strategyProfile === "ict_improved_v3"
  );
}

function metadataOptions(config: NativeBacktestConfig) {
  return {
    strategy_profile: config.strategyProfile ?? "centurion_ict",
    break_even_enabled: config.breakEvenEnabled ?? true,
    ema_period: config.emaPeriod,
    sweep_atr_period: config.sweepAtrPeriod,
    sweep_depth_atr_multiple: config.sweepDepthAtrMultiple,
    fvg_atr_period: config.fvgAtrPeriod,
    fvg_size_atr_multiple: config.fvgSizeAtrMultiple,
    confirmation_lookback: config.confirmationLookback,
    min_risk_pips:
      config.minRiskPips == null && config.strategyProfile !== "ict_improved_v3"
        ? undefined
        : effectiveMinRiskPips(config),
  };
}

function pipSizeForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized === "GER40") return 1;

  return normalized.includes("JPY") ? 0.01 : 0.0001;
}

function riskDistancePipsForPrices(entryPrice: number, stopLoss: number, symbol: string) {
  const pipSize = pipSizeForSymbol(symbol);

  return pipSize > 0 ? Math.abs(entryPrice - stopLoss) / pipSize : 0;
}

function effectiveMinRiskPips(config: NativeBacktestConfig) {
  if (config.minRiskPips != null && Number.isFinite(config.minRiskPips)) {
    return Math.max(0, config.minRiskPips);
  }

  return config.strategyProfile === "ict_improved_v3" ? 5 : 0;
}

function isRiskDistanceAllowed(config: NativeBacktestConfig, entryPrice: number, stopLoss: number) {
  const minRiskPips = effectiveMinRiskPips(config);
  if (minRiskPips <= 0) return true;

  return riskDistancePipsForPrices(entryPrice, stopLoss, config.symbol) >= minRiskPips;
}

function setupWithinTradeRange(setup: CandidateSetup, config: NativeBacktestConfig) {
  if (config.tradeStartTime != null && setup.entryTime < config.tradeStartTime) return false;
  if (config.tradeEndTime != null && setup.entryTime >= config.tradeEndTime) return false;

  return true;
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

function buildEmaSeries(klines: Kline[], period: number) {
  const values: Array<number | null> = Array.from({ length: klines.length }, () => null);
  if (klines.length < period) return values;

  const multiplier = 2 / (period + 1);
  let ema = klines.slice(0, period).reduce((sum, kline) => sum + kline.close, 0) / period;
  values[period - 1] = ema;

  for (let index = period; index < klines.length; index += 1) {
    ema = (klines[index].close - ema) * multiplier + ema;
    values[index] = ema;
  }

  return values;
}

function kyivMinutesOfDay(timestamp: number) {
  const parts = kyivTimePartsFormatter.formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return (hour % 24) * 60 + minute;
}

function isKyivKillzoneEntry(timestamp: number) {
  const minutes = kyivMinutesOfDay(timestamp);

  return KYIV_KILLZONE_WINDOWS.some(
    (window) => minutes >= window.start && minutes <= window.end
  );
}

function entryTimeAllowed(config: NativeBacktestConfig, entryTime: number) {
  if (config.entryWindowMode !== "kyiv_killzones") return true;

  return isKyivKillzoneEntry(entryTime);
}

function isFinalFiveMinuteCandle(kline: Kline) {
  return new Date(kline.openTime).getUTCMinutes() === 55;
}

function findFiveMinuteIndexAtOrAfter(klines5m: Kline[], openTime: number) {
  return klines5m.findIndex((kline) => kline.openTime >= openTime);
}

function getFiveMinuteWindow(klines5m: Kline[], startTime: number, endTime: number) {
  return klines5m.filter((kline) => kline.openTime >= startTime && kline.openTime <= endTime);
}

function overlapsFvg(kline: Kline, fvgLow: number, fvgHigh: number) {
  return kline.low <= fvgHigh && kline.high >= fvgLow;
}

function isConfirmationBreakout(
  window: Kline[],
  confirmationIndex: number,
  direction: NativeBacktestDirection,
  lookback: number
) {
  if (confirmationIndex - lookback < 0) return false;

  const previousClosed = window.slice(confirmationIndex - lookback, confirmationIndex);
  return direction === "long"
    ? window[confirmationIndex].close > Math.max(...previousClosed.map((kline) => kline.high))
    : window[confirmationIndex].close < Math.min(...previousClosed.map((kline) => kline.low));
}

function getClassicIctFvg(
  candle1: Kline,
  candle2: Kline,
  candle3: Kline,
  direction: NativeBacktestDirection
) {
  void candle2;

  if (direction === "long" && candle1.high < candle3.low) {
    return { fvgLow: candle1.high, fvgHigh: candle3.low };
  }

  if (direction === "short" && candle1.low > candle3.high) {
    return { fvgLow: candle3.high, fvgHigh: candle1.low };
  }

  return null;
}

function findSetupInWindow(
  klines5m: Kline[],
  direction: NativeBacktestDirection,
  setupVariant: NativeBacktestSetupVariant,
  setupTime: number,
  windowStart: number,
  windowEnd: number,
  rewardRMultiple: number,
  fvgMustStartAfterTime = -Infinity,
  isFvgStartAllowed?: (candle1: Kline) => boolean,
  isEntryTimeAllowed: (entryTime: number) => boolean = () => true,
  isFvgAllowed: (params: {
    candle1: Kline;
    candle2: Kline;
    candle3: Kline;
    fvgLow: number;
    fvgHigh: number;
  }) => boolean = () => true,
  getFvgAtrValue: (candle3: Kline) => number | undefined = () => undefined,
  setupFilters?: Pick<CandidateSetup, "sweepDepth" | "sweepAtr" | "emaValue">,
  confirmationLookback = 1,
  isRiskAllowed: (entryPrice: number, stopLoss: number) => boolean = () => true
): CandidateSetup | null {
  const window = getFiveMinuteWindow(klines5m, windowStart, windowEnd);

  for (let fvgIndex = 0; fvgIndex <= window.length - 3; fvgIndex++) {
    const candle1 = window[fvgIndex];
    const candle2 = window[fvgIndex + 1];
    const candle3 = window[fvgIndex + 2];
    if (isFvgStartAllowed) {
      if (!isFvgStartAllowed(candle1)) continue;
    } else if (candle1.openTime <= fvgMustStartAfterTime) {
      continue;
    }

    const fvg = getClassicIctFvg(candle1, candle2, candle3, direction);

    if (!fvg) continue;
    if (!isFvgAllowed({ candle1, candle2, candle3, ...fvg })) continue;

    const fvgFormedTime = candle3.closeTime;
    const fvgSize = fvg.fvgHigh - fvg.fvgLow;
    const fvgAtr = getFvgAtrValue(candle3);

    for (let testIndex = fvgIndex + 3; testIndex < window.length; testIndex++) {
      const testCandle = window[testIndex];
      if (testCandle.openTime < fvgFormedTime || !overlapsFvg(testCandle, fvg.fvgLow, fvg.fvgHigh)) {
        continue;
      }

      for (let confirmationIndex = testIndex + 1; confirmationIndex < window.length; confirmationIndex++) {
        const confirmationCandle = window[confirmationIndex];
        const entryIndex = findFiveMinuteIndexAtOrAfter(
          klines5m,
          confirmationCandle.openTime + FIVE_MINUTES_MS
        );
        const entryCandle = entryIndex >= 0 ? klines5m[entryIndex] : null;

        if (
          !entryCandle ||
          entryCandle.openTime > windowEnd ||
          !isEntryTimeAllowed(entryCandle.openTime)
        ) {
          continue;
        }

        if (!isConfirmationBreakout(window, confirmationIndex, direction, confirmationLookback)) {
          continue;
        }

        const entryPrice = entryCandle.open;
        const stopLoss = direction === "long" ? testCandle.low : testCandle.high;
        const riskDistance = direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;

        if (riskDistance <= 0) {
          break;
        }

        if (!isRiskAllowed(entryPrice, stopLoss)) {
          continue;
        }

        const takeProfit =
          direction === "long"
            ? entryPrice + rewardRMultiple * riskDistance
            : entryPrice - rewardRMultiple * riskDistance;

        return {
          direction,
          setupVariant,
          setupTime,
          entryTime: entryCandle.openTime,
          entryPrice,
          stopLoss,
          takeProfit,
          fvgLow: fvg.fvgLow,
          fvgHigh: fvg.fvgHigh,
          fvgFormedTime,
          fvgTestTime: testCandle.openTime,
          engulfingTime: confirmationCandle.openTime,
          fvgCandle1Time: candle1.openTime,
          fvgCandle2Time: candle2.openTime,
          fvgCandle3Time: candle3.openTime,
          fvgSize,
          fvgAtr,
          ...setupFilters,
        };
      }
    }
  }

  return null;
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

function finalizeTrade(
  state: OpenTradeState,
  exitTime: number,
  exitPrice: number,
  resultStatus: NativeBacktestResultStatus
): NativeBacktestTrade {
  const profit = resultStatus === "breakeven" ? 0 : profitForTrade(
    state.direction,
    state.entryPrice,
    exitPrice,
    state.quantity
  );

  return {
    direction: state.direction,
    setup_variant: state.setupVariant,
    entry_time: state.entryTime,
    entry_price: state.entryPrice,
    stop_loss: state.stopLoss,
    take_profit: state.takeProfit,
    exit_time: exitTime,
    exit_price: exitPrice,
    result_status: resultStatus,
    profit,
    r_multiple: state.riskAmount > 0 ? profit / state.riskAmount : 0,
    quantity: state.quantity,
    risk_amount: state.riskAmount,
    setup_time: state.setupTime,
    fvg_low: state.fvgLow,
    fvg_high: state.fvgHigh,
    fvg_formed_time: state.fvgFormedTime,
    fvg_test_time: state.fvgTestTime,
    engulfing_time: state.engulfingTime,
    fvg_candle_1_time: state.fvgCandle1Time,
    fvg_candle_2_time: state.fvgCandle2Time,
    fvg_candle_3_time: state.fvgCandle3Time,
    sweep_depth: state.sweepDepth,
    sweep_atr: state.sweepAtr,
    ema_value: state.emaValue,
    fvg_size: state.fvgSize,
    fvg_atr: state.fvgAtr,
  };
}

function resolveTrade(
  setup: CandidateSetup,
  klines1m: Kline[],
  klines5m: Kline[],
  equity: number,
  config: NativeBacktestConfig
) {
  const riskDistance =
    setup.direction === "long"
      ? setup.entryPrice - setup.stopLoss
      : setup.stopLoss - setup.entryPrice;
  const riskAmount = equity * (config.riskPerTradePercent / 100);
  const state: OpenTradeState = {
    ...setup,
    riskAmount,
    quantity: riskAmount / riskDistance,
  };

  const breakEvenEnabled = config.breakEvenEnabled ?? true;
  let activeStop = setup.stopLoss;
  let beActive = false;
  let fiveMinuteCursor = 0;
  const oneMinuteAfterEntry = klines1m.filter((kline) => kline.openTime >= setup.entryTime);
  const finalFiveMinuteCandles = klines5m
    .filter((kline) => kline.openTime >= setup.entryTime && isFinalFiveMinuteCandle(kline))
    .sort((a, b) => a.openTime - b.openTime);

  for (const minuteCandle of oneMinuteAfterEntry) {
    while (
      fiveMinuteCursor < finalFiveMinuteCandles.length &&
      finalFiveMinuteCandles[fiveMinuteCursor].openTime + FIVE_MINUTES_MS <= minuteCandle.openTime
    ) {
      const finalCandle = finalFiveMinuteCandles[fiveMinuteCursor];
      const profitable =
        setup.direction === "long"
          ? finalCandle.close > setup.entryPrice
          : finalCandle.close < setup.entryPrice;

      if (breakEvenEnabled && profitable) {
        activeStop = setup.entryPrice;
        beActive = true;
      }

      fiveMinuteCursor += 1;
    }

    if (setup.direction === "long") {
      const hitStop = minuteCandle.low <= activeStop;
      const hitTarget = minuteCandle.high >= setup.takeProfit;

      if (hitStop) {
        return finalizeTrade(
          state,
          minuteCandle.openTime,
          activeStop,
          beActive && activeStop === setup.entryPrice ? "breakeven" : "stop_loss"
        );
      }

      if (hitTarget) {
        return finalizeTrade(state, minuteCandle.openTime, setup.takeProfit, "take_profit");
      }
    } else {
      const hitStop = minuteCandle.high >= activeStop;
      const hitTarget = minuteCandle.low <= setup.takeProfit;

      if (hitStop) {
        return finalizeTrade(
          state,
          minuteCandle.openTime,
          activeStop,
          beActive && activeStop === setup.entryPrice ? "breakeven" : "stop_loss"
        );
      }

      if (hitTarget) {
        return finalizeTrade(state, minuteCandle.openTime, setup.takeProfit, "take_profit");
      }
    }
  }

  const lastCandle = oneMinuteAfterEntry[oneMinuteAfterEntry.length - 1] ?? klines1m[klines1m.length - 1];
  const exitPrice = lastCandle?.close ?? setup.entryPrice;
  return finalizeTrade(state, lastCandle?.openTime ?? setup.entryTime, exitPrice, "open_at_end");
}

function estimateExecutionEndTime(
  setup: CandidateSetup,
  klines5m: Kline[],
  fallbackEndTime: number,
  config: NativeBacktestConfig
) {
  const breakEvenEnabled = config.breakEvenEnabled ?? true;
  let activeStop = setup.stopLoss;
  const candlesAfterEntry = klines5m
    .filter((kline) => kline.openTime >= setup.entryTime)
    .sort((a, b) => a.openTime - b.openTime);

  for (const candle of candlesAfterEntry) {
    if (isFinalFiveMinuteCandle(candle)) {
      const profitable =
        setup.direction === "long"
          ? candle.close > setup.entryPrice
          : candle.close < setup.entryPrice;

      if (breakEvenEnabled && profitable) {
        activeStop = setup.entryPrice;
      }
    }

    if (setup.direction === "long") {
      if (candle.low <= activeStop || candle.high >= setup.takeProfit) {
        return candle.openTime + FIVE_MINUTES_MS;
      }
    } else if (candle.high >= activeStop || candle.low <= setup.takeProfit) {
      return candle.openTime + FIVE_MINUTES_MS;
    }
  }

  return fallbackEndTime;
}

interface PlanAContext {
  config: NativeBacktestConfig;
  emaValue?: number | null;
  sweepAtr?: number | null;
}

function planADirections(
  current: Kline,
  previous: Kline,
  context?: PlanAContext
): NativeBacktestDirection[] {
  const sweptLow = current.low < previous.low;
  const sweptHigh = current.high > previous.high;

  if (sweptLow && sweptHigh) {
    return [];
  }

  if (context && usesAtrSweepFilter(context.config)) {
    const emaValue = context.emaValue;
    const sweepAtr = context.sweepAtr;
    const sweepDepthAtrMultiple = context.config.sweepDepthAtrMultiple ?? 0.05;
    const usesEmaFilter = context.config.strategyProfile === "ict_ema_atr";
    if (sweepAtr == null || sweepAtr <= 0 || (usesEmaFilter && emaValue == null)) return [];

    const longDepth = previous.low - current.low;
    const shortDepth = current.high - previous.high;
    const minDepth = sweepDepthAtrMultiple * sweepAtr;

    if (
      sweptLow &&
      current.close > previous.low &&
      (!usesEmaFilter || current.close > (emaValue ?? Infinity)) &&
      longDepth >= minDepth
    ) {
      return ["long"];
    }

    if (
      sweptHigh &&
      current.close < previous.high &&
      (!usesEmaFilter || current.close < (emaValue ?? -Infinity)) &&
      shortDepth >= minDepth
    ) {
      return ["short"];
    }

    return [];
  }

  if (sweptLow && current.close > previous.low) {
    return ["long"];
  }

  if (sweptHigh && current.close < previous.high) {
    return ["short"];
  }

  return [];
}

function planBDirections(currentWindow: Kline[], previousHour: Kline): NativeBacktestDirection[] {
  const sweptLow = currentWindow.some((kline) => kline.low < previousHour.low);
  const sweptHigh = currentWindow.some((kline) => kline.high > previousHour.high);

  if (sweptLow && sweptHigh) {
    return [];
  }

  if (sweptLow) return ["long"];
  if (sweptHigh) return ["short"];

  return [];
}

function hasPlanBSweepBeforeEntry(
  klines5m: Kline[],
  direction: NativeBacktestDirection,
  previousHour: Kline,
  currentHourOpenTime: number,
  entryTime: number
) {
  return klines5m
    .filter((kline) => kline.openTime >= currentHourOpenTime && kline.openTime <= entryTime)
    .some((kline) =>
      direction === "long" ? kline.low < previousHour.low : kline.high > previousHour.high
    );
}

function hasPlanBSweepBeforeTime(
  klines5m: Kline[],
  direction: NativeBacktestDirection,
  previousHour: Kline,
  currentHourOpenTime: number,
  beforeTime: number
) {
  return klines5m
    .filter((kline) => kline.openTime >= currentHourOpenTime && kline.openTime < beforeTime)
    .some((kline) =>
      direction === "long" ? kline.low < previousHour.low : kline.high > previousHour.high
    );
}

function buildFvgAtrFilter(klines5m: Kline[], config: NativeBacktestConfig) {
  if (!isFilteredIctProfile(config)) {
    return {
      isAllowed: () => true,
      getAtr: () => undefined,
    };
  }

  const atrPeriod = config.fvgAtrPeriod ?? 14;
  const minMultiple = config.fvgSizeAtrMultiple ?? 0.05;
  const atrSeries = buildAtrSeries(klines5m, atrPeriod);
  const indexByOpenTime = new Map(klines5m.map((kline, index) => [kline.openTime, index]));

  const getAtr = (candle3: Kline) => {
    const index = indexByOpenTime.get(candle3.openTime);
    if (index == null) return undefined;

    return atrSeries[index] ?? undefined;
  };

  return {
    isAllowed: ({ candle3, fvgLow, fvgHigh }: {
      candle3: Kline;
      fvgLow: number;
      fvgHigh: number;
    }) => {
      const atr = getAtr(candle3);
      if (atr == null || atr <= 0) return false;

      return fvgHigh - fvgLow >= minMultiple * atr;
    },
    getAtr,
  };
}

function setupFiltersForSweep(
  direction: NativeBacktestDirection,
  currentHour: Kline,
  previousHour: Kline,
  emaValue?: number | null,
  sweepAtr?: number | null
) {
  return {
    sweepDepth:
      direction === "long"
        ? previousHour.low - currentHour.low
        : currentHour.high - previousHour.high,
    sweepAtr: sweepAtr ?? undefined,
    emaValue: emaValue ?? undefined,
  };
}

function shouldBuildMinRiskValidation(config: NativeBacktestConfig) {
  return config.strategyProfile === "ict_improved_v3" && !config.skipMinRiskPipsValidation;
}

function minRiskValidationValues(config: NativeBacktestConfig) {
  return config.minRiskPipsSimulation ?? [0, 4, 5, 6, 8, 10];
}

function minRiskPipsRow(minRiskPips: number, report: NativeBacktestReport): NativeBacktestMinRiskPipsRow {
  return {
    min_risk_pips: minRiskPips,
    trades: report.metrics.total_trades,
    win_rate: report.metrics.win_rate,
    net_profit: report.metrics.net_profit,
    profit_factor: report.metrics.profit_factor,
    expectancy_r: report.metrics.expectancy,
    max_drawdown: report.metrics.max_drawdown,
  };
}

export function runCenturionNativeBacktest({
  klines1h,
  klines5m,
  klines1m,
  config,
}: {
  klines1h: Kline[];
  klines5m: Kline[];
  klines1m: Kline[];
  config: NativeBacktestConfig;
}): NativeBacktestReport {
  const oneHour = sortKlines(klines1h);
  const fiveMinute = sortKlines(klines5m);
  const oneMinute = sortKlines(klines1m);
  const emaPeriod = config.emaPeriod ?? 200;
  const sweepAtrPeriod = config.sweepAtrPeriod ?? 14;
  const oneHourEma = buildEmaSeries(oneHour, emaPeriod);
  const oneHourAtr = buildAtrSeries(oneHour, sweepAtrPeriod);
  const fvgAtrFilter = buildFvgAtrFilter(fiveMinute, config);
  const firstTime = oneMinute[0]?.openTime ?? fiveMinute[0]?.openTime ?? oneHour[0]?.openTime;
  const lastTime =
    oneMinute[oneMinute.length - 1]?.openTime ??
    fiveMinute[fiveMinute.length - 1]?.openTime ??
    oneHour[oneHour.length - 1]?.openTime;

  const metadataBase = {
    native_backtest_run_id: buildRunId(config, firstTime, lastTime),
    strategy_name: strategyName(config),
    strategy_version: strategyVersion(config),
    symbol: config.symbol,
    requested_exchange: config.requestedExchange,
    market_type: config.marketType,
    market_data_provider_used: config.marketDataProvider,
    start_date: iso(config.tradeStartTime ?? firstTime),
    end_date: iso(config.tradeEndTime ?? lastTime),
    initial_capital: config.initialCapital,
    risk_per_trade_percent: config.riskPerTradePercent,
    reward_r_multiple: config.rewardRMultiple,
    include_plan_b: config.includePlanB,
    entry_window_mode: config.entryWindowMode ?? "all",
    ...metadataOptions(config),
  };

  if (!oneHour.length || !fiveMinute.length || !oneMinute.length) {
    const emptyMetrics = calculateNativeBacktestMetrics([], config.initialCapital);

    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient market data for 1H, 5M, or 1M timeframes.",
      },
      metrics: emptyMetrics,
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let lastExitTime = -Infinity;

  for (let index = 1; index < oneHour.length; index++) {
    const previousHour = oneHour[index - 1];
    const currentHour = oneHour[index];

    const emaValue = oneHourEma[index];
    const sweepAtr = oneHourAtr[index];

    for (const direction of planADirections(currentHour, previousHour, {
      config,
      emaValue,
      sweepAtr,
    })) {
      const windowStart = currentHour.openTime + ONE_HOUR_MS;
      const windowEnd = windowStart + 30 * ONE_MINUTE_MS;
      const setup = findSetupInWindow(
        fiveMinute,
        direction,
        "plan_a",
        currentHour.openTime,
        windowStart,
        windowEnd,
        config.rewardRMultiple,
        -Infinity,
        undefined,
        (entryTime) => entryTimeAllowed(config, entryTime),
        fvgAtrFilter.isAllowed,
        fvgAtrFilter.getAtr,
        setupFiltersForSweep(direction, currentHour, previousHour, emaValue, sweepAtr),
        config.confirmationLookback ?? 1,
        (entryPrice, stopLoss) => isRiskDistanceAllowed(config, entryPrice, stopLoss)
      );

      if (!setup || setup.entryTime <= lastExitTime || !setupWithinTradeRange(setup, config)) continue;

      const trade = resolveTrade(setup, oneMinute, fiveMinute, equity, config);
      trades.push(trade);
      equity += trade.profit;
      lastExitTime = trade.exit_time;
      break;
    }

    if (!config.includePlanB) continue;

    const planBWindowStart = currentHour.openTime + 45 * ONE_MINUTE_MS;
    const planBWindowEnd = currentHour.openTime + ONE_HOUR_MS;
    const currentWindow5m = getFiveMinuteWindow(fiveMinute, currentHour.openTime, planBWindowEnd);

    for (const direction of planBDirections(currentWindow5m, previousHour)) {
      const setup = findSetupInWindow(
        fiveMinute,
        direction,
        "plan_b",
        currentHour.openTime,
        planBWindowStart,
        planBWindowEnd,
        config.rewardRMultiple,
        -Infinity,
        (candle1) =>
          hasPlanBSweepBeforeTime(
            fiveMinute,
            direction,
            previousHour,
            currentHour.openTime,
            candle1.openTime
          ),
        (entryTime) => entryTimeAllowed(config, entryTime),
        undefined,
        undefined,
        undefined,
        config.confirmationLookback ?? 1,
        (entryPrice, stopLoss) => isRiskDistanceAllowed(config, entryPrice, stopLoss)
      );

      if (
        !setup ||
        setup.entryTime <= lastExitTime ||
        !setupWithinTradeRange(setup, config) ||
        !hasPlanBSweepBeforeEntry(
          fiveMinute,
          direction,
          previousHour,
          currentHour.openTime,
          setup.entryTime
        )
      ) {
        continue;
      }

      const trade = resolveTrade(setup, oneMinute, fiveMinute, equity, config);
      trades.push(trade);
      equity += trade.profit;
      lastExitTime = trade.exit_time;
      break;
    }
  }

  const minRiskPipsSimulation = shouldBuildMinRiskValidation(config)
    ? minRiskValidationValues(config).map((minRiskPips) => {
        const simulatedReport = runCenturionNativeBacktest({
          klines1h: oneHour,
          klines5m: fiveMinute,
          klines1m: oneMinute,
          config: {
            ...config,
            minRiskPips,
            skipMinRiskPipsValidation: true,
          },
        });

        return minRiskPipsRow(minRiskPips, simulatedReport);
      })
    : undefined;

  return {
    metadata: {
      ...metadataBase,
      status: "success",
    },
    metrics: calculateNativeBacktestMetrics(trades, config.initialCapital),
    trades,
    validation_report: calculateNativeBacktestValidationReport(
      trades,
      config.initialCapital,
      config.symbol,
      minRiskPipsSimulation
    ),
  };
}

export async function runCenturionNativeBacktestLazy({
  klines1h,
  klines5m,
  config,
  loadExecutionKlines1m,
}: {
  klines1h: Kline[];
  klines5m: Kline[];
  config: NativeBacktestConfig;
  loadExecutionKlines1m: (startTime: number, endTime: number) => Promise<Kline[]>;
}): Promise<NativeBacktestReport> {
  const oneHour = sortKlines(klines1h);
  const fiveMinute = sortKlines(klines5m);
  const emaPeriod = config.emaPeriod ?? 200;
  const sweepAtrPeriod = config.sweepAtrPeriod ?? 14;
  const oneHourEma = buildEmaSeries(oneHour, emaPeriod);
  const oneHourAtr = buildAtrSeries(oneHour, sweepAtrPeriod);
  const fvgAtrFilter = buildFvgAtrFilter(fiveMinute, config);
  const firstTime = fiveMinute[0]?.openTime ?? oneHour[0]?.openTime;
  const lastTime =
    fiveMinute[fiveMinute.length - 1]?.openTime ??
    oneHour[oneHour.length - 1]?.openTime;

  const metadataBase = {
    native_backtest_run_id: buildRunId(config, firstTime, lastTime),
    strategy_name: strategyName(config),
    strategy_version: strategyVersion(config),
    symbol: config.symbol,
    requested_exchange: config.requestedExchange,
    market_type: config.marketType,
    market_data_provider_used: config.marketDataProvider,
    start_date: iso(config.tradeStartTime ?? firstTime),
    end_date: iso(config.tradeEndTime ?? lastTime),
    initial_capital: config.initialCapital,
    risk_per_trade_percent: config.riskPerTradePercent,
    reward_r_multiple: config.rewardRMultiple,
    include_plan_b: config.includePlanB,
    entry_window_mode: config.entryWindowMode ?? "all",
    ...metadataOptions(config),
  };

  if (!oneHour.length || !fiveMinute.length) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient market data for 1H or 5M timeframes.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let lastExitTime = -Infinity;

  const resolveCandidate = async (setup: CandidateSetup) => {
    const roughEndTime = estimateExecutionEndTime(setup, fiveMinute, lastTime, config);
    const oneMinute = sortKlines(await loadExecutionKlines1m(setup.entryTime, roughEndTime));
    const trade = resolveTrade(setup, oneMinute, fiveMinute, equity, config);
    trades.push(trade);
    equity += trade.profit;
    lastExitTime = trade.exit_time;
  };

  for (let index = 1; index < oneHour.length; index++) {
    const previousHour = oneHour[index - 1];
    const currentHour = oneHour[index];

    const emaValue = oneHourEma[index];
    const sweepAtr = oneHourAtr[index];

    for (const direction of planADirections(currentHour, previousHour, {
      config,
      emaValue,
      sweepAtr,
    })) {
      const windowStart = currentHour.openTime + ONE_HOUR_MS;
      const windowEnd = windowStart + 30 * ONE_MINUTE_MS;
      const setup = findSetupInWindow(
        fiveMinute,
        direction,
        "plan_a",
        currentHour.openTime,
        windowStart,
        windowEnd,
        config.rewardRMultiple,
        -Infinity,
        undefined,
        (entryTime) => entryTimeAllowed(config, entryTime),
        fvgAtrFilter.isAllowed,
        fvgAtrFilter.getAtr,
        setupFiltersForSweep(direction, currentHour, previousHour, emaValue, sweepAtr),
        config.confirmationLookback ?? 1,
        (entryPrice, stopLoss) => isRiskDistanceAllowed(config, entryPrice, stopLoss)
      );

      if (!setup || setup.entryTime <= lastExitTime || !setupWithinTradeRange(setup, config)) continue;

      await resolveCandidate(setup);
      break;
    }

    if (!config.includePlanB) continue;

    const planBWindowStart = currentHour.openTime + 45 * ONE_MINUTE_MS;
    const planBWindowEnd = currentHour.openTime + ONE_HOUR_MS;
    const currentWindow5m = getFiveMinuteWindow(fiveMinute, currentHour.openTime, planBWindowEnd);

    for (const direction of planBDirections(currentWindow5m, previousHour)) {
      const setup = findSetupInWindow(
        fiveMinute,
        direction,
        "plan_b",
        currentHour.openTime,
        planBWindowStart,
        planBWindowEnd,
        config.rewardRMultiple,
        -Infinity,
        (candle1) =>
          hasPlanBSweepBeforeTime(
            fiveMinute,
            direction,
            previousHour,
            currentHour.openTime,
            candle1.openTime
          ),
        (entryTime) => entryTimeAllowed(config, entryTime),
        undefined,
        undefined,
        undefined,
        config.confirmationLookback ?? 1,
        (entryPrice, stopLoss) => isRiskDistanceAllowed(config, entryPrice, stopLoss)
      );

      if (
        !setup ||
        setup.entryTime <= lastExitTime ||
        !setupWithinTradeRange(setup, config) ||
        !hasPlanBSweepBeforeEntry(
          fiveMinute,
          direction,
          previousHour,
          currentHour.openTime,
          setup.entryTime
        )
      ) {
        continue;
      }

      await resolveCandidate(setup);
      break;
    }
  }

  const minRiskPipsSimulation = shouldBuildMinRiskValidation(config)
    ? await Promise.all(
        minRiskValidationValues(config).map(async (minRiskPips) => {
          const simulatedReport = await runCenturionNativeBacktestLazy({
            klines1h: oneHour,
            klines5m: fiveMinute,
            config: {
              ...config,
              minRiskPips,
              skipMinRiskPipsValidation: true,
            },
            loadExecutionKlines1m,
          });

          return minRiskPipsRow(minRiskPips, simulatedReport);
        })
      )
    : undefined;

  return {
    metadata: {
      ...metadataBase,
      status: "success",
    },
    metrics: calculateNativeBacktestMetrics(trades, config.initialCapital),
    trades,
    validation_report: calculateNativeBacktestValidationReport(
      trades,
      config.initialCapital,
      config.symbol,
      minRiskPipsSimulation
    ),
  };
}
