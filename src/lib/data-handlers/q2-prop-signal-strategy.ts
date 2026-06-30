import type { Kline } from "../binance";

export type Q2PropDirection = "long" | "short";
export type Q2PropStrategyKind =
  | "q2_opening_drive"
  | "q2_session_stretch"
  | "q2_compression_release";

export interface Q2PropStrategyConfig {
  kind: Q2PropStrategyKind;
  timeframeMinutes: 30 | 60;
  atrPeriod: number;
  stopAtr: number;
  rewardR: number;
  maxHoldBars: number;
  sessionStart?: number;
  driveHours?: number;
  efficiencyPeriod?: number;
  minEfficiency?: number;
  minDriveAtr?: number;
  minDirectionalShare?: number;
  dayOpenHour?: number;
  signalHour?: number;
  minStretchAtr?: number;
  compressionLookback?: number;
  breakoutLookback?: number;
  maxAtrRatio?: number;
  minBodyAtr?: number;
  session?: "active" | "all";
}

export interface Q2PropSignalSetup {
  direction: Q2PropDirection;
  signalTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  reason: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function utcHour(timestamp: number) {
  const date = new Date(timestamp);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
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

function meanAtrAt(rows: Kline[], index: number, atrPeriod: number, lookback: number) {
  if (index - lookback + 1 - atrPeriod < 0) return null;
  let sum = 0;
  for (let cursor = index - lookback + 1; cursor <= index; cursor += 1) {
    const value = atrAt(rows, cursor, atrPeriod);
    if (value == null) return null;
    sum += value;
  }
  return sum / lookback;
}

function efficiencyRatioAt(rows: Kline[], index: number, period: number) {
  if (index - period < 0) return null;
  const direction = Math.abs(rows[index].close - rows[index - period].close);
  let movement = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    movement += Math.abs(rows[cursor].close - rows[cursor - 1].close);
  }
  return movement > 0 ? direction / movement : 0;
}

function highestBefore(rows: Kline[], index: number, lookback: number) {
  if (index - lookback < 0) return null;
  let value = -Infinity;
  for (let cursor = index - lookback; cursor < index; cursor += 1) {
    value = Math.max(value, rows[cursor].high);
  }
  return value;
}

function lowestBefore(rows: Kline[], index: number, lookback: number) {
  if (index - lookback < 0) return null;
  let value = Infinity;
  for (let cursor = index - lookback; cursor < index; cursor += 1) {
    value = Math.min(value, rows[cursor].low);
  }
  return value;
}

function createSetup(
  config: Q2PropStrategyConfig,
  direction: Q2PropDirection,
  signal: Kline,
  entry: Kline,
  atr: number,
  reason: string
): Q2PropSignalSetup {
  const riskDistance = atr * config.stopAtr;
  return {
    direction,
    signalTime: signal.openTime,
    entryTime: entry.openTime,
    entryPrice: entry.open,
    stopLoss:
      direction === "long" ? entry.open - riskDistance : entry.open + riskDistance,
    takeProfit:
      direction === "long"
        ? entry.open + riskDistance * config.rewardR
        : entry.open - riskDistance * config.rewardR,
    riskDistance,
    reason,
  };
}

function openingDriveAt(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  signalIndex: number
) {
  const signal = rows[signalIndex];
  const entry = rows[signalIndex + 1];
  const sessionStart = config.sessionStart ?? 13;
  const driveHours = config.driveHours ?? 2;
  const expectedLastHour = sessionStart + driveHours - config.timeframeMinutes / 60;
  if (!entry || utcHour(signal.openTime) !== expectedLastHour) return null;

  const day = dayStart(signal.openTime);
  const drive = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const hour = utcHour(row.openTime);
      return (
        dayStart(row.openTime) === day &&
        hour >= sessionStart &&
        hour < sessionStart + driveHours
      );
    });
  if (drive.length < 2 || drive[drive.length - 1].index !== signalIndex) return null;

  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const efficiency = efficiencyRatioAt(
    rows,
    signalIndex,
    config.efficiencyPeriod ?? 8
  );
  if (atr == null || efficiency == null || efficiency < (config.minEfficiency ?? 0.3)) {
    return null;
  }

  const first = drive[0].row;
  const netMove = signal.close - first.open;
  const driveHigh = Math.max(...drive.map(({ row }) => row.high));
  const driveLow = Math.min(...drive.map(({ row }) => row.low));
  const driveRange = driveHigh - driveLow;
  if (
    driveRange < atr * (config.minDriveAtr ?? 0.8) ||
    !(driveRange > 0) ||
    Math.abs(netMove) / driveRange < (config.minDirectionalShare ?? 0.6)
  ) {
    return null;
  }

  const direction = netMove > 0 ? "long" : "short";
  return createSetup(
    config,
    direction,
    signal,
    entry,
    atr,
    `opening drive ${sessionStart}:00-${sessionStart + driveHours}:00 UTC; efficiency ${efficiency.toFixed(2)}, directional share ${(Math.abs(netMove) / driveRange).toFixed(2)}`
  );
}

function sessionStretchAt(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  signalIndex: number
) {
  const signal = rows[signalIndex];
  const entry = rows[signalIndex + 1];
  const signalHour = config.signalHour ?? 13;
  if (!entry || utcHour(signal.openTime) !== signalHour) return null;

  const day = dayStart(signal.openTime);
  const dayOpenHour = config.dayOpenHour ?? 0;
  const openBar = rows.find(
    (row) =>
      dayStart(row.openTime) === day && utcHour(row.openTime) >= dayOpenHour
  );
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  if (!openBar || atr == null || !(atr > 0)) return null;

  const stretch = (signal.close - openBar.open) / atr;
  const minStretch = config.minStretchAtr ?? 1.5;
  const bearishRejection = stretch >= minStretch && signal.close < signal.open;
  const bullishRejection = stretch <= -minStretch && signal.close > signal.open;
  if (!bearishRejection && !bullishRejection) return null;

  const direction = bearishRejection ? "short" : "long";
  return createSetup(
    config,
    direction,
    signal,
    entry,
    atr,
    `session stretch ${stretch.toFixed(2)} ATR from the ${dayOpenHour}:00 UTC day open with rejection candle`
  );
}

function compressionReleaseAt(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  signalIndex: number
) {
  const signal = rows[signalIndex];
  const entry = rows[signalIndex + 1];
  if (!entry) return null;
  const hour = utcHour(signal.openTime);
  if (config.session === "active" && (hour < 6 || hour >= 18)) return null;

  const compressionLookback = config.compressionLookback ?? 40;
  const breakoutLookback = config.breakoutLookback ?? 12;
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const baselineAtr = meanAtrAt(
    rows,
    signalIndex,
    config.atrPeriod,
    compressionLookback
  );
  const efficiency = efficiencyRatioAt(
    rows,
    signalIndex,
    config.efficiencyPeriod ?? 10
  );
  const priorHigh = highestBefore(rows, signalIndex, breakoutLookback);
  const priorLow = lowestBefore(rows, signalIndex, breakoutLookback);
  if (
    atr == null ||
    baselineAtr == null ||
    efficiency == null ||
    priorHigh == null ||
    priorLow == null
  ) {
    return null;
  }

  const atrRatio = atr / baselineAtr;
  const bodyAtr = Math.abs(signal.close - signal.open) / atr;
  if (
    atrRatio > (config.maxAtrRatio ?? 0.8) ||
    bodyAtr < (config.minBodyAtr ?? 0.8) ||
    efficiency < (config.minEfficiency ?? 0.25)
  ) {
    return null;
  }

  const direction =
    signal.close > priorHigh
      ? "long"
      : signal.close < priorLow
        ? "short"
        : null;
  if (!direction) return null;

  return createSetup(
    config,
    direction,
    signal,
    entry,
    atr,
    `compression release; ATR ratio ${atrRatio.toFixed(2)}, body ${bodyAtr.toFixed(2)} ATR, efficiency ${efficiency.toFixed(2)}`
  );
}

export function detectQ2PropSignalAt(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  signalIndex: number
) {
  if (config.kind === "q2_opening_drive") {
    return openingDriveAt(config, rows, signalIndex);
  }
  if (config.kind === "q2_session_stretch") {
    return sessionStretchAt(config, rows, signalIndex);
  }
  return compressionReleaseAt(config, rows, signalIndex);
}

export function detectAllQ2PropSignals(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  now = Number.POSITIVE_INFINITY
) {
  const barMs = config.timeframeMinutes * MINUTE_MS;
  const setups: Q2PropSignalSetup[] = [];
  for (let index = 0; index < rows.length - 1; index += 1) {
    if (rows[index].openTime + barMs > now - 30_000) continue;
    const setup = detectQ2PropSignalAt(config, rows, index);
    if (setup) setups.push(setup);
  }
  return setups;
}

export function detectLatestQ2PropSignal(
  config: Q2PropStrategyConfig,
  rows: Kline[],
  now = Date.now()
) {
  const barMs = config.timeframeMinutes * MINUTE_MS;
  for (let index = rows.length - 2; index >= 0; index -= 1) {
    const signal = rows[index];
    if (signal.openTime + barMs > now - 30_000) continue;
    const setup = detectQ2PropSignalAt(config, rows, index);
    if (setup) return setup;
  }
  return null;
}
