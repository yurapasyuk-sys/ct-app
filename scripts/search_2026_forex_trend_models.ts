import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

const FOREX_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const RISK_PERCENT = 1;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-17T00:00:00.000Z");
const WARMUP_MS = 260 * 24 * 60 * 60 * 1000;

const FILES: Record<string, string> = {
  AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
  EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
};

type Direction = "long" | "short";
type Timeframe = "1h" | "4h";
type ExitMode = "atr_trail" | "ema_exit" | "time_or_trail";

interface TrendConfig {
  timeframe: Timeframe;
  entryLookback: number;
  atrPeriod: number;
  atrMultiplier: number;
  emaPeriod: number;
  maxHoldBars: number;
  exitMode: ExitMode;
  directionMode: "all" | "long_only" | "short_only";
}

interface Trade {
  symbol: string;
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
  result: string;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function loadRows(symbol: string) {
  const file = FILES[symbol];
  const path = `${FOREX_DIR}/${file}`;
  if (!existsSync(path)) throw new Error(`Missing local CSV for ${symbol}: ${path}`);
  return parseLocalCsvKlines(readFileSync(path, "utf8")).filter(
    (row) => row.openTime >= START_TIME - WARMUP_MS && row.openTime < END_TIME
  );
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function buildAtr(rows: Kline[], period: number) {
  return rows.map((_, index) => {
    if (index - period < 0) return null;
    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += trueRange(rows[cursor], rows[cursor - 1]);
    }
    return sum / period;
  });
}

function buildEma(rows: Kline[], period: number) {
  const values = Array.from<number | null>({ length: rows.length }).fill(null);
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

function highestHigh(rows: Kline[], start: number, end: number) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, rows[index].high);
  return value;
}

function lowestLow(rows: Kline[], start: number, end: number) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, rows[index].low);
  return value;
}

function pipSize(symbol: string) {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

function directionAllowed(mode: TrendConfig["directionMode"], direction: Direction) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";
  return true;
}

function profitFor(direction: Direction, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function runTrendBreakout(symbol: string, rows: Kline[], config: TrendConfig) {
  const atr = buildAtr(rows, config.atrPeriod);
  const ema = buildEma(rows, config.emaPeriod);
  const warmup = Math.max(config.entryLookback, config.atrPeriod, config.emaPeriod) + 2;
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
    barsHeld: number;
    highWater: number;
    lowWater: number;
  } | null = null;

  for (let index = warmup; index < rows.length; index += 1) {
    const current = rows[index];
    const signalIndex = index - 1;
    const signal = rows[signalIndex];

    if (position) {
      position.barsHeld += 1;
      const emaExit =
        config.exitMode === "ema_exit" &&
        ema[signalIndex] != null &&
        (position.direction === "long" ? signal.close < (ema[signalIndex] ?? 0) : signal.close > (ema[signalIndex] ?? 0));
      const timeExit = position.barsHeld >= config.maxHoldBars;
      const hitStop =
        position.direction === "long"
          ? current.low <= position.stopLoss
          : current.high >= position.stopLoss;

      if (hitStop || emaExit || timeExit) {
        const exitPrice = emaExit || timeExit ? current.open : position.stopLoss;
        const profit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
        const trade: Trade = {
          symbol,
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          profit,
          rMultiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
          result: hitStop ? "trailing_stop" : emaExit ? "ema_exit" : "time_exit",
        };
        trades.push(trade);
        equity += profit;
        position = null;
      }

      if (position) {
        position.highWater = Math.max(position.highWater, current.high);
        position.lowWater = Math.min(position.lowWater, current.low);

        const atrValue = atr[signalIndex] ?? atr[index] ?? 0;
        if (atrValue > 0 && (config.exitMode === "atr_trail" || config.exitMode === "time_or_trail")) {
          if (position.direction === "long") {
            position.stopLoss = Math.max(position.stopLoss, position.highWater - atrValue * config.atrMultiplier);
          } else {
            position.stopLoss = Math.min(position.stopLoss, position.lowWater + atrValue * config.atrMultiplier);
          }
        }
      }
    }

    if (position) continue;
    if (current.openTime < START_TIME || current.openTime >= END_TIME) continue;
    if (signalIndex - config.entryLookback < 0) continue;
    const atrValue = atr[signalIndex];
    if (atrValue == null || atrValue <= 0) continue;
    if (config.emaPeriod > 0 && ema[signalIndex] == null) continue;

    const channelHigh = highestHigh(rows, signalIndex - config.entryLookback, signalIndex);
    const channelLow = lowestLow(rows, signalIndex - config.entryLookback, signalIndex);
    const emaValue = ema[signalIndex];
    const longSignal = signal.close > channelHigh && (config.emaPeriod <= 0 || signal.close > (emaValue ?? Infinity));
    const shortSignal = signal.close < channelLow && (config.emaPeriod <= 0 || signal.close < (emaValue ?? -Infinity));
    const direction: Direction | null = longSignal ? "long" : shortSignal ? "short" : null;
    if (!direction || !directionAllowed(config.directionMode, direction)) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * config.atrMultiplier;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const riskAmount = equity * (RISK_PERCENT / 100);
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      riskAmount,
      riskDistance,
      quantity: riskAmount / riskDistance,
      barsHeld: 0,
      highWater: current.high,
      lowWater: current.low,
    };
  }

  if (position) {
    const last = rows[rows.length - 1];
    const profit = profitFor(position.direction, position.entryPrice, last.close, position.quantity);
    trades.push({
      symbol,
      direction: position.direction,
      entryTime: position.entryTime,
      exitTime: last.openTime,
      entryPrice: position.entryPrice,
      exitPrice: last.close,
      stopLoss: position.stopLoss,
      riskAmount: position.riskAmount,
      riskDistance: position.riskDistance,
      profit,
      rMultiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
      result: "open_at_end",
    });
  }

  return trades;
}

function metrics(symbol: string, trades: Trade[]) {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  const winners = trades.filter((trade) => trade.profit > 0);
  const losers = trades.filter((trade) => trade.profit < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.profit, 0);
  const grossLoss = losers.reduce((sum, trade) => sum + trade.profit, 0);
  const netProfit = equity - INITIAL_CAPITAL;
  const costAdjusted = (costPips: number) => {
    let adjustedEquity = INITIAL_CAPITAL;
    for (const trade of trades) {
      const costR = costPips / (trade.riskDistance / pipSize(symbol));
      adjustedEquity += (trade.rMultiple - costR) * trade.riskAmount;
    }
    return adjustedEquity - INITIAL_CAPITAL;
  };
  const top3 = [...trades].sort((a, b) => b.profit - a.profit).slice(0, 3).reduce((sum, trade) => sum + Math.max(0, trade.profit), 0);
  return {
    trades: trades.length,
    winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
    netProfit,
    returnPct: (netProfit / INITIAL_CAPITAL) * 100,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length : 0,
    maxDrawdown,
    cost05Net: costAdjusted(0.5),
    cost1Net: costAdjusted(1),
    top3Pct: netProfit > 0 ? (top3 / netProfit) * 100 : 0,
  };
}

function variantKey(config: TrendConfig) {
  return [
    config.timeframe,
    `don${config.entryLookback}`,
    `atr${config.atrMultiplier}`,
    `ema${config.emaPeriod}`,
    `hold${config.maxHoldBars}`,
    config.exitMode,
    config.directionMode,
  ].join("_");
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const symbols = Object.keys(FILES);
  const rowsBySymbol = new Map<string, Record<Timeframe, Kline[]>>();
  for (const symbol of symbols) {
    const rows = loadRows(symbol);
    rowsBySymbol.set(symbol, {
      "1h": aggregateKlines(rows, "1h"),
      "4h": aggregateKlines(rows, "4h"),
    });
  }

  const configs: TrendConfig[] = [];
  for (const timeframe of ["1h", "4h"] as const) {
    for (const entryLookback of [20, 40, 60, 80, 100]) {
      for (const atrMultiplier of [0.75, 1, 1.25, 1.5, 2, 2.5]) {
        for (const emaPeriod of [0, 50, 100, 200]) {
          for (const maxHoldBars of timeframe === "1h" ? [24, 48, 96, 168] : [12, 24, 36, 48]) {
            for (const exitMode of ["atr_trail", "ema_exit", "time_or_trail"] as const) {
              configs.push({
                timeframe,
                entryLookback,
                atrPeriod: 14,
                atrMultiplier,
                emaPeriod,
                maxHoldBars,
                exitMode,
                directionMode: "all",
              });
            }
          }
        }
      }
    }
  }

  const rows: unknown[][] = [[
    "variant",
    "symbol",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "cost_0_5_net_profit",
    "cost_1_0_net_profit",
    "top_3_profit_pct",
  ]];
  const grouped = new Map<string, Array<ReturnType<typeof metrics> & { symbol: string }>>();

  for (const config of configs) {
    const variant = variantKey(config);
    for (const symbol of symbols) {
      const symbolRows = rowsBySymbol.get(symbol)?.[config.timeframe] ?? [];
      const trades = runTrendBreakout(symbol, symbolRows, config);
      const row = { symbol, ...metrics(symbol, trades) };
      if (!grouped.has(variant)) grouped.set(variant, []);
      grouped.get(variant)?.push(row);
      rows.push([
        variant,
        symbol,
        row.trades,
        row.winRate,
        row.netProfit,
        row.returnPct,
        row.profitFactor,
        row.expectancyR,
        row.maxDrawdown,
        row.cost05Net,
        row.cost1Net,
        row.top3Pct,
      ]);
    }
  }

  const summary = [...grouped.entries()].map(([variant, items]) => {
    const profitable = items.filter((item) => item.netProfit > 0);
    const above30 = items.filter((item) => item.returnPct >= 30);
    return {
      variant,
      profitable_symbols: profitable.length,
      above_30_symbols: above30.length,
      total_net_profit: items.reduce((sum, item) => sum + item.netProfit, 0),
      total_cost_1_net_profit: items.reduce((sum, item) => sum + item.cost1Net, 0),
      avg_return_pct: items.reduce((sum, item) => sum + item.returnPct, 0) / items.length,
      max_return_pct: Math.max(...items.map((item) => item.returnPct)),
      min_return_pct: Math.min(...items.map((item) => item.returnPct)),
      min_profit_factor: Math.min(...items.map((item) => item.profitFactor)),
      max_drawdown: Math.min(...items.map((item) => item.maxDrawdown)),
      max_top3_pct: Math.max(...items.map((item) => item.top3Pct)),
      min_trades: Math.min(...items.map((item) => item.trades)),
    };
  }).sort((a, b) => {
    if (b.profitable_symbols !== a.profitable_symbols) return b.profitable_symbols - a.profitable_symbols;
    if (b.above_30_symbols !== a.above_30_symbols) return b.above_30_symbols - a.above_30_symbols;
    return b.total_cost_1_net_profit - a.total_cost_1_net_profit;
  });

  writeCsv(`${OUT_DIR}/forex_trend_model_search_rows.csv`, rows);
  writeCsv(`${OUT_DIR}/forex_trend_model_search_summary.csv`, [
    Object.keys(summary[0] ?? { variant: "" }),
    ...summary.map((row) => Object.values(row)),
  ]);
  writeFileSync(`${OUT_DIR}/forex_trend_model_search_summary.json`, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary.slice(0, 20), null, 2));
}

main();
