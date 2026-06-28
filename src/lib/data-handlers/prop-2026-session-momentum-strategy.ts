import type { Kline } from "../binance";
import {
  detectApprovedPropPositionExit,
  type ApprovedPropOpenPosition,
} from "./approved-prop-portfolio-strategy";

export type Prop2026SessionMomentumDirection = "long" | "short";

export interface Prop2026SessionMomentumConfig {
  signalHourUtc: number;
  momentumBars: number;
  atrPeriod: number;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  minMoveAtr: number;
  stopAtr: number;
  rewardR: number;
  maxHoldBars: number;
  maxGapAtr: number;
  maxSpreadR: number;
  fridayLastEntryHourUtc: number;
  fridayExitHourUtc: number;
}

export interface Prop2026SessionMomentumSetup {
  direction: Prop2026SessionMomentumDirection;
  signalTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  exitAtTime?: number;
  reason: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function buildAtr(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index], rows[index - 1]);
    if (index > period) {
      sum -= trueRange(rows[index - period], rows[index - period - 1]);
    }
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function buildEma(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length < period) return values;
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = value;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < rows.length; index += 1) {
    value = (rows[index].close - value) * multiplier + value;
    values[index] = value;
  }
  return values;
}

function fridayExit(entryTime: number, hourUtc: number) {
  const date = new Date(entryTime);
  if (date.getUTCDay() !== 5) return undefined;
  return Math.floor(entryTime / DAY_MS) * DAY_MS + hourUtc * HOUR_MS;
}

export function detectAllProp2026SessionMomentumSignals(
  config: Prop2026SessionMomentumConfig,
  bidRows: Kline[],
  askRows: Kline[] = bidRows,
  now = Number.POSITIVE_INFINITY
) {
  const askByTime = new Map(askRows.map((row) => [row.openTime, row]));
  const atr = buildAtr(bidRows, config.atrPeriod);
  const fast = buildEma(bidRows, config.fastEmaPeriod);
  const slow = buildEma(bidRows, config.slowEmaPeriod);
  const warmup = Math.max(
    config.momentumBars,
    config.atrPeriod,
    config.fastEmaPeriod,
    config.slowEmaPeriod
  );
  const setups: Prop2026SessionMomentumSetup[] = [];

  for (let signalIndex = warmup; signalIndex < bidRows.length - 1; signalIndex += 1) {
    const signal = bidRows[signalIndex];
    if (signal.openTime + HOUR_MS > now - 30_000) continue;
    if (new Date(signal.openTime).getUTCHours() !== config.signalHourUtc) continue;
    const bidEntry = bidRows[signalIndex + 1];
    const askEntry = askByTime.get(bidEntry.openTime);
    if (!askEntry) continue;
    const entryDate = new Date(bidEntry.openTime);
    const entryHour = entryDate.getUTCHours();
    if (entryHour >= 21) continue;
    if (entryDate.getUTCDay() === 5 && entryHour >= config.fridayLastEntryHourUtc) continue;

    const atrValue = atr[signalIndex];
    const fastValue = fast[signalIndex];
    const slowValue = slow[signalIndex];
    if (atrValue == null || fastValue == null || slowValue == null || !(atrValue > 0)) continue;
    if (Math.abs(bidEntry.open - signal.close) > atrValue * config.maxGapAtr) continue;

    const momentum = signal.close - bidRows[signalIndex - config.momentumBars].close;
    const direction: Prop2026SessionMomentumDirection | null =
      momentum >= atrValue * config.minMoveAtr && fastValue > slowValue
        ? "long"
        : momentum <= -atrValue * config.minMoveAtr && fastValue < slowValue
          ? "short"
          : null;
    if (!direction) continue;

    const entryPrice = direction === "long" ? askEntry.open : bidEntry.open;
    const riskDistance = atrValue * config.stopAtr;
    const spreadR = Math.max(0, askEntry.open - bidEntry.open) / riskDistance;
    if (spreadR > config.maxSpreadR) continue;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const takeProfit =
      direction === "long"
        ? entryPrice + riskDistance * config.rewardR
        : entryPrice - riskDistance * config.rewardR;
    const exitAtTime = fridayExit(bidEntry.openTime, config.fridayExitHourUtc);

    setups.push({
      direction,
      signalTime: signal.openTime,
      entryTime: bidEntry.openTime,
      entryPrice,
      stopLoss,
      takeProfit,
      riskDistance,
      exitAtTime,
      reason:
        `${config.momentumBars}H momentum ${(momentum / atrValue).toFixed(2)} ATR; ` +
        `EMA${config.fastEmaPeriod} ${fastValue.toFixed(6)} ${direction === "long" ? ">" : "<"} ` +
        `EMA${config.slowEmaPeriod} ${slowValue.toFixed(6)}; spread ${spreadR.toFixed(3)}R`,
    });
  }
  return setups;
}

export function detectLatestProp2026SessionMomentumSignal(
  config: Prop2026SessionMomentumConfig,
  bidRows: Kline[],
  askRows: Kline[] = bidRows,
  now = Date.now()
) {
  return detectAllProp2026SessionMomentumSignals(config, bidRows, askRows, now).at(-1) ?? null;
}

export function detectProp2026SessionMomentumExit(
  position: ApprovedPropOpenPosition,
  bidRows: Kline[],
  askRows: Kline[] = bidRows
) {
  return detectApprovedPropPositionExit(position, bidRows, askRows);
}
