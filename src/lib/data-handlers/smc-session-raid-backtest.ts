import type { Kline } from "@/lib/binance";
import { aggregateKlines } from "./local-csv-market-data";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type SmcDirection = "long" | "short";
export type SmcSession = "london" | "new_york";
export type SmcLiquiditySource = "asian" | "previous_day" | "either";
export type SmcEntryModel = "fvg" | "order_block" | "either";
export type SmcBiasFilter = "none" | "premium_discount";

export interface SmcSessionRaidConfig {
  session: SmcSession;
  liquiditySource: SmcLiquiditySource;
  entryModel: SmcEntryModel;
  rewardR: 2 | 3;
  swingStrength: 2 | 3;
  displacementAtrMultiple: 0.8 | 1;
  biasFilter: SmcBiasFilter;
  minRaidAtrMultiple: 0.05 | 0.1;
  entryExpiryBars: 6 | 12;
  minRiskPips: number;
  stopBufferAtrMultiple: number;
}

export interface SmcSessionRaidTrade {
  symbol: string;
  direction: SmcDirection;
  session: SmcSession;
  liquiditySource: "asian" | "previous_day";
  entryModel: "fvg" | "order_block";
  liquidityLevel: number;
  raidTime: number;
  raidExtreme: number;
  raidDepthAtr: number;
  shiftTime: number;
  shiftLevel: number;
  displacementAtr: number;
  zoneFormedTime: number;
  zoneLow: number;
  zoneHigh: number;
  zoneTestTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitTime: number;
  exitPrice: number;
  result: "TP" | "SL" | "TIME";
  riskAmount: number;
  profit: number;
  rMultiple: number;
}

export interface PreparedSmcData {
  oneMinute: Kline[];
  fiveMinute: Kline[];
  oneHour: Kline[];
  fiveMinuteAtr: Array<number | null>;
  oneHourAtr: Array<number | null>;
  days: Array<{
    start: number;
    rows: Kline[];
    previousDayHigh: number | null;
    previousDayLow: number | null;
  }>;
}

interface Zone {
  model: "fvg" | "order_block";
  low: number;
  high: number;
  formedIndex: number;
  formedTime: number;
}

function dayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
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

function pipSize(symbol: string) {
  return symbol.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

function isPivotHigh(rows: Kline[], index: number, strength: number) {
  if (index - strength < 0 || index + strength >= rows.length) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (
      rows[index].high <= rows[index - offset].high ||
      rows[index].high < rows[index + offset].high
    ) {
      return false;
    }
  }
  return true;
}

function isPivotLow(rows: Kline[], index: number, strength: number) {
  if (index - strength < 0 || index + strength >= rows.length) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (
      rows[index].low >= rows[index - offset].low ||
      rows[index].low > rows[index + offset].low
    ) {
      return false;
    }
  }
  return true;
}

function sessionHours(session: SmcSession) {
  return session === "london"
    ? { start: 7, end: 11, tradeEnd: 14 }
    : { start: 12, end: 16, tradeEnd: 20 };
}

function overlaps(row: Kline, low: number, high: number) {
  return row.low <= high && row.high >= low;
}

function latestClosedAtr(
  rows: Kline[],
  values: Array<number | null>,
  timestamp: number
) {
  const index = lowerBound(rows, timestamp) - 1;
  return index >= 0 ? values[index] : null;
}

function h1DealingRange(oneHour: Kline[], timestamp: number, lookback = 20) {
  const end = lowerBound(oneHour, timestamp);
  const rows = oneHour.slice(Math.max(0, end - lookback), end);
  if (rows.length < lookback) return null;
  const high = Math.max(...rows.map((row) => row.high));
  const low = Math.min(...rows.map((row) => row.low));
  return { high, low, midpoint: (high + low) / 2 };
}

function findOrderBlock(
  rows: Kline[],
  raidIndex: number,
  shiftIndex: number,
  direction: SmcDirection
): Zone | null {
  for (let index = shiftIndex - 1; index >= Math.max(raidIndex, shiftIndex - 8); index -= 1) {
    const row = rows[index];
    const opposite =
      direction === "long" ? row.close < row.open : row.close > row.open;
    if (opposite) {
      return {
        model: "order_block",
        low: row.low,
        high: row.high,
        formedIndex: shiftIndex,
        formedTime: rows[shiftIndex].openTime,
      };
    }
  }
  return null;
}

function findFvg(
  rows: Kline[],
  shiftIndex: number,
  direction: SmcDirection
): Zone | null {
  for (
    let index = Math.max(shiftIndex, 2);
    index <= Math.min(rows.length - 1, shiftIndex + 3);
    index += 1
  ) {
    const candle1 = rows[index - 2];
    const candle3 = rows[index];
    if (direction === "long" && candle1.high < candle3.low) {
      return {
        model: "fvg",
        low: candle1.high,
        high: candle3.low,
        formedIndex: index,
        formedTime: candle3.openTime,
      };
    }
    if (direction === "short" && candle1.low > candle3.high) {
      return {
        model: "fvg",
        low: candle3.high,
        high: candle1.low,
        formedIndex: index,
        formedTime: candle3.openTime,
      };
    }
  }
  return null;
}

function chooseZone(
  fvg: Zone | null,
  orderBlock: Zone | null,
  model: SmcEntryModel
) {
  if (model === "fvg") return fvg;
  if (model === "order_block") return orderBlock;
  if (!fvg) return orderBlock;
  if (!orderBlock) return fvg;
  return fvg.formedIndex <= orderBlock.formedIndex ? fvg : orderBlock;
}

function resolveTrade(
  trade: Omit<
    SmcSessionRaidTrade,
    "exitTime" | "exitPrice" | "result" | "profit" | "rMultiple"
  >,
  oneMinute: Kline[],
  exitCutoff: number
) {
  const riskDistance = Math.abs(trade.entryPrice - trade.stopLoss);
  const quantity = trade.riskAmount / riskDistance;
  const start = lowerBound(oneMinute, trade.entryTime);
  const end = lowerBound(oneMinute, exitCutoff);
  for (let index = start; index < Math.min(end, oneMinute.length); index += 1) {
    const row = oneMinute[index];
    const hitStop =
      trade.direction === "long"
        ? row.low <= trade.stopLoss
        : row.high >= trade.stopLoss;
    const hitTarget =
      trade.direction === "long"
        ? row.high >= trade.takeProfit
        : row.low <= trade.takeProfit;
    if (!hitStop && !hitTarget) continue;
    const exitPrice = hitStop ? trade.stopLoss : trade.takeProfit;
    const profit =
      trade.direction === "long"
        ? (exitPrice - trade.entryPrice) * quantity
        : (trade.entryPrice - exitPrice) * quantity;
    return {
      ...trade,
      exitTime: row.openTime,
      exitPrice,
      result: hitStop ? "SL" : "TP",
      profit,
      rMultiple: profit / trade.riskAmount,
    } satisfies SmcSessionRaidTrade;
  }
  const last = oneMinute[Math.max(start, Math.min(oneMinute.length - 1, end - 1))];
  const exitPrice = last?.close ?? trade.entryPrice;
  const profit =
    trade.direction === "long"
      ? (exitPrice - trade.entryPrice) * quantity
      : (trade.entryPrice - exitPrice) * quantity;
  return {
    ...trade,
    exitTime: last?.openTime ?? trade.entryTime,
    exitPrice,
    result: "TIME",
    profit,
    rMultiple: profit / trade.riskAmount,
  } satisfies SmcSessionRaidTrade;
}

export function prepareSmcSessionRaidData(oneMinute: Kline[]): PreparedSmcData {
  const sorted = [...oneMinute].sort((left, right) => left.openTime - right.openTime);
  const fiveMinute = aggregateKlines(sorted, "5m");
  const oneHour = aggregateKlines(sorted, "1h");
  const grouped = new Map<number, Kline[]>();
  for (const row of fiveMinute) {
    const start = dayStart(row.openTime);
    grouped.set(start, [...(grouped.get(start) ?? []), row]);
  }
  const rawDays = [...grouped.entries()].sort(([left], [right]) => left - right);
  let previousDayHigh: number | null = null;
  let previousDayLow: number | null = null;
  const days = rawDays.map(([start, rows]) => {
    const result = { start, rows, previousDayHigh, previousDayLow };
    previousDayHigh = Math.max(...rows.map((row) => row.high));
    previousDayLow = Math.min(...rows.map((row) => row.low));
    return result;
  });
  return {
    oneMinute: sorted,
    fiveMinute,
    oneHour,
    fiveMinuteAtr: atrSeries(fiveMinute),
    oneHourAtr: atrSeries(oneHour),
    days,
  };
}

export function runSmcSessionRaidBacktest(
  symbol: string,
  data: PreparedSmcData,
  config: SmcSessionRaidConfig,
  start: number,
  end: number,
  initialCapital = 10_000,
  riskPercent = 1
) {
  const trades: SmcSessionRaidTrade[] = [];
  let equity = initialCapital;
  const hours = sessionHours(config.session);

  for (const day of data.days) {
    if (day.start < start || day.start >= end) continue;
    const asian = day.rows.filter(
      (row) => row.openTime >= day.start && row.openTime < day.start + 7 * HOUR
    );
    if (asian.length < 60) continue;
    const asianHigh = Math.max(...asian.map((row) => row.high));
    const asianLow = Math.min(...asian.map((row) => row.low));
    const sessionStart = day.start + hours.start * HOUR;
    const sessionEnd = day.start + hours.end * HOUR;
    const tradeEnd = day.start + hours.tradeEnd * HOUR;
    const h1Atr = latestClosedAtr(data.oneHour, data.oneHourAtr, sessionStart);
    if (h1Atr == null || h1Atr <= 0) continue;

    const levels: Array<{
      source: "asian" | "previous_day";
      high: number;
      low: number;
    }> = [];
    if (config.liquiditySource !== "previous_day") {
      levels.push({ source: "asian", high: asianHigh, low: asianLow });
    }
    if (
      config.liquiditySource !== "asian" &&
      day.previousDayHigh != null &&
      day.previousDayLow != null
    ) {
      levels.push({
        source: "previous_day",
        high: day.previousDayHigh,
        low: day.previousDayLow,
      });
    }

    let opened = false;
    for (const level of levels) {
      if (opened) break;
      const sessionRows = day.rows.filter(
        (row) => row.openTime >= sessionStart && row.openTime < sessionEnd
      );
      for (const raidRow of sessionRows) {
        const raidIndex = day.rows.indexOf(raidRow);
        const highDepth = raidRow.high - level.high;
        const lowDepth = level.low - raidRow.low;
        const sweptHigh =
          raidRow.high > level.high &&
          raidRow.close < level.high &&
          highDepth >= config.minRaidAtrMultiple * h1Atr;
        const sweptLow =
          raidRow.low < level.low &&
          raidRow.close > level.low &&
          lowDepth >= config.minRaidAtrMultiple * h1Atr;
        if (sweptHigh === sweptLow) continue;
        const direction: SmcDirection = sweptLow ? "long" : "short";
        const dealingRange = h1DealingRange(data.oneHour, raidRow.openTime);
        if (
          config.biasFilter === "premium_discount" &&
          dealingRange &&
          (direction === "long"
            ? raidRow.low > dealingRange.midpoint
            : raidRow.high < dealingRange.midpoint)
        ) {
          continue;
        }

        let swingLevel: number | null = null;
        let shiftIndex = -1;
        let displacementAtr = 0;
        const searchStart = Math.max(0, raidIndex - 12);
        for (let index = searchStart; index < day.rows.length; index += 1) {
          if (day.rows[index].openTime >= sessionEnd) break;
          const confirmed = index - config.swingStrength;
          if (confirmed >= searchStart) {
            if (direction === "long" && isPivotHigh(day.rows, confirmed, config.swingStrength)) {
              swingLevel = day.rows[confirmed].high;
            }
            if (direction === "short" && isPivotLow(day.rows, confirmed, config.swingStrength)) {
              swingLevel = day.rows[confirmed].low;
            }
          }
          if (index <= raidIndex || swingLevel == null) continue;
          const globalIndex = lowerBound(data.fiveMinute, day.rows[index].openTime);
          const atr5m = data.fiveMinuteAtr[globalIndex];
          if (atr5m == null || atr5m <= 0) continue;
          const body = Math.abs(day.rows[index].close - day.rows[index].open);
          const directionalBody =
            direction === "long"
              ? day.rows[index].close > day.rows[index].open
              : day.rows[index].close < day.rows[index].open;
          const broke =
            direction === "long"
              ? day.rows[index].close > swingLevel
              : day.rows[index].close < swingLevel;
          if (
            directionalBody &&
            broke &&
            body >= config.displacementAtrMultiple * atr5m
          ) {
            shiftIndex = index;
            displacementAtr = body / atr5m;
            break;
          }
        }
        if (shiftIndex < 0 || swingLevel == null) continue;

        const fvg = findFvg(day.rows, shiftIndex, direction);
        const orderBlock = findOrderBlock(day.rows, raidIndex, shiftIndex, direction);
        const zone = chooseZone(fvg, orderBlock, config.entryModel);
        if (!zone) continue;
        const expiryIndex = Math.min(
          day.rows.length - 2,
          zone.formedIndex + config.entryExpiryBars
        );
        for (let testIndex = zone.formedIndex + 1; testIndex <= expiryIndex; testIndex += 1) {
          const testRow = day.rows[testIndex];
          if (testRow.openTime >= sessionEnd || !overlaps(testRow, zone.low, zone.high)) continue;
          const entryRow = day.rows[testIndex + 1];
          if (!entryRow || entryRow.openTime >= sessionEnd) break;
          const globalIndex = lowerBound(data.fiveMinute, entryRow.openTime);
          const atr5m = data.fiveMinuteAtr[globalIndex] ?? 0;
          const raidExtreme = direction === "long" ? raidRow.low : raidRow.high;
          const stopLoss =
            direction === "long"
              ? raidExtreme - config.stopBufferAtrMultiple * atr5m
              : raidExtreme + config.stopBufferAtrMultiple * atr5m;
          const entryPrice = entryRow.open;
          const stopIsValid =
            direction === "long" ? stopLoss < entryPrice : stopLoss > entryPrice;
          if (!stopIsValid) break;
          const riskDistance = Math.abs(entryPrice - stopLoss);
          if (riskDistance <= 0 || riskDistance / pipSize(symbol) < config.minRiskPips) break;
          const takeProfit =
            direction === "long"
              ? entryPrice + config.rewardR * riskDistance
              : entryPrice - config.rewardR * riskDistance;
          const base = {
            symbol,
            direction,
            session: config.session,
            liquiditySource: level.source,
            entryModel: zone.model,
            liquidityLevel: direction === "long" ? level.low : level.high,
            raidTime: raidRow.openTime,
            raidExtreme,
            raidDepthAtr: (direction === "long" ? lowDepth : highDepth) / h1Atr,
            shiftTime: day.rows[shiftIndex].openTime,
            shiftLevel: swingLevel,
            displacementAtr,
            zoneFormedTime: zone.formedTime,
            zoneLow: zone.low,
            zoneHigh: zone.high,
            zoneTestTime: testRow.openTime,
            entryTime: entryRow.openTime,
            entryPrice,
            stopLoss,
            takeProfit,
            riskAmount: equity * (riskPercent / 100),
          };
          const trade = resolveTrade(base, data.oneMinute, tradeEnd);
          trades.push(trade);
          equity += trade.profit;
          opened = true;
          break;
        }
        if (opened) break;
      }
    }
  }
  return trades;
}

export function smcMetrics(
  trades: SmcSessionRaidTrade[],
  symbol: string,
  executionCostPips = 0,
  initialCapital = 10_000
) {
  let equity = initialCapital;
  let peak = equity;
  let maxDrawdownPct = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let totalR = 0;
  for (const trade of trades) {
    const riskPips = Math.abs(trade.entryPrice - trade.stopLoss) / pipSize(symbol);
    const adjustedR =
      trade.rMultiple - (riskPips > 0 ? executionCostPips / riskPips : 0);
    const profit = equity * 0.01 * adjustedR;
    totalR += adjustedR;
    equity += profit;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((equity - peak) / peak) * 100);
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
    losers: trades.length - winners,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    netProfit: equity - initialCapital,
    returnPct: (equity / initialCapital - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length ? totalR / trades.length : 0,
    maxDrawdownPct,
    maxLossStreak,
    finalEquity: equity,
  };
}
