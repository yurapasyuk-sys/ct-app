import { mkdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { fetchKlinesMultiBatch } from "../src/lib/binance";
import { aggregateKlines } from "../src/lib/data-handlers/local-csv-market-data";

type Direction = "long" | "short";
type Mode = "all" | "long_only" | "short_only";
type Timeframe = "1h" | "4h";

interface Trade {
  entry: number;
  exit: number;
  direction: Direction;
  profit: number;
  r: number;
}

interface Summary {
  symbol: string;
  market: "stock" | "forex";
  strategy: string;
  timeframe: Timeframe;
  trades: number;
  ret: number;
  pf: number;
  ddPct: number;
  maxLossStreak: number;
  best60: number;
  best90: number;
  worst60: number;
  worst90: number;
  score: number;
}

const OUT_DIR = "public/exports";
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const INITIAL = 10_000;

const DEFAULT_STOCKS = ["NVDA", "TSLA", "AMD", "META", "MSFT", "AAPL", "GOOGL", "AMZN", "NFLX", "COIN", "MSTR", "PLTR", "SMCI"];
const DEFAULT_FOREX = ["EURJPY", "GBPJPY", "USDJPY", "CHFJPY", "NZDUSD", "EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF"];
const STOCKS = process.env.PROP_STOCK_SYMBOLS?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) ?? DEFAULT_STOCKS;
const FOREX = process.env.PROP_FX_SYMBOLS?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) ?? DEFAULT_FOREX;

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function parseYahoo(payload: unknown, intervalMs: number): Kline[] {
  const chart = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
      }>;
      error?: { description?: string; code?: string } | null;
    };
  };
  const error = chart.chart?.error;
  if (error) throw new Error(error.description || error.code || "Yahoo error");
  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];
  return timestamps.map((timestamp, index) => {
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
  }).filter((row): row is Kline => row != null).sort((a, b) => a.openTime - b.openTime);
}

async function fetchStock1h(symbol: string, warmupDays: number) {
  const period1 = Math.floor((START - warmupDays * DAY) / 1000);
  const period2 = Math.floor(END / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=60m&includePrePost=false`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${symbol} Yahoo ${response.status}`);
  return parseYahoo(await response.json(), HOUR);
}

async function fetchForex1h(symbol: string, warmupDays: number) {
  return fetchKlinesMultiBatch(
    { symbol, interval: "1h", startTime: START - warmupDays * DAY, endTime: END, dataSource: "yahoo-fx" },
    Math.ceil((END - (START - warmupDays * DAY)) / HOUR) + 10
  );
}

function tr(current: Kline, previous: Kline) {
  return Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
}

function atr(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let i = 1; i < rows.length; i += 1) {
    sum += tr(rows[i], rows[i - 1]);
    if (i > period) sum -= tr(rows[i - period], rows[i - period - 1]);
    if (i >= period) values[i] = sum / period;
  }
  return values;
}

function ema(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length < period) return values;
  const mult = 2 / (period + 1);
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = value;
  for (let i = period; i < rows.length; i += 1) {
    value = (rows[i].close - value) * mult + value;
    values[i] = value;
  }
  return values;
}

function bands(rows: Kline[], period: number, dev: number) {
  return rows.map((_, index) => {
    if (index - period + 1 < 0) return null;
    const slice = rows.slice(index - period + 1, index + 1);
    const mean = slice.reduce((sum, row) => sum + row.close, 0) / period;
    const variance = slice.reduce((sum, row) => sum + (row.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { mean, upper: mean + dev * sd, lower: mean - dev * sd };
  });
}

function allowed(mode: Mode, direction: Direction) {
  if (mode === "long_only") return direction === "long";
  if (mode === "short_only") return direction === "short";
  return true;
}

function runBb(symbol: string, market: "stock" | "forex", rows: Kline[], timeframe: Timeframe, p: { bb: number; dev: number; stop: number; hold: number; mode: Mode; ema: number; filter: "none" | "trend" | "counter"; exit: "mean" | "opposite"; risk: number }) {
  const a = atr(rows, 14);
  const e = ema(rows, p.ema);
  const b = bands(rows, p.bb, p.dev);
  const trades: Trade[] = [];
  let equity = INITIAL;
  let position: null | { entry: number; time: number; direction: Direction; stop: number; target: number; qty: number; risk: number; bars: number } = null;
  const minIndex = Math.max(p.bb, p.ema, 14) + 1;
  for (let i = minIndex; i < rows.length; i += 1) {
    const signal = rows[i - 1];
    const current = rows[i];
    if (position) {
      position.bars += 1;
      const hitStop = position.direction === "long" ? current.low <= position.stop : current.high >= position.stop;
      const hitTarget = position.direction === "long" ? current.high >= position.target : current.low <= position.target;
      if (hitStop || hitTarget || position.bars >= p.hold) {
        const exit = hitStop ? position.stop : hitTarget ? position.target : current.close;
        const profit = position.direction === "long" ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty;
        trades.push({ entry: position.time, exit: current.openTime, direction: position.direction, profit, r: profit / position.risk });
        equity += profit;
        position = null;
      }
    }
    if (position || current.openTime < START || current.openTime >= END) continue;
    const band = b[i - 1];
    const atrValue = a[i - 1];
    if (!band || !atrValue || atrValue <= 0) continue;
    const direction = signal.close < band.lower ? "long" : signal.close > band.upper ? "short" : null;
    if (!direction || !allowed(p.mode, direction)) continue;
    const emaValue = e[i - 1];
    if (p.filter !== "none") {
      if (emaValue == null) continue;
      const trendOk = direction === "long" ? signal.close > emaValue : signal.close < emaValue;
      if (p.filter === "trend" && !trendOk) continue;
      if (p.filter === "counter" && trendOk) continue;
    }
    const riskDistance = atrValue * p.stop;
    const riskAmount = equity * (p.risk / 100);
    const target = p.exit === "opposite" ? (direction === "long" ? band.upper : band.lower) : band.mean;
    position = {
      entry: current.open,
      time: current.openTime,
      direction,
      stop: direction === "long" ? current.open - riskDistance : current.open + riskDistance,
      target,
      qty: riskAmount / riskDistance,
      risk: riskAmount,
      bars: 0,
    };

    const hitStop = direction === "long" ? current.low <= position.stop : current.high >= position.stop;
    const hitTarget = direction === "long" ? current.high >= position.target : current.low <= position.target;
    if (hitStop || hitTarget) {
      const exitPrice = hitStop ? position.stop : position.target;
      const tradeProfit = direction === "long"
        ? (exitPrice - position.entry) * position.qty
        : (position.entry - exitPrice) * position.qty;
      trades.push({
        entry: position.time,
        exit: current.openTime,
        direction,
        profit: tradeProfit,
        r: tradeProfit / position.risk,
      });
      equity += tradeProfit;
      position = null;
    }
  }
  return summarize(symbol, market, `bb${p.bb}_dev${p.dev}_stop${p.stop}_hold${p.hold}_${p.mode}_${p.filter}_${p.exit}_risk${p.risk}`, timeframe, trades);
}

function summarize(symbol: string, market: "stock" | "forex", strategy: string, timeframe: Timeframe, trades: Trade[]): Summary {
  let equity = INITIAL;
  let peak = INITIAL;
  let dd = 0;
  let gp = 0;
  let gl = 0;
  let wins = 0;
  let currentLoss = 0;
  let maxLossStreak = 0;
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    dd = Math.min(dd, equity - peak);
    if (trade.profit > 0) {
      gp += trade.profit;
      wins += 1;
      currentLoss = 0;
    } else {
      gl += trade.profit;
      currentLoss += 1;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    }
  }
  const ret = (equity / INITIAL - 1) * 100;
  const ddPct = (dd / INITIAL) * 100;
  const pf = gl < 0 ? gp / Math.abs(gl) : gp > 0 ? Infinity : 0;
  const rolling = (days: number, best: boolean) => {
    let value = best ? -Infinity : Infinity;
    for (let start = START; start + days * DAY <= END; start += DAY) {
      const m = summarizeWindow(trades, start, start + days * DAY);
      if (m.trades < 2) continue;
      value = best ? Math.max(value, m.ret) : Math.min(value, m.ret);
    }
    return Number.isFinite(value) ? value : 0;
  };
  const best60 = rolling(60, true);
  const best90 = rolling(90, true);
  const worst60 = rolling(60, false);
  const worst90 = rolling(90, false);
  const score = ret + best90 * 0.25 + pf * 5 - Math.abs(ddPct) * 4 - Math.max(0, maxLossStreak - 3) * 6;
  return { symbol, market, strategy, timeframe, trades: trades.length, ret, pf, ddPct, maxLossStreak, best60, best90, worst60, worst90, score };
}

function summarizeWindow(trades: Trade[], start: number, end: number) {
  let equity = INITIAL;
  let count = 0;
  for (const trade of trades) {
    if (trade.exit >= start && trade.exit < end) {
      equity += trade.profit;
      count += 1;
    }
  }
  return { trades: count, ret: (equity / INITIAL - 1) * 100 };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summaries: Summary[] = [];
  const assets: Array<{ symbol: string; market: "stock" | "forex"; rows: Kline[] }> = [];
  for (const symbol of STOCKS) {
    try {
      const rows = await fetchStock1h(symbol, 220);
      if (rows.length > 500) assets.push({ symbol, market: "stock", rows });
      console.log(`${symbol} ${rows.length}`);
    } catch (error) {
      console.warn(`${symbol} failed`, error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (const symbol of FOREX) {
    try {
      const rows = await fetchForex1h(symbol, 220);
      if (rows.length > 1000) assets.push({ symbol, market: "forex", rows });
    } catch (error) {
      console.warn(`${symbol} failed`, error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const asset of assets) {
    for (const [timeframe, rows] of [["1h", asset.rows], ["4h", aggregateKlines(asset.rows, "4h")]] as Array<[Timeframe, Kline[]]>) {
      for (const bb of [20, 40, 80, 120]) {
        for (const dev of [1.25, 1.5, 1.75, 2, 2.25]) {
          for (const stop of [0.5, 0.75, 1, 1.25, 1.5]) {
            for (const hold of timeframe === "1h" ? [12, 24, 48, 96] : [6, 12, 24, 48]) {
              for (const mode of ["all", "long_only", "short_only"] as Mode[]) {
                for (const filter of ["none", "trend", "counter"] as const) {
                  for (const exit of ["mean", "opposite"] as const) {
                    summaries.push(runBb(asset.symbol, asset.market, rows, timeframe, { bb, dev, stop, hold, mode, ema: 200, filter, exit, risk: 1 }));
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  const qualified = summaries
    .filter((s) => s.trades >= 10 && s.ret >= 20 && s.ddPct >= -8 && s.best60 >= 20)
    .sort((a, b) => b.score - a.score);
  const top = summaries
    .filter((s) => s.trades >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 200);
  const headers = ["symbol", "market", "strategy", "timeframe", "trades", "ret", "pf", "ddPct", "maxLossStreak", "best60", "best90", "worst60", "worst90", "score"];
  const toRow = (s: Summary) => headers.map((key) => s[key as keyof Summary]);
  writeCsv(`${OUT_DIR}/prop_safe_stock_fx_search_qualified.csv`, [headers, ...qualified.map(toRow)]);
  writeCsv(`${OUT_DIR}/prop_safe_stock_fx_search_top.csv`, [headers, ...top.map(toRow)]);
  writeFileSync(`${OUT_DIR}/prop_safe_stock_fx_search.json`, JSON.stringify({ generated_at: new Date().toISOString(), qualified, top }, null, 2), "utf8");
  console.table(qualified.slice(0, 20).map((s) => ({ symbol: s.symbol, market: s.market, tf: s.timeframe, ret: s.ret.toFixed(1), dd: s.ddPct.toFixed(1), pf: Number.isFinite(s.pf) ? s.pf.toFixed(2) : "Inf", trades: s.trades, best60: s.best60.toFixed(1), worst90: s.worst90.toFixed(1), streak: s.maxLossStreak, strategy: s.strategy })));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
