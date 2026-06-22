import type { Kline } from "../binance";

export type ApprovedPropDirection = "long" | "short";

export type ApprovedPropStrategyConfig =
  | {
      kind: "htf_breakout";
      timeframeHours: 1 | 4;
      lookback: number;
      atrPeriod: number;
      emaPeriod: number;
      stopAtr: number;
      rewardR: number;
      maxHoldBars: number;
      direction: ApprovedPropDirection;
    }
  | {
      kind: "opening_range_breakout";
      timeframeHours: 1;
      openingBars: number;
      atrPeriod: number;
      emaPeriod: number;
      stopAtr: number;
      rewardR: number;
      minRangeAtr: number;
      maxRangeAtr: number;
      maxRiskAtr: number;
      direction: ApprovedPropDirection;
    };

export interface ApprovedPropSignalSetup {
  direction: ApprovedPropDirection;
  signalTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  exitAtTime?: number;
  reason: string;
}

export interface ApprovedPropOpenPosition {
  direction: ApprovedPropDirection;
  entryTime: number;
  stopLoss: number;
  takeProfit: number;
  exitAtTime?: number;
  maxHoldBars?: number;
  timeframeHours: 1 | 4;
}

export interface ApprovedPropPositionExit {
  exitTime: number;
  exitPrice: number;
  result: "take_profit" | "stop_loss" | "strategy_exit";
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function dayStart(timestamp: number) {
  return timestamp - (timestamp % DAY_MS);
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrAt(rows: Kline[], index: number, period: number) {
  if (index - period < 0) return null;
  let sum = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    sum += trueRange(rows[cursor], rows[cursor - 1]);
  }
  return sum / period;
}

function emaAt(rows: Kline[], index: number, period: number) {
  if (index - period + 1 < 0) return null;
  const multiplier = 2 / (period + 1);
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  for (let cursor = period; cursor <= index; cursor += 1) {
    value = (rows[cursor].close - value) * multiplier + value;
  }
  return value;
}

function executionEntry(
  direction: ApprovedPropDirection,
  bidEntry: Kline,
  askEntry: Kline | undefined
) {
  return direction === "long" ? (askEntry?.open ?? bidEntry.open) : bidEntry.open;
}

function createFixedTargetSetup({
  config,
  direction,
  signal,
  bidEntry,
  askEntry,
  riskDistance,
  reason,
  exitAtTime,
}: {
  config: ApprovedPropStrategyConfig;
  direction: ApprovedPropDirection;
  signal: Kline;
  bidEntry: Kline;
  askEntry?: Kline;
  riskDistance: number;
  reason: string;
  exitAtTime?: number;
}): ApprovedPropSignalSetup {
  const entryPrice = executionEntry(direction, bidEntry, askEntry);
  return {
    direction,
    signalTime: signal.openTime,
    entryTime: bidEntry.openTime,
    entryPrice,
    stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
    takeProfit:
      direction === "long"
        ? entryPrice + riskDistance * config.rewardR
        : entryPrice - riskDistance * config.rewardR,
    riskDistance,
    exitAtTime,
    reason,
  };
}

function breakoutAt(
  config: Extract<ApprovedPropStrategyConfig, { kind: "htf_breakout" }>,
  bidRows: Kline[],
  askByTime: Map<number, Kline>,
  signalIndex: number
) {
  if (signalIndex - config.lookback < 0) return null;
  const signal = bidRows[signalIndex];
  const bidEntry = bidRows[signalIndex + 1];
  if (!bidEntry) return null;
  const channel = bidRows.slice(signalIndex - config.lookback, signalIndex);
  const channelHigh = Math.max(...channel.map((row) => row.high));
  const channelLow = Math.min(...channel.map((row) => row.low));
  const atr = atrAt(bidRows, signalIndex, config.atrPeriod);
  const ema = emaAt(bidRows, signalIndex, config.emaPeriod);
  if (atr == null || ema == null || !(atr > 0)) return null;
  const triggered =
    config.direction === "long"
      ? signal.close > channelHigh && signal.close > ema
      : signal.close < channelLow && signal.close < ema;
  if (!triggered) return null;
  return createFixedTargetSetup({
    config,
    direction: config.direction,
    signal,
    bidEntry,
    askEntry: askByTime.get(bidEntry.openTime),
    riskDistance: atr * config.stopAtr,
    reason:
      `${config.timeframeHours}H close ${signal.close} broke ` +
      `${config.lookback}-bar ${config.direction === "long" ? "high" : "low"} ` +
      `${config.direction === "long" ? channelHigh : channelLow} with EMA${config.emaPeriod} filter`,
  });
}

function openingRangeAt(
  config: Extract<ApprovedPropStrategyConfig, { kind: "opening_range_breakout" }>,
  bidRows: Kline[],
  askByTime: Map<number, Kline>,
  signalIndex: number
) {
  const signal = bidRows[signalIndex];
  const bidEntry = bidRows[signalIndex + 1];
  if (!bidEntry || dayStart(signal.openTime) !== dayStart(bidEntry.openTime)) return null;
  const day = dayStart(signal.openTime);
  const dayIndexes = bidRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => dayStart(row.openTime) === day);
  if (dayIndexes.length <= config.openingBars) return null;
  const opening = dayIndexes.slice(0, config.openingBars);
  if (signalIndex < opening[opening.length - 1].index + 1) return null;
  const firstIndex = opening[0].index;
  const first = opening[0].row;
  const atr = atrAt(bidRows, firstIndex, config.atrPeriod);
  const ema = emaAt(bidRows, firstIndex, config.emaPeriod);
  if (atr == null || ema == null || !(atr > 0)) return null;
  const rangeHigh = Math.max(...opening.map(({ row }) => row.high));
  const rangeLow = Math.min(...opening.map(({ row }) => row.low));
  const openingRange = rangeHigh - rangeLow;
  const rangeAtr = openingRange / atr;
  if (rangeAtr < config.minRangeAtr || rangeAtr > config.maxRangeAtr) return null;
  const triggered =
    config.direction === "long"
      ? signal.close > rangeHigh && first.close > ema
      : signal.close < rangeLow && first.close < ema;
  if (!triggered) return null;

  // Only the first valid breakout of the day is actionable.
  for (const candidate of dayIndexes) {
    if (candidate.index >= signalIndex || candidate.index < opening[opening.length - 1].index + 1) {
      continue;
    }
    const earlierTriggered =
      config.direction === "long"
        ? candidate.row.close > rangeHigh && first.close > ema
        : candidate.row.close < rangeLow && first.close < ema;
    if (earlierTriggered) return null;
  }

  const entryPrice = executionEntry(
    config.direction,
    bidEntry,
    askByTime.get(bidEntry.openTime)
  );
  const atrStop =
    config.direction === "long"
      ? entryPrice - atr * config.stopAtr
      : entryPrice + atr * config.stopAtr;
  const rangeStop = config.direction === "long" ? rangeLow : rangeHigh;
  const stopLoss =
    config.direction === "long" ? Math.max(atrStop, rangeStop) : Math.min(atrStop, rangeStop);
  const riskDistance = Math.abs(entryPrice - stopLoss);
  if (!(riskDistance > 0) || riskDistance / atr > config.maxRiskAtr) return null;
  const takeProfit =
    config.direction === "long"
      ? entryPrice + riskDistance * config.rewardR
      : entryPrice - riskDistance * config.rewardR;
  return {
    direction: config.direction,
    signalTime: signal.openTime,
    entryTime: bidEntry.openTime,
    entryPrice,
    stopLoss,
    takeProfit,
    riskDistance,
    exitAtTime: day + DAY_MS,
    reason:
      `UTC opening-range breakout (${config.openingBars}H); range ${rangeAtr.toFixed(2)} ATR, ` +
      `EMA${config.emaPeriod} filter passed`,
  } satisfies ApprovedPropSignalSetup;
}

export function detectLatestApprovedPropSignal(
  config: ApprovedPropStrategyConfig,
  bidRows: Kline[],
  askRows: Kline[] = bidRows,
  now = Date.now()
) {
  const intervalMs = config.timeframeHours * HOUR_MS;
  const askByTime = new Map(askRows.map((row) => [row.openTime, row]));
  let latest: ApprovedPropSignalSetup | null = null;
  for (let signalIndex = 1; signalIndex < bidRows.length - 1; signalIndex += 1) {
    const signal = bidRows[signalIndex];
    if (signal.openTime + intervalMs > now - 30_000) continue;
    const setup =
      config.kind === "htf_breakout"
        ? breakoutAt(config, bidRows, askByTime, signalIndex)
        : openingRangeAt(config, bidRows, askByTime, signalIndex);
    if (setup && (!latest || setup.signalTime > latest.signalTime)) latest = setup;
  }
  return latest;
}

export function detectApprovedPropPositionExit(
  position: ApprovedPropOpenPosition,
  bidRows: Kline[],
  askRows: Kline[] = bidRows
): ApprovedPropPositionExit | null {
  const rows = position.direction === "long" ? bidRows : askRows;
  const deadline =
    position.exitAtTime ??
    (position.maxHoldBars
      ? position.entryTime + position.maxHoldBars * position.timeframeHours * HOUR_MS
      : null);
  for (const row of rows) {
    if (row.openTime < position.entryTime) continue;
    if (deadline != null && row.openTime >= deadline) {
      return {
        exitTime: row.openTime,
        exitPrice: row.open,
        result: "strategy_exit",
      };
    }
    const hitStop =
      position.direction === "long"
        ? row.low <= position.stopLoss
        : row.high >= position.stopLoss;
    const hitTarget =
      position.direction === "long"
        ? row.high >= position.takeProfit
        : row.low <= position.takeProfit;
    // Intrabar ordering is unknown on hourly data, so stop wins ties.
    if (hitStop) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.stopLoss,
        result: "stop_loss",
      };
    }
    if (hitTarget) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.takeProfit,
        result: "take_profit",
      };
    }
  }
  return null;
}
