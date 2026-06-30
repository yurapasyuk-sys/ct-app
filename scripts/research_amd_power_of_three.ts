import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import {
  aggregateKlines,
  parseLocalCsvKlines,
} from "../src/lib/data-handlers/local-csv-market-data";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const INITIAL_CAPITAL = 10_000;
const RISK_PERCENT = 1;
const OUTPUT_DIR = "public/exports";

const FILES: Record<string, string> = {
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "public/data/forex/AUDUSD_1m_2023-06-15_2026-06-15.csv",
};

type Direction = "long" | "short";
type Confirmation = "rejection" | "mss3" | "fvg_retest";
type TargetMode = "opposite_range" | "2r" | "3r";

interface Config {
  accumulationEndHour: 6 | 7;
  manipulationStartHour: 6 | 7;
  manipulationEndHour: 10 | 11;
  confirmation: Confirmation;
  targetMode: TargetMode;
  minSweepAtr: 0 | 0.05 | 0.1;
  rangeFilter: "none" | "atr_1_4";
  entryCutoffHour: 12 | 14;
}

interface DayContext {
  key: string;
  start: number;
  fiveMinute: Kline[];
  oneMinuteStartIndex: number;
  oneMinuteEndIndex: number;
}

interface Candidate {
  direction: Direction;
  setupTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  asianHigh: number;
  asianLow: number;
  sweepPrice: number;
  confirmation: Confirmation;
}

interface Trade extends Candidate {
  symbol: string;
  exitTime: number;
  exitPrice: number;
  result: "TP" | "SL" | "TIME";
  profit: number;
  r: number;
}

interface Result {
  symbol: string;
  period: "train_2025" | "test_2026" | "history_pre2025";
  config: Config;
  metrics: ReturnType<typeof metrics>;
  trades: Trade[];
}

function pipSize(symbol: string) {
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function utcHour(timestamp: number) {
  return new Date(timestamp).getUTCHours();
}

function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrSeries(rows: Kline[], period = 14) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index], rows[index - 1]);
    if (index > period) sum -= trueRange(rows[index - period], rows[index - period - 1]);
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function lowerBound(rows: Kline[], timestamp: number) {
  let left = 0;
  let right = rows.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (rows[middle].openTime < timestamp) left = middle + 1;
    else right = middle;
  }
  return left;
}

function highest(rows: Kline[]) {
  return Math.max(...rows.map((row) => row.high));
}

function lowest(rows: Kline[]) {
  return Math.min(...rows.map((row) => row.low));
}

function classicFvg(
  candle1: Kline,
  candle3: Kline,
  direction: Direction
): { low: number; high: number } | null {
  if (direction === "long" && candle1.high < candle3.low) {
    return { low: candle1.high, high: candle3.low };
  }
  if (direction === "short" && candle1.low > candle3.high) {
    return { low: candle3.high, high: candle1.low };
  }
  return null;
}

function overlaps(row: Kline, low: number, high: number) {
  return row.low <= high && row.high >= low;
}

function previousThreeBreak(rows: Kline[], index: number, direction: Direction) {
  if (index < 3) return false;
  const previous = rows.slice(index - 3, index);
  return direction === "long"
    ? rows[index].close > highest(previous)
    : rows[index].close < lowest(previous);
}

function buildDays(oneMinute: Kline[]) {
  const fiveMinute = aggregateKlines(oneMinute, "5m");
  const grouped = new Map<number, Kline[]>();
  for (const row of fiveMinute) {
    const start = dayStart(row.openTime);
    grouped.set(start, [...(grouped.get(start) ?? []), row]);
  }
  return [...grouped.entries()].map(([start, rows]) => ({
    key: new Date(start).toISOString().slice(0, 10),
    start,
    fiveMinute: rows,
    oneMinuteStartIndex: lowerBound(oneMinute, start),
    oneMinuteEndIndex: lowerBound(oneMinute, start + DAY),
  })) satisfies DayContext[];
}

function h1AtrAt(
  oneHour: Kline[],
  oneHourAtr: Array<number | null>,
  timestamp: number
) {
  const index = lowerBound(oneHour, timestamp) - 1;
  return index >= 0 ? oneHourAtr[index] : null;
}

function findCandidate(
  day: DayContext,
  config: Config,
  oneHour: Kline[],
  oneHourAtr: Array<number | null>,
  symbol: string
): Candidate | null {
  const accumulation = day.fiveMinute.filter(
    (row) => utcHour(row.openTime) >= 0 && utcHour(row.openTime) < config.accumulationEndHour
  );
  if (accumulation.length < config.accumulationEndHour * 8) return null;
  const asianHigh = highest(accumulation);
  const asianLow = lowest(accumulation);
  const atr1h = h1AtrAt(oneHour, oneHourAtr, day.start + config.manipulationStartHour * HOUR);
  if (atr1h == null || atr1h <= 0) return null;
  const asianRange = asianHigh - asianLow;
  if (config.rangeFilter === "atr_1_4" && (asianRange < atr1h || asianRange > 4 * atr1h)) {
    return null;
  }

  const manipulation = day.fiveMinute.filter(
    (row) =>
      utcHour(row.openTime) >= config.manipulationStartHour &&
      utcHour(row.openTime) < config.manipulationEndHour
  );
  let sweepIndex = -1;
  let direction: Direction | null = null;
  let sweepPrice = Number.NaN;
  for (const row of manipulation) {
    const index = day.fiveMinute.indexOf(row);
    const shortDepth = row.high - asianHigh;
    const longDepth = asianLow - row.low;
    const sweptHigh =
      shortDepth >= config.minSweepAtr * atr1h &&
      row.high > asianHigh &&
      row.close < asianHigh;
    const sweptLow =
      longDepth >= config.minSweepAtr * atr1h &&
      row.low < asianLow &&
      row.close > asianLow;
    if (sweptHigh && sweptLow) continue;
    if (sweptHigh) {
      sweepIndex = index;
      direction = "short";
      sweepPrice = row.high;
      break;
    }
    if (sweptLow) {
      sweepIndex = index;
      direction = "long";
      sweepPrice = row.low;
      break;
    }
  }
  if (sweepIndex < 0 || !direction) return null;

  const entryCutoff = day.start + config.entryCutoffHour * HOUR;
  let signalIndex = sweepIndex;
  let stopExtreme = direction === "long" ? day.fiveMinute[sweepIndex].low : day.fiveMinute[sweepIndex].high;

  if (config.confirmation === "mss3") {
    signalIndex = -1;
    for (let index = sweepIndex + 1; index < day.fiveMinute.length; index += 1) {
      const row = day.fiveMinute[index];
      if (row.closeTime >= entryCutoff) break;
      stopExtreme =
        direction === "long" ? Math.min(stopExtreme, row.low) : Math.max(stopExtreme, row.high);
      if (previousThreeBreak(day.fiveMinute, index, direction)) {
        signalIndex = index;
        break;
      }
    }
  }

  if (config.confirmation === "fvg_retest") {
    signalIndex = -1;
    let fvg: { low: number; high: number; formedIndex: number } | null = null;
    for (let index = sweepIndex + 2; index < day.fiveMinute.length; index += 1) {
      const row = day.fiveMinute[index];
      if (row.closeTime >= entryCutoff) break;
      stopExtreme =
        direction === "long" ? Math.min(stopExtreme, row.low) : Math.max(stopExtreme, row.high);
      if (!fvg) {
        const zone = classicFvg(day.fiveMinute[index - 2], row, direction);
        if (zone) fvg = { ...zone, formedIndex: index };
        continue;
      }
      if (index > fvg.formedIndex && overlaps(row, fvg.low, fvg.high)) {
        signalIndex = index;
        break;
      }
    }
  }

  if (signalIndex < 0 || signalIndex + 1 >= day.fiveMinute.length) return null;
  const entryRow = day.fiveMinute[signalIndex + 1];
  if (entryRow.openTime >= entryCutoff) return null;
  const entryPrice = entryRow.open;
  const buffer = 0.05 * atr1h;
  const stopLoss =
    direction === "long" ? stopExtreme - buffer : stopExtreme + buffer;
  const riskDistance = Math.abs(entryPrice - stopLoss);
  if (riskDistance <= 0 || riskDistance / pipSize(symbol) < 5) return null;
  const oppositeTarget = direction === "long" ? asianHigh : asianLow;
  const rrTarget =
    direction === "long"
      ? entryPrice + Number(config.targetMode[0]) * riskDistance
      : entryPrice - Number(config.targetMode[0]) * riskDistance;
  const takeProfit =
    config.targetMode === "opposite_range" ? oppositeTarget : rrTarget;
  if (direction === "long" ? takeProfit <= entryPrice : takeProfit >= entryPrice) return null;
  if (Math.abs(takeProfit - entryPrice) / riskDistance < 1) return null;

  return {
    direction,
    setupTime: day.fiveMinute[signalIndex].openTime,
    entryTime: entryRow.openTime,
    entryPrice,
    stopLoss,
    takeProfit,
    asianHigh,
    asianLow,
    sweepPrice,
    confirmation: config.confirmation,
  };
}

function resolveTrade(
  symbol: string,
  candidate: Candidate,
  day: DayContext,
  oneMinute: Kline[],
  equity: number
) {
  const riskAmount = equity * (RISK_PERCENT / 100);
  const riskDistance = Math.abs(candidate.entryPrice - candidate.stopLoss);
  const quantity = riskAmount / riskDistance;
  const startIndex = lowerBound(oneMinute, candidate.entryTime);
  const endTime = day.start + 20 * HOUR;
  const endIndex = Math.min(day.oneMinuteEndIndex, lowerBound(oneMinute, endTime));
  for (let index = startIndex; index < endIndex; index += 1) {
    const row = oneMinute[index];
    const hitStop =
      candidate.direction === "long"
        ? row.low <= candidate.stopLoss
        : row.high >= candidate.stopLoss;
    const hitTarget =
      candidate.direction === "long"
        ? row.high >= candidate.takeProfit
        : row.low <= candidate.takeProfit;
    if (!hitStop && !hitTarget) continue;
    const exitPrice = hitStop ? candidate.stopLoss : candidate.takeProfit;
    const profit =
      candidate.direction === "long"
        ? (exitPrice - candidate.entryPrice) * quantity
        : (candidate.entryPrice - exitPrice) * quantity;
    return {
      ...candidate,
      symbol,
      exitTime: row.openTime,
      exitPrice,
      result: hitStop ? "SL" : "TP",
      profit,
      r: profit / riskAmount,
    } satisfies Trade;
  }
  const last = oneMinute[Math.max(startIndex, endIndex - 1)];
  const profit =
    candidate.direction === "long"
      ? (last.close - candidate.entryPrice) * quantity
      : (candidate.entryPrice - last.close) * quantity;
  return {
    ...candidate,
    symbol,
    exitTime: last.openTime,
    exitPrice: last.close,
    result: "TIME",
    profit,
    r: profit / riskAmount,
  } satisfies Trade;
}

function runPeriod(
  symbol: string,
  oneMinute: Kline[],
  days: DayContext[],
  oneHour: Kline[],
  oneHourAtr: Array<number | null>,
  config: Config,
  start: number,
  end: number
) {
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  for (const day of days) {
    if (day.start < start || day.start >= end) continue;
    const candidate = findCandidate(day, config, oneHour, oneHourAtr, symbol);
    if (!candidate) continue;
    const trade = resolveTrade(symbol, candidate, day, oneMinute, equity);
    trades.push(trade);
    equity += trade.profit;
  }
  return trades;
}

function metrics(trades: Trade[]) {
  let equity = INITIAL_CAPITAL;
  let peak = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (trade.profit > 0) {
      winners += 1;
      grossProfit += trade.profit;
      lossStreak = 0;
    } else if (trade.profit < 0) {
      grossLoss += Math.abs(trade.profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }
  return {
    trades: trades.length,
    winners,
    losers: trades.filter((trade) => trade.profit < 0).length,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    netProfit: equity - INITIAL_CAPITAL,
    returnPct: (equity / INITIAL_CAPITAL - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.r, 0) / trades.length : 0,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / INITIAL_CAPITAL) * 100,
    maxLossStreak,
    finalEquity: equity,
  };
}

function metricsFromR(trades: Trade[], executionCostPips = 0) {
  let equity = INITIAL_CAPITAL;
  let peak = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let totalR = 0;
  for (const trade of trades) {
    const riskPips =
      Math.abs(trade.entryPrice - trade.stopLoss) / pipSize(trade.symbol);
    const adjustedR =
      trade.r - (riskPips > 0 ? executionCostPips / riskPips : 0);
    const profit = equity * (RISK_PERCENT / 100) * adjustedR;
    totalR += adjustedR;
    equity += profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (profit > 0) {
      winners += 1;
      grossProfit += profit;
      lossStreak = 0;
    } else if (profit < 0) {
      grossLoss += Math.abs(profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }
  return {
    trades: trades.length,
    winners,
    losers: trades.filter((trade) => {
      const riskPips =
        Math.abs(trade.entryPrice - trade.stopLoss) / pipSize(trade.symbol);
      return trade.r - (riskPips > 0 ? executionCostPips / riskPips : 0) < 0;
    }).length,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    netProfit: equity - INITIAL_CAPITAL,
    returnPct: (equity / INITIAL_CAPITAL - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length ? totalR / trades.length : 0,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / INITIAL_CAPITAL) * 100,
    maxLossStreak,
    finalEquity: equity,
  };
}

const configs: Config[] = [];
for (const accumulationEndHour of [6, 7] as const) {
  for (const manipulationStartHour of [6, 7] as const) {
    if (manipulationStartHour < accumulationEndHour) continue;
    for (const manipulationEndHour of [10, 11] as const) {
      for (const confirmation of ["rejection", "mss3", "fvg_retest"] as const) {
        for (const targetMode of ["opposite_range", "2r", "3r"] as const) {
          for (const minSweepAtr of [0, 0.05, 0.1] as const) {
            for (const rangeFilter of ["none", "atr_1_4"] as const) {
              for (const entryCutoffHour of [12, 14] as const) {
                configs.push({
                  accumulationEndHour,
                  manipulationStartHour,
                  manipulationEndHour,
                  confirmation,
                  targetMode,
                  minSweepAtr,
                  rangeFilter,
                  entryCutoffHour,
                });
              }
            }
          }
        }
      }
    }
  }
}

function configKey(config: Config) {
  return JSON.stringify(config);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tradeBreakdowns(trades: Trade[]) {
  const monthly = new Map<string, Trade[]>();
  for (const trade of trades) {
    const month = new Date(trade.entryTime).toISOString().slice(0, 7);
    monthly.set(month, [...(monthly.get(month) ?? []), trade]);
  }
  return {
    directions: (["long", "short"] as const).map((direction) => ({
      direction,
      ...metricsFromR(trades.filter((trade) => trade.direction === direction)),
    })),
    monthly: [...monthly.entries()].map(([month, monthTrades]) => ({
      month,
      ...metricsFromR(monthTrades),
    })),
  };
}

async function main() {
  const datasets = new Map<
    string,
    {
      oneMinute: Kline[];
      days: DayContext[];
      oneHour: Kline[];
      oneHourAtr: Array<number | null>;
    }
  >();
  for (const [symbol, path] of Object.entries(FILES)) {
    if (!existsSync(path)) continue;
    const oneMinute = parseLocalCsvKlines(readFileSync(path, "utf8"));
    const oneHour = aggregateKlines(oneMinute, "1h");
    datasets.set(symbol, {
      oneMinute,
      days: buildDays(oneMinute),
      oneHour,
      oneHourAtr: atrSeries(oneHour),
    });
    console.log(`${symbol}: ${oneMinute.length} one-minute rows`);
  }

  const trainResults: Result[] = [];
  const trainStart = Date.parse("2025-01-01T00:00:00Z");
  const trainEnd = Date.parse("2026-01-01T00:00:00Z");
  for (const config of configs) {
    for (const [symbol, dataset] of datasets) {
      const trades = runPeriod(
        symbol,
        dataset.oneMinute,
        dataset.days,
        dataset.oneHour,
        dataset.oneHourAtr,
        config,
        trainStart,
        trainEnd
      );
      trainResults.push({
        symbol,
        period: "train_2025",
        config,
        metrics: metrics(trades),
        trades,
      });
    }
  }

  const grouped = new Map<string, Result[]>();
  for (const result of trainResults) {
    grouped.set(configKey(result.config), [...(grouped.get(configKey(result.config)) ?? []), result]);
  }
  const ranking = [...grouped.entries()]
    .map(([key, results]) => {
      const active = results.filter((result) => result.metrics.trades >= 10);
      const positive = active.filter(
        (result) => result.metrics.netProfit > 0 && result.metrics.profitFactor > 1
      ).length;
      const averageReturn = active.length
        ? active.reduce((sum, result) => sum + result.metrics.returnPct, 0) / active.length
        : -999;
      const minimumReturn = active.length
        ? Math.min(...active.map((result) => result.metrics.returnPct))
        : -999;
      const averagePf = active.length
        ? active.reduce((sum, result) => sum + result.metrics.profitFactor, 0) / active.length
        : 0;
      const worstDrawdown = active.length
        ? Math.min(...active.map((result) => result.metrics.maxDrawdownPct))
        : -999;
      const totalTrades = active.reduce((sum, result) => sum + result.metrics.trades, 0);
      const score =
        positive * 100 +
        minimumReturn * 4 +
        averageReturn * 2 +
        averagePf * 5 +
        worstDrawdown * 2 +
        Math.min(50, totalTrades / 5);
      return {
        key,
        config: JSON.parse(key) as Config,
        positive,
        activeAssets: active.length,
        averageReturn,
        minimumReturn,
        averagePf,
        worstDrawdown,
        totalTrades,
        score,
        details: results.map((result) => ({
          symbol: result.symbol,
          ...result.metrics,
        })),
      };
    })
    .sort((left, right) => right.score - left.score);

  const selected = ranking[0];
  const testResults: Result[] = [];
  const testStart = Date.parse("2026-01-01T00:00:00Z");
  const testEnd = Date.parse("2026-06-21T00:00:00Z");
  for (const [symbol, dataset] of datasets) {
    const trades = runPeriod(
      symbol,
      dataset.oneMinute,
      dataset.days,
      dataset.oneHour,
      dataset.oneHourAtr,
      selected.config,
      testStart,
      testEnd
    );
    testResults.push({
      symbol,
      period: "test_2026",
      config: selected.config,
      metrics: metrics(trades),
      trades,
    });
  }

  const historyResults: Result[] = [];
  for (const symbol of ["EURUSD", "AUDUSD"]) {
    const dataset = datasets.get(symbol);
    if (!dataset) continue;
    const trades = runPeriod(
      symbol,
      dataset.oneMinute,
      dataset.days,
      dataset.oneHour,
      dataset.oneHourAtr,
      selected.config,
      Date.parse("2024-01-01T00:00:00Z"),
      trainStart
    );
    historyResults.push({
      symbol,
      period: "history_pre2025",
      config: selected.config,
      metrics: metrics(trades),
      trades,
    });
  }

  const halfYear = Date.parse("2025-07-01T00:00:00Z");
  const assetSelections = [...datasets.keys()].map((symbol) => {
    const candidates = trainResults
      .filter((result) => result.symbol === symbol)
      .map((result) => {
        const firstHalf = metricsFromR(
          result.trades.filter((trade) => trade.entryTime < halfYear)
        );
        const secondHalf = metricsFromR(
          result.trades.filter((trade) => trade.entryTime >= halfYear)
        );
        const fullYear = metricsFromR(result.trades);
        const robust =
          firstHalf.trades >= 8 &&
          secondHalf.trades >= 8 &&
          firstHalf.netProfit > 0 &&
          secondHalf.netProfit > 0 &&
          fullYear.maxDrawdownPct >= -12;
        const score =
          (robust ? 1_000 : 0) +
          Math.min(firstHalf.returnPct, secondHalf.returnPct) * 8 +
          fullYear.returnPct * 2 +
          fullYear.profitFactor * 10 +
          fullYear.expectancyR * 20 +
          fullYear.maxDrawdownPct * 3 -
          fullYear.maxLossStreak * 2 +
          Math.min(50, fullYear.trades / 2);
        return {
          config: result.config,
          robust,
          score,
          firstHalf,
          secondHalf,
          fullYear,
        };
      })
      .sort((left, right) => right.score - left.score);
    return {
      symbol,
      selected: candidates[0],
      alternatives: candidates.slice(1, 6),
    };
  });

  const assetTestResults = assetSelections.map(({ symbol, selected: assetSelected }) => {
    const dataset = datasets.get(symbol)!;
    const trades = runPeriod(
      symbol,
      dataset.oneMinute,
      dataset.days,
      dataset.oneHour,
      dataset.oneHourAtr,
      assetSelected.config,
      testStart,
      testEnd
    );
    return {
      symbol,
      config: assetSelected.config,
      training: assetSelected,
      test2026: metricsFromR(trades),
      executionCosts: [0, 0.5, 1].map((costPips) => ({
        costPips,
        ...metricsFromR(trades, costPips),
      })),
      breakdowns: tradeBreakdowns(trades),
      trades,
    };
  });

  const assetHistoryResults = assetSelections
    .filter(({ symbol }) => symbol === "EURUSD" || symbol === "AUDUSD")
    .map(({ symbol, selected: assetSelected }) => {
      const dataset = datasets.get(symbol)!;
      const trades = runPeriod(
        symbol,
        dataset.oneMinute,
        dataset.days,
        dataset.oneHour,
        dataset.oneHourAtr,
        assetSelected.config,
        Date.parse(symbol === "AUDUSD" ? "2023-06-15T00:00:00Z" : "2024-01-01T00:00:00Z"),
        trainStart
      );
      return {
        symbol,
        config: assetSelected.config,
        metrics: metricsFromR(trades),
        executionCosts: [0, 0.5, 1].map((costPips) => ({
          costPips,
          ...metricsFromR(trades, costPips),
        })),
        breakdowns: tradeBreakdowns(trades),
        trades,
      };
    });

  const universalExecutionCosts = testResults.map((result) => ({
    symbol: result.symbol,
    costs: [0, 0.5, 1].map((costPips) => ({
      costPips,
      ...metricsFromR(result.trades, costPips),
    })),
  }));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    name: "ICT AMD / Power of 3 Research",
    assumptions: {
      accumulation: "Asian range from 00:00 UTC to configured end hour.",
      manipulation:
        "London-window sweep beyond one Asian boundary, followed by a close back inside the range.",
      confirmation:
        "Rejection entry, 3-candle market structure break, or strict ICT FVG formation and retest.",
      entry: "Open of the next closed 5M candle after confirmation.",
      stop: "Beyond the manipulation extreme plus 0.05 * H1 ATR(14).",
      target: "Opposite Asian boundary, fixed 2R, or fixed 3R.",
      execution: "TP/SL resolved on 1M candles; same-minute ambiguity resolves to SL.",
      risk: "1% current equity; maximum one trade per pair per day.",
      costs: "Spread, commission, slippage, and swaps excluded.",
    },
    selectedTrainingConfiguration: selected,
    topTrainingConfigurations: ranking.slice(0, 20),
    test2026: testResults,
    historyPre2025: historyResults,
    universalExecutionCosts,
    robustAssetSelections: assetSelections,
    robustAssetTests2026: assetTestResults,
    robustAssetHistoryBefore2025: assetHistoryResults,
  };
  writeFileSync(
    `${OUTPUT_DIR}/amd_power_of_three_research.json`,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const summaryHeaders = [
    "period",
    "symbol",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "max_drawdown_pct",
    "max_loss_streak",
    "config",
  ];
  const summaryRows = [...testResults, ...historyResults].map((result) => [
    result.period,
    result.symbol,
    result.metrics.trades,
    result.metrics.winRate,
    result.metrics.netProfit,
    result.metrics.returnPct,
    result.metrics.profitFactor,
    result.metrics.expectancyR,
    result.metrics.maxDrawdown,
    result.metrics.maxDrawdownPct,
    result.metrics.maxLossStreak,
    configKey(result.config),
  ]);
  for (const result of assetTestResults) {
    summaryRows.push([
      "asset_specific_test_2026",
      result.symbol,
      result.test2026.trades,
      result.test2026.winRate,
      result.test2026.netProfit,
      result.test2026.returnPct,
      result.test2026.profitFactor,
      result.test2026.expectancyR,
      result.test2026.maxDrawdown,
      result.test2026.maxDrawdownPct,
      result.test2026.maxLossStreak,
      configKey(result.config),
    ]);
  }
  writeFileSync(
    `${OUTPUT_DIR}/amd_power_of_three_summary.csv`,
    [summaryHeaders, ...summaryRows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n") + "\n",
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        selected,
        test2026: testResults.map((result) => ({
          symbol: result.symbol,
          ...result.metrics,
        })),
        historyPre2025: historyResults.map((result) => ({
          symbol: result.symbol,
          ...result.metrics,
        })),
        robustAssetTests2026: assetTestResults.map((result) => ({
          symbol: result.symbol,
          config: result.config,
          robustInBoth2025Halves: result.training.robust,
          training2025: result.training.fullYear,
          test2026: result.test2026,
          executionCosts: result.executionCosts,
        })),
        robustAssetHistoryBefore2025: assetHistoryResults.map((result) => ({
          symbol: result.symbol,
          metrics: result.metrics,
          executionCosts: result.executionCosts,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
