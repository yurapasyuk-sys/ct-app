import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Kline } from "../src/lib/binance";
import { fetchKlinesMultiBatch } from "../src/lib/binance";
import { aggregateKlines } from "../src/lib/data-handlers/local-csv-market-data";

type Direction = "long" | "short";
type DirectionMode = "all" | "long_only" | "short_only";
type Timeframe = "1h" | "4h";

interface Trade {
  symbol: string;
  strategy: string;
  variant: string;
  timeframe: Timeframe;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  riskAmount: number;
  riskDistance: number;
  profit: number;
  costAdjustedProfit: number;
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
  returnPercent: number;
  cost10BpsNetProfit: number;
  cost10BpsReturnPercent: number;
  profitFactor: number;
  cost10BpsProfitFactor: number;
  expectancyR: number;
  maxDrawdown: number;
  maxLossStreak: number;
  top3ProfitPercent: number;
  volumeFilter: string;
  score: number;
  tradesList: Trade[];
}

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE = 0.01;
const COST_RATE = 0.001;
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-24T00:00:00Z");
const WARMUP = Date.parse("2025-09-01T00:00:00Z");
const ONE_HOUR_MS = 60 * 60 * 1000;

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "LINKUSDT",
  "AVAXUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "TRXUSDT",
  "DOTUSDT",
  "APTUSDT",
  "OPUSDT",
  "ARBUSDT",
  "SUIUSDT",
  "PEPEUSDT",
  "WIFUSDT",
  "INJUSDT",
];

const SYMBOLS = (
  process.env.CRYPTO_SYMBOLS?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) ??
  DEFAULT_SYMBOLS
);

function iso(time: number) {
  return new Date(time).toISOString();
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

    if (index > period) {
      sum -= trueRange(rows[index - period], rows[index - period - 1]);
    }

    if (index >= period) {
      values[index] = sum / period;
    }
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

function buildSma(values: number[], period: number) {
  const result: Array<number | null> = Array(values.length).fill(null);
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  }

  return result;
}

function buildRsi(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length <= period) return values;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  values[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let index = period + 1; index < rows.length; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    values[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return values;
}

function highest(rows: Kline[], start: number, end: number) {
  let value = -Infinity;
  for (let index = Math.max(0, start); index < end; index += 1) {
    value = Math.max(value, rows[index].high);
  }
  return value;
}

function lowest(rows: Kline[], start: number, end: number) {
  let value = Infinity;
  for (let index = Math.max(0, start); index < end; index += 1) {
    value = Math.min(value, rows[index].low);
  }
  return value;
}

function directionAllowed(mode: DirectionMode, direction: Direction) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";
  return true;
}

function profitFor(direction: Direction, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function closeLocation(row: Kline) {
  const range = row.high - row.low;
  return range > 0 ? (row.close - row.low) / range : 0.5;
}

function summarize(
  symbol: string,
  strategy: string,
  variant: string,
  timeframe: Timeframe,
  volumeFilter: string,
  trades: Trade[]
): Summary {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  let costEquity = INITIAL_CAPITAL;
  let grossProfit = 0;
  let grossLoss = 0;
  let costGrossProfit = 0;
  let costGrossLoss = 0;
  let wins = 0;
  let rSum = 0;
  let currentLossStreak = 0;
  let maxLossStreak = 0;

  for (const trade of trades) {
    equity += trade.profit;
    costEquity += trade.costAdjustedProfit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    rSum += trade.rMultiple;

    if (trade.profit > 0) {
      wins += 1;
      grossProfit += trade.profit;
      currentLossStreak = 0;
    } else {
      if (trade.profit < 0) grossLoss += trade.profit;
      currentLossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    }

    if (trade.costAdjustedProfit > 0) costGrossProfit += trade.costAdjustedProfit;
    if (trade.costAdjustedProfit < 0) costGrossLoss += trade.costAdjustedProfit;
  }

  const netProfit = equity - INITIAL_CAPITAL;
  const cost10BpsNetProfit = costEquity - INITIAL_CAPITAL;
  const returnPercent = (netProfit / INITIAL_CAPITAL) * 100;
  const cost10BpsReturnPercent = (cost10BpsNetProfit / INITIAL_CAPITAL) * 100;
  const positiveProfits = trades.map((trade) => trade.profit).filter((value) => value > 0).sort((a, b) => b - a);
  const top3Profit = positiveProfits.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const top3ProfitPercent = netProfit > 0 ? (top3Profit / netProfit) * 100 : 0;
  const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
  const cost10BpsProfitFactor =
    costGrossLoss < 0 ? costGrossProfit / Math.abs(costGrossLoss) : costGrossProfit > 0 ? Infinity : 0;
  const score =
    cost10BpsReturnPercent +
    Math.max(0, cost10BpsProfitFactor - 1) * 25 -
    Math.max(0, maxLossStreak - 4) * 12 -
    Math.max(0, 20 - trades.length) * 2 -
    Math.max(0, top3ProfitPercent - 65) * 0.4 +
    Math.min(0, maxDrawdown / 100) * 0.25;

  return {
    symbol,
    strategy,
    variant,
    timeframe,
    trades: trades.length,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    netProfit,
    returnPercent,
    cost10BpsNetProfit,
    cost10BpsReturnPercent,
    profitFactor,
    cost10BpsProfitFactor,
    expectancyR: trades.length ? rSum / trades.length : 0,
    maxDrawdown,
    maxLossStreak,
    top3ProfitPercent,
    volumeFilter,
    score,
    tradesList: [],
  };
}

function finalizeTrade(
  position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
  },
  symbol: string,
  strategy: string,
  variant: string,
  timeframe: Timeframe,
  exitTime: number,
  exitPrice: number,
  exitReason: string
): Trade {
  const profit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
  const notional = position.entryPrice * position.quantity;
  const costAdjustedProfit = profit - notional * COST_RATE;

  return {
    symbol,
    strategy,
    variant,
    timeframe,
    direction: position.direction,
    entryTime: position.entryTime,
    exitTime,
    entryPrice: position.entryPrice,
    exitPrice,
    stopLoss: position.stopLoss,
    riskAmount: position.riskAmount,
    riskDistance: position.riskDistance,
    profit,
    costAdjustedProfit,
    rMultiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
    exitReason,
  };
}

function runExpansionBreakout(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    channel: number;
    atrPeriod: number;
    emaFast: number;
    emaSlow: number;
    volPeriod: number;
    volMult: number;
    rangeMult: number;
    stop: number;
    targetR: number;
    maxBars: number;
    mode: DirectionMode;
    requireVolume: boolean;
  }
) {
  const strategy = "range_expansion_breakout";
  const volumeFilter = params.requireVolume ? `volume>${params.volMult}xSMA${params.volPeriod}` : "none";
  const variant = `ch${params.channel}_rng${params.rangeMult}_stop${params.stop}_target${params.targetR}_hold${params.maxBars}_${params.mode}_${volumeFilter}`;
  const atr = buildAtr(rows, params.atrPeriod);
  const emaFast = buildEma(rows, params.emaFast);
  const emaSlow = buildEma(rows, params.emaSlow);
  const volumeSma = buildSma(rows.map((row) => row.volume), params.volPeriod);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    target: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
    barsHeld: number;
  } | null = null;

  for (
    let index = Math.max(params.channel, params.atrPeriod, params.emaFast, params.emaSlow, params.volPeriod) + 1;
    index < rows.length;
    index += 1
  ) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      position.barsHeld += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.barsHeld >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.target : current.close;
        const trade = finalizeTrade(position, symbol, strategy, variant, timeframe, current.openTime, exitPrice, hitStop ? "stop_loss" : hitTarget ? "target" : "time_exit");
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const atrValue = atr[signalIndex];
    const volumeAverage = volumeSma[signalIndex];
    const fast = emaFast[signalIndex];
    const slow = emaSlow[signalIndex];
    if (atrValue == null || volumeAverage == null || fast == null || slow == null || atrValue <= 0) continue;

    const upperBreak = highest(rows, signalIndex - params.channel, signalIndex);
    const lowerBreak = lowest(rows, signalIndex - params.channel, signalIndex);
    const rangeOk = signal.high - signal.low >= atrValue * params.rangeMult;
    const volumeOk = !params.requireVolume || signal.volume >= volumeAverage * params.volMult;
    const direction =
      signal.close > upperBreak && signal.close > signal.open && closeLocation(signal) >= 0.7 && fast > slow
        ? "long"
        : signal.close < lowerBreak && signal.close < signal.open && closeLocation(signal) <= 0.3 && fast < slow
          ? "short"
          : null;

    if (!direction || !rangeOk || !volumeOk || !directionAllowed(params.mode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    const riskAmount = equity * RISK_PER_TRADE;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      target: direction === "long" ? entryPrice + riskDistance * params.targetR : entryPrice - riskDistance * params.targetR,
      riskAmount,
      riskDistance,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
    };
  }

  return summarize(symbol, strategy, variant, timeframe, volumeFilter, trades);
}

function runSqueezeContinuation(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    channel: number;
    compression: number;
    atrPeriod: number;
    ema: number;
    volPeriod: number;
    volMult: number;
    stop: number;
    targetR: number;
    maxBars: number;
    mode: DirectionMode;
    requireVolume: boolean;
  }
) {
  const strategy = "atr_squeeze_continuation";
  const volumeFilter = params.requireVolume ? `volume>${params.volMult}xSMA${params.volPeriod}` : "none";
  const variant = `ch${params.channel}_cmp${params.compression}_stop${params.stop}_target${params.targetR}_hold${params.maxBars}_${params.mode}_${volumeFilter}`;
  const atr = buildAtr(rows, params.atrPeriod);
  const ema = buildEma(rows, params.ema);
  const volumeSma = buildSma(rows.map((row) => row.volume), params.volPeriod);
  const atrPctSma = buildSma(rows.map((row, index) => ((atr[index] ?? 0) / row.close) * 100), params.channel);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    target: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
    barsHeld: number;
  } | null = null;

  for (
    let index = Math.max(params.channel, params.atrPeriod, params.ema, params.volPeriod) + 1;
    index < rows.length;
    index += 1
  ) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      position.barsHeld += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.barsHeld >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.target : current.close;
        const trade = finalizeTrade(position, symbol, strategy, variant, timeframe, current.openTime, exitPrice, hitStop ? "stop_loss" : hitTarget ? "target" : "time_exit");
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const atrValue = atr[signalIndex];
    const atrAveragePct = atrPctSma[signalIndex];
    const emaValue = ema[signalIndex];
    const volumeAverage = volumeSma[signalIndex];
    if (atrValue == null || atrAveragePct == null || emaValue == null || volumeAverage == null || atrValue <= 0) continue;

    const atrPct = (atrValue / signal.close) * 100;
    const compressed = atrPct <= atrAveragePct * params.compression;
    const upperBreak = highest(rows, signalIndex - params.channel, signalIndex);
    const lowerBreak = lowest(rows, signalIndex - params.channel, signalIndex);
    const volumeOk = !params.requireVolume || signal.volume >= volumeAverage * params.volMult;
    const direction =
      signal.close > upperBreak && signal.close > emaValue
        ? "long"
        : signal.close < lowerBreak && signal.close < emaValue
          ? "short"
          : null;

    if (!direction || !compressed || !volumeOk || !directionAllowed(params.mode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    const riskAmount = equity * RISK_PER_TRADE;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      target: direction === "long" ? entryPrice + riskDistance * params.targetR : entryPrice - riskDistance * params.targetR,
      riskAmount,
      riskDistance,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
    };
  }

  return summarize(symbol, strategy, variant, timeframe, volumeFilter, trades);
}

function runReclaimReversal(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    sweep: number;
    atrPeriod: number;
    rsiPeriod: number;
    volPeriod: number;
    volMult: number;
    stop: number;
    targetR: number;
    maxBars: number;
    mode: DirectionMode;
    requireVolume: boolean;
  }
) {
  const strategy = "liquidity_reclaim_reversal";
  const volumeFilter = params.requireVolume ? `volume>${params.volMult}xSMA${params.volPeriod}` : "none";
  const variant = `sweep${params.sweep}_rsi${params.rsiPeriod}_stop${params.stop}_target${params.targetR}_hold${params.maxBars}_${params.mode}_${volumeFilter}`;
  const atr = buildAtr(rows, params.atrPeriod);
  const rsi = buildRsi(rows, params.rsiPeriod);
  const volumeSma = buildSma(rows.map((row) => row.volume), params.volPeriod);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    target: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
    barsHeld: number;
  } | null = null;

  for (
    let index = Math.max(params.sweep, params.atrPeriod, params.rsiPeriod, params.volPeriod) + 1;
    index < rows.length;
    index += 1
  ) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      position.barsHeld += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.barsHeld >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.target : current.close;
        const trade = finalizeTrade(position, symbol, strategy, variant, timeframe, current.openTime, exitPrice, hitStop ? "stop_loss" : hitTarget ? "target" : "time_exit");
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const atrValue = atr[signalIndex];
    const rsiValue = rsi[signalIndex];
    const volumeAverage = volumeSma[signalIndex];
    if (atrValue == null || rsiValue == null || volumeAverage == null || atrValue <= 0) continue;

    const priorLow = lowest(rows, signalIndex - params.sweep, signalIndex);
    const priorHigh = highest(rows, signalIndex - params.sweep, signalIndex);
    const volumeOk = !params.requireVolume || signal.volume >= volumeAverage * params.volMult;
    const direction =
      signal.low < priorLow && signal.close > priorLow && closeLocation(signal) >= 0.55 && rsiValue < 50
        ? "long"
        : signal.high > priorHigh && signal.close < priorHigh && closeLocation(signal) <= 0.45 && rsiValue > 50
          ? "short"
          : null;

    if (!direction || !volumeOk || !directionAllowed(params.mode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = Math.max(atrValue * params.stop, Math.abs(entryPrice - (direction === "long" ? signal.low : signal.high)));
    const riskAmount = equity * RISK_PER_TRADE;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      target: direction === "long" ? entryPrice + riskDistance * params.targetR : entryPrice - riskDistance * params.targetR,
      riskAmount,
      riskDistance,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
    };
  }

  return summarize(symbol, strategy, variant, timeframe, volumeFilter, trades);
}

async function fetchSymbol(symbol: string) {
  const candlesNeeded = Math.ceil((END - WARMUP) / ONE_HOUR_MS) + 500;
  const rows = await fetchKlinesMultiBatch(
    {
      symbol,
      interval: "1h",
      endTime: END,
      limit: 300,
      dataSource: "okx-swap",
    },
    candlesNeeded
  );

  return rows.filter((row) => row.openTime >= WARMUP && row.openTime < END);
}

function csvRows(rows: Summary[]) {
  const headers = [
    "rank",
    "symbol",
    "strategy",
    "variant",
    "timeframe",
    "trades",
    "win_rate",
    "net_profit",
    "return_percent",
    "cost_10bps_net_profit",
    "cost_10bps_return_percent",
    "profit_factor",
    "cost_10bps_profit_factor",
    "expectancy_r",
    "max_drawdown",
    "max_loss_streak",
    "top3_profit_percent",
    "volume_filter",
    "score",
  ];

  return [
    headers,
    ...rows.map((row, index) => [
      index + 1,
      row.symbol,
      row.strategy,
      row.variant,
      row.timeframe,
      row.trades,
      row.winRate.toFixed(2),
      row.netProfit.toFixed(2),
      row.returnPercent.toFixed(2),
      row.cost10BpsNetProfit.toFixed(2),
      row.cost10BpsReturnPercent.toFixed(2),
      Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Infinity",
      Number.isFinite(row.cost10BpsProfitFactor) ? row.cost10BpsProfitFactor.toFixed(2) : "Infinity",
      row.expectancyR.toFixed(3),
      row.maxDrawdown.toFixed(2),
      row.maxLossStreak,
      row.top3ProfitPercent.toFixed(2),
      row.volumeFilter,
      row.score.toFixed(2),
    ]),
  ];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summaries: Summary[] = [];
  const bySymbol = new Map<string, { oneHour: Kline[]; fourHour: Kline[] }>();

  for (const symbol of SYMBOLS) {
    try {
      const oneHour = await fetchSymbol(symbol);
      if (oneHour.length < 1_500) {
        console.warn(`${symbol}: skipped, only ${oneHour.length} 1H candles`);
        continue;
      }

      bySymbol.set(symbol, {
        oneHour,
        fourHour: aggregateKlines(oneHour, "4h"),
      });
      console.log(`${symbol}: loaded ${oneHour.length} 1H candles`);
    } catch (error) {
      console.warn(`${symbol}: fetch failed`, error instanceof Error ? error.message : error);
    }
  }

  for (const [symbol, frames] of bySymbol) {
    const frameEntries: Array<[Timeframe, Kline[]]> = [
      ["1h", frames.oneHour],
      ["4h", frames.fourHour],
    ];

    for (const [timeframe, rows] of frameEntries) {
      for (const channel of timeframe === "1h" ? [12, 20, 36, 55] : [10, 14, 20, 30]) {
        for (const rangeMult of [0.9, 1.1, 1.35, 1.6]) {
          for (const stop of [0.7, 1, 1.3, 1.7]) {
            for (const targetR of [1.5, 2, 2.5, 3]) {
              for (const maxBars of timeframe === "1h" ? [8, 16, 32, 64] : [4, 8, 16, 32]) {
                for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                  for (const requireVolume of [true, false]) {
                    summaries.push(runExpansionBreakout(symbol, rows, timeframe, {
                      channel,
                      atrPeriod: 14,
                      emaFast: 34,
                      emaSlow: 144,
                      volPeriod: 30,
                      volMult: 1.4,
                      rangeMult,
                      stop,
                      targetR,
                      maxBars,
                      mode,
                      requireVolume,
                    }));
                  }
                }
              }
            }
          }
        }
      }

      for (const channel of timeframe === "1h" ? [20, 36, 55, 80] : [10, 14, 20, 30]) {
        for (const compression of [0.7, 0.85, 1]) {
          for (const stop of [0.8, 1.1, 1.5, 2]) {
            for (const targetR of [1.5, 2, 2.5, 3.5]) {
              for (const maxBars of timeframe === "1h" ? [12, 24, 48, 96] : [6, 12, 24, 48]) {
                for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                  for (const requireVolume of [true, false]) {
                    summaries.push(runSqueezeContinuation(symbol, rows, timeframe, {
                      channel,
                      compression,
                      atrPeriod: 14,
                      ema: 100,
                      volPeriod: 30,
                      volMult: 1.25,
                      stop,
                      targetR,
                      maxBars,
                      mode,
                      requireVolume,
                    }));
                  }
                }
              }
            }
          }
        }
      }

      for (const sweep of timeframe === "1h" ? [12, 24, 48, 72] : [8, 12, 18, 24]) {
        for (const stop of [0.5, 0.8, 1.1, 1.5]) {
          for (const targetR of [1.25, 1.5, 2, 2.5, 3]) {
            for (const maxBars of timeframe === "1h" ? [8, 16, 32, 64] : [4, 8, 16, 32]) {
              for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                for (const requireVolume of [true, false]) {
                  summaries.push(runReclaimReversal(symbol, rows, timeframe, {
                    sweep,
                    atrPeriod: 14,
                    rsiPeriod: 14,
                    volPeriod: 30,
                    volMult: 1.5,
                    stop,
                    targetR,
                    maxBars,
                    mode,
                    requireVolume,
                  }));
                }
              }
            }
          }
        }
      }
    }
  }

  const tested = summaries.filter((summary) => summary.trades >= 8);
  const qualified = tested
    .filter((summary) => summary.returnPercent >= 30 && summary.maxLossStreak <= 5)
    .sort((a, b) => b.score - a.score);
  const qualifiedCostAdjusted = tested
    .filter((summary) => summary.cost10BpsReturnPercent >= 30 && summary.maxLossStreak <= 5)
    .sort((a, b) => b.score - a.score);
  const top = tested.sort((a, b) => b.score - a.score);

  writeCsv(`${OUT_DIR}/crypto_novel_strategy_2026_qualified.csv`, csvRows(qualified));
  writeCsv(`${OUT_DIR}/crypto_novel_strategy_2026_cost_qualified.csv`, csvRows(qualifiedCostAdjusted));
  writeCsv(`${OUT_DIR}/crypto_novel_strategy_2026_top.csv`, csvRows(top.slice(0, 150)));
  writeCsv(`${OUT_DIR}/crypto_novel_strategy_2026_by_return.csv`, csvRows([...tested].sort((a, b) => b.returnPercent - a.returnPercent).slice(0, 150)));

  writeFileSync(
    `${OUT_DIR}/crypto_novel_strategy_2026_results.json`,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        test_start: iso(START),
        test_end: iso(END),
        warmup_start: iso(WARMUP),
        initial_capital: INITIAL_CAPITAL,
        risk_per_trade_percent: RISK_PER_TRADE * 100,
        transaction_cost_model: "10 bps of entry notional per completed trade",
        data_source: "OKX swap 1H, aggregated to 4H",
        symbols: [...bySymbol.keys()],
        tested_count: tested.length,
        qualified_count: qualified.length,
        cost_adjusted_qualified_count: qualifiedCostAdjusted.length,
        top_qualified: qualified.slice(0, 25).map(({ tradesList, ...row }) => row),
        top_cost_adjusted_qualified: qualifiedCostAdjusted.slice(0, 25).map(({ tradesList, ...row }) => row),
        best_trades: [],
      },
      null,
      2
    ),
    "utf8"
  );

  console.table(
    qualified.slice(0, 20).map((row) => ({
      symbol: row.symbol,
      strategy: row.strategy,
      timeframe: row.timeframe,
      trades: row.trades,
      return: `${row.returnPercent.toFixed(2)}%`,
      cost10: `${row.cost10BpsReturnPercent.toFixed(2)}%`,
      maxL: row.maxLossStreak,
      pf: Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Inf",
      volume: row.volumeFilter,
      variant: row.variant,
    }))
  );

  console.log(`Tested variants: ${tested.length}`);
  console.log(`Qualified gross >=30% and max loss streak <=5: ${qualified.length}`);
  console.log(`Qualified cost-adjusted >=30% and max loss streak <=5: ${qualifiedCostAdjusted.length}`);
  console.log(`Saved: ${resolve(`${OUT_DIR}/crypto_novel_strategy_2026_qualified.csv`)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
