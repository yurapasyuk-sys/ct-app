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
  returnPercent: number;
  cost10BpsNetProfit: number;
  cost10BpsReturnPercent: number;
  cost10BpsProfitFactor: number;
  top3ProfitPercent: number;
  score: number;
  tradesList: Trade[];
}

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const WARMUP = Date.parse("2025-10-01T00:00:00Z");
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
];

const SYMBOLS = (process.env.CRYPTO_SYMBOLS?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) ?? DEFAULT_SYMBOLS);

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

function emaAllowed(filter: "none" | "trend" | "countertrend", direction: Direction, close: number, ema: number | null) {
  if (filter === "none") return true;
  if (ema == null) return false;
  if (filter === "trend") return direction === "long" ? close > ema : close < ema;
  return direction === "long" ? close < ema : close > ema;
}

function profitFor(direction: Direction, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function summarize(
  symbol: string,
  strategy: string,
  variant: string,
  timeframe: Timeframe,
  trades: Trade[]
): Summary {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let rSum = 0;
  let costEquity = INITIAL_CAPITAL;
  let costGrossProfit = 0;
  let costGrossLoss = 0;

  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (trade.profit > 0) {
      wins += 1;
      grossProfit += trade.profit;
    } else if (trade.profit < 0) {
      grossLoss += trade.profit;
    }
    rSum += trade.rMultiple;

    const roundTripCost = trade.entryPrice * trade.riskAmount / trade.riskDistance * 0.001;
    const costProfit = trade.profit - roundTripCost;
    costEquity += costProfit;
    if (costProfit > 0) costGrossProfit += costProfit;
    if (costProfit < 0) costGrossLoss += costProfit;
  }

  const netProfit = equity - INITIAL_CAPITAL;
  const cost10BpsNetProfit = costEquity - INITIAL_CAPITAL;
  const positiveProfits = trades.map((trade) => trade.profit).filter((value) => value > 0).sort((a, b) => b - a);
  const top3Profit = positiveProfits.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const top3ProfitPercent = netProfit > 0 ? (top3Profit / netProfit) * 100 : 0;
  const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
  const returnPercent = (netProfit / INITIAL_CAPITAL) * 100;
  const cost10BpsReturnPercent = (cost10BpsNetProfit / INITIAL_CAPITAL) * 100;
  const cost10BpsProfitFactor =
    costGrossLoss < 0 ? costGrossProfit / Math.abs(costGrossLoss) : costGrossProfit > 0 ? Infinity : 0;
  const score =
    cost10BpsReturnPercent +
    Math.max(0, cost10BpsProfitFactor - 1) * 20 +
    Math.min(0, maxDrawdown / 100) * 0.35 -
    Math.max(0, 10 - trades.length) * 4 -
    Math.max(0, top3ProfitPercent - 80) * 0.25;

  return {
    symbol,
    strategy,
    variant,
    timeframe,
    trades: trades.length,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    netProfit,
    profitFactor,
    expectancyR: trades.length ? rSum / trades.length : 0,
    maxDrawdown,
    finalEquity: equity,
    returnPercent,
    cost10BpsNetProfit,
    cost10BpsReturnPercent,
    cost10BpsProfitFactor,
    top3ProfitPercent,
    score,
    tradesList: [],
  };
}

function runBbAtr(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    bb: number;
    dev: number;
    atr: number;
    stop: number;
    maxBars: number;
    mode: DirectionMode;
    ema: number;
    filter: "none" | "trend" | "countertrend";
    exit: "mean" | "opposite_band";
  }
) {
  const atr = buildAtr(rows, params.atr);
  const bands = buildBands(rows, params.bb, params.dev);
  const ema = buildEma(rows, params.ema);
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

  for (let index = Math.max(params.bb, params.atr, params.ema) + 1; index < rows.length; index += 1) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      position.barsHeld += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.barsHeld >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.target : current.close;
        const tradeProfit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
        const trade: Trade = {
          symbol,
          strategy: "bb_atr_reversion",
          variant: `bb${params.bb}_dev${params.dev}_stop${params.stop}_hold${params.maxBars}_${params.mode}_${params.filter}_${params.exit}`,
          timeframe,
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          profit: tradeProfit,
          rMultiple: position.riskAmount > 0 ? tradeProfit / position.riskAmount : 0,
          exitReason: hitStop ? "stop_loss" : hitTarget ? "target" : "time_exit",
        };
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const band = bands[signalIndex];
    const atrValue = atr[signalIndex];
    if (!band || atrValue == null || atrValue <= 0) continue;

    const direction = signal.close < band.lower ? "long" : signal.close > band.upper ? "short" : null;
    if (!direction || !directionAllowed(params.mode, direction)) continue;
    if (!emaAllowed(params.filter, direction, signal.close, ema[signalIndex])) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    if (riskDistance <= 0) continue;

    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      target: params.exit === "opposite_band"
        ? direction === "long"
          ? band.upper
          : band.lower
        : band.mean,
      riskAmount: equity * 0.01,
      riskDistance,
      quantity: (equity * 0.01) / riskDistance,
      barsHeld: 0,
    };
  }

  return summarize(
    symbol,
    "bb_atr_reversion",
    `bb${params.bb}_dev${params.dev}_stop${params.stop}_hold${params.maxBars}_${params.mode}_${params.filter}_${params.exit}`,
    timeframe,
    trades
  );
}

function runDonchian(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    entry: number;
    exit: number;
    atr: number;
    stop: number;
    mode: DirectionMode;
    ema: number;
    filter: "none" | "trend";
  }
) {
  const atr = buildAtr(rows, params.atr);
  const ema = buildEma(rows, params.ema);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
  } | null = null;

  for (let index = Math.max(params.entry, params.exit, params.atr, params.ema) + 1; index < rows.length; index += 1) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      const exitHigh = highest(rows, signalIndex - params.exit, signalIndex);
      const exitLow = lowest(rows, signalIndex - params.exit, signalIndex);
      const channelExit = position.direction === "long" ? signal.close < exitLow : signal.close > exitHigh;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;

      if (channelExit || hitStop) {
        const exitPrice = hitStop ? position.stopLoss : current.open;
        const tradeProfit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
        const trade: Trade = {
          symbol,
          strategy: "donchian_trend",
          variant: `entry${params.entry}_exit${params.exit}_stop${params.stop}_${params.mode}_${params.filter}`,
          timeframe,
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          profit: tradeProfit,
          rMultiple: position.riskAmount > 0 ? tradeProfit / position.riskAmount : 0,
          exitReason: hitStop ? "stop_loss" : "channel_exit",
        };
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const entryHigh = highest(rows, signalIndex - params.entry, signalIndex);
    const entryLow = lowest(rows, signalIndex - params.entry, signalIndex);
    const direction = signal.close > entryHigh ? "long" : signal.close < entryLow ? "short" : null;
    const atrValue = atr[signalIndex];
    if (!direction || atrValue == null || atrValue <= 0) continue;
    if (!directionAllowed(params.mode, direction)) continue;
    if (params.filter === "trend" && !emaAllowed("trend", direction, signal.close, ema[signalIndex])) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      riskAmount: equity * 0.01,
      riskDistance,
      quantity: (equity * 0.01) / riskDistance,
    };
  }

  return summarize(
    symbol,
    "donchian_trend",
    `entry${params.entry}_exit${params.exit}_stop${params.stop}_${params.mode}_${params.filter}`,
    timeframe,
    trades
  );
}

function runRsiAtr(
  symbol: string,
  rows: Kline[],
  timeframe: Timeframe,
  params: {
    rsiPeriod: number;
    low: number;
    high: number;
    atr: number;
    stop: number;
    targetR: number;
    maxBars: number;
    mode: DirectionMode;
    ema: number;
    filter: "none" | "trend" | "countertrend";
  }
) {
  const rsi = buildRsi(rows, params.rsiPeriod);
  const atr = buildAtr(rows, params.atr);
  const ema = buildEma(rows, params.ema);
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

  for (let index = Math.max(params.rsiPeriod, params.atr, params.ema) + 1; index < rows.length; index += 1) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];

    if (position) {
      position.barsHeld += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.barsHeld >= params.maxBars) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.target : current.close;
        const tradeProfit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
        const trade: Trade = {
          symbol,
          strategy: "rsi_atr_reversal",
          variant: `rsi${params.rsiPeriod}_${params.low}_${params.high}_stop${params.stop}_target${params.targetR}_hold${params.maxBars}_${params.mode}_${params.filter}`,
          timeframe,
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          profit: tradeProfit,
          rMultiple: position.riskAmount > 0 ? tradeProfit / position.riskAmount : 0,
          exitReason: hitStop ? "stop_loss" : hitTarget ? "target" : "time_exit",
        };
        trades.push(trade);
        equity += trade.profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;

    const rsiValue = rsi[signalIndex];
    const atrValue = atr[signalIndex];
    if (rsiValue == null || atrValue == null || atrValue <= 0) continue;

    const direction = rsiValue <= params.low ? "long" : rsiValue >= params.high ? "short" : null;
    if (!direction || !directionAllowed(params.mode, direction)) continue;
    if (!emaAllowed(params.filter, direction, signal.close, ema[signalIndex])) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * params.stop;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      target: direction === "long" ? entryPrice + riskDistance * params.targetR : entryPrice - riskDistance * params.targetR,
      riskAmount: equity * 0.01,
      riskDistance,
      quantity: (equity * 0.01) / riskDistance,
      barsHeld: 0,
    };
  }

  return summarize(
    symbol,
    "rsi_atr_reversal",
    `rsi${params.rsiPeriod}_${params.low}_${params.high}_stop${params.stop}_target${params.targetR}_hold${params.maxBars}_${params.mode}_${params.filter}`,
    timeframe,
    trades
  );
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summaries: Summary[] = [];
  const bySymbol = new Map<string, { oneHour: Kline[]; fourHour: Kline[] }>();

  for (const symbol of SYMBOLS) {
    try {
      const oneHour = await fetchSymbol(symbol);
      if (oneHour.length < 1_000) {
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
      for (const bb of [20, 40, 80, 120]) {
        for (const dev of [1.25, 1.5, 1.75, 2, 2.25]) {
          for (const stop of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
            for (const maxBars of timeframe === "1h" ? [12, 24, 48, 96] : [6, 12, 24, 48]) {
              for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                for (const filter of ["none", "trend", "countertrend"] as const) {
                  for (const exit of ["mean", "opposite_band"] as const) {
                    summaries.push(runBbAtr(symbol, rows, timeframe, {
                      bb,
                      dev,
                      atr: 14,
                      stop,
                      maxBars,
                      mode,
                      ema: 200,
                      filter,
                      exit,
                    }));
                  }
                }
              }
            }
          }
        }
      }

      for (const entry of [20, 40, 55, 80, 120]) {
        for (const exit of [10, 20, 40]) {
          if (exit >= entry) continue;
          for (const stop of [1, 1.5, 2, 2.5, 3, 4]) {
            for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
              for (const filter of ["none", "trend"] as const) {
                summaries.push(runDonchian(symbol, rows, timeframe, {
                  entry,
                  exit,
                  atr: 14,
                  stop,
                  mode,
                  ema: 200,
                  filter,
                }));
              }
            }
          }
        }
      }

      for (const rsiPeriod of [7, 14, 21]) {
        for (const low of [20, 25, 30, 35]) {
          const high = 100 - low;
          for (const stop of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
            for (const targetR of [1, 1.5, 2, 3]) {
              for (const maxBars of timeframe === "1h" ? [12, 24, 48, 96] : [6, 12, 24, 48]) {
                for (const mode of ["all", "long_only", "short_only"] as DirectionMode[]) {
                  for (const filter of ["none", "trend", "countertrend"] as const) {
                    summaries.push(runRsiAtr(symbol, rows, timeframe, {
                      rsiPeriod,
                      low,
                      high,
                      atr: 14,
                      stop,
                      targetR,
                      maxBars,
                      mode,
                      ema: 200,
                      filter,
                    }));
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const sorted = summaries
    .filter((summary) => summary.trades >= 6)
    .sort((a, b) => b.score - a.score);
  const topByAsset = [...bySymbol.keys()].flatMap((symbol) =>
    sorted.filter((summary) => summary.symbol === symbol).slice(0, 10)
  );

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
    "cost_10bps_profit_factor",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "top3_profit_percent",
    "score",
  ];

  writeCsv(`${OUT_DIR}/crypto_strategy_search_2026_ytd_top.csv`, [
    headers,
    ...sorted.slice(0, 100).map((row, index) => [
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
      Number.isFinite(row.cost10BpsProfitFactor) ? row.cost10BpsProfitFactor.toFixed(2) : "Infinity",
      Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Infinity",
      row.expectancyR.toFixed(3),
      row.maxDrawdown.toFixed(2),
      row.top3ProfitPercent.toFixed(2),
      row.score.toFixed(2),
    ]),
  ]);

  writeCsv(`${OUT_DIR}/crypto_strategy_search_2026_ytd_top_by_asset.csv`, [
    headers,
    ...topByAsset.map((row, index) => [
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
      Number.isFinite(row.cost10BpsProfitFactor) ? row.cost10BpsProfitFactor.toFixed(2) : "Infinity",
      Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Infinity",
      row.expectancyR.toFixed(3),
      row.maxDrawdown.toFixed(2),
      row.top3ProfitPercent.toFixed(2),
      row.score.toFixed(2),
    ]),
  ]);

  writeFileSync(
    `${OUT_DIR}/crypto_strategy_search_2026_ytd.json`,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        test_start: iso(START),
        test_end: iso(END),
        initial_capital: INITIAL_CAPITAL,
        risk_per_trade_percent: 1,
        data_source: "OKX swap 1H",
        symbols: [...bySymbol.keys()],
        top: sorted.slice(0, 50).map(({ tradesList, ...row }) => row),
      },
      null,
      2
    ),
    "utf8"
  );

  writeCsv(`${OUT_DIR}/crypto_strategy_search_2026_ytd_top_by_return.csv`, [
    headers,
    ...[...summaries]
      .filter((summary) => summary.trades >= 6)
      .sort((a, b) => b.returnPercent - a.returnPercent)
      .slice(0, 100)
      .map((row, index) => [
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
        Number.isFinite(row.cost10BpsProfitFactor) ? row.cost10BpsProfitFactor.toFixed(2) : "Infinity",
        Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Infinity",
        row.expectancyR.toFixed(3),
        row.maxDrawdown.toFixed(2),
        row.top3ProfitPercent.toFixed(2),
        row.score.toFixed(2),
      ]),
  ]);

  console.table(
    sorted.slice(0, 15).map((row) => ({
      symbol: row.symbol,
      strategy: row.strategy,
      timeframe: row.timeframe,
      trades: row.trades,
      return: `${row.returnPercent.toFixed(2)}%`,
      pf: Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : "Inf",
      cost10: `${row.cost10BpsReturnPercent.toFixed(2)}%`,
      wr: `${row.winRate.toFixed(1)}%`,
      dd: row.maxDrawdown.toFixed(0),
      variant: row.variant,
    }))
  );

  console.log(`Saved: ${resolve(`${OUT_DIR}/crypto_strategy_search_2026_ytd_top.csv`)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
