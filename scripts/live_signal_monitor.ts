import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { lookup } from "node:dns";
import { get as httpsGet } from "node:https";
import type { Kline } from "../src/lib/binance";

type Direction = "long" | "short";
type StrategyKind = "donchian" | "bb_atr";
type SignalTimeframe = "1h" | "4h";
type StrategyCategory = "research" | "asset_specific" | "universal" | "prop" | "crypto";

interface Signal {
  key: string;
  symbol: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  direction: Direction;
  signalTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  exitRule: string;
  riskDistance: number;
  riskDistancePips: number;
  source: string;
  reason: string;
}

interface SymbolConfig {
  profileId: string;
  symbol: string;
  yahooSymbol: string;
  timeframe: SignalTimeframe;
  kind: StrategyKind;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  entryLookback?: number;
  exitLookback?: number;
  bbPeriod?: number;
  bandDeviation?: number;
  atrPeriod: number;
  atrMultiplier: number;
  maxHoldBars?: number;
  directionMode: "all" | "long_only" | "short_only";
  emaPeriod?: number;
  emaFilter?: "none" | "trend" | "countertrend";
  exitTarget?: "mean" | "opposite_band";
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
const OUT_DIR = "logs";
const STATE_PATH = `${OUT_DIR}/signal-monitor-state.json`;
const JOURNAL_PATH = `${OUT_DIR}/signal-journal.csv`;
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const STRATEGY_CATEGORY_LABELS: Record<StrategyCategory, string> = {
  research: "Research стратегія",
  asset_specific: "Індивідуальна стратегія",
  universal: "Універсальна стратегія",
  prop: "Пропстратегія",
  crypto: "Криптостратегія",
};

const SIGNAL_PROFILES: SymbolConfig[] = [
  {
    profileId: "research_pack_audusd_bb_atr_4h",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "Research 2026 AUDUSD BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.audusd-bb20-dev2-long-opposite-4h.1",
    bbPeriod: 20,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 2,
    maxHoldBars: 6,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "audusd_bb_atr_long_reversion_2026",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "AUDUSD BB/ATR Long Reversion 2026",
    strategyCategory: "asset_specific",
    strategyVersion: "research.2026-ytd.audusd-bb100-dev1_75-atr0_75-hold24-long-countertrend-opposite-1h.1",
    bbPeriod: 100,
    bandDeviation: 1.75,
    atrPeriod: 14,
    atrMultiplier: 0.75,
    maxHoldBars: 24,
    directionMode: "long_only",
    emaPeriod: 200,
    emaFilter: "countertrend",
    exitTarget: "opposite_band",
  },
  {
    profileId: "research_pack_eurusd_donchian_1h",
    symbol: "EURUSD",
    yahooSymbol: "EURUSD=X",
    timeframe: "1h",
    kind: "donchian",
    strategyName: "Research 2026 EURUSD Donchian 1H 80/10",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.eurusd-donchian-1h-80-10-atr1.1",
    entryLookback: 80,
    exitLookback: 10,
    atrPeriod: 14,
    atrMultiplier: 1,
    directionMode: "all",
  },
  {
    profileId: "research_pack_gbpusd_bb_atr_1h",
    symbol: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 GBPUSD BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.gbpusd-bb80-dev1_5-short-mean.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "short_only",
    exitTarget: "mean",
  },
  {
    profileId: "research_pack_usdjpy_bb_atr_1h",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 USDJPY BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.usdjpy-bb40-dev2-long-opposite.1",
    bbPeriod: 40,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "long_only",
    exitTarget: "opposite_band",
  },
  {
    profileId: "research_pack_ger40_bb_atr_1h",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 GER40 BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.ger40-bb80-dev2-short-opposite.1",
    bbPeriod: 80,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "ger40_bb_atr_short_reversion_2026",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "GER40 BB/ATR Short Reversion 2026",
    strategyCategory: "asset_specific",
    strategyVersion: "research.2026-ytd.ger40-bb80-dev2_25-atr1_25-hold72-short-opposite-1h.1",
    bbPeriod: 80,
    bandDeviation: 2.25,
    atrPeriod: 14,
    atrMultiplier: 1.25,
    maxHoldBars: 72,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_eurjpy",
    symbol: "EURJPY",
    yahooSymbol: "EURJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_chfjpy",
    symbol: "CHFJPY",
    yahooSymbol: "CHFJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_usdjpy",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_gbpjpy",
    symbol: "GBPJPY",
    yahooSymbol: "GBPJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_prop_nzdusd_bb_atr_2026",
    symbol: "NZDUSD",
    yahooSymbol: "NZDUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "FX Prop NZDUSD BB/ATR 2026",
    strategyCategory: "prop",
    strategyVersion: "research.2026-ytd.prop-nzdusd-1h-bb80-dev1_75-ema200-trend-atr0_5-hold24-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.75,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 24,
    directionMode: "all",
    emaPeriod: 200,
    emaFilter: "trend",
    exitTarget: "opposite_band",
  },
  {
    profileId: "crypto_doge_bb_atr_short_reversion_2026",
    symbol: "DOGEUSDT",
    yahooSymbol: "DOGE-USD",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Crypto DOGE BB/ATR Short Reversion 2026",
    strategyCategory: "crypto",
    strategyVersion: "research.2026-ytd.dogeusdt-1h-bb120-dev2_25-short-atr0_5-mean-hold48.1",
    bbPeriod: 120,
    bandDeviation: 2.25,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "mean",
  },
];

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

function iso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function ensureJournal() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(JOURNAL_PATH)) {
    appendFileSync(
      JOURNAL_PATH,
      [
        "logged_at",
        "status",
        "symbol",
        "strategy",
        "direction",
        "signal_time",
        "entry_time",
        "entry_price",
        "stop_loss",
        "take_profit",
        "exit_rule",
        "risk_distance_pips",
        "reason",
      ].join(",") + "\n",
      "utf8"
    );
  }
}

function appendJournal(status: string, signal: Signal) {
  ensureJournal();
  appendFileSync(
    JOURNAL_PATH,
    [
      iso(Date.now()),
      status,
      signal.symbol,
      signal.strategyName,
      signal.direction,
      iso(signal.signalTime),
      iso(signal.entryTime),
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit ?? "",
      signal.exitRule,
      signal.riskDistancePips,
      signal.reason,
    ]
      .map(csvEscape)
      .join(",") + "\n",
    "utf8"
  );
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { sentKeys: [] as string[] };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as { sentKeys?: string[] };
    return { sentKeys: Array.isArray(parsed.sentKeys) ? parsed.sentKeys : [] };
  } catch {
    return { sentKeys: [] as string[] };
  }
}

function saveState(state: { sentKeys: string[] }) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({ sentKeys: state.sentKeys.slice(-500) }, null, 2), "utf8");
}

function timeframeMs(timeframe: SignalTimeframe) {
  return timeframe === "4h" ? FOUR_HOURS_MS : ONE_HOUR_MS;
}

function yahooInterval(timeframe: SignalTimeframe) {
  return timeframe === "4h" ? "4h" : "60m";
}

function pipSize(symbol: string) {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40") return 1;
  return 0.0001;
}

function formatPrice(symbol: string, value: number | null) {
  if (value == null || !Number.isFinite(value)) return "dynamic";
  if (symbol === "GER40") return value.toFixed(1);
  return value.toFixed(symbol.includes("JPY") ? 3 : 5);
}

function strategyCategoryLabel(category: StrategyCategory) {
  return STRATEGY_CATEGORY_LABELS[category] ?? category;
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrAt(rows: Kline[], index: number, period: number) {
  if (index - period < 0) return null;
  let sum = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    sum += trueRange(rows[cursor], rows[cursor - 1]);
  }
  return sum / period;
}

function bandsAt(rows: Kline[], index: number, period: number, deviation: number) {
  if (index - period + 1 < 0) return null;
  const window = rows.slice(index - period + 1, index + 1);
  const mean = window.reduce((sum, row) => sum + row.close, 0) / period;
  const variance = window.reduce((sum, row) => sum + (row.close - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mean, upper: mean + deviation * sd, lower: mean - deviation * sd };
}

function emaAt(rows: Kline[], index: number, period: number) {
  if (period <= 0 || index - period + 1 < 0) return null;

  const multiplier = 2 / (period + 1);
  let ema = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  for (let cursor = period; cursor <= index; cursor += 1) {
    ema = (rows[cursor].close - ema) * multiplier + ema;
  }

  return ema;
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

function directionAllowed(config: SymbolConfig, direction: Direction) {
  if (config.directionMode === "long_only") return direction === "long";
  if (config.directionMode === "short_only") return direction === "short";
  return true;
}

function emaFilterAllowed(config: SymbolConfig, direction: Direction, signalClose: number, ema: number | null) {
  const filter = config.emaFilter ?? "none";
  if (filter === "none") return true;
  if (ema == null) return false;

  if (filter === "trend") {
    return direction === "long" ? signalClose > ema : signalClose < ema;
  }

  return direction === "long" ? signalClose < ema : signalClose > ema;
}

function parseYahooChart(payload: unknown, timeframe: SignalTimeframe): Kline[] {
  const root = payload as {
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
  const error = root.chart?.error;
  if (error) throw new Error(error.description || error.code || "Yahoo chart error");
  const result = root.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];

  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      const barMs = timeframeMs(timeframe);
      return {
        openTime,
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
        closeTime: openTime + barMs - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      } satisfies Kline;
    })
    .filter((row): row is Kline => row != null)
    .sort((a, b) => a.openTime - b.openTime);
}

function getJsonWithIpv4(url: URL, timeoutMs = 20_000) {
  return new Promise<unknown>((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        headers: {
          "accept": "application/json,text/plain,*/*",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        },
        lookup: (hostname, options, callback) => {
          lookup(hostname, { ...options, family: 4 }, callback);
        },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Yahoo chart error ${response.statusCode ?? "unknown"} ${response.statusMessage ?? ""}${
                  body ? `: ${body.slice(0, 180)}` : ""
                }`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Yahoo request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

async function fetchYahooKlines(config: SymbolConfig) {
  const endTime = Date.now() + 5 * 60 * 1000;
  const warmupBars = Math.max(config.entryLookback ?? 0, config.bbPeriod ?? 0, config.emaPeriod ?? 0, 120);
  const barsPerDay = config.timeframe === "4h" ? 6 : 24;
  const lookbackDays = Math.max(30, Math.ceil((warmupBars + 48) / barsPerDay));
  const startTime = endTime - lookbackDays * 24 * ONE_HOUR_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const host = YAHOO_HOSTS[attempt % YAHOO_HOSTS.length];
    const url = new URL(
      `https://${host}/v8/finance/chart/${encodeURIComponent(config.yahooSymbol)}`
    );
    url.searchParams.set("interval", yahooInterval(config.timeframe));
    url.searchParams.set("period1", Math.floor(startTime / 1000).toString());
    url.searchParams.set("period2", Math.floor(endTime / 1000).toString());
    url.searchParams.set("includePrePost", "true");

    try {
      const rows = parseYahooChart(await getJsonWithIpv4(url), config.timeframe);
      if (!rows.length) {
        throw new Error("Yahoo chart returned no OHLC rows");
      }

      return rows;
    } catch (error) {
      const cause =
        error instanceof Error && "cause" in error && error.cause
          ? ` cause=${String(error.cause)}`
          : "";
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `${iso(Date.now())} ${config.symbol}: Yahoo fetch attempt ${attempt + 1}/4 via ${host} failed: ${
          lastError.message
        }${cause}`
      );
      await sleep(1_000 * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`Yahoo chart fetch failed for ${config.symbol}`);
}

function selectSignalAndEntryBars(rows: Kline[], timeframe: SignalTimeframe) {
  const now = Date.now();
  const barMs = timeframeMs(timeframe);
  const closedRows = rows.filter((row) => row.openTime + barMs <= now - 30_000);
  const signal = closedRows[closedRows.length - 1];
  if (!signal) return null;
  const signalIndex = rows.findIndex((row) => row.openTime === signal.openTime);
  const next = rows[signalIndex + 1];
  if (next && next.openTime > signal.openTime) {
    return { signalIndex, entryIndex: signalIndex + 1 };
  }
  return null;
}

function detectDonchianSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectSignalAndEntryBars(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex, entryIndex } = selected;
  const entryLookback = config.entryLookback ?? 80;
  const exitLookback = config.exitLookback ?? 10;
  if (signalIndex - entryLookback < 0) return null;

  const signal = rows[signalIndex];
  const entryBar = rows[entryIndex];
  const channelHigh = highest(rows, signalIndex - entryLookback, signalIndex);
  const channelLow = lowest(rows, signalIndex - entryLookback, signalIndex);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  if (atr == null || atr <= 0) return null;

  const direction: Direction | null =
    signal.close > channelHigh ? "long" : signal.close < channelLow ? "short" : null;
  if (!direction || !directionAllowed(config, direction)) return null;

  const entryPrice = entryBar.open;
  const riskDistance = atr * config.atrMultiplier;
  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const riskDistancePips = riskDistance / pipSize(config.symbol);
  const key = [config.symbol, config.profileId, config.strategyVersion, direction, entryBar.openTime].join("|");

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: entryBar.openTime,
    entryPrice,
    stopLoss,
    takeProfit: null,
    exitRule: `${exitLookback}H Donchian channel exit, no fixed TP`,
    riskDistance,
    riskDistancePips,
    source: `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke above Donchian(${entryLookback}) high ${formatPrice(config.symbol, channelHigh)}`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke below Donchian(${entryLookback}) low ${formatPrice(config.symbol, channelLow)}`,
  } satisfies Signal;
}

function detectBbAtrSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectSignalAndEntryBars(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex, entryIndex } = selected;
  const bbPeriod = config.bbPeriod ?? 80;
  const deviation = config.bandDeviation ?? 2;
  const signal = rows[signalIndex];
  const entryBar = rows[entryIndex];
  const bands = bandsAt(rows, signalIndex, bbPeriod, deviation);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const ema = config.emaPeriod ? emaAt(rows, signalIndex, config.emaPeriod) : null;
  if (!bands || atr == null || atr <= 0) return null;

  const direction: Direction | null =
    signal.close < bands.lower ? "long" : signal.close > bands.upper ? "short" : null;
  if (!direction || !directionAllowed(config, direction)) return null;
  if (!emaFilterAllowed(config, direction, signal.close, ema)) return null;

  const entryPrice = entryBar.open;
  const riskDistance = atr * config.atrMultiplier;
  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const takeProfit =
    config.exitTarget === "opposite_band"
      ? direction === "long"
        ? bands.upper
        : bands.lower
      : bands.mean;
  if ((direction === "long" && takeProfit <= entryPrice) || (direction === "short" && takeProfit >= entryPrice)) {
    return null;
  }

  const key = [config.symbol, config.profileId, config.strategyVersion, direction, entryBar.openTime].join("|");
  const filterText =
    config.emaFilter && config.emaFilter !== "none" && ema != null
      ? `; EMA${config.emaPeriod} ${config.emaFilter} filter passed at ${formatPrice(config.symbol, ema)}`
      : "";

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: entryBar.openTime,
    entryPrice,
    stopLoss,
    takeProfit,
    exitRule: `TP at ${config.exitTarget === "opposite_band" ? "opposite Bollinger band" : "Bollinger mean"}, time stop ${config.maxHoldBars ?? 96} bars`,
    riskDistance,
    riskDistancePips: riskDistance / pipSize(config.symbol),
    source: `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} closed below BB(${bbPeriod}, ${deviation}) lower ${formatPrice(config.symbol, bands.lower)}${filterText}`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} closed above BB(${bbPeriod}, ${deviation}) upper ${formatPrice(config.symbol, bands.upper)}${filterText}`,
  } satisfies Signal;
}

function detectSignal(config: SymbolConfig, rows: Kline[]) {
  return config.kind === "donchian"
    ? detectDonchianSignal(config, rows)
    : detectBbAtrSignal(config, rows);
}

function signalMessage(signal: Signal) {
  const tp = signal.takeProfit == null ? signal.exitRule : formatPrice(signal.symbol, signal.takeProfit);
  return [
    "<b>PAPER SIGNAL</b>",
    `<b>${htmlEscape(signal.symbol)}</b> ${signal.direction.toUpperCase()}`,
    `Strategy: ${htmlEscape(signal.strategyName)}`,
    `Класифікація: ${htmlEscape(strategyCategoryLabel(signal.strategyCategory))}`,
    `Signal candle: ${iso(signal.signalTime)}`,
    `Entry time: ${iso(signal.entryTime)}`,
    `Entry: <code>${formatPrice(signal.symbol, signal.entryPrice)}</code>`,
    `SL: <code>${formatPrice(signal.symbol, signal.stopLoss)}</code>`,
    `TP / exit: <code>${htmlEscape(tp)}</code>`,
    `Risk distance: ${signal.riskDistancePips.toFixed(1)} pips/points`,
    `Reason: ${htmlEscape(signal.reason)}`,
    `Strategy version: ${htmlEscape(signal.strategyVersion)}`,
    `Source: ${htmlEscape(signal.source)}`,
    "",
    "Mode: paper signal only. No auto-trade.",
  ].join("\n");
}

async function sendTelegram(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { description?: string } | null;
    throw new Error(`Telegram sendMessage failed: ${response.status} ${payload?.description ?? response.statusText}`);
  }
}

function configuredSymbols() {
  const raw =
    process.env.SIGNAL_SYMBOLS ?? "AUDUSD,EURUSD,GBPUSD,USDJPY,GER40,EURJPY,CHFJPY,GBPJPY,NZDUSD,DOGEUSDT";
  const supportedSymbols = new Set(SIGNAL_PROFILES.map((profile) => profile.symbol));
  return raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((symbol, index, symbols) => supportedSymbols.has(symbol) && symbols.indexOf(symbol) === index);
}

function profilesForSymbol(symbol: string) {
  return SIGNAL_PROFILES.filter((profile) => profile.symbol === symbol);
}

function profileLabel(profile: SymbolConfig) {
  return `${profile.symbol}/${profile.profileId}`;
}

async function scanOnce({ forceTest = false } = {}) {
  const state = loadState();
  const symbols = configuredSymbols();
  const maxAgeMinutes = Number(process.env.SIGNAL_MAX_SIGNAL_AGE_MINUTES ?? "90");
  const dryRun = process.env.SIGNAL_DRY_RUN === "1" || process.env.SIGNAL_DRY_RUN === "true";

  if (forceTest) {
    const message = [
      "<b>PAPER SIGNAL TEST</b>",
      "Telegram delivery is configured.",
      `Time: ${iso(Date.now())}`,
      "No auto-trade.",
    ].join("\n");
    if (dryRun) {
      console.log("[dry-run] Telegram test message:");
      console.log(message.replace(/<[^>]+>/g, ""));
    } else {
      await sendTelegram(message);
      console.log("Telegram test message sent.");
    }
    return;
  }

  const rowsCache = new Map<string, Kline[]>();

  for (const symbol of symbols) {
    const profiles = profilesForSymbol(symbol);
    if (!profiles.length) {
      console.log(`${iso(Date.now())} ${symbol}: no configured signal profiles`);
      continue;
    }

    for (const config of profiles) {
      const label = profileLabel(config);
      const cacheKey = [config.yahooSymbol, config.timeframe].join("|");
      try {
        let rows = rowsCache.get(cacheKey);
        if (!rows) {
          rows = await fetchYahooKlines(config);
          rowsCache.set(cacheKey, rows);
        }
        const signal = detectSignal(config, rows);
        if (!signal) {
          console.log(`${iso(Date.now())} ${label}: no signal`);
          continue;
        }

        const ageMinutes = (Date.now() - signal.entryTime) / 60_000;
        if (ageMinutes > maxAgeMinutes) {
          console.log(`${iso(Date.now())} ${label}: signal skipped as stale (${ageMinutes.toFixed(1)} min)`);
          continue;
        }

        if (state.sentKeys.includes(signal.key)) {
          console.log(`${iso(Date.now())} ${label}: duplicate signal already handled`);
          continue;
        }

        const message = signalMessage(signal);
        if (dryRun) {
          console.log("[dry-run] Signal detected:");
          console.log(message.replace(/<[^>]+>/g, ""));
          appendJournal("dry_run", signal);
        } else {
          await sendTelegram(message);
          appendJournal("sent", signal);
          console.log(`${iso(Date.now())} ${label}: Telegram signal sent`);
        }

        state.sentKeys.push(signal.key);
        saveState(state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${iso(Date.now())} ${label}: ${message}`);
      }
    }
  }
}

async function main() {
  loadEnv();
  ensureJournal();

  const args = new Set(process.argv.slice(2));
  if (args.has("--test-telegram")) {
    await scanOnce({ forceTest: true });
    return;
  }

  if (args.has("--once")) {
    await scanOnce();
    return;
  }

  const pollMs = Math.max(60_000, Number(process.env.SIGNAL_POLL_MS ?? "300000"));
  const profileCount = configuredSymbols().reduce((sum, symbol) => sum + profilesForSymbol(symbol).length, 0);
  console.log(
    `Starting live signal monitor. Poll: ${pollMs}ms. Symbols: ${configuredSymbols().join(", ")}. Profiles: ${profileCount}`
  );
  for (;;) {
    await scanOnce();
    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
