import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

type Direction = "long" | "short";
type DirectionMode = "all" | "long_only" | "short_only";
type Timeframe = "5m" | "1h" | "4h";

interface Trade {
  symbol: string;
  strategy: string;
  variant: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  riskAmount: number;
  riskDistance: number;
  riskDistancePips: number;
  profit: number;
  rMultiple: number;
  exitReason: string;
}

interface Summary {
  symbol: string;
  strategy: string;
  variant: string;
  timeframe: Timeframe;
  trades: number;
  winRate: number;
  netProfit: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdown: number;
  finalEquity: number;
  cagrPercent: number;
  cost1NetProfit: number;
  cost1ProfitFactor: number;
  cost1ExpectancyR: number;
  cost1CagrPercent: number;
  top3ProfitPercent: number;
  score: number;
  tradesList: Trade[];
}

const DATA_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-16T00:00:00Z");
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function iso(time: number) {
  return new Date(time).toISOString();
}

function pipSize(symbol: string) {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40") return 1;
  return 0.0001;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

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
    const tr = trueRange(rows[index], rows[index - 1]);
    sum += tr;
    if (index > period) sum -= trueRange(rows[index - period], rows[index - period - 1]);
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function buildEma(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (period <= 0 || rows.length < period) return values;
  const multiplier = 2 / (period + 1);
  let ema = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = ema;
  for (let index = period; index < rows.length; index += 1) {
    ema = (rows[index].close - ema) * multiplier + ema;
    values[index] = ema;
  }
  return values;
}

function buildBands(rows: Kline[], period: number, deviation: number) {
  return rows.map((_, index) => {
    if (index - period + 1 < 0) return null;
    const window = rows.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, row) => sum + row.close, 0) / period;
    const variance = window.reduce((sum, row) => sum + (row.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { mean, upper: mean + deviation * sd, lower: mean - deviation * sd };
  });
}

function highest(rows: Kline[], start: number, end: number) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, rows[index].high);
  return value;
}

function lowest(rows: Kline[], start: number, end: number) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, rows[index].low);
  return value;
}

function directionAllowed(mode: DirectionMode, direction: Direction) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";
  return true;
}

function regimeAllowed(
  filter: "none" | "trend" | "counter",
  direction: Direction,
  close: number,
  ema: number | null
) {
  if (filter === "none") return true;
  if (ema == null) return false;
  if (filter === "trend") return direction === "long" ? close > ema : close < ema;
  return direction === "long" ? close < ema : close > ema;
}

function profit(direction: Direction, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function summarize(
  symbol: string,
  strategy: string,
  variant: string,
  timeframe: Timeframe,
  trades: Trade[],
  startTime: number,
  endTime: number,
  costPips = 1
): Summary {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let rSum = 0;
  let wins = 0;
  const costAdjustedProfits: number[] = [];
  const costAdjustedR: number[] = [];
  let costEquity = INITIAL_CAPITAL;
  let costPeak = INITIAL_CAPITAL;
  let costMaxDrawdown = 0;

  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (trade.profit > 0) {
      grossProfit += trade.profit;
      wins += 1;
    }
    if (trade.profit < 0) grossLoss += trade.profit;
    rSum += trade.rMultiple;

    const costR = trade.riskDistancePips > 0 ? costPips / trade.riskDistancePips : 0;
    const adjustedR = trade.rMultiple - costR;
    const adjustedProfit = adjustedR * trade.riskAmount;
    costAdjustedR.push(adjustedR);
    costAdjustedProfits.push(adjustedProfit);
    costEquity += adjustedProfit;
    costPeak = Math.max(costPeak, costEquity);
    costMaxDrawdown = Math.min(costMaxDrawdown, costEquity - costPeak);
  }

  const costGrossProfit = costAdjustedProfits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const costGrossLoss = costAdjustedProfits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  const netProfit = equity - INITIAL_CAPITAL;
  const days = Math.max(1, (endTime - startTime) / ONE_DAY);
  const cagrPercent = ((equity / INITIAL_CAPITAL) ** (365 / days) - 1) * 100;
  const cost1CagrPercent = ((costEquity / INITIAL_CAPITAL) ** (365 / days) - 1) * 100;
  const positiveProfits = [...trades.map((trade) => trade.profit).filter((value) => value > 0)].sort((a, b) => b - a);
  const top3 = positiveProfits.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const top3ProfitPercent = netProfit > 0 ? (top3 / netProfit) * 100 : 0;
  const cost1ProfitFactor =
    costGrossLoss < 0 ? costGrossProfit / Math.abs(costGrossLoss) : costGrossProfit > 0 ? Infinity : 0;
  const score =
    cost1CagrPercent +
    Math.max(0, cost1ProfitFactor - 1) * 25 +
    Math.min(0, costMaxDrawdown / 100) * 0.25 -
    Math.max(0, 25 - trades.length) * 2 -
    Math.max(0, top3ProfitPercent - 80) * 0.2;

  return {
    symbol,
    strategy,
    variant,
    timeframe,
    trades: trades.length,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    netProfit,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0,
    expectancyR: trades.length ? rSum / trades.length : 0,
    maxDrawdown,
    finalEquity: equity,
    cagrPercent,
    cost1NetProfit: costEquity - INITIAL_CAPITAL,
    cost1ProfitFactor,
    cost1ExpectancyR: costAdjustedR.length ? costAdjustedR.reduce((sum, value) => sum + value, 0) / costAdjustedR.length : 0,
    cost1CagrPercent,
    top3ProfitPercent,
    score,
    tradesList: trades,
  };
}

function runBbStrategy(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  testEndTime: number,
  params: {
    bb: number;
    dev: number;
    atr: number;
    stop: number;
    maxBars: number;
    mode: DirectionMode;
    ema: number;
    filter: "none" | "trend" | "counter";
    riskPercent: number;
    exit: "mean" | "opposite_band";
  }
) {
  const atr = buildAtr(rows, params.atr);
  const bands = buildBands(rows, params.bb, params.dev);
  const ema = buildEma(rows, params.ema);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: null | {
    direction: Direction;
    entryIndex: number;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskAmount: number;
    quantity: number;
    riskDistance: number;
  } = null;

  for (let index = Math.max(params.bb, params.atr, params.ema) + 1; index < rows.length; index += 1) {
    const current = rows[index];
    if (position) {
      const held = index - position.entryIndex;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.takeProfit : current.low <= position.takeProfit;
      if (hitStop || hitTarget || held >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.takeProfit : current.close;
        const p = profit(position.direction, position.entryPrice, exitPrice, position.quantity);
        const riskPips = position.riskDistance / pipSize(symbol);
        trades.push({
          symbol,
          strategy: "bb_atr",
          variant: "",
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          riskDistancePips: riskPips,
          profit: p,
          rMultiple: position.riskAmount > 0 ? p / position.riskAmount : 0,
          exitReason: hitStop ? "stop" : hitTarget ? "target" : "time",
        });
        equity += p;
        position = null;
      }
    }
    if (position || current.openTime < START || current.openTime >= testEndTime) continue;

    const signal = rows[index - 1];
    const band = bands[index - 1];
    const atrValue = atr[index - 1];
    if (!band || atrValue == null || atrValue <= 0) continue;
    const direction: Direction | null = signal.close < band.lower ? "long" : signal.close > band.upper ? "short" : null;
    if (!direction || !directionAllowed(params.mode, direction)) continue;
    if (!regimeAllowed(params.filter, direction, signal.close, ema[index - 1])) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const target = params.exit === "mean" ? band.mean : direction === "long" ? band.upper : band.lower;
    if ((direction === "long" && target <= entryPrice) || (direction === "short" && target >= entryPrice)) continue;
    const riskAmount = equity * (params.riskPercent / 100);
    position = {
      direction,
      entryIndex: index,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      takeProfit: target,
      riskAmount,
      quantity: riskAmount / riskDistance,
      riskDistance,
    };
  }

  const variant = [
    timeframe,
    `bb${params.bb}`,
    `dev${params.dev}`,
    `atr${params.atr}`,
    `stop${params.stop}`,
    `max${params.maxBars}`,
    params.mode,
    `ema${params.ema}`,
    params.filter,
    params.exit,
    `risk${params.riskPercent}`,
  ].join("_");
  trades.forEach((trade) => {
    trade.variant = variant;
  });
  return summarize(symbol, "bb_atr", variant, timeframe, trades, START, testEndTime);
}

function runDonchianStrategy(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  testEndTime: number,
  params: {
    entry: number;
    exit: number;
    atr: number;
    stop: number;
    mode: DirectionMode;
    riskPercent: number;
  }
) {
  const atr = buildAtr(rows, params.atr);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: null | {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    riskAmount: number;
    quantity: number;
    riskDistance: number;
  } = null;

  for (let index = Math.max(params.entry, params.exit, params.atr) + 1; index < rows.length; index += 1) {
    const current = rows[index];
    const signal = rows[index - 1];
    if (position) {
      const exitHigh = highest(rows, index - 1 - params.exit, index - 1);
      const exitLow = lowest(rows, index - 1 - params.exit, index - 1);
      const channelExit =
        position.direction === "long" ? signal.close < exitLow : signal.close > exitHigh;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      if (channelExit || hitStop) {
        const exitPrice = hitStop ? position.stopLoss : current.open;
        const p = profit(position.direction, position.entryPrice, exitPrice, position.quantity);
        trades.push({
          symbol,
          strategy: "donchian",
          variant: "",
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          riskDistancePips: position.riskDistance / pipSize(symbol),
          profit: p,
          rMultiple: position.riskAmount > 0 ? p / position.riskAmount : 0,
          exitReason: hitStop ? "stop" : "channel",
        });
        equity += p;
        position = null;
      }
    }
    if (position || current.openTime < START || current.openTime >= testEndTime) continue;

    const entryHigh = highest(rows, index - 1 - params.entry, index - 1);
    const entryLow = lowest(rows, index - 1 - params.entry, index - 1);
    const atrValue = atr[index - 1];
    if (atrValue == null || atrValue <= 0) continue;
    const direction: Direction | null = signal.close > entryHigh ? "long" : signal.close < entryLow ? "short" : null;
    if (!direction || !directionAllowed(params.mode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    const riskAmount = equity * (params.riskPercent / 100);
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      riskAmount,
      quantity: riskAmount / riskDistance,
      riskDistance,
    };
  }

  const variant = [
    timeframe,
    `entry${params.entry}`,
    `exit${params.exit}`,
    `atr${params.atr}`,
    `stop${params.stop}`,
    params.mode,
    `risk${params.riskPercent}`,
  ].join("_");
  trades.forEach((trade) => {
    trade.variant = variant;
  });
  return summarize(symbol, "donchian", variant, timeframe, trades, START, testEndTime);
}

function dayKey(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function hourUtc(time: number) {
  return new Date(time).getUTCHours() + new Date(time).getUTCMinutes() / 60;
}

function runSessionBreakStrategy(
  symbol: string,
  rows5m: Kline[],
  testEndTime: number,
  params: {
    session: "london" | "ny";
    rangeStart: number;
    rangeEnd: number;
    tradeStart: number;
    tradeEnd: number;
    mode: DirectionMode;
    stopMode: "range" | "atr";
    rr: number;
    atr: number;
    atrStop: number;
    riskPercent: number;
  }
) {
  const atr = buildAtr(rows5m, params.atr);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let cursor = 0;
  while (cursor < rows5m.length) {
    const key = dayKey(rows5m[cursor].openTime);
    const startCursor = cursor;
    while (cursor < rows5m.length && dayKey(rows5m[cursor].openTime) === key) cursor += 1;
    const dayRows = rows5m.slice(startCursor, cursor);
    const rangeRows = dayRows.filter((row) => {
      const hour = hourUtc(row.openTime);
      return hour >= params.rangeStart && hour < params.rangeEnd;
    });
    if (rangeRows.length < 6) continue;
    const rangeHigh = Math.max(...rangeRows.map((row) => row.high));
    const rangeLow = Math.min(...rangeRows.map((row) => row.low));
    let traded = false;
    for (let local = 1; local < dayRows.length - 1; local += 1) {
      const signal = dayRows[local];
      const current = dayRows[local + 1];
      const globalIndex = startCursor + local + 1;
      const hour = hourUtc(current.openTime);
      if (traded || current.openTime < START || current.openTime >= testEndTime) continue;
      if (hour < params.tradeStart || hour >= params.tradeEnd) continue;
      const direction: Direction | null = signal.close > rangeHigh ? "long" : signal.close < rangeLow ? "short" : null;
      if (!direction || !directionAllowed(params.mode, direction)) continue;
      const atrValue = atr[globalIndex - 1];
      if (atrValue == null || atrValue <= 0) continue;
      const entryPrice = current.open;
      const riskDistance =
        params.stopMode === "range"
          ? direction === "long"
            ? entryPrice - rangeLow
            : rangeHigh - entryPrice
          : atrValue * params.atrStop;
      if (riskDistance <= 0) continue;
      const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
      const target = direction === "long" ? entryPrice + riskDistance * params.rr : entryPrice - riskDistance * params.rr;
      const riskAmount = equity * (params.riskPercent / 100);
      const quantity = riskAmount / riskDistance;

      for (let exitIndex = local + 1; exitIndex < dayRows.length; exitIndex += 1) {
        const bar = dayRows[exitIndex];
        const exitHour = hourUtc(bar.openTime);
        const hitStop = direction === "long" ? bar.low <= stopLoss : bar.high >= stopLoss;
        const hitTarget = direction === "long" ? bar.high >= target : bar.low <= target;
        if (hitStop || hitTarget || exitHour >= params.tradeEnd) {
          const exitPrice = hitStop ? stopLoss : hitTarget ? target : bar.close;
          const p = profit(direction, entryPrice, exitPrice, quantity);
          trades.push({
            symbol,
            strategy: "session_break",
            variant: "",
            direction,
            entryTime: current.openTime,
            exitTime: bar.openTime,
            entryPrice,
            exitPrice,
            stopLoss,
            riskAmount,
            riskDistance,
            riskDistancePips: riskDistance / pipSize(symbol),
            profit: p,
            rMultiple: riskAmount > 0 ? p / riskAmount : 0,
            exitReason: hitStop ? "stop" : hitTarget ? "target" : "session_close",
          });
          equity += p;
          traded = true;
          break;
        }
      }
    }
  }

  const variant = [
    params.session,
    `range${params.rangeStart}-${params.rangeEnd}`,
    `trade${params.tradeStart}-${params.tradeEnd}`,
    params.mode,
    params.stopMode,
    `rr${params.rr}`,
    `atr${params.atr}`,
    `atrStop${params.atrStop}`,
    `risk${params.riskPercent}`,
  ].join("_");
  trades.forEach((trade) => {
    trade.variant = variant;
  });
  return summarize(symbol, "session_break", variant, "5m", trades, START, testEndTime);
}

function discoverFiles() {
  return readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".csv"))
    .map((file) => ({
      file,
      symbol: file.split("_")[0].toUpperCase(),
      path: `${DATA_DIR}/${file}`,
    }))
    .filter((item) => ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY", "GER40"].includes(item.symbol));
}

function compactSummary(summary: Summary) {
  const { tradesList: _tradesList, ...rest } = summary;
  return rest;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(DATA_DIR)) throw new Error(`Missing ${DATA_DIR}`);

  const all: Summary[] = [];
  const bestTrades: Record<string, Trade[]> = {};
  const dataInfo: unknown[] = [];

  for (const item of discoverFiles()) {
    const oneMinute = parseLocalCsvKlines(readFileSync(item.path, "utf8"));
    const lastTime = oneMinute[oneMinute.length - 1]?.openTime ?? START;
    const endTime = Math.min(END, lastTime + 60_000);
    const warmupStart = START - 180 * ONE_DAY;
    const warmRows = oneMinute.filter((row) => row.openTime >= warmupStart && row.openTime < endTime);
    const fiveMinute = aggregateKlines(warmRows, "5m");
    const oneHourRows = aggregateKlines(warmRows, "1h");
    const fourHourRows = aggregateKlines(warmRows, "4h");
    dataInfo.push({
      symbol: item.symbol,
      file: item.file,
      first: iso(oneMinute[0].openTime),
      last: iso(lastTime),
      test_start: iso(START),
      test_end: iso(endTime),
    });
    console.log(`${item.symbol}: testing ${iso(START)} -> ${iso(endTime)}`);

    const timeframeRows: Array<[Timeframe, Kline[]]> = [
      ["1h", oneHourRows],
      ["4h", fourHourRows],
    ];
    for (const [timeframe, rows] of timeframeRows) {
      for (const bb of [20, 40, 80]) {
        for (const dev of [1.5, 2, 2.5]) {
          for (const stop of [1, 1.5, 2, 3]) {
            for (const maxBars of timeframe === "1h" ? [12, 24, 48, 96] : [6, 12, 24, 48]) {
              for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                for (const filter of ["none", "trend", "counter"] as const) {
                  for (const exit of ["mean", "opposite_band"] as const) {
                    all.push(
                      runBbStrategy(item.symbol, rows, timeframe, endTime, {
                        bb,
                        dev,
                        atr: 14,
                        stop,
                        maxBars,
                        mode,
                        ema: 200,
                        filter,
                        exit,
                        riskPercent: 1,
                      })
                    );
                  }
                }
              }
            }
          }
        }
      }

      for (const entry of [20, 40, 55, 80]) {
        for (const exit of [10, 20, 40]) {
          if (exit >= entry) continue;
          for (const stop of [1, 1.5, 2, 3]) {
            for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
              all.push(
                runDonchianStrategy(item.symbol, rows, timeframe, endTime, {
                  entry,
                  exit,
                  atr: 14,
                  stop,
                  mode,
                  riskPercent: 1,
                })
              );
            }
          }
        }
      }
    }

    for (const session of [
      { session: "london" as const, rangeStart: 0, rangeEnd: 7, tradeStart: 7, tradeEnd: 11 },
      { session: "ny" as const, rangeStart: 7, rangeEnd: 13, tradeStart: 13, tradeEnd: 17 },
    ]) {
      for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
        for (const stopMode of ["range", "atr"] as const) {
          for (const rr of [1, 1.5, 2, 3]) {
            for (const atrStop of [0.5, 1, 1.5]) {
              all.push(
                runSessionBreakStrategy(item.symbol, fiveMinute, endTime, {
                  ...session,
                  mode,
                  stopMode,
                  rr,
                  atr: 14,
                  atrStop,
                  riskPercent: 1,
                })
              );
            }
          }
        }
      }
    }
  }

  const candidates = all
    .filter((summary) => summary.trades >= 10)
    .sort((a, b) => b.score - a.score);
  const byAsset = ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY", "GER40"].map((symbol) => {
    const rows = candidates.filter((summary) => summary.symbol === symbol);
    const best = rows[0];
    if (best) bestTrades[symbol] = best.tradesList;
    return { symbol, top: rows.slice(0, 20).map(compactSummary) };
  });
  const universalNames = new Map<string, Summary[]>();
  for (const summary of all) {
    const key = `${summary.strategy}|${summary.variant}`;
    const rows = universalNames.get(key) ?? [];
    rows.push(summary);
    universalNames.set(key, rows);
  }
  const universal = [...universalNames.entries()]
    .map(([key, rows]) => {
      const [strategy, variant] = key.split("|");
      const validRows = rows.filter((row) => row.trades >= 10);
      const passAssets = validRows.filter((row) => row.cost1CagrPercent >= 15 && row.cost1ProfitFactor > 1).length;
      const minCagr = validRows.length ? Math.min(...validRows.map((row) => row.cost1CagrPercent)) : -Infinity;
      const avgCagr = validRows.length
        ? validRows.reduce((sum, row) => sum + row.cost1CagrPercent, 0) / validRows.length
        : -Infinity;
      const avgPf = validRows.length
        ? validRows.reduce((sum, row) => sum + row.cost1ProfitFactor, 0) / validRows.length
        : 0;
      return {
        strategy,
        variant,
        assets: validRows.length,
        passAssets,
        minCagr,
        avgCagr,
        avgPf,
        rows: validRows.map(compactSummary),
        score: passAssets * 100 + minCagr + avgCagr + Math.max(0, avgPf - 1) * 20,
      };
    })
    .filter((row) => row.assets >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const output = {
    generated_at: iso(Date.now()),
    period: { start: iso(START), requested_end: iso(END) },
    initial_capital: INITIAL_CAPITAL,
    cost_model: "1 pip for FX, 1 point for GER40 subtracted from each trade in R units",
    data: dataInfo,
    top_by_asset: byAsset,
    top_universal_variants: universal,
    top_overall: candidates.slice(0, 100).map(compactSummary),
  };

  writeFileSync(`${OUT_DIR}/strategy_search_2026_ytd.json`, JSON.stringify(output, null, 2), "utf8");
  writeCsv(`${OUT_DIR}/strategy_search_2026_ytd_top_by_asset.csv`, [
    [
      "symbol",
      "rank",
      "strategy",
      "variant",
      "timeframe",
      "trades",
      "win_rate",
      "net_profit",
      "profit_factor",
      "expectancy_r",
      "max_drawdown",
      "cagr_percent",
      "cost1_net_profit",
      "cost1_profit_factor",
      "cost1_expectancy_r",
      "cost1_cagr_percent",
      "top3_profit_percent",
      "score",
    ],
    ...byAsset.flatMap((asset) =>
      asset.top.map((row, index) => [
        asset.symbol,
        index + 1,
        row.strategy,
        row.variant,
        row.timeframe,
        row.trades,
        row.winRate,
        row.netProfit,
        row.profitFactor,
        row.expectancyR,
        row.maxDrawdown,
        row.cagrPercent,
        row.cost1NetProfit,
        row.cost1ProfitFactor,
        row.cost1ExpectancyR,
        row.cost1CagrPercent,
        row.top3ProfitPercent,
        row.score,
      ])
    ),
  ]);
  writeCsv(`${OUT_DIR}/strategy_search_2026_ytd_universal.csv`, [
    ["rank", "strategy", "variant", "assets", "pass_assets", "min_cost1_cagr", "avg_cost1_cagr", "avg_cost1_pf", "score"],
    ...universal.map((row, index) => [
      index + 1,
      row.strategy,
      row.variant,
      row.assets,
      row.passAssets,
      row.minCagr,
      row.avgCagr,
      row.avgPf,
      row.score,
    ]),
  ]);

  for (const [symbol, trades] of Object.entries(bestTrades)) {
    writeCsv(`${OUT_DIR}/strategy_search_2026_ytd_${symbol}_best_trades.csv`, [
      [
        "symbol",
        "strategy",
        "variant",
        "direction",
        "entry_time",
        "exit_time",
        "entry_price",
        "exit_price",
        "stop_loss",
        "risk_distance_pips",
        "profit",
        "r_multiple",
        "exit_reason",
      ],
      ...trades.map((trade) => [
        trade.symbol,
        trade.strategy,
        trade.variant,
        trade.direction,
        iso(trade.entryTime),
        iso(trade.exitTime),
        trade.entryPrice,
        trade.exitPrice,
        trade.stopLoss,
        trade.riskDistancePips,
        trade.profit,
        trade.rMultiple,
        trade.exitReason,
      ]),
    ]);
  }

  console.log(
    JSON.stringify(
      {
        tested_variants: all.length,
        kept_candidates: candidates.length,
        files: [
          resolve(`${OUT_DIR}/strategy_search_2026_ytd.json`),
          resolve(`${OUT_DIR}/strategy_search_2026_ytd_top_by_asset.csv`),
          resolve(`${OUT_DIR}/strategy_search_2026_ytd_universal.csv`),
        ],
        top_by_asset: byAsset.map((asset) => ({
          symbol: asset.symbol,
          best: asset.top[0]
            ? {
                strategy: asset.top[0].strategy,
                variant: asset.top[0].variant,
                trades: asset.top[0].trades,
                cost1_cagr: asset.top[0].cost1CagrPercent,
                cost1_pf: asset.top[0].cost1ProfitFactor,
                cost1_net: asset.top[0].cost1NetProfit,
                max_drawdown: asset.top[0].maxDrawdown,
              }
            : null,
        })),
        universal_top: universal.slice(0, 5).map((row) => ({
          strategy: row.strategy,
          variant: row.variant,
          assets: row.assets,
          pass_assets: row.passAssets,
          min_cost1_cagr: row.minCagr,
          avg_cost1_cagr: row.avgCagr,
          avg_cost1_pf: row.avgPf,
        })),
      },
      null,
      2
    )
  );
}

main();
