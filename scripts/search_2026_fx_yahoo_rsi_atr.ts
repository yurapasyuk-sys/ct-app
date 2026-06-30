import { mkdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines } from "../src/lib/data-handlers/local-csv-market-data";

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const RISK_PERCENT = 1;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-17T00:00:00.000Z");
const FETCH_WARMUP_START = Date.parse("2025-10-01T00:00:00.000Z");

const SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "NZDUSD",
  "USDCAD",
  "USDCHF",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "AUDJPY",
  "CADJPY",
  "CHFJPY",
  "EURAUD",
  "GBPAUD",
  "AUDNZD",
  "EURCAD",
  "GBPCAD",
];

type Direction = "long" | "short";
type Timeframe = "1h" | "4h";
type EntryStyle = "counter_extreme" | "cross_revert" | "trend_pullback";

interface Config {
  timeframe: Timeframe;
  entryStyle: EntryStyle;
  rsiPeriod: number;
  lowThreshold: number;
  highThreshold: number;
  emaPeriod: number;
  atrPeriod: number;
  stopAtr: number;
  targetAtr: number;
  maxHoldBars: number;
}

interface Trade {
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
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

function parseYahooChart(payload: unknown, intervalMs: number): Kline[] {
  const chart = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
      error?: { code?: string; description?: string } | null;
    };
  };
  const error = chart.chart?.error;
  if (error) throw new Error(error.description || error.code || "Yahoo chart error");
  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || !timestamps.length) return [];
  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      return {
        openTime,
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
        closeTime: openTime + intervalMs - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      } satisfies Kline;
    })
    .filter((row): row is Kline => row != null)
    .sort((a, b) => a.openTime - b.openTime);
}

async function fetchYahoo1h(symbol: string) {
  const period1 = Math.floor(FETCH_WARMUP_START / 1000);
  const period2 = Math.floor(END_TIME / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?period1=${period1}&period2=${period2}&interval=60m&includePrePost=true`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${symbol}: Yahoo ${response.status} ${response.statusText}`);
  return parseYahooChart(await response.json(), 60 * 60 * 1000);
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function buildAtr(rows: Kline[], period: number) {
  const values = Array.from<number | null>({ length: rows.length }).fill(null);
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

function buildRsi(rows: Kline[], period: number) {
  const values = Array.from<number | null>({ length: rows.length }).fill(null);
  if (rows.length <= period) return values;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  values[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let index = period + 1; index < rows.length; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -change)) / period;
    values[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return values;
}

function pipSize(symbol: string) {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

function profitFor(direction: Direction, entry: number, exit: number, quantity: number) {
  return direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
}

function signalDirection(
  rows: Kline[],
  rsi: Array<number | null>,
  ema: Array<number | null>,
  index: number,
  config: Config
): Direction | null {
  const value = rsi[index];
  const previous = rsi[index - 1];
  if (value == null) return null;

  if (config.entryStyle === "counter_extreme") {
    if (value <= config.lowThreshold) return "long";
    if (value >= config.highThreshold) return "short";
    return null;
  }

  if (config.entryStyle === "cross_revert") {
    if (previous == null) return null;
    if (previous < config.lowThreshold && value >= config.lowThreshold) return "long";
    if (previous > config.highThreshold && value <= config.highThreshold) return "short";
    return null;
  }

  const trend = ema[index];
  if (trend == null) return null;
  if (rows[index].close > trend && value <= config.lowThreshold) return "long";
  if (rows[index].close < trend && value >= config.highThreshold) return "short";
  return null;
}

function run(symbol: string, rows: Kline[], config: Config) {
  const atr = buildAtr(rows, config.atrPeriod);
  const ema = buildEma(rows, config.emaPeriod);
  const rsi = buildRsi(rows, config.rsiPeriod);
  const warmup = Math.max(config.rsiPeriod, config.atrPeriod, config.emaPeriod) + 2;
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let position: {
    direction: Direction;
    entryIndex: number;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskAmount: number;
    riskDistance: number;
    quantity: number;
  } | null = null;

  for (let index = warmup; index < rows.length; index += 1) {
    const current = rows[index];
    const signalIndex = index - 1;

    if (position) {
      const held = index - position.entryIndex;
      const hitStop = position.direction === "long" ? current.low <= position.stopLoss : current.high >= position.stopLoss;
      const hitTarget = position.direction === "long" ? current.high >= position.takeProfit : current.low <= position.takeProfit;
      const timeExit = held >= config.maxHoldBars;
      if (hitStop || hitTarget || timeExit) {
        const exitPrice = hitStop ? position.stopLoss : hitTarget ? position.takeProfit : current.open;
        const profit = profitFor(position.direction, position.entryPrice, exitPrice, position.quantity);
        trades.push({
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          riskAmount: position.riskAmount,
          riskDistance: position.riskDistance,
          profit,
          rMultiple: position.riskAmount > 0 ? profit / position.riskAmount : 0,
          result: hitStop ? "stop_loss" : hitTarget ? "take_profit" : "time_exit",
        });
        equity += profit;
        position = null;
      }
    }

    if (position) continue;
    if (current.openTime < START_TIME || current.openTime >= END_TIME) continue;
    const atrValue = atr[signalIndex];
    if (atrValue == null || atrValue <= 0) continue;
    const direction = signalDirection(rows, rsi, ema, signalIndex, config);
    if (!direction) continue;

    const entryPrice = current.open;
    const riskDistance = atrValue * config.stopAtr;
    const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
    const takeProfit = direction === "long" ? entryPrice + atrValue * config.targetAtr : entryPrice - atrValue * config.targetAtr;
    const riskAmount = equity * (RISK_PERCENT / 100);
    position = {
      direction,
      entryIndex: index,
      entryTime: current.openTime,
      entryPrice,
      stopLoss,
      takeProfit,
      riskAmount,
      riskDistance,
      quantity: riskAmount / riskDistance,
    };
  }
  return trades;
}

function metrics(symbol: string, trades: Trade[]) {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  let costEquity = INITIAL_CAPITAL;
  let costPeak = INITIAL_CAPITAL;
  let costMaxDrawdown = 0;
  const adjusted: number[] = [];
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    const riskPips = trade.riskDistance / pipSize(symbol);
    const costR = riskPips > 0 ? 1 / riskPips : 0;
    const adjustedProfit = (trade.rMultiple - costR) * trade.riskAmount;
    adjusted.push(adjustedProfit);
    costEquity += adjustedProfit;
    costPeak = Math.max(costPeak, costEquity);
    costMaxDrawdown = Math.min(costMaxDrawdown, costEquity - costPeak);
  }
  const winners = trades.filter((trade) => trade.profit > 0);
  const losers = trades.filter((trade) => trade.profit < 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.profit, 0);
  const grossLoss = losers.reduce((sum, trade) => sum + trade.profit, 0);
  const costGrossProfit = adjusted.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const costGrossLoss = adjusted.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  const netProfit = equity - INITIAL_CAPITAL;
  const cost1NetProfit = costEquity - INITIAL_CAPITAL;
  const top3 = [...trades].sort((a, b) => b.profit - a.profit).slice(0, 3).reduce((sum, trade) => sum + Math.max(0, trade.profit), 0);
  return {
    trades: trades.length,
    winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
    netProfit,
    returnPct: (netProfit / INITIAL_CAPITAL) * 100,
    profitFactor: grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length : 0,
    maxDrawdown,
    cost1NetProfit,
    cost1ReturnPct: (cost1NetProfit / INITIAL_CAPITAL) * 100,
    cost1ProfitFactor: costGrossLoss < 0 ? costGrossProfit / Math.abs(costGrossLoss) : costGrossProfit > 0 ? Infinity : 0,
    cost1MaxDrawdown: costMaxDrawdown,
    top3Pct: netProfit > 0 ? (top3 / netProfit) * 100 : 0,
  };
}

function key(config: Config) {
  return [
    config.timeframe,
    config.entryStyle,
    `rsi${config.rsiPeriod}`,
    `lo${config.lowThreshold}`,
    `hi${config.highThreshold}`,
    `ema${config.emaPeriod}`,
    `sl${config.stopAtr}`,
    `tp${config.targetAtr}`,
    `hold${config.maxHoldBars}`,
  ].join("_");
}

function buildConfigs() {
  const configs: Config[] = [];
  const thresholdPairs: Array<[number, number]> = [
    [25, 75],
    [30, 70],
    [35, 65],
  ];
  for (const timeframe of ["1h", "4h"] as const) {
    for (const entryStyle of ["counter_extreme", "cross_revert", "trend_pullback"] as const) {
      for (const rsiPeriod of [7, 14]) {
        for (const [lowThreshold, highThreshold] of thresholdPairs) {
          for (const emaPeriod of entryStyle === "trend_pullback" ? [100, 200] : [0, 100, 200]) {
            for (const stopAtr of [1, 1.5, 2]) {
              for (const targetAtr of [1, 1.5, 2, 3]) {
                for (const maxHoldBars of timeframe === "1h" ? [12, 24, 48] : [6, 12, 24]) {
                  configs.push({
                    timeframe,
                    entryStyle,
                    rsiPeriod,
                    lowThreshold,
                    highThreshold,
                    emaPeriod,
                    atrPeriod: 14,
                    stopAtr,
                    targetAtr,
                    maxHoldBars,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const data = new Map<string, Record<Timeframe, Kline[]>>();
  for (const symbol of SYMBOLS) {
    const oneHour = await fetchYahoo1h(symbol);
    data.set(symbol, { "1h": oneHour, "4h": aggregateKlines(oneHour, "4h") });
    console.log(`${symbol}: ${oneHour.length} 1H rows`);
    await new Promise((resolve) => setTimeout(resolve, 120));
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
    "cost_1_net_profit",
    "cost_1_return_pct",
    "cost_1_profit_factor",
    "cost_1_max_drawdown",
    "top_3_profit_pct",
  ]];
  const grouped = new Map<string, Array<ReturnType<typeof metrics> & { symbol: string }>>();
  for (const config of buildConfigs()) {
    const variant = key(config);
    for (const symbol of SYMBOLS) {
      const symbolRows = data.get(symbol)?.[config.timeframe] ?? [];
      const result = metrics(symbol, run(symbol, symbolRows, config));
      if (!grouped.has(variant)) grouped.set(variant, []);
      grouped.get(variant)?.push({ symbol, ...result });
      rows.push([
        variant,
        symbol,
        result.trades,
        result.winRate,
        result.netProfit,
        result.returnPct,
        result.profitFactor,
        result.expectancyR,
        result.maxDrawdown,
        result.cost1NetProfit,
        result.cost1ReturnPct,
        result.cost1ProfitFactor,
        result.cost1MaxDrawdown,
        result.top3Pct,
      ]);
    }
  }

  const summary = [...grouped.entries()].map(([variant, items]) => {
    const valid = items.filter((item) => item.trades >= 10);
    return {
      variant,
      valid_symbols: valid.length,
      profitable_symbols: valid.filter((item) => item.netProfit > 0 && item.profitFactor > 1).length,
      cost1_profitable_symbols: valid.filter((item) => item.cost1NetProfit > 0 && item.cost1ProfitFactor > 1).length,
      above_30_symbols: valid.filter((item) => item.returnPct >= 30).length,
      cost1_above_30_symbols: valid.filter((item) => item.cost1ReturnPct >= 30).length,
      total_net_profit: valid.reduce((sum, item) => sum + item.netProfit, 0),
      total_cost_1_net_profit: valid.reduce((sum, item) => sum + item.cost1NetProfit, 0),
      avg_cost1_return_pct: valid.length ? valid.reduce((sum, item) => sum + item.cost1ReturnPct, 0) / valid.length : -Infinity,
      min_cost1_return_pct: valid.length ? Math.min(...valid.map((item) => item.cost1ReturnPct)) : -Infinity,
      min_cost1_profit_factor: valid.length ? Math.min(...valid.map((item) => item.cost1ProfitFactor)) : 0,
      max_drawdown: valid.length ? Math.min(...valid.map((item) => item.maxDrawdown)) : 0,
      max_top3_pct: valid.length ? Math.max(...valid.map((item) => item.top3Pct)) : 0,
      min_trades: valid.length ? Math.min(...valid.map((item) => item.trades)) : 0,
    };
  }).sort((a, b) => {
    if (b.valid_symbols !== a.valid_symbols) return b.valid_symbols - a.valid_symbols;
    if (b.cost1_profitable_symbols !== a.cost1_profitable_symbols) return b.cost1_profitable_symbols - a.cost1_profitable_symbols;
    if (b.cost1_above_30_symbols !== a.cost1_above_30_symbols) return b.cost1_above_30_symbols - a.cost1_above_30_symbols;
    return b.total_cost_1_net_profit - a.total_cost_1_net_profit;
  });

  writeCsv(`${OUT_DIR}/fx_yahoo_rsi_atr_rows.csv`, rows);
  writeCsv(`${OUT_DIR}/fx_yahoo_rsi_atr_summary.csv`, [
    Object.keys(summary[0] ?? { variant: "" }),
    ...summary.map((row) => Object.values(row)),
  ]);
  writeFileSync(`${OUT_DIR}/fx_yahoo_rsi_atr_summary.json`, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary.slice(0, 20), null, 2));
}

main();
