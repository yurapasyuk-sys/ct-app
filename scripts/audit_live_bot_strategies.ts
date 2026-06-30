import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { fetchKlinesMultiBatch } from "../src/lib/binance";
import {
  detectAllApprovedPropSignals,
  detectApprovedPropPositionExit,
} from "../src/lib/data-handlers/approved-prop-portfolio-strategy";
import { runFxDonchianBacktest } from "../src/lib/data-handlers/fx-donchian-backtest";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";
import { runPropHtfBreakoutBacktest } from "../src/lib/data-handlers/prop-htf-breakout-backtest";
import { detectAllQ2PropSignals } from "../src/lib/data-handlers/q2-prop-signal-strategy";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";
import { SIGNAL_PROFILES, type SignalTimeframe, type SymbolConfig } from "./live_signal_monitor";

type Direction = "long" | "short";

interface Period {
  id: "2025" | "2026_q1" | "2026_q2" | "2026_ytd";
  label: string;
  start: number;
  end: number;
  primary?: boolean;
}

interface AuditTrade {
  entryTime: number;
  exitTime: number;
  direction: Direction;
  entryPrice: number;
  exitPrice: number;
  grossR: number;
  baselineR: number;
  stressR: number;
  exitReason: string;
}

interface MarketData {
  bid: Kline[];
  ask: Kline[];
  source: string;
  caveats: string[];
}

interface Metrics {
  trades: number;
  wins: number;
  winRatePct: number;
  returnPctAt1Risk: number;
  propReturnPctAt0_5Risk: number;
  stressReturnPctAt0_5Risk: number;
  profitFactor: number;
  stressProfitFactor: number;
  expectancyR: number;
  maxDrawdownPct: number;
  worstDayPct: number;
  maxLossStreak: number;
  firstTrade: string | null;
  lastTrade: string | null;
  dailyReturnsPct: number[];
}

interface MonteCarloResult {
  runs: number;
  phase1PassProbabilityPct: number;
  challengePassProbabilityPct: number;
  rulesSafetyProbabilityPct: number;
  medianCompletionDays: number | null;
}

interface ProfileAudit {
  profileId: string;
  symbol: string;
  strategyName: string;
  category: string;
  timeframe: SignalTimeframe;
  kind: string;
  source: string;
  caveats: string[];
  dataStart: string | null;
  dataEnd: string | null;
  periods: Record<string, Metrics | null>;
  monteCarlo: MonteCarloResult | null;
  profitabilityRank: number | null;
  propCandidate: boolean;
  propReasons: string[];
  approvalStatus: "approved_for_forward" | "rejected" | "insufficient_data";
  approvalReasons: string[];
  error?: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const INITIAL_EQUITY = 10_000;
const PRIMARY_END = Date.parse(process.env.AUDIT_END ?? "2026-06-13T00:00:00Z");
const FETCH_START = Date.parse("2024-10-01T00:00:00Z");
const OUTPUT_DIR = "public/exports";
const MONTE_CARLO_RUNS = Math.max(100, Number(process.env.AUDIT_MONTE_CARLO_RUNS ?? "5000"));

const PERIODS: Period[] = [
  {
    id: "2025",
    label: "2025 external check",
    start: Date.parse("2025-01-01T00:00:00Z"),
    end: Date.parse("2026-01-01T00:00:00Z"),
  },
  {
    id: "2026_q1",
    label: "2026 Q1",
    start: Date.parse("2026-01-01T00:00:00Z"),
    end: Date.parse("2026-04-01T00:00:00Z"),
  },
  {
    id: "2026_q2",
    label: "2026 Q2 to common cutoff",
    start: Date.parse("2026-04-01T00:00:00Z"),
    end: PRIMARY_END,
  },
  {
    id: "2026_ytd",
    label: "2026 YTD primary",
    start: Date.parse("2026-01-01T00:00:00Z"),
    end: PRIMARY_END,
    primary: true,
  },
];

const LOCAL_FILES: Record<string, string> = {
  AUDUSD: "public/data/forex/AUDUSD_1m_2023-06-15_2026-06-15.csv",
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  GER40: "public/data/forex/GER40_1m_2024-01-01_2026-06-15.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
};

const APPROVED_FILES: Record<string, string> = {
  USDCHF: ".scratch/dukascopy_control/USDCHF_1m_bidask_2025-01-01_2026-06-17.csv",
  XAUUSD: ".scratch/dukascopy_control/XAUUSD_1m_bidask_2025-01-01_2026-06-17.csv",
  US30: ".scratch/dukascopy_control/USA30IDXUSD_1m_bidask_2025-01-01_2026-06-17.csv",
  SPX500: ".scratch/dukascopy_control/USA500IDXUSD_1m_bidask_2025-01-01_2026-06-17.csv",
};

const localCache = new Map<string, Map<SignalTimeframe, Kline[]>>();
const yahooCache = new Map<string, Kline[]>();
const approvedCache = new Map<string, MarketData>();

function iso(value: number | undefined) {
  return value == null ? null : new Date(value).toISOString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`, "utf8");
}

function parseYahooChart(payload: unknown): Kline[] {
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
  if (!quote) return [];
  return timestamps.flatMap((timestamp, index) => {
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (open == null || high == null || low == null || close == null) return [];
    const openTime = timestamp * 1000;
    return [{
      openTime,
      open,
      high,
      low,
      close,
      volume: quote.volume?.[index] ?? 0,
      closeTime: openTime + HOUR_MS - 1,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    } satisfies Kline];
  }).sort((left, right) => left.openTime - right.openTime);
}

async function fetchYahoo1h(symbol: string) {
  const cached = yahooCache.get(symbol);
  if (cached) return cached;
  const params = new URLSearchParams({
    period1: String(Math.floor(FETCH_START / 1000)),
    period2: String(Math.floor(PRIMARY_END / 1000)),
    interval: "60m",
    includePrePost: "true",
  });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 Centurion strategy audit" } });
  if (!response.ok) throw new Error(`Yahoo ${symbol}: ${response.status} ${response.statusText}`);
  const rows = parseYahooChart(await response.json());
  if (!rows.length) throw new Error(`Yahoo ${symbol}: no hourly rows`);
  yahooCache.set(symbol, rows);
  return rows;
}

function loadLocalSymbol(symbol: string) {
  const cached = localCache.get(symbol);
  if (cached) return cached;
  const path = LOCAL_FILES[symbol];
  if (!path || !existsSync(path)) throw new Error(`${symbol}: local OHLC file is missing`);
  console.log(`${symbol}: parsing ${path}`);
  const oneMinute = parseLocalCsvKlines(readFileSync(path, "utf8"));
  const intervals = new Map<SignalTimeframe, Kline[]>([
    ["30m", aggregateByMs(oneMinute, 30 * 60_000)],
    ["1h", aggregateKlines(oneMinute, "1h")],
    ["4h", aggregateKlines(oneMinute, "4h")],
  ]);
  localCache.set(symbol, intervals);
  return intervals;
}

function aggregateByMs(rows: Kline[], intervalMs: number) {
  const buckets = new Map<number, Kline>();
  for (const row of rows) {
    const openTime = Math.floor(row.openTime / intervalMs) * intervalMs;
    const current = buckets.get(openTime);
    if (!current) {
      buckets.set(openTime, { ...row, openTime, closeTime: openTime + intervalMs - 1 });
      continue;
    }
    current.high = Math.max(current.high, row.high);
    current.low = Math.min(current.low, row.low);
    current.close = row.close;
    current.volume += row.volume;
  }
  return [...buckets.values()].sort((left, right) => left.openTime - right.openTime);
}

function parseBidAskCsv(path: string, timeframe: SignalTimeframe): MarketData {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const bid: Kline[] = [];
  const ask: Kline[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    const cells = lines[index].split(",");
    const openTime = Date.parse(cells[0]);
    const values = cells.slice(1, 9).map(Number);
    if (!Number.isFinite(openTime) || values.some((value) => !Number.isFinite(value))) continue;
    const base = {
      openTime,
      volume: 0,
      closeTime: openTime + 60_000 - 1,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    };
    bid.push({ ...base, open: values[0], high: values[1], low: values[2], close: values[3] });
    ask.push({ ...base, open: values[4], high: values[5], low: values[6], close: values[7] });
  }
  const intervalMs = timeframe === "4h" ? 4 * HOUR_MS : HOUR_MS;
  return {
    bid: aggregateByMs(bid, intervalMs),
    ask: aggregateByMs(ask, intervalMs),
    source: `Dukascopy BID/ASK cache ${path}`,
    caveats: ["Approved profiles use cached Dukascopy bid/ask data through 2026-06-17."],
  };
}

async function loadMarket(profile: SymbolConfig): Promise<MarketData> {
  if (profile.approvedProp) {
    const key = `${profile.symbol}:${profile.timeframe}`;
    const cached = approvedCache.get(key);
    if (cached) return cached;
    const path = APPROVED_FILES[profile.symbol];
    if (!path || !existsSync(path)) throw new Error(`${profile.symbol}: approved Dukascopy cache is missing`);
    console.log(`${profile.profileId}: parsing ${path}`);
    const market = parseBidAskCsv(path, profile.timeframe);
    approvedCache.set(key, market);
    return market;
  }

  if (profile.dataProvider === "okx_swap") {
    const needed = Math.ceil((PRIMARY_END - FETCH_START) / HOUR_MS) + 300;
    const rows = await fetchKlinesMultiBatch({
      symbol: profile.symbol,
      interval: "1h",
      endTime: PRIMARY_END,
      limit: 300,
      dataSource: "okx-swap",
    }, needed);
    const filtered = rows.filter((row) => row.openTime >= FETCH_START && row.openTime < PRIMARY_END);
    return { bid: filtered, ask: filtered, source: "OKX swap 1H", caveats: [] };
  }

  if (LOCAL_FILES[profile.symbol]) {
    const rows = loadLocalSymbol(profile.symbol).get(profile.timeframe) ?? [];
    return {
      bid: rows,
      ask: rows,
      source: `workspace minute CSV aggregated to ${profile.timeframe}`,
      caveats: ["Workspace OHLC is bid-only; baseline transaction cost is modeled, not observed."],
    };
  }

  const oneHour = await fetchYahoo1h(profile.yahooSymbol);
  const rows = profile.timeframe === "4h" ? aggregateKlines(oneHour, "4h") : oneHour;
  return {
    bid: rows,
    ask: rows,
    source: `Yahoo ${profile.yahooSymbol} ${profile.timeframe}`,
    caveats: ["Yahoo OHLC is a proxy feed; baseline transaction cost is modeled."],
  };
}

function nativeConfig(profile: SymbolConfig, period: Period) {
  return {
    symbol: profile.symbol,
    requestedExchange: "AUDIT",
    marketType: profile.strategyCategory === "crypto" ? "crypto" : "forex_cfd",
    marketDataProvider: "bot_profile_audit",
    initialCapital: INITIAL_EQUITY,
    riskPerTradePercent: 1,
    rewardRMultiple: profile.rewardR ?? 0,
    includePlanB: false,
    tradeStartTime: period.start,
    tradeEndTime: period.end,
  };
}

function modeledCostPrice(symbol: string) {
  if (symbol.endsWith("USDT")) return null;
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40") return 1;
  if (symbol === "XAUUSD") return 0.4;
  if (symbol === "US30") return 2;
  if (symbol === "SPX500") return 0.5;
  return 0.0001;
}

function costR(profile: SymbolConfig, entryPrice: number, stopLoss: number) {
  const distance = Math.abs(entryPrice - stopLoss);
  if (!(distance > 0)) return 0;
  if (profile.symbol.endsWith("USDT")) return (entryPrice * 0.001) / distance;
  return (modeledCostPrice(profile.symbol) ?? 0) / distance;
}

function convertNativeTrades(profile: SymbolConfig, report: ReturnType<typeof runUniversalBbAtrBacktest>) {
  return report.trades.map((trade) => {
    const cost = costR(profile, trade.entry_price, trade.stop_loss);
    return {
      entryTime: trade.entry_time,
      exitTime: trade.exit_time,
      direction: trade.direction,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      grossR: trade.r_multiple,
      baselineR: trade.r_multiple - cost,
      stressR: trade.r_multiple - 1.5 * cost,
      exitReason: trade.result_status,
    } satisfies AuditTrade;
  });
}

function closeLocation(row: Kline) {
  const range = row.high - row.low;
  return range > 0 ? (row.close - row.low) / range : 0.5;
}

function buildAtr(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1];
    const tr = Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
    sum += tr;
    if (index > period) {
      const old = rows[index - period];
      const oldPrevious = rows[index - period - 1];
      sum -= Math.max(old.high - old.low, Math.abs(old.high - oldPrevious.close), Math.abs(old.low - oldPrevious.close));
    }
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function buildEma(rows: Kline[], period: number) {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length < period) return values;
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = value;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < rows.length; index += 1) {
    value = (rows[index].close - value) * multiplier + value;
    values[index] = value;
  }
  return values;
}

function highest(rows: Kline[], start: number, end: number) {
  let result = -Infinity;
  for (let index = start; index < end; index += 1) result = Math.max(result, rows[index].high);
  return result;
}

function executeFixedSetups(
  profile: SymbolConfig,
  market: MarketData,
  period: Period,
  setups: Array<{
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskDistance: number;
    exitAtTime?: number;
  }>,
  approved = false
) {
  const rows = market.bid;
  const byTime = new Map(rows.map((row, index) => [row.openTime, index]));
  const trades: AuditTrade[] = [];
  let nextFreeTime = period.start;
  const barMs = profile.timeframe === "30m" ? 30 * 60_000 : profile.timeframe === "4h" ? 4 * HOUR_MS : HOUR_MS;

  for (const setup of setups) {
    if (setup.entryTime < period.start || setup.entryTime >= period.end || setup.entryTime < nextFreeTime) continue;
    const entryIndex = byTime.get(setup.entryTime);
    if (entryIndex == null) continue;
    let exit: { exitTime: number; exitPrice: number; result: string } | null = null;

    if (approved && profile.approvedProp) {
      exit = detectApprovedPropPositionExit({
        direction: setup.direction,
        entryTime: setup.entryTime,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        exitAtTime: setup.exitAtTime,
        maxHoldBars: profile.maxHoldBars,
        timeframeHours: profile.approvedProp.timeframeHours,
      }, market.bid.slice(entryIndex), market.ask.slice(entryIndex));
    } else {
      const deadline = setup.entryTime + (profile.maxHoldBars ?? 96) * barMs;
      for (let index = entryIndex; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.openTime >= period.end) break;
        const hitStop = setup.direction === "long" ? row.low <= setup.stopLoss : row.high >= setup.stopLoss;
        const hitTarget = setup.direction === "long" ? row.high >= setup.takeProfit : row.low <= setup.takeProfit;
        if (hitStop || hitTarget) {
          exit = {
            exitTime: row.openTime,
            exitPrice: hitStop ? setup.stopLoss : setup.takeProfit,
            result: hitStop ? "stop_loss" : "take_profit",
          };
          break;
        }
        if (row.openTime >= deadline) {
          exit = { exitTime: row.closeTime, exitPrice: row.close, result: "time_exit" };
          break;
        }
      }
    }

    if (!exit) continue;
    const grossR = setup.direction === "long"
      ? (exit.exitPrice - setup.entryPrice) / setup.riskDistance
      : (setup.entryPrice - exit.exitPrice) / setup.riskDistance;
    let baseCost = approved ? 0 : costR(profile, setup.entryPrice, setup.stopLoss);
    let stressExtra = baseCost * 0.5;
    if (approved) {
      const askIndex = new Map(market.ask.map((row) => [row.openTime, row])).get(setup.entryTime);
      const bidIndex = rows[entryIndex];
      const spreadR = askIndex && bidIndex ? Math.max(0, askIndex.open - bidIndex.open) / setup.riskDistance : 0;
      stressExtra = spreadR * 0.5;
      baseCost = 0;
    }
    trades.push({
      entryTime: setup.entryTime,
      exitTime: exit.exitTime,
      direction: setup.direction,
      entryPrice: setup.entryPrice,
      exitPrice: exit.exitPrice,
      grossR,
      baselineR: grossR - baseCost,
      stressR: grossR - baseCost - stressExtra,
      exitReason: exit.result,
    });
    nextFreeTime = exit.exitTime + 1;
  }
  return trades;
}

function runRangeExpansion(profile: SymbolConfig, market: MarketData, period: Period) {
  const rows = market.bid;
  const lookback = profile.lookback ?? 20;
  const atr = buildAtr(rows, profile.atrPeriod);
  const fast = buildEma(rows, profile.emaFastPeriod ?? 34);
  const slow = buildEma(rows, profile.emaSlowPeriod ?? 144);
  const setups = [];
  for (let index = Math.max(lookback, profile.atrPeriod, profile.emaSlowPeriod ?? 144) + 1; index < rows.length; index += 1) {
    const signalIndex = index - 1;
    const signal = rows[signalIndex];
    const current = rows[index];
    const atrValue = atr[signalIndex];
    const fastValue = fast[signalIndex];
    const slowValue = slow[signalIndex];
    if (atrValue == null || fastValue == null || slowValue == null || !(atrValue > 0)) continue;
    const upper = highest(rows, signalIndex - lookback, signalIndex);
    const rangeOk = signal.high - signal.low >= atrValue * (profile.rangeAtrMultiplier ?? 1.1);
    const long = signal.close > upper && signal.close > signal.open && closeLocation(signal) >= (profile.closeLocationMin ?? 0.7) && fastValue > slowValue;
    if (!long || !rangeOk || profile.directionMode === "short_only") continue;
    const riskDistance = atrValue * profile.atrMultiplier;
    setups.push({
      direction: "long" as const,
      entryTime: current.openTime,
      entryPrice: current.open,
      stopLoss: current.open - riskDistance,
      takeProfit: current.open + riskDistance * (profile.rewardR ?? 3),
      riskDistance,
    });
  }
  return executeFixedSetups(profile, market, period, setups);
}

function runProfilePeriod(profile: SymbolConfig, market: MarketData, period: Period) {
  if (profile.approvedProp) {
    const setups = detectAllApprovedPropSignals(profile.approvedProp, market.bid, market.ask, period.end);
    return executeFixedSetups(profile, market, period, setups, true);
  }
  if (profile.q2Prop) {
    const setups = detectAllQ2PropSignals(profile.q2Prop, market.bid, period.end);
    return executeFixedSetups(profile, market, period, setups);
  }
  if (profile.kind === "range_expansion_breakout") return runRangeExpansion(profile, market, period);

  const base = nativeConfig(profile, period);
  if (profile.kind === "bb_atr") {
    const report = runUniversalBbAtrBacktest({
      klines4h: market.bid,
      config: {
        ...base,
        bbPeriod: profile.bbPeriod,
        bandDeviation: profile.bandDeviation,
        atrPeriod: profile.atrPeriod,
        atrMultiplier: profile.atrMultiplier,
        maxHoldBars: profile.maxHoldBars,
        directionMode: profile.directionMode,
        emaPeriod: profile.emaPeriod,
        emaFilter: profile.emaFilter,
        exitTarget: profile.exitTarget,
        setupVariant: profile.profileId as never,
        strategyName: profile.strategyName,
        strategyVersion: profile.strategyVersion,
      },
    });
    return convertNativeTrades(profile, report);
  }
  if (profile.kind === "donchian") {
    const report = runFxDonchianBacktest({
      klines4h: market.bid,
      config: {
        ...base,
        entryLookback: profile.entryLookback,
        exitLookback: profile.exitLookback,
        atrPeriod: profile.atrPeriod,
        atrMultiplier: profile.atrMultiplier,
        directionMode: profile.directionMode,
        setupVariant: profile.profileId as never,
        strategyName: profile.strategyName,
        strategyVersion: profile.strategyVersion,
      },
    });
    return convertNativeTrades(profile, report as ReturnType<typeof runUniversalBbAtrBacktest>);
  }
  const report = runPropHtfBreakoutBacktest({
    klines: market.bid,
    config: {
      ...base,
      lookback: profile.lookback,
      atrPeriod: profile.atrPeriod,
      emaPeriod: profile.emaPeriod,
      atrMultiplier: profile.atrMultiplier,
      rewardR: profile.rewardR,
      maxHoldBars: profile.maxHoldBars,
      directionMode: profile.directionMode,
      setupVariant: profile.profileId as never,
      strategyName: profile.strategyName,
      strategyVersion: profile.strategyVersion,
    },
  });
  return convertNativeTrades(profile, report as ReturnType<typeof runUniversalBbAtrBacktest>);
}

function calculateMetrics(trades: AuditTrade[], period: Period): Metrics {
  let equity1 = 100;
  let propEquity = 100;
  let stressEquity = 100;
  let peak = 100;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let stressProfit = 0;
  let stressLoss = 0;
  let wins = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  const byDay = new Map<number, number>();

  for (const trade of trades) {
    equity1 *= 1 + trade.baselineR * 0.01;
    propEquity *= 1 + trade.baselineR * 0.005;
    stressEquity *= 1 + trade.stressR * 0.005;
    peak = Math.max(peak, propEquity);
    maxDrawdown = Math.min(maxDrawdown, (propEquity / peak - 1) * 100);
    if (trade.baselineR > 0) {
      wins += 1;
      grossProfit += trade.baselineR;
      currentStreak = 0;
    } else if (trade.baselineR < 0) {
      grossLoss += -trade.baselineR;
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    }
    if (trade.stressR > 0) stressProfit += trade.stressR;
    if (trade.stressR < 0) stressLoss += -trade.stressR;
    const day = Math.floor(trade.exitTime / DAY_MS) * DAY_MS;
    byDay.set(day, (byDay.get(day) ?? 0) + trade.baselineR * 0.5);
  }

  const dailyReturns: number[] = [];
  let dailyEquity = 100;
  for (let day = period.start; day < period.end; day += DAY_MS) {
    if (new Date(day).getUTCDay() === 0 || new Date(day).getUTCDay() === 6) continue;
    const raw = byDay.get(day) ?? 0;
    const value = raw * (100 / dailyEquity);
    dailyReturns.push(value);
    dailyEquity += raw;
  }

  return {
    trades: trades.length,
    wins,
    winRatePct: trades.length ? wins / trades.length * 100 : 0,
    returnPctAt1Risk: equity1 - 100,
    propReturnPctAt0_5Risk: propEquity - 100,
    stressReturnPctAt0_5Risk: stressEquity - 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    stressProfitFactor: stressLoss ? stressProfit / stressLoss : stressProfit ? 999 : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.baselineR, 0) / trades.length : 0,
    maxDrawdownPct: maxDrawdown,
    worstDayPct: dailyReturns.length ? Math.min(...dailyReturns) : 0,
    maxLossStreak: maxStreak,
    firstTrade: iso(trades[0]?.entryTime),
    lastTrade: iso(trades.at(-1)?.entryTime),
    dailyReturnsPct: dailyReturns,
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function sampleBlocks(values: number[], random: () => number, length: number, block = 5) {
  const result: number[] = [];
  while (result.length < length) {
    const start = Math.floor(random() * values.length);
    for (let offset = 0; offset < block && result.length < length; offset += 1) {
      result.push(values[(start + offset) % values.length]);
    }
  }
  return result;
}

function runPhase(days: number[], targetPct: number, maxDays: number) {
  let equity = 100;
  let dayStart = 100;
  for (let index = 0; index < maxDays; index += 1) {
    const value = days[index] ?? 0;
    if (value <= -3) return { passed: false, safe: false, days: index + 1 };
    dayStart = equity;
    equity *= 1 + value / 100;
    if ((equity / dayStart - 1) * 100 <= -3 || equity <= 90) {
      return { passed: false, safe: false, days: index + 1 };
    }
    if (equity >= 100 + targetPct) return { passed: true, safe: true, days: index + 1 };
  }
  return { passed: false, safe: true, days: maxDays };
}

function monteCarlo(values: number[]): MonteCarloResult | null {
  if (!values.length || values.every((value) => value === 0)) return null;
  const random = seededRandom(20260628);
  let phase1Passed = 0;
  let passed = 0;
  let safe = 0;
  const completion: number[] = [];
  for (let run = 0; run < MONTE_CARLO_RUNS; run += 1) {
    const sample = sampleBlocks(values, random, 120);
    const phase1 = runPhase(sample.slice(0, 60), 8, 60);
    if (phase1.safe) safe += 1;
    if (!phase1.passed) continue;
    phase1Passed += 1;
    const phase2 = runPhase(sample.slice(phase1.days, phase1.days + 40), 4, 40);
    if (phase2.passed) {
      passed += 1;
      completion.push(phase1.days + phase2.days);
    }
  }
  completion.sort((left, right) => left - right);
  return {
    runs: MONTE_CARLO_RUNS,
    phase1PassProbabilityPct: phase1Passed / MONTE_CARLO_RUNS * 100,
    challengePassProbabilityPct: passed / MONTE_CARLO_RUNS * 100,
    rulesSafetyProbabilityPct: safe / MONTE_CARLO_RUNS * 100,
    medianCompletionDays: completion.length ? completion[Math.floor(completion.length / 2)] : null,
  };
}

function classify(audit: ProfileAudit) {
  const primary = audit.periods["2026_ytd"];
  const q1 = audit.periods["2026_q1"];
  const q2 = audit.periods["2026_q2"];
  const external = audit.periods["2025"];
  if (!primary) {
    audit.approvalStatus = "insufficient_data";
    audit.propReasons = ["primary_2026_data_unavailable"];
    audit.approvalReasons = ["primary_2026_data_unavailable"];
    return;
  }

  const propReasons: string[] = [];
  if (primary.trades < 10) propReasons.push("fewer_than_10_primary_trades");
  if (primary.propReturnPctAt0_5Risk <= 0) propReasons.push("non_positive_2026_prop_return");
  if (primary.profitFactor < 1.15) propReasons.push("profit_factor_below_1_15");
  if (primary.maxDrawdownPct <= -8) propReasons.push("drawdown_above_8_percent");
  if (primary.worstDayPct <= -3) propReasons.push("daily_loss_limit_breached");
  if (primary.maxLossStreak > 5) propReasons.push("loss_streak_above_5");
  if ((audit.monteCarlo?.phase1PassProbabilityPct ?? 0) < 10) propReasons.push("phase1_probability_below_10_percent");
  audit.propCandidate = propReasons.length === 0;
  audit.propReasons = propReasons;

  const approvalReasons = [...propReasons];
  if (primary.trades < 15) approvalReasons.push("approval_requires_15_primary_trades");
  if (primary.profitFactor < 1.2) approvalReasons.push("approval_pf_below_1_20");
  if (primary.stressProfitFactor < 1.05) approvalReasons.push("stress_pf_below_1_05");
  if (primary.maxDrawdownPct <= -6) approvalReasons.push("approval_drawdown_above_6_percent");
  if (!q1 || q1.propReturnPctAt0_5Risk <= -1) approvalReasons.push("q1_unstable");
  if (!q2 || q2.propReturnPctAt0_5Risk <= -1) approvalReasons.push("q2_unstable");
  if (!external || external.trades < 8) approvalReasons.push("insufficient_2025_external_sample");
  else if (external.profitFactor < 1 || external.propReturnPctAt0_5Risk <= 0) approvalReasons.push("failed_2025_external_check");
  for (const [periodId, metrics] of Object.entries(audit.periods)) {
    if (metrics && metrics.trades >= 8 && metrics.maxLossStreak > 5) {
      approvalReasons.push(`${periodId}_loss_streak_above_5`);
    }
  }
  if (audit.profileId === "prop_xauusd_htf_breakout_2026") {
    approvalReasons.push("xau_yahoo_futures_proxy_not_executable_broker_feed");
  }
  if ((audit.monteCarlo?.challengePassProbabilityPct ?? 0) < 5) approvalReasons.push("challenge_probability_below_5_percent");
  if ((audit.monteCarlo?.rulesSafetyProbabilityPct ?? 0) < 95) approvalReasons.push("rules_safety_below_95_percent");
  audit.approvalReasons = [...new Set(approvalReasons)];
  audit.approvalStatus = audit.approvalReasons.length ? "rejected" : "approved_for_forward";
}

function compactMetrics(metrics: Metrics | null) {
  if (!metrics) return null;
  const { dailyReturnsPct: _daily, ...compact } = metrics;
  return compact;
}

async function auditProfile(profile: SymbolConfig): Promise<ProfileAudit> {
  const empty: ProfileAudit = {
    profileId: profile.profileId,
    symbol: profile.symbol,
    strategyName: profile.strategyName,
    category: profile.strategyCategory,
    timeframe: profile.timeframe,
    kind: profile.kind,
    source: "",
    caveats: [],
    dataStart: null,
    dataEnd: null,
    periods: {},
    monteCarlo: null,
    profitabilityRank: null,
    propCandidate: false,
    propReasons: [],
    approvalStatus: "insufficient_data",
    approvalReasons: [],
  };
  try {
    const market = await loadMarket(profile);
    empty.source = market.source;
    empty.caveats = market.caveats;
    empty.dataStart = iso(market.bid[0]?.openTime);
    empty.dataEnd = iso(market.bid.at(-1)?.openTime);
    for (const period of PERIODS) {
      const trades = runProfilePeriod(profile, market, period);
      empty.periods[period.id] = calculateMetrics(trades, period);
    }
    empty.monteCarlo = monteCarlo(empty.periods["2026_ytd"]?.dailyReturnsPct ?? []);
    classify(empty);
  } catch (error) {
    empty.error = error instanceof Error ? error.message : String(error);
    empty.propReasons = ["audit_error"];
    empty.approvalReasons = ["audit_error"];
  }
  return empty;
}

function reportMarkdown(audits: ProfileAudit[]) {
  const profitable = audits.filter((audit) => audit.periods["2026_ytd"]).sort((left, right) =>
    (right.periods["2026_ytd"]?.returnPctAt1Risk ?? -Infinity) - (left.periods["2026_ytd"]?.returnPctAt1Risk ?? -Infinity));
  const candidates = audits.filter((audit) => audit.propCandidate).sort((left, right) =>
    (right.monteCarlo?.challengePassProbabilityPct ?? 0) - (left.monteCarlo?.challengePassProbabilityPct ?? 0));
  const approved = audits.filter((audit) => audit.approvalStatus === "approved_for_forward");
  const topRows = profitable.slice(0, 10).map((audit, index) => {
    const metric = audit.periods["2026_ytd"]!;
    return `| ${index + 1} | ${audit.profileId} | ${audit.symbol} | ${metric.returnPctAt1Risk.toFixed(2)}% | ${metric.profitFactor.toFixed(2)} | ${metric.maxDrawdownPct.toFixed(2)}% | ${metric.maxLossStreak} |`;
  });
  const candidateRows = candidates.map((audit) => {
    const metric = audit.periods["2026_ytd"]!;
    return `| ${audit.profileId} | ${metric.propReturnPctAt0_5Risk.toFixed(2)}% | ${(audit.monteCarlo?.phase1PassProbabilityPct ?? 0).toFixed(1)}% | ${(audit.monteCarlo?.challengePassProbabilityPct ?? 0).toFixed(1)}% | ${audit.approvalStatus} | ${audit.approvalReasons.join(", ") || "-"} |`;
  });
  return [
    "# Live bot strategy audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Primary period: 2026-01-01 to ${new Date(PRIMARY_END).toISOString()} (exclusive common cutoff).`,
    "Profitability uses 1% compounding risk. Prop simulation uses 0.5% risk, +8%/+4% targets, -3% daily and -10% total limits.",
    "",
    "## Top profitability",
    "",
    "| Rank | Profile | Symbol | 2026 return | PF | Max DD at 0.5% | Max loss streak |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: |",
    ...topRows,
    "",
    "## Prop candidates",
    "",
    "| Profile | 2026 prop return | Phase 1 probability | Full challenge probability | Approval | Blocking reasons |",
    "| --- | ---: | ---: | ---: | --- | --- |",
    ...(candidateRows.length ? candidateRows : ["| None | - | - | - | - | - |"]),
    "",
    "## Approval gate",
    "",
    `Approved for forward validation: ${approved.length ? approved.map((audit) => audit.profileId).join(", ") : "none"}.`,
    "Approval here means forward/paper admission only. Real-money admission still requires an untouched forward sample of at least 20 closed trades or 30 calendar days.",
    "",
    "## Data notes",
    "",
    "- A common 2026 cutoff is used because workspace minute files end between June 12 and June 17.",
    "- Approved profiles use cached Dukascopy bid/ask. Workspace and Yahoo profiles use modeled baseline costs.",
    "- Yahoo XAUUSD remains a GC=F futures proxy and is not interchangeable with an OANDA XAUUSD executable quote.",
  ].join("\n");
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Auditing ${SIGNAL_PROFILES.length} live profiles through ${iso(PRIMARY_END)}`);
  const audits: ProfileAudit[] = [];
  for (const profile of SIGNAL_PROFILES) {
    console.log(`${profile.profileId}: start`);
    const audit = await auditProfile(profile);
    audits.push(audit);
    console.log(`${profile.profileId}: ${audit.error ?? "done"}`);
  }

  const ranked = audits.filter((audit) => audit.periods["2026_ytd"]).sort((left, right) =>
    (right.periods["2026_ytd"]?.returnPctAt1Risk ?? -Infinity) - (left.periods["2026_ytd"]?.returnPctAt1Risk ?? -Infinity));
  ranked.forEach((audit, index) => { audit.profitabilityRank = index + 1; });

  const output = {
    suite: "LIVE_BOT_STRATEGY_MULTIPERIOD_PROP_APPROVAL_AUDIT",
    version: 1,
    generatedAt: new Date().toISOString(),
    profileCount: SIGNAL_PROFILES.length,
    primaryPeriod: PERIODS.find((period) => period.primary),
    assumptions: {
      profitabilityRiskPct: 1,
      propRiskPct: 0.5,
      dailyLossLimitPct: -3,
      totalLossLimitPct: -10,
      phase1TargetPct: 8,
      phase1Days: 60,
      phase2TargetPct: 4,
      phase2Days: 40,
      maximumLossStreak: 5,
      monteCarloRuns: MONTE_CARLO_RUNS,
      costStressMultiplier: 1.5,
    },
    periods: PERIODS,
    audits: audits.map((audit) => ({
      ...audit,
      periods: Object.fromEntries(Object.entries(audit.periods).map(([key, value]) => [key, compactMetrics(value)])),
    })),
  };
  writeFileSync(`${OUTPUT_DIR}/live_bot_strategy_audit.json`, JSON.stringify(output, null, 2), "utf8");

  const headers = ["rank", "profile_id", "symbol", "category", "timeframe", "kind", "period", "trades", "return_1pct", "return_prop_0_5pct", "stress_return_prop", "pf", "stress_pf", "expectancy_r", "max_dd_pct", "worst_day_pct", "max_loss_streak", "prop_candidate", "approval_status", "source", "error"];
  const summaryRows = audits.flatMap((audit) => PERIODS.map((period) => {
    const metric = audit.periods[period.id];
    return [audit.profitabilityRank, audit.profileId, audit.symbol, audit.category, audit.timeframe, audit.kind, period.id, metric?.trades, metric?.returnPctAt1Risk, metric?.propReturnPctAt0_5Risk, metric?.stressReturnPctAt0_5Risk, metric?.profitFactor, metric?.stressProfitFactor, metric?.expectancyR, metric?.maxDrawdownPct, metric?.worstDayPct, metric?.maxLossStreak, audit.propCandidate, audit.approvalStatus, audit.source, audit.error ?? ""];
  }));
  writeCsv(`${OUTPUT_DIR}/live_bot_strategy_audit_summary.csv`, [headers, ...summaryRows]);

  const primaryRows = ranked.map((audit) => {
    const metric = audit.periods["2026_ytd"]!;
    return [audit.profitabilityRank, audit.profileId, audit.symbol, metric.trades, metric.returnPctAt1Risk, metric.profitFactor, metric.maxDrawdownPct, metric.maxLossStreak, audit.monteCarlo?.phase1PassProbabilityPct, audit.monteCarlo?.challengePassProbabilityPct, audit.propCandidate, audit.approvalStatus];
  });
  writeCsv(`${OUTPUT_DIR}/live_bot_strategy_profitability_top.csv`, [["rank", "profile_id", "symbol", "trades", "return_1pct", "pf", "max_dd_prop_pct", "max_loss_streak", "phase1_probability_pct", "challenge_probability_pct", "prop_candidate", "approval_status"], ...primaryRows]);
  writeCsv(`${OUTPUT_DIR}/live_bot_strategy_prop_candidates.csv`, [["profile_id", "symbol", "prop_return_pct", "pf", "max_dd_pct", "max_loss_streak", "phase1_probability_pct", "challenge_probability_pct", "approval_status", "approval_reasons"], ...audits.filter((audit) => audit.propCandidate).map((audit) => {
    const metric = audit.periods["2026_ytd"]!;
    return [audit.profileId, audit.symbol, metric.propReturnPctAt0_5Risk, metric.profitFactor, metric.maxDrawdownPct, metric.maxLossStreak, audit.monteCarlo?.phase1PassProbabilityPct, audit.monteCarlo?.challengePassProbabilityPct, audit.approvalStatus, audit.approvalReasons.join("|")];
  })]);
  writeCsv(`${OUTPUT_DIR}/live_bot_strategy_approval.csv`, [["profile_id", "symbol", "status", "reasons"], ...audits.map((audit) => [audit.profileId, audit.symbol, audit.approvalStatus, audit.approvalReasons.join("|")])]);
  writeFileSync(`${OUTPUT_DIR}/live_bot_strategy_audit.md`, reportMarkdown(audits), "utf8");

  console.table(ranked.slice(0, 10).map((audit) => ({
    rank: audit.profitabilityRank,
    profile: audit.profileId,
    symbol: audit.symbol,
    return2026: audit.periods["2026_ytd"]?.returnPctAt1Risk.toFixed(2),
    pf: audit.periods["2026_ytd"]?.profitFactor.toFixed(2),
    streak: audit.periods["2026_ytd"]?.maxLossStreak,
    phase1: audit.monteCarlo?.phase1PassProbabilityPct.toFixed(1),
    approval: audit.approvalStatus,
  })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
