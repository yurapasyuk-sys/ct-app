import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { lookup } from "node:dns";

type Direction = "long" | "short";
type Timeframe = "15m" | "30m" | "1h";
type Family = "session_stretch_reversion" | "compression_release" | "opening_drive";

interface Bar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Profile {
  id: string;
  symbol: string;
  yahooSymbol: string;
  timeframe: Timeframe;
  family: Family;
  stopAtr: number;
  rewardR: number;
  maxHoldBars: number;
  dayOpenHour?: number;
  signalHour?: number;
  compressionLookback?: number;
  breakoutLookback?: number;
  efficiencyPeriod?: number;
  maxAtrRatio?: number;
  minBodyAtr?: number;
  minEfficiency?: number;
  sessionStart?: number;
  driveHours?: number;
  minDriveAtr?: number;
  minDirectionalShare?: number;
}

interface PaperPosition {
  key: string;
  profileId: string;
  symbol: string;
  direction: Direction;
  timeframe: Timeframe;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskPct: number;
  maxExitTime: number;
}

interface ClosedPaperTrade extends PaperPosition {
  exitTime: number;
  exitPrice: number;
  result: "take_profit" | "stop_loss" | "time_exit";
  rMultiple: number;
  profit: number;
}

interface ForwardState {
  version: 1;
  frozenAt: string;
  equity: number;
  sentKeys: string[];
  openPositions: PaperPosition[];
  closedTrades: ClosedPaperTrade[];
}

const INITIAL_EQUITY = 10_000;
const RISK_PCT = 1;
const MAX_CONCURRENT_RISK_PCT = 2;
const DAILY_STOP_PCT = -3;
const MINUTE = 60_000;
const DAY = 86_400_000;
const OUT_DIR = ".scratch/forward/strict-fixed-prop-system";
const STATE_PATH = `${OUT_DIR}/state.json`;
const JOURNAL_PATH = `${OUT_DIR}/journal.csv`;
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const COST_PIPS: Record<string, number> = {
  EURUSD: 1.2,
  GBPUSD: 1.6,
  USDJPY: 1.4,
  AUDUSD: 1.4,
};

const PROFILES: Profile[] = [
  {
    id: "strict_gbpusd_session_stretch_30m",
    symbol: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    timeframe: "30m",
    family: "session_stretch_reversion",
    dayOpenHour: 0,
    signalHour: 11,
    stopAtr: 0.75,
    rewardR: 2,
    maxHoldBars: 16,
  },
  {
    id: "strict_usdjpy_compression_release_1h",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "1h",
    family: "compression_release",
    compressionLookback: 40,
    breakoutLookback: 12,
    efficiencyPeriod: 10,
    maxAtrRatio: 0.65,
    minBodyAtr: 0.5,
    minEfficiency: 0.25,
    stopAtr: 0.75,
    rewardR: 2.5,
    maxHoldBars: 16,
  },
  {
    id: "strict_audusd_compression_release_15m",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "15m",
    family: "compression_release",
    compressionLookback: 40,
    breakoutLookback: 12,
    efficiencyPeriod: 10,
    maxAtrRatio: 0.65,
    minBodyAtr: 0.8,
    minEfficiency: 0.25,
    stopAtr: 1,
    rewardR: 2.5,
    maxHoldBars: 32,
  },
  {
    id: "strict_eurusd_session_stretch_1h",
    symbol: "EURUSD",
    yahooSymbol: "EURUSD=X",
    timeframe: "1h",
    family: "session_stretch_reversion",
    dayOpenHour: 0,
    signalHour: 13,
    stopAtr: 0.75,
    rewardR: 2,
    maxHoldBars: 10,
  },
  {
    id: "strict_gbpusd_ny_opening_drive_15m",
    symbol: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    timeframe: "15m",
    family: "opening_drive",
    sessionStart: 13,
    driveHours: 2,
    efficiencyPeriod: 8,
    minEfficiency: 0.5,
    minDriveAtr: 0.8,
    minDirectionalShare: 0.6,
    stopAtr: 1,
    rewardR: 2,
    maxHoldBars: 24,
  },
];

function timeframeMs(timeframe: Timeframe) {
  if (timeframe === "15m") return 15 * MINUTE;
  if (timeframe === "30m") return 30 * MINUTE;
  return 60 * MINUTE;
}

function yahooInterval(timeframe: Timeframe) {
  if (timeframe === "15m") return "15m";
  if (timeframe === "30m") return "30m";
  return "60m";
}

function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
}

function utcHour(timestamp: number) {
  const date = new Date(timestamp);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

function pipSize(symbol: string) {
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function trueRange(current: Bar, previous: Bar) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrSeries(rows: Bar[], period = 14) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index], rows[index - 1]);
    if (index > period) sum -= trueRange(rows[index - period], rows[index - period - 1]);
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function rollingMean(values: Array<number | null>, period: number) {
  const result: Array<number | null> = Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    if (window.some((value) => value == null)) continue;
    result[index] = window.reduce((sum, value) => sum + (value ?? 0), 0) / period;
  }
  return result;
}

function efficiencyRatio(rows: Bar[], period: number) {
  const result: Array<number | null> = Array(rows.length).fill(null);
  for (let index = period; index < rows.length; index += 1) {
    const direction = Math.abs(rows[index].close - rows[index - period].close);
    let movement = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      movement += Math.abs(rows[cursor].close - rows[cursor - 1].close);
    }
    result[index] = movement > 0 ? direction / movement : 0;
  }
  return result;
}

function signalKey(profile: Profile, direction: Direction, signalTime: number) {
  return `${profile.id}|${direction}|${signalTime}`;
}

function buildPosition(
  profile: Profile,
  direction: Direction,
  signalTime: number,
  entryBar: Bar,
  atrValue: number,
  equity: number
): PaperPosition {
  const riskDistance = atrValue * profile.stopAtr;
  const stopLoss = direction === "long" ? entryBar.open - riskDistance : entryBar.open + riskDistance;
  const takeProfit =
    direction === "long"
      ? entryBar.open + riskDistance * profile.rewardR
      : entryBar.open - riskDistance * profile.rewardR;
  return {
    key: signalKey(profile, direction, signalTime),
    profileId: profile.id,
    symbol: profile.symbol,
    direction,
    timeframe: profile.timeframe,
    entryTime: entryBar.openTime,
    entryPrice: entryBar.open,
    stopLoss,
    takeProfit,
    riskAmount: equity * (RISK_PCT / 100),
    riskPct: RISK_PCT,
    maxExitTime: entryBar.openTime + profile.maxHoldBars * timeframeMs(profile.timeframe),
  };
}

function detectCompressionSignals(profile: Profile, rows: Bar[], state: ForwardState) {
  const atr = atrSeries(rows);
  const slowAtr = rollingMean(atr, profile.compressionLookback ?? 40);
  const efficiency = efficiencyRatio(rows, profile.efficiencyPeriod ?? 10);
  const signals: PaperPosition[] = [];
  const lookback = profile.breakoutLookback ?? 12;
  for (let index = Math.max(60, lookback + 2); index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const entry = rows[index + 1];
    const atrValue = atr[index];
    const baseline = slowAtr[index];
    const er = efficiency[index];
    if (!atrValue || !baseline || er == null) continue;
    const hour = utcHour(signal.openTime);
    if (hour < 6 || hour >= 18) continue;
    const high = Math.max(...rows.slice(index - lookback, index).map((row) => row.high));
    const low = Math.min(...rows.slice(index - lookback, index).map((row) => row.low));
    const compressed = atrValue / baseline <= (profile.maxAtrRatio ?? 0.65);
    const impulsive =
      Math.abs(signal.close - signal.open) >= atrValue * (profile.minBodyAtr ?? 0.5) &&
      er >= (profile.minEfficiency ?? 0.25);
    if (!compressed || !impulsive) continue;
    const direction: Direction | null =
      signal.close > high ? "long" : signal.close < low ? "short" : null;
    if (!direction) continue;
    const key = signalKey(profile, direction, signal.openTime);
    if (state.sentKeys.includes(key)) continue;
    signals.push(buildPosition(profile, direction, signal.openTime, entry, atrValue, state.equity));
  }
  return signals;
}

function detectStretchSignals(profile: Profile, rows: Bar[], state: ForwardState) {
  const atr = atrSeries(rows);
  const signals: PaperPosition[] = [];
  const days = new Map<number, number[]>();
  rows.forEach((row, index) => {
    const day = dayStart(row.openTime);
    const indexes = days.get(day) ?? [];
    indexes.push(index);
    days.set(day, indexes);
  });
  for (const indexes of days.values()) {
    const openIndex = indexes.find((index) => utcHour(rows[index].openTime) >= (profile.dayOpenHour ?? 0));
    const signalIndex = indexes.find((index) => utcHour(rows[index].openTime) >= (profile.signalHour ?? 13));
    if (openIndex == null || signalIndex == null || signalIndex >= rows.length - 1) continue;
    const signal = rows[signalIndex];
    const entry = rows[signalIndex + 1];
    const atrValue = atr[signalIndex];
    if (!atrValue) continue;
    const stretch = (signal.close - rows[openIndex].open) / atrValue;
    const direction: Direction | null =
      stretch >= 2.5 && signal.close < signal.open
        ? "short"
        : stretch <= -2.5 && signal.close > signal.open
          ? "long"
          : null;
    if (!direction) continue;
    const key = signalKey(profile, direction, signal.openTime);
    if (state.sentKeys.includes(key)) continue;
    signals.push(buildPosition(profile, direction, signal.openTime, entry, atrValue, state.equity));
  }
  return signals;
}

function detectOpeningDriveSignals(profile: Profile, rows: Bar[], state: ForwardState) {
  const atr = atrSeries(rows);
  const efficiency = efficiencyRatio(rows, profile.efficiencyPeriod ?? 8);
  const signals: PaperPosition[] = [];
  const days = new Map<number, number[]>();
  rows.forEach((row, index) => {
    const day = dayStart(row.openTime);
    const indexes = days.get(day) ?? [];
    indexes.push(index);
    days.set(day, indexes);
  });
  for (const indexes of days.values()) {
    const drive = indexes.filter((index) => {
      const hour = utcHour(rows[index].openTime);
      const start = profile.sessionStart ?? 13;
      return hour >= start && hour < start + (profile.driveHours ?? 2);
    });
    if (drive.length < 2) continue;
    const first = rows[drive[0]];
    const signalIndex = drive[drive.length - 1];
    if (signalIndex >= rows.length - 1) continue;
    const signal = rows[signalIndex];
    const entry = rows[signalIndex + 1];
    const atrValue = atr[signalIndex];
    const er = efficiency[signalIndex];
    if (!atrValue || er == null || er < (profile.minEfficiency ?? 0.5)) continue;
    const driveRows = drive.map((index) => rows[index]);
    const driveRange =
      Math.max(...driveRows.map((row) => row.high)) - Math.min(...driveRows.map((row) => row.low));
    const netMove = signal.close - first.open;
    if (
      driveRange < atrValue * (profile.minDriveAtr ?? 0.8) ||
      Math.abs(netMove) / driveRange < (profile.minDirectionalShare ?? 0.6)
    ) {
      continue;
    }
    const direction: Direction = netMove > 0 ? "long" : "short";
    const key = signalKey(profile, direction, signal.openTime);
    if (state.sentKeys.includes(key)) continue;
    signals.push(buildPosition(profile, direction, signal.openTime, entry, atrValue, state.equity));
  }
  return signals;
}

function detectSignals(profile: Profile, rows: Bar[], state: ForwardState) {
  if (profile.family === "compression_release") return detectCompressionSignals(profile, rows, state);
  if (profile.family === "opening_drive") return detectOpeningDriveSignals(profile, rows, state);
  return detectStretchSignals(profile, rows, state);
}

function positionExit(position: PaperPosition, rows: Bar[]) {
  for (const row of rows) {
    if (row.openTime < position.entryTime) continue;
    const stopHit =
      position.direction === "long" ? row.low <= position.stopLoss : row.high >= position.stopLoss;
    const targetHit =
      position.direction === "long" ? row.high >= position.takeProfit : row.low <= position.takeProfit;
    if (stopHit) {
      return { exitTime: row.openTime, exitPrice: position.stopLoss, result: "stop_loss" as const };
    }
    if (targetHit) {
      return { exitTime: row.openTime, exitPrice: position.takeProfit, result: "take_profit" as const };
    }
    if (row.openTime >= position.maxExitTime) {
      return { exitTime: row.openTime, exitPrice: row.close, result: "time_exit" as const };
    }
  }
  return null;
}

function closeTrade(position: PaperPosition, exit: NonNullable<ReturnType<typeof positionExit>>) {
  const riskDistance = Math.abs(position.entryPrice - position.stopLoss);
  const grossR =
    position.direction === "long"
      ? (exit.exitPrice - position.entryPrice) / riskDistance
      : (position.entryPrice - exit.exitPrice) / riskDistance;
  const costR = ((COST_PIPS[position.symbol] ?? 1.5) * pipSize(position.symbol)) / riskDistance;
  const rMultiple = grossR - costR;
  return {
    ...position,
    ...exit,
    rMultiple,
    profit: position.riskAmount * rMultiple,
  } satisfies ClosedPaperTrade;
}

function loadState(): ForwardState {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(STATE_PATH)) {
    return {
      version: 1,
      frozenAt: new Date().toISOString(),
      equity: INITIAL_EQUITY,
      sentKeys: [],
      openPositions: [],
      closedTrades: [],
    };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as ForwardState;
}

function saveState(state: ForwardState) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function appendJournal(event: string, values: Array<string | number>) {
  if (!existsSync(JOURNAL_PATH)) {
    appendFileSync(
      JOURNAL_PATH,
      "event,time,profile_id,symbol,direction,entry,stop,target,exit,r_multiple,profit,equity\n",
      "utf8"
    );
  }
  appendFileSync(
    JOURNAL_PATH,
    [event, new Date().toISOString(), ...values]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",") + "\n",
    "utf8"
  );
}

function parseYahoo(payload: unknown) {
  const root = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null> }> };
      }>;
      error?: { description?: string };
    };
  };
  if (root.chart?.error) throw new Error(root.chart.error.description ?? "Yahoo chart error");
  const result = root.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) return [];
  return result.timestamp.flatMap((timestamp, index) => {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    return [open, high, low, close].every((value) => typeof value === "number")
      ? [{ openTime: timestamp * 1000, open: open!, high: high!, low: low!, close: close! }]
      : [];
  });
}

function getJson(url: URL) {
  return new Promise<unknown>((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        lookup: (hostname, options, callback) =>
          lookup(hostname, { ...(typeof options === "object" ? options : {}), family: 4 }, callback),
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Yahoo HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.setTimeout(20_000, () => request.destroy(new Error("Yahoo timeout")));
    request.on("error", reject);
  });
}

async function fetchRows(profile: Profile) {
  let lastError: unknown;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(profile.yahooSymbol)}`);
      url.searchParams.set("interval", yahooInterval(profile.timeframe));
      url.searchParams.set("range", profile.timeframe === "1h" ? "2y" : "60d");
      url.searchParams.set("includePrePost", "true");
      const rows = parseYahoo(await getJson(url));
      const closedBefore = Date.now() - 30_000;
      return rows.filter((row) => row.openTime + timeframeMs(profile.timeframe) <= closedBefore);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Unable to fetch ${profile.symbol}`);
}

function dayRealizedPct(state: ForwardState, timestamp: number) {
  const day = dayStart(timestamp);
  const profit = state.closedTrades
    .filter((trade) => dayStart(trade.exitTime) === day)
    .reduce((sum, trade) => sum + trade.profit, 0);
  const approximateDayOpenEquity = state.equity - profit;
  return approximateDayOpenEquity ? (profit / approximateDayOpenEquity) * 100 : 0;
}

async function runOnce() {
  const state = loadState();
  const frozenAt = Date.parse(state.frozenAt);
  const rowsByProfile = new Map<string, Bar[]>();

  for (const profile of PROFILES) {
    const rows = await fetchRows(profile);
    rowsByProfile.set(profile.id, rows);
    const positions = state.openPositions.filter((position) => position.profileId === profile.id);
    for (const position of positions) {
      const exit = positionExit(position, rows);
      if (!exit) continue;
      const trade = closeTrade(position, exit);
      state.equity += trade.profit;
      state.openPositions = state.openPositions.filter((item) => item.key !== position.key);
      state.closedTrades.push(trade);
      appendJournal("exit", [
        trade.profileId,
        trade.symbol,
        trade.direction,
        trade.entryPrice,
        trade.stopLoss,
        trade.takeProfit,
        trade.exitPrice,
        trade.rMultiple,
        trade.profit,
        state.equity,
      ]);
      console.log(`EXIT ${trade.profileId} ${trade.result} ${trade.rMultiple.toFixed(2)}R`);
    }
  }

  for (const profile of PROFILES) {
    const rows = rowsByProfile.get(profile.id) ?? [];
    const signals = detectSignals(profile, rows, state)
      .filter((signal) => signal.entryTime >= frozenAt)
      .sort((left, right) => left.entryTime - right.entryTime);
    for (const signal of signals) {
      if (state.sentKeys.includes(signal.key)) continue;
      const openRisk = state.openPositions.reduce((sum, position) => sum + position.riskPct, 0);
      if (openRisk + signal.riskPct > MAX_CONCURRENT_RISK_PCT) {
        state.sentKeys.push(signal.key);
        appendJournal("skip_concurrent_risk", [
          signal.profileId,
          signal.symbol,
          signal.direction,
          signal.entryPrice,
          signal.stopLoss,
          signal.takeProfit,
          "",
          "",
          "",
          state.equity,
        ]);
        continue;
      }
      if (dayRealizedPct(state, signal.entryTime) <= DAILY_STOP_PCT) {
        state.sentKeys.push(signal.key);
        appendJournal("skip_daily_stop", [
          signal.profileId,
          signal.symbol,
          signal.direction,
          signal.entryPrice,
          signal.stopLoss,
          signal.takeProfit,
          "",
          "",
          "",
          state.equity,
        ]);
        continue;
      }
      state.sentKeys.push(signal.key);
      state.openPositions.push(signal);
      appendJournal("entry", [
        signal.profileId,
        signal.symbol,
        signal.direction,
        signal.entryPrice,
        signal.stopLoss,
        signal.takeProfit,
        "",
        "",
        "",
        state.equity,
      ]);
      console.log(
        `ENTRY ${signal.profileId} ${signal.direction.toUpperCase()} ${signal.entryPrice} SL ${signal.stopLoss} TP ${signal.takeProfit}`
      );
    }
  }

  state.sentKeys = state.sentKeys.slice(-5_000);
  state.closedTrades = state.closedTrades.slice(-5_000);
  saveState(state);
  console.log(
    JSON.stringify(
      {
        frozenAt: state.frozenAt,
        equity: state.equity,
        openPositions: state.openPositions.length,
        closedTrades: state.closedTrades.length,
        journal: JOURNAL_PATH,
      },
      null,
      2
    )
  );
}

runOnce().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
