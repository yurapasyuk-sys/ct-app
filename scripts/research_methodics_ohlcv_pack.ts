import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import {
  aggregateKlines,
  parseLocalCsvKlines,
} from "../src/lib/data-handlers/local-csv-market-data";
import {
  prepareSmcSessionRaidData,
  runSmcSessionRaidBacktest,
  type SmcSessionRaidConfig,
} from "../src/lib/data-handlers/smc-session-raid-backtest";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const INITIAL_EQUITY = 10_000;
const RISK_PCT = Number(process.env.METHODICS_RISK_PCT ?? 1);
const START = Date.parse(process.env.METHODICS_START ?? "2026-01-01T00:00:00Z");
const END = Date.parse(process.env.METHODICS_END ?? "2026-06-21T00:00:00Z");
const OUT_DIR = process.env.METHODICS_OUT_DIR ?? "public/exports";

const FILES: Record<string, string> = {
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "public/data/forex/AUDUSD_1m_2023-06-15_2026-06-15.csv",
};

type Direction = "long" | "short";
type Result = "TP" | "SL" | "TIME";

interface Trade {
  family: string;
  strategy: string;
  symbol: string;
  direction: Direction;
  setupTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitTime: number;
  exitPrice: number;
  result: Result;
  riskPips: number;
  profit: number;
  rMultiple: number;
  reason: string;
}

function pipSize(symbol: string) {
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
}

function utcHour(timestamp: number) {
  return new Date(timestamp).getUTCHours();
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

function trueRange(row: Kline, previous: Kline) {
  return Math.max(
    row.high - row.low,
    Math.abs(row.high - previous.close),
    Math.abs(row.low - previous.close)
  );
}

function atrSeries(rows: Kline[], period = 14) {
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

function emaSeries(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  const multiplier = 2 / (period + 1);
  let ema = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (index < period) {
      ema += rows[index].close;
      if (index === period - 1) {
        ema /= period;
        values[index] = ema;
      }
      continue;
    }
    ema = rows[index].close * multiplier + ema * (1 - multiplier);
    values[index] = ema;
  }
  return values;
}

function overlaps(row: Kline, low: number, high: number) {
  return row.low <= high && row.high >= low;
}

function resolveTrade(
  partial: Omit<Trade, "exitTime" | "exitPrice" | "result" | "profit" | "rMultiple">,
  oneMinute: Kline[],
  equity: number,
  maxExitTime: number
): Trade | null {
  const riskDistance = Math.abs(partial.entryPrice - partial.stopLoss);
  if (riskDistance <= 0) return null;
  if (partial.direction === "long" && partial.stopLoss >= partial.entryPrice) return null;
  if (partial.direction === "short" && partial.stopLoss <= partial.entryPrice) return null;
  if (Math.abs(partial.entryPrice - partial.stopLoss) / pipSize(partial.symbol) < 5) return null;

  const riskAmount = equity * (RISK_PCT / 100);
  const quantity = riskAmount / riskDistance;
  const startIndex = lowerBound(oneMinute, partial.entryTime);
  const endIndex = Math.min(oneMinute.length, lowerBound(oneMinute, maxExitTime));
  for (let index = startIndex; index < endIndex; index += 1) {
    const row = oneMinute[index];
    const hitStop =
      partial.direction === "long" ? row.low <= partial.stopLoss : row.high >= partial.stopLoss;
    const hitTarget =
      partial.direction === "long" ? row.high >= partial.takeProfit : row.low <= partial.takeProfit;
    if (!hitStop && !hitTarget) continue;
    const exitPrice = hitStop ? partial.stopLoss : partial.takeProfit;
    const profit =
      partial.direction === "long"
        ? (exitPrice - partial.entryPrice) * quantity
        : (partial.entryPrice - exitPrice) * quantity;
    return {
      ...partial,
      exitTime: row.openTime,
      exitPrice,
      result: hitStop ? "SL" : "TP",
      profit,
      rMultiple: profit / riskAmount,
    };
  }

  const fallback = oneMinute[Math.max(startIndex, endIndex - 1)];
  if (!fallback) return null;
  const profit =
    partial.direction === "long"
      ? (fallback.close - partial.entryPrice) * quantity
      : (partial.entryPrice - fallback.close) * quantity;
  return {
    ...partial,
    exitTime: fallback.openTime,
    exitPrice: fallback.close,
    result: "TIME",
    profit,
    rMultiple: profit / riskAmount,
  };
}

function metrics(trades: Trade[]) {
  let equity = INITIAL_EQUITY;
  let peak = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let maxLossStreak = 0;
  let lossStreak = 0;
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
    netProfit: equity - INITIAL_EQUITY,
    returnPct: (equity / INITIAL_EQUITY - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length
      ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length
      : 0,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / INITIAL_EQUITY) * 100,
    maxLossStreak,
    finalEquity: equity,
  };
}

function runFvgRebalance(symbol: string, oneMinute: Kline[]) {
  const oneHour = aggregateKlines(oneMinute, "1h");
  const atr = atrSeries(oneHour);
  const ema = emaSeries(oneHour, 100);
  const trades: Trade[] = [];
  let equity = INITIAL_EQUITY;

  for (let index = 102; index < oneHour.length - 2; index += 1) {
    const signal = oneHour[index];
    if (signal.openTime < START || signal.openTime >= END) continue;
    const atrValue = atr[index] ?? 0;
    const emaValue = ema[index] ?? 0;
    if (atrValue <= 0 || emaValue <= 0) continue;

    const candle1 = oneHour[index - 2];
    const bullish = candle1.high < signal.low && signal.close > emaValue;
    const bearish = candle1.low > signal.high && signal.close < emaValue;
    if (!bullish && !bearish) continue;

    const direction: Direction = bullish ? "long" : "short";
    const zoneLow = bullish ? candle1.high : signal.high;
    const zoneHigh = bullish ? signal.low : candle1.low;
    if ((zoneHigh - zoneLow) / atrValue < 0.1) continue;

    for (let testIndex = index + 1; testIndex < Math.min(oneHour.length - 1, index + 49); testIndex += 1) {
      const test = oneHour[testIndex];
      if (!overlaps(test, zoneLow, zoneHigh)) continue;
      const entryRow = oneHour[testIndex + 1];
      const entryPrice = entryRow.open;
      const stopLoss = direction === "long" ? zoneLow - 0.1 * atrValue : zoneHigh + 0.1 * atrValue;
      const risk = Math.abs(entryPrice - stopLoss);
      const takeProfit = direction === "long" ? entryPrice + 2 * risk : entryPrice - 2 * risk;
      const trade = resolveTrade(
        {
          family: "SMC/OHLCV",
          strategy: "Methodics FVG Rebalance H1 EMA100",
          symbol,
          direction,
          setupTime: signal.openTime,
          entryTime: entryRow.openTime,
          entryPrice,
          stopLoss,
          takeProfit,
          riskPips: risk / pipSize(symbol),
          reason: `${direction} H1 strict FVG retest with EMA100 context`,
        },
        oneMinute,
        equity,
        entryRow.openTime + 5 * DAY
      );
      if (trade) {
        trades.push(trade);
        equity += trade.profit;
      }
      break;
    }
  }
  return trades;
}

function runObMitigation(symbol: string, oneMinute: Kline[]) {
  const oneHour = aggregateKlines(oneMinute, "1h");
  const atr = atrSeries(oneHour);
  const trades: Trade[] = [];
  let equity = INITIAL_EQUITY;

  for (let index = 30; index < oneHour.length - 2; index += 1) {
    const row = oneHour[index];
    if (row.openTime < START || row.openTime >= END) continue;
    const atrValue = atr[index] ?? 0;
    if (atrValue <= 0) continue;
    const lookback = oneHour.slice(index - 20, index);
    const breaksHigh = row.close > highest(lookback) && row.close - row.open > 0.8 * atrValue;
    const breaksLow = row.close < lowest(lookback) && row.open - row.close > 0.8 * atrValue;
    if (!breaksHigh && !breaksLow) continue;
    const direction: Direction = breaksHigh ? "long" : "short";
    const search = oneHour.slice(Math.max(0, index - 8), index).reverse();
    const ob = search.find((item) =>
      direction === "long" ? item.close < item.open : item.close > item.open
    );
    if (!ob) continue;
    const bodyLow = Math.min(ob.open, ob.close);
    const bodyHigh = Math.max(ob.open, ob.close);
    const meanThreshold = (bodyLow + bodyHigh) / 2;
    const zoneLow = direction === "long" ? ob.low : meanThreshold;
    const zoneHigh = direction === "long" ? meanThreshold : ob.high;

    for (let testIndex = index + 1; testIndex < Math.min(oneHour.length - 1, index + 49); testIndex += 1) {
      const test = oneHour[testIndex];
      if (!overlaps(test, zoneLow, zoneHigh)) continue;
      const entryRow = oneHour[testIndex + 1];
      const entryPrice = entryRow.open;
      const stopLoss = direction === "long" ? ob.low - 0.1 * atrValue : ob.high + 0.1 * atrValue;
      const risk = Math.abs(entryPrice - stopLoss);
      const takeProfit = direction === "long" ? entryPrice + 2 * risk : entryPrice - 2 * risk;
      const trade = resolveTrade(
        {
          family: "SMC/OHLCV",
          strategy: "Methodics OB Mitigation H1 BOS",
          symbol,
          direction,
          setupTime: row.openTime,
          entryTime: entryRow.openTime,
          entryPrice,
          stopLoss,
          takeProfit,
          riskPips: risk / pipSize(symbol),
          reason: `${direction} H1 BOS displacement, retest of last opposite candle OB/MT`,
        },
        oneMinute,
        equity,
        entryRow.openTime + 5 * DAY
      );
      if (trade) {
        trades.push(trade);
        equity += trade.profit;
      }
      break;
    }
  }
  return trades;
}

function previousThreeBreak(rows: Kline[], index: number, direction: Direction) {
  if (index < 3) return false;
  const previous = rows.slice(index - 3, index);
  return direction === "long"
    ? rows[index].close > highest(previous)
    : rows[index].close < lowest(previous);
}

function runAmdPo3Fixed(symbol: string, oneMinute: Kline[]) {
  const fiveMinute = aggregateKlines(oneMinute, "5m");
  const oneHour = aggregateKlines(oneMinute, "1h");
  const oneHourAtr = atrSeries(oneHour);
  const byDay = new Map<number, Kline[]>();
  for (const row of fiveMinute) {
    const start = dayStart(row.openTime);
    byDay.set(start, [...(byDay.get(start) ?? []), row]);
  }
  const trades: Trade[] = [];
  let equity = INITIAL_EQUITY;

  for (const [start, rows] of byDay) {
    if (start < START || start >= END) continue;
    const asian = rows.filter((row) => utcHour(row.openTime) >= 0 && utcHour(row.openTime) < 7);
    if (asian.length < 60) continue;
    const asianHigh = highest(asian);
    const asianLow = lowest(asian);
    const h1Index = lowerBound(oneHour, start + 7 * HOUR) - 1;
    const atrValue = oneHourAtr[h1Index] ?? 0;
    if (atrValue <= 0) continue;
    const london = rows.filter((row) => utcHour(row.openTime) >= 7 && utcHour(row.openTime) < 11);
    let sweepIndex = -1;
    let direction: Direction | null = null;
    for (const row of london) {
      const index = rows.indexOf(row);
      const sweptHigh = row.high > asianHigh && row.close < asianHigh && row.high - asianHigh >= 0.05 * atrValue;
      const sweptLow = row.low < asianLow && row.close > asianLow && asianLow - row.low >= 0.05 * atrValue;
      if (sweptHigh && sweptLow) continue;
      if (sweptHigh) {
        direction = "short";
        sweepIndex = index;
        break;
      }
      if (sweptLow) {
        direction = "long";
        sweepIndex = index;
        break;
      }
    }
    if (sweepIndex < 0 || !direction) continue;
    let signalIndex = -1;
    let stopExtreme = direction === "long" ? rows[sweepIndex].low : rows[sweepIndex].high;
    for (let index = sweepIndex + 1; index < rows.length - 1; index += 1) {
      if (rows[index].openTime >= start + 12 * HOUR) break;
      stopExtreme =
        direction === "long" ? Math.min(stopExtreme, rows[index].low) : Math.max(stopExtreme, rows[index].high);
      if (previousThreeBreak(rows, index, direction)) {
        signalIndex = index;
        break;
      }
    }
    if (signalIndex < 0) continue;
    const entryRow = rows[signalIndex + 1];
    const entryPrice = entryRow.open;
    const stopLoss = direction === "long" ? stopExtreme - 0.05 * atrValue : stopExtreme + 0.05 * atrValue;
    const risk = Math.abs(entryPrice - stopLoss);
    const takeProfit = direction === "long" ? entryPrice + 2 * risk : entryPrice - 2 * risk;
    const trade = resolveTrade(
      {
        family: "PO3/AMD",
        strategy: "Methodics AMD PO3 London Sweep MSS",
        symbol,
        direction,
        setupTime: rows[sweepIndex].openTime,
        entryTime: entryRow.openTime,
        entryPrice,
        stopLoss,
        takeProfit,
        riskPips: risk / pipSize(symbol),
        reason: `${direction} Asian range accumulation, London manipulation sweep, MSS confirmation`,
      },
      oneMinute,
      equity,
      start + 20 * HOUR
    );
    if (trade) {
      trades.push(trade);
      equity += trade.profit;
    }
  }
  return trades;
}

function buildPreviousDayLevels(rows: Kline[]) {
  const levels = new Map<number, { high: number; low: number }>();
  const grouped = new Map<number, Kline[]>();
  for (const row of rows) {
    const start = dayStart(row.openTime);
    grouped.set(start, [...(grouped.get(start) ?? []), row]);
  }
  const starts = [...grouped.keys()].sort((a, b) => a - b);
  for (let index = 1; index < starts.length; index += 1) {
    const previous = grouped.get(starts[index - 1]) ?? [];
    if (previous.length) levels.set(starts[index], { high: highest(previous), low: lowest(previous) });
  }
  return levels;
}

function runSmtForPair(
  tradedSymbol: string,
  confirmSymbol: string,
  tradedOneMinute: Kline[],
  confirmOneMinute: Kline[]
) {
  const traded = aggregateKlines(tradedOneMinute, "5m");
  const confirm = aggregateKlines(confirmOneMinute, "5m");
  const confirmByTime = new Map(confirm.map((row) => [row.openTime, row]));
  const tradedLevels = buildPreviousDayLevels(traded);
  const confirmLevels = buildPreviousDayLevels(confirm);
  const trades: Trade[] = [];
  let equity = INITIAL_EQUITY;
  let lastTradeDay = 0;

  for (let index = 3; index < traded.length - 1; index += 1) {
    const row = traded[index];
    if (row.openTime < START || row.openTime >= END) continue;
    const hour = utcHour(row.openTime);
    if (hour < 7 || hour >= 16) continue;
    const start = dayStart(row.openTime);
    if (lastTradeDay === start) continue;
    const tLevel = tradedLevels.get(start);
    const cLevel = confirmLevels.get(start);
    const cRow = confirmByTime.get(row.openTime);
    if (!tLevel || !cLevel || !cRow) continue;
    const longSmt = row.low < tLevel.low && row.close > tLevel.low && cRow.low >= cLevel.low;
    const shortSmt = row.high > tLevel.high && row.close < tLevel.high && cRow.high <= cLevel.high;
    if (!longSmt && !shortSmt) continue;
    const direction: Direction = longSmt ? "long" : "short";
    if (!previousThreeBreak(traded, index, direction)) continue;
    const entryRow = traded[index + 1];
    const entryPrice = entryRow.open;
    const stopLoss = direction === "long" ? row.low : row.high;
    const risk = Math.abs(entryPrice - stopLoss);
    const takeProfit = direction === "long" ? entryPrice + 2 * risk : entryPrice - 2 * risk;
    const trade = resolveTrade(
      {
        family: "SMT",
        strategy: `Methodics SMT Divergence ${confirmSymbol} confirmation`,
        symbol: tradedSymbol,
        direction,
        setupTime: row.openTime,
        entryTime: entryRow.openTime,
        entryPrice,
        stopLoss,
        takeProfit,
        riskPips: risk / pipSize(tradedSymbol),
        reason: `${tradedSymbol} swept previous-day liquidity while ${confirmSymbol} did not confirm`,
      },
      tradedOneMinute,
      equity,
      start + 20 * HOUR
    );
    if (trade) {
      trades.push(trade);
      equity += trade.profit;
      lastTradeDay = start;
    }
  }
  return trades;
}

function runStdivRangeProxy(symbol: string, oneMinute: Kline[]) {
  const fiveMinute = aggregateKlines(oneMinute, "5m");
  const byDay = new Map<number, Kline[]>();
  for (const row of fiveMinute) {
    const start = dayStart(row.openTime);
    byDay.set(start, [...(byDay.get(start) ?? []), row]);
  }
  const trades: Trade[] = [];
  let equity = INITIAL_EQUITY;
  for (const [start, rows] of byDay) {
    if (start < START || start >= END) continue;
    const asian = rows.filter((row) => utcHour(row.openTime) >= 0 && utcHour(row.openTime) < 7);
    if (asian.length < 60) continue;
    const closes = asian.map((row) => row.close);
    const mean = closes.reduce((sum, value) => sum + value, 0) / closes.length;
    const stdev = Math.sqrt(closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / closes.length);
    if (stdev <= 0) continue;
    const highBand = mean + 2 * stdev;
    const lowBand = mean - 2 * stdev;
    const session = rows.filter((row) => utcHour(row.openTime) >= 7 && utcHour(row.openTime) < 11);
    for (const row of session) {
      const index = rows.indexOf(row);
      const shortRevert = row.high > highBand && row.close < highBand;
      const longRevert = row.low < lowBand && row.close > lowBand;
      if (!shortRevert && !longRevert) continue;
      const direction: Direction = longRevert ? "long" : "short";
      if (index + 1 >= rows.length) break;
      const entryRow = rows[index + 1];
      const entryPrice = entryRow.open;
      const stopLoss = direction === "long" ? row.low : row.high;
      const risk = Math.abs(entryPrice - stopLoss);
      const takeProfit = direction === "long" ? entryPrice + 2 * risk : entryPrice - 2 * risk;
      const trade = resolveTrade(
        {
          family: "STDIV",
          strategy: "Methodics STDIV Asian Range Reversion Proxy",
          symbol,
          direction,
          setupTime: row.openTime,
          entryTime: entryRow.openTime,
          entryPrice,
          stopLoss,
          takeProfit,
          riskPips: risk / pipSize(symbol),
          reason: `${direction} raid of Asian 2-stdev band and close back inside`,
        },
        oneMinute,
        equity,
        start + 20 * HOUR
      );
      if (trade) {
        trades.push(trade);
        equity += trade.profit;
      }
      break;
    }
  }
  return trades;
}

function runSmcSessionRaid(symbol: string, oneMinute: Kline[]) {
  const config: SmcSessionRaidConfig = {
    session: "new_york",
    liquiditySource: "either",
    entryModel: "either",
    rewardR: 2,
    swingStrength: 3,
    displacementAtrMultiple: 1,
    biasFilter: "none",
    minRaidAtrMultiple: 0.1,
    entryExpiryBars: 12,
    minRiskPips: 5,
    stopBufferAtrMultiple: 0.05,
  };
  const data = prepareSmcSessionRaidData(oneMinute);
  return runSmcSessionRaidBacktest(symbol, data, config, START, END).map((trade) => ({
    family: "SMC/OHLCV",
    strategy: "Methodics SMC Session Raid Shift FVG/OB",
    symbol,
    direction: trade.direction,
    setupTime: trade.raidTime,
    entryTime: trade.entryTime,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    exitTime: trade.exitTime,
    exitPrice: trade.exitPrice,
    result: trade.result,
    riskPips: Math.abs(trade.entryPrice - trade.stopLoss) / pipSize(symbol),
    profit: trade.profit,
    rMultiple: trade.rMultiple,
    reason: `${trade.session} raid of ${trade.liquiditySource}, shift, ${trade.entryModel} retest`,
  })) satisfies Trade[];
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function iso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const datasets = new Map<string, Kline[]>();
  for (const [symbol, path] of Object.entries(FILES)) {
    if (!existsSync(path)) continue;
    datasets.set(symbol, parseLocalCsvKlines(readFileSync(path, "utf8")));
  }

  const allTrades: Trade[] = [];
  const skipped = [
    {
      methodic: "Order Flow / Cluster / Footprint / DOM / MBO-MBP",
      reason: "Потрібні bid/ask trades, aggressor side, footprint або історичний стакан. У наших CSV є тільки OHLCV.",
    },
    {
      methodic: "Чистий кластерний аналіз POC/VAH/VAL",
      reason: "Без volume-at-price по кожному рівню POC/VAH/VAL можна лише грубо імітувати, не валідний бектест.",
    },
  ];

  for (const [symbol, rows] of datasets) {
    console.log(`${symbol}: running OHLCV methodics pack`);
    allTrades.push(...runSmcSessionRaid(symbol, rows));
    allTrades.push(...runFvgRebalance(symbol, rows));
    allTrades.push(...runObMitigation(symbol, rows));
    allTrades.push(...runAmdPo3Fixed(symbol, rows));
    allTrades.push(...runStdivRangeProxy(symbol, rows));
  }

  const pairs: Array<[string, string]> = [
    ["EURUSD", "GBPUSD"],
    ["GBPUSD", "EURUSD"],
    ["EURUSD", "AUDUSD"],
    ["AUDUSD", "EURUSD"],
  ];
  for (const [traded, confirm] of pairs) {
    const tradedRows = datasets.get(traded);
    const confirmRows = datasets.get(confirm);
    if (tradedRows && confirmRows) allTrades.push(...runSmtForPair(traded, confirm, tradedRows, confirmRows));
  }

  const groups = new Map<string, Trade[]>();
  for (const trade of allTrades) {
    const key = `${trade.strategy}||${trade.symbol}`;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }
  const reports = [...groups.entries()]
    .map(([key, trades]) => {
      const [strategy, symbol] = key.split("||");
      const stats = metrics(trades);
      return { strategy, symbol, ...stats };
    })
    .sort((left, right) => right.returnPct - left.returnPct);

  writeFileSync(
    `${OUT_DIR}/methodics_ohlcv_strategy_results.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        period: {
          start: iso(START),
          end: iso(END),
        },
        riskPct: RISK_PCT,
        note: "Research-only OHLCV formalizations of methodics. Not a promise of live profitability.",
        skipped,
        reports,
        trades: allTrades,
      },
      null,
      2
    ),
    "utf8"
  );

  writeCsv(`${OUT_DIR}/methodics_ohlcv_strategy_summary.csv`, [
    [
      "strategy",
      "symbol",
      "trades",
      "winners",
      "losers",
      "win_rate",
      "net_profit",
      "return_pct",
      "profit_factor",
      "expectancy_r",
      "max_drawdown",
      "max_drawdown_pct",
      "max_loss_streak",
      "final_equity",
    ],
    ...reports.map((row) => [
      row.strategy,
      row.symbol,
      row.trades,
      row.winners,
      row.losers,
      row.winRate,
      row.netProfit,
      row.returnPct,
      row.profitFactor,
      row.expectancyR,
      row.maxDrawdown,
      row.maxDrawdownPct,
      row.maxLossStreak,
      row.finalEquity,
    ]),
  ]);

  writeCsv(`${OUT_DIR}/methodics_ohlcv_strategy_trades.csv`, [
    [
      "strategy",
      "family",
      "symbol",
      "direction",
      "setup_time",
      "entry_time",
      "entry_price",
      "stop_loss",
      "take_profit",
      "exit_time",
      "exit_price",
      "result",
      "risk_pips",
      "profit",
      "r_multiple",
      "reason",
    ],
    ...allTrades.map((trade) => [
      trade.strategy,
      trade.family,
      trade.symbol,
      trade.direction,
      iso(trade.setupTime),
      iso(trade.entryTime),
      trade.entryPrice,
      trade.stopLoss,
      trade.takeProfit,
      iso(trade.exitTime),
      trade.exitPrice,
      trade.result,
      trade.riskPips,
      trade.profit,
      trade.rMultiple,
      trade.reason,
    ]),
  ]);

  writeFileSync(
    `${OUT_DIR}/methodics_ohlcv_strategy_analysis.md`,
    [
      "# Methodics OHLCV Strategy Pack",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Period: ${iso(START)} to ${iso(END)}`,
      `Risk per trade: ${RISK_PCT}%`,
      "",
      "## Tested OHLCV formalizations",
      "",
      "- SMC Session Raid + Shift + FVG/OB Entry",
      "- FVG Rebalance H1 EMA100",
      "- OB Mitigation H1 BOS",
      "- AMD / PO3 London Sweep MSS",
      "- SMT Divergence on previous-day liquidity",
      "- STDIV Asian Range Reversion Proxy",
      "",
      "## Not valid with current data",
      "",
      ...skipped.map((item) => `- ${item.methodic}: ${item.reason}`),
      "",
      "## Top Results",
      "",
      "| Strategy | Symbol | Trades | Return % | PF | Max DD % | Expectancy R |",
      "|---|---:|---:|---:|---:|---:|---:|",
      ...reports
        .slice(0, 20)
        .map(
          (row) =>
            `| ${row.strategy} | ${row.symbol} | ${row.trades} | ${row.returnPct.toFixed(2)} | ${Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Inf"} | ${row.maxDrawdownPct.toFixed(2)} | ${row.expectancyR.toFixed(2)} |`
        ),
      "",
    ].join("\n"),
    "utf8"
  );

  console.table(
    reports.slice(0, 20).map((row) => ({
      strategy: row.strategy,
      symbol: row.symbol,
      trades: row.trades,
      returnPct: row.returnPct.toFixed(2),
      pf: Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Inf",
      ddPct: row.maxDrawdownPct.toFixed(2),
      expR: row.expectancyR.toFixed(2),
    }))
  );
}

main();
