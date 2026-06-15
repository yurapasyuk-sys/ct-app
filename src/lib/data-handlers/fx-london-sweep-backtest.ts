import type { Kline } from "@/lib/binance";
import {
  calculateNativeBacktestMetrics,
  calculateNativeBacktestValidationReport,
  type NativeBacktestConfig,
  type NativeBacktestDirection,
  type NativeBacktestReport,
  type NativeBacktestResultStatus,
  type NativeBacktestTrade,
} from "./backtest";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const STRATEGY_NAME = "London Session Liquidity Sweep + FVG Confirmation";
const STRATEGY_VERSION = "mvp.5m-asian-range-london-fvg.1";
const ATR_PERIOD = 14;
const REWARD_R_MULTIPLE = 2;

interface LondonSweepConfig extends NativeBacktestConfig {
  atrPeriod?: number;
  minAsianRangeAtrMultiple?: number;
  maxAsianRangeAtrMultiple?: number;
  tradeStartTime?: number;
  tradeEndTime?: number;
}

interface FvgState {
  fvgLow: number;
  fvgHigh: number;
  fvgFormedTime: number;
  fvgCandle1Time: number;
  fvgCandle2Time: number;
  fvgCandle3Time: number;
}

interface DirectionState {
  swept: boolean;
  sweepTime: number;
  fvg: FvgState | null;
  testCandle: Kline | null;
}

interface CandidateSetup {
  direction: NativeBacktestDirection;
  setupTime: number;
  sweepTime: number;
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
  asianHigh: number;
  asianLow: number;
  asianRange: number;
  asianAtr: number;
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
  return ["fx-london-sweep", config.symbol.toLowerCase(), firstTime, lastTime].join("-");
}

function utcDayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function utcMinutes(timestamp: number) {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
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

function dailyKlinesFromFiveMinute(klines5m: Kline[]) {
  const days = new Map<string, Kline[]>();
  for (const kline of klines5m) {
    const key = utcDayKey(kline.openTime);
    days.set(key, [...(days.get(key) ?? []), kline]);
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayKlines]) => {
      const sorted = dayKlines.sort((a, b) => a.openTime - b.openTime);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      return {
        key,
        kline: {
          openTime: Date.parse(`${key}T00:00:00Z`),
          open: first.open,
          high: highestHigh(sorted),
          low: lowestLow(sorted),
          close: last.close,
          volume: sorted.reduce((sum, item) => sum + item.volume, 0),
          closeTime: Date.parse(`${key}T00:00:00Z`) + 24 * 60 * 60 * 1000 - 1,
          quoteVolume: 0,
          trades: 0,
          takerBuyBaseVolume: 0,
          takerBuyQuoteVolume: 0,
        } satisfies Kline,
      };
    });
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

function overlapsFvg(kline: Kline, fvgLow: number, fvgHigh: number) {
  return kline.low <= fvgHigh && kline.high >= fvgLow;
}

function isConfirmation(kline: Kline, previous: Kline, direction: NativeBacktestDirection) {
  return direction === "long" ? kline.close > previous.high : kline.close < previous.low;
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
  const profit = profitForTrade(
    state.direction,
    state.entryPrice,
    exitPrice,
    state.quantity
  );

  return {
    direction: state.direction,
    setup_variant: "london_sweep_fvg",
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
    asian_high: state.asianHigh,
    asian_low: state.asianLow,
    asian_range: state.asianRange,
    asian_atr: state.asianAtr,
    sweep_time: state.sweepTime,
  };
}

function resolveTrade(setup: CandidateSetup, klines5m: Kline[], equity: number) {
  const riskDistance =
    setup.direction === "long"
      ? setup.entryPrice - setup.stopLoss
      : setup.stopLoss - setup.entryPrice;

  const state: OpenTradeState = {
    ...setup,
    riskAmount: equity * 0.01,
    quantity: (equity * 0.01) / riskDistance,
  };

  const candlesAfterEntry = klines5m.filter((kline) => kline.openTime >= setup.entryTime);

  for (const candle of candlesAfterEntry) {
    if (setup.direction === "long") {
      if (candle.low <= setup.stopLoss) {
        return finalizeTrade(state, candle.openTime, setup.stopLoss, "stop_loss");
      }

      if (candle.high >= setup.takeProfit) {
        return finalizeTrade(state, candle.openTime, setup.takeProfit, "take_profit");
      }
    } else {
      if (candle.high >= setup.stopLoss) {
        return finalizeTrade(state, candle.openTime, setup.stopLoss, "stop_loss");
      }

      if (candle.low <= setup.takeProfit) {
        return finalizeTrade(state, candle.openTime, setup.takeProfit, "take_profit");
      }
    }
  }

  const lastCandle = candlesAfterEntry[candlesAfterEntry.length - 1] ?? klines5m[klines5m.length - 1];
  return finalizeTrade(
    state,
    lastCandle?.openTime ?? setup.entryTime,
    lastCandle?.close ?? setup.entryPrice,
    "open_at_end"
  );
}

function nextCandle(klines5m: Kline[], candle: Kline) {
  return klines5m.find((item) => item.openTime >= candle.openTime + FIVE_MINUTES_MS) ?? null;
}

function buildCandidateFromState({
  state,
  direction,
  candle,
  previous,
  klines5m,
  asianHigh,
  asianLow,
  asianRange,
  asianAtr,
  londonEnd,
}: {
  state: DirectionState;
  direction: NativeBacktestDirection;
  candle: Kline;
  previous: Kline;
  klines5m: Kline[];
  asianHigh: number;
  asianLow: number;
  asianRange: number;
  asianAtr: number;
  londonEnd: number;
}) {
  if (!state.fvg || !state.testCandle || !isConfirmation(candle, previous, direction)) {
    return null;
  }

  const entryCandle = nextCandle(klines5m, candle);
  if (!entryCandle || entryCandle.openTime >= londonEnd) return null;

  const entryPrice = entryCandle.open;
  const stopLoss = direction === "long" ? state.testCandle.low : state.testCandle.high;
  const riskDistance = direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (riskDistance <= 0) return null;

  return {
    direction,
    setupTime: state.sweepTime,
    sweepTime: state.sweepTime,
    entryTime: entryCandle.openTime,
    entryPrice,
    stopLoss,
    takeProfit:
      direction === "long"
        ? entryPrice + REWARD_R_MULTIPLE * riskDistance
        : entryPrice - REWARD_R_MULTIPLE * riskDistance,
    fvgLow: state.fvg.fvgLow,
    fvgHigh: state.fvg.fvgHigh,
    fvgFormedTime: state.fvg.fvgFormedTime,
    fvgTestTime: state.testCandle.openTime,
    engulfingTime: candle.openTime,
    fvgCandle1Time: state.fvg.fvgCandle1Time,
    fvgCandle2Time: state.fvg.fvgCandle2Time,
    fvgCandle3Time: state.fvg.fvgCandle3Time,
    asianHigh,
    asianLow,
    asianRange,
    asianAtr,
  } satisfies CandidateSetup;
}

function findDailySetup({
  dayKlines,
  klines5m,
  asianHigh,
  asianLow,
  asianRange,
  asianAtr,
}: {
  dayKlines: Kline[];
  klines5m: Kline[];
  asianHigh: number;
  asianLow: number;
  asianRange: number;
  asianAtr: number;
}) {
  const londonCandles = dayKlines.filter((kline) => {
    const minutes = utcMinutes(kline.openTime);
    return minutes >= 7 * 60 && minutes < 11 * 60;
  });

  if (londonCandles.length < 5) return null;

  const londonEnd = Date.parse(`${utcDayKey(londonCandles[0].openTime)}T11:00:00Z`);
  const states: Record<NativeBacktestDirection, DirectionState> = {
    long: { swept: false, sweepTime: 0, fvg: null, testCandle: null },
    short: { swept: false, sweepTime: 0, fvg: null, testCandle: null },
  };

  for (let index = 0; index < londonCandles.length; index += 1) {
    const candle = londonCandles[index];
    const previous = londonCandles[index - 1];

    if (!states.long.swept && candle.low < asianLow) {
      states.long = { swept: true, sweepTime: candle.openTime, fvg: null, testCandle: null };
    }

    if (!states.short.swept && candle.high > asianHigh) {
      states.short = { swept: true, sweepTime: candle.openTime, fvg: null, testCandle: null };
    }

    for (const direction of ["long", "short"] satisfies NativeBacktestDirection[]) {
      const state = states[direction];
      if (!state.swept) continue;

      if (state.fvg && !state.testCandle && candle.openTime >= state.fvg.fvgFormedTime) {
        if (overlapsFvg(candle, state.fvg.fvgLow, state.fvg.fvgHigh)) {
          state.testCandle = candle;
          continue;
        }
      }

      if (previous && state.testCandle && candle.openTime > state.testCandle.openTime) {
        const candidate = buildCandidateFromState({
          state,
          direction,
          candle,
          previous,
          klines5m,
          asianHigh,
          asianLow,
          asianRange,
          asianAtr,
          londonEnd,
        });

        if (candidate) return candidate;
      }

      if (!state.fvg && index >= 2) {
        const candle1 = londonCandles[index - 2];
        const candle2 = londonCandles[index - 1];
        const candle3 = candle;
        if (candle1.openTime <= state.sweepTime) continue;

        const fvg = getClassicIctFvg(candle1, candle2, candle3, direction);
        if (fvg) {
          state.fvg = {
            ...fvg,
            fvgFormedTime: candle3.closeTime,
            fvgCandle1Time: candle1.openTime,
            fvgCandle2Time: candle2.openTime,
            fvgCandle3Time: candle3.openTime,
          };
        }
      }
    }
  }

  return null;
}

export function runFxLondonSweepBacktest({
  klines5m,
  config,
}: {
  klines5m: Kline[];
  config: LondonSweepConfig;
}): NativeBacktestReport {
  const fiveMinute = sortKlines(klines5m);
  const firstTime = fiveMinute[0]?.openTime;
  const lastTime = fiveMinute[fiveMinute.length - 1]?.openTime;
  const atrPeriod = config.atrPeriod ?? ATR_PERIOD;
  const minAsianRangeAtrMultiple = config.minAsianRangeAtrMultiple ?? 0.3;
  const maxAsianRangeAtrMultiple = config.maxAsianRangeAtrMultiple ?? 1.5;
  const metadataBase = {
    native_backtest_run_id: buildRunId(config, firstTime, lastTime),
    strategy_name: STRATEGY_NAME,
    strategy_version: STRATEGY_VERSION,
    symbol: config.symbol,
    requested_exchange: config.requestedExchange,
    market_type: config.marketType,
    market_data_provider_used: config.marketDataProvider,
    start_date: iso(config.tradeStartTime ?? firstTime),
    end_date: iso(config.tradeEndTime ?? lastTime),
    initial_capital: config.initialCapital,
    risk_per_trade_percent: config.riskPerTradePercent,
    reward_r_multiple: REWARD_R_MULTIPLE,
    include_plan_b: false,
  };

  if (!["EURUSD", "GBPUSD"].includes(config.symbol)) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "London Sweep strategy is enabled only for EURUSD and GBPUSD.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  if (fiveMinute.length < 120) {
    return {
      metadata: {
        ...metadataBase,
        status: "failed",
        error_message: "Insufficient 5M market data for London Sweep strategy.",
      },
      metrics: calculateNativeBacktestMetrics([], config.initialCapital),
      trades: [],
      validation_report: calculateNativeBacktestValidationReport([], config.initialCapital, config.symbol),
    };
  }

  const days = new Map<string, Kline[]>();
  for (const kline of fiveMinute) {
    const key = utcDayKey(kline.openTime);
    days.set(key, [...(days.get(key) ?? []), kline]);
  }
  const dailyKlines = dailyKlinesFromFiveMinute(fiveMinute);
  const dailyAtrByDay = new Map<string, number>();
  for (let index = 0; index < dailyKlines.length; index += 1) {
    const atr = atrAt(
      dailyKlines.map((item) => item.kline),
      index - 1,
      atrPeriod
    );
    if (atr != null) dailyAtrByDay.set(dailyKlines[index].key, atr);
  }

  const trades: NativeBacktestTrade[] = [];
  let equity = config.initialCapital;
  let lastExitTime = -Infinity;

  for (const [dayKey, dayKlines] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dayStart = Date.parse(`${dayKey}T00:00:00Z`);
    if (config.tradeStartTime != null && dayStart < config.tradeStartTime) continue;
    if (config.tradeEndTime != null && dayStart >= config.tradeEndTime) continue;

    const asianCandles = dayKlines.filter((kline) => {
      const minutes = utcMinutes(kline.openTime);
      return minutes >= 0 && minutes < 7 * 60;
    });

    if (!asianCandles.length) continue;

    const asianAtr = dailyAtrByDay.get(dayKey);
    if (asianAtr == null || asianAtr <= 0) continue;

    const asianHigh = highestHigh(asianCandles);
    const asianLow = lowestLow(asianCandles);
    const asianRange = asianHigh - asianLow;

    if (
      asianRange < minAsianRangeAtrMultiple * asianAtr ||
      asianRange > maxAsianRangeAtrMultiple * asianAtr
    ) {
      continue;
    }

    const setup = findDailySetup({
      dayKlines,
      klines5m: fiveMinute,
      asianHigh,
      asianLow,
      asianRange,
      asianAtr,
    });

    if (!setup || setup.entryTime <= lastExitTime) continue;

    const trade = resolveTrade(setup, fiveMinute, equity);
    trades.push(trade);
    equity += trade.profit;
    lastExitTime = trade.exit_time;
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
