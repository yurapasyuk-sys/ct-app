import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { decodeJettaCandles } from "../src/lib/data-handlers/dukascopy-jetta";

type Direction = "long" | "short";
type Family =
  | "trend_breakout"
  | "trend_pullback"
  | "session_momentum"
  | "adaptive_regime"
  | "compression_breakout"
  | "liquidity_sweep_reclaim";
type AssetClass = "forex" | "index" | "metal";

interface Asset {
  symbol: string;
  code: string;
  assetClass: AssetClass;
}

interface MarketData {
  bid: Kline[];
  ask: Kline[];
}

interface PairedBar {
  openTime: number;
  closeTime: number;
  bid: Kline;
  ask: Kline;
}

interface StrategyConfig {
  id: string;
  family: Family;
  timeframeHours: 1 | 4;
  lookback?: number;
  fastEma: number;
  slowEma: number;
  pullbackEma?: number;
  signalHour?: number;
  momentumBars?: number;
  minMoveAtr?: number;
  efficiencyPeriod?: number;
  trendEfficiencyMin?: number;
  rangeEfficiencyMax?: number;
  rangeZ?: number;
  compressionRatio?: number;
  rangeStartHour?: number;
  rangeEndHour?: number;
  signalEndHour?: number;
  sweepBufferAtr?: number;
  stopAtr: number;
  targetR: number;
  maxHoldBars: number;
}

interface Trade {
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  riskDistance: number;
  netR: number;
  stressR: number;
  exitReason: string;
}

interface ChallengeWindow {
  start: number;
  end: number;
  targetPct: 4 | 8;
  passed: boolean;
  safe: boolean;
  completionDays: number | null;
  endEquity: number;
  maxDrawdownPct: number;
  worstDayPct: number;
  maxLossStreak: number;
  acceptedTrades: number;
  failureReason: string | null;
}

interface WindowSet {
  windows: ChallengeWindow[];
  starts: number;
  passed: number;
  passRatePct: number;
  safeRatePct: number;
  allPassed: boolean;
  maxCompletionDays: number | null;
  medianCompletionDays: number | null;
  worstDrawdownPct: number;
  worstDayPct: number;
  maxLossStreak: number;
  failureReasons: Record<string, number>;
}

interface CandidateResult {
  config: StrategyConfig;
  subsetId: string;
  symbols: string[];
  riskPct: number;
  trainPhase1: WindowSet;
  trainPhase2: WindowSet;
  trainScore: number;
}

interface PortfolioCandidateResult {
  id: string;
  components: CandidateResult[];
  riskPct: number;
  trades: Trade[];
  trainPhase1: WindowSet;
  trainPhase2: WindowSet;
  trainScore: number;
}

interface AssetCandidateResult {
  asset: Asset;
  config: StrategyConfig;
  trades: Trade[];
  trainPhase1: WindowSet;
  trainPhase2: WindowSet;
  trainScore: number;
}

interface RegimeCandidateResult {
  id: string;
  kind: "single" | "portfolio";
  config?: StrategyConfig;
  subsetId?: string;
  components?: Array<{ configId: string; subsetId: string }>;
  symbols: string[];
  phase1: WindowSet;
  phase2: WindowSet;
  stressPhase1: WindowSet;
  score: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const START = Date.parse("2020-10-01T00:00:00Z");
const TRAIN_START = Date.parse("2021-01-01T00:00:00Z");
const TRAIN_END = Date.parse("2024-01-01T00:00:00Z");
const VALIDATION_END = Date.parse("2025-01-01T00:00:00Z");
const REGIME_2026_START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse(process.env.ROLLING_PROP_END ?? "2026-06-27T00:00:00Z");
const CACHE_DIR = ".scratch/rolling_prop_hourly";
const OUTPUT_DIR = "public/exports";
const DAILY_ENTRY_STOP_PCT = -2;
const DAILY_HARD_LIMIT_PCT = -3;
const TOTAL_LOSS_LIMIT_PCT = -10;
const MAX_CONCURRENT_RISK_PCT = 2;
const MAX_LOSS_STREAK = 7;
const RISK_LEVELS = [1] as const;
const TOP_TRAIN_CANDIDATES = 24;

const ASSETS: Asset[] = [
  { symbol: "EURUSD", code: "EUR-USD", assetClass: "forex" },
  { symbol: "GBPUSD", code: "GBP-USD", assetClass: "forex" },
  { symbol: "USDJPY", code: "USD-JPY", assetClass: "forex" },
  { symbol: "AUDUSD", code: "AUD-USD", assetClass: "forex" },
  { symbol: "USDCHF", code: "USD-CHF", assetClass: "forex" },
  { symbol: "USDCAD", code: "USD-CAD", assetClass: "forex" },
  { symbol: "US30", code: "USA30.IDX-USD", assetClass: "index" },
  { symbol: "SPX500", code: "USA500.IDX-USD", assetClass: "index" },
  { symbol: "NAS100", code: "USATECH.IDX-USD", assetClass: "index" },
  { symbol: "XAUUSD", code: "XAU-USD", assetClass: "metal" },
  { symbol: "XAGUSD", code: "XAG-USD", assetClass: "metal" },
];

const SUBSETS = [
  { id: "all", classes: ["forex", "index", "metal"] as AssetClass[] },
  { id: "forex_indices", classes: ["forex", "index"] as AssetClass[] },
  { id: "forex_metals", classes: ["forex", "metal"] as AssetClass[] },
  { id: "indices_metals", classes: ["index", "metal"] as AssetClass[] },
];

function iso(value: number) {
  return new Date(value).toISOString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`, "utf8");
}

function monthStarts(start: number, end: number) {
  const result: number[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() < end) {
    result.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

async function fetchJson(url: string, attempts = 4): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          origin: "https://widgets.dukascopy.com",
          referer: "https://widgets.dukascopy.com/",
          "user-agent": "Centurion rolling prop research/1.0",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Unknown fetch error");
}

async function mapLimit<T, R>(values: T[], limit: number, task: (value: T) => Promise<R>) {
  const results: R[] = Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await task(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchSide(asset: Asset, side: "BID" | "ASK") {
  const months = monthStarts(START, END);
  const currentMonthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const payloads = await mapLimit(months, 8, async (monthStart) => {
    const month = new Date(monthStart);
    const url = monthStart >= currentMonthStart
      ? `https://jetta.dukascopy.com/v1/candles/trade/hour/${asset.code}/${side}?from=${monthStart}`
      : `https://jetta.dukascopy.com/v1/candles/trade/hour/${asset.code}/${side}/${month.getUTCFullYear()}/${month.getUTCMonth() + 1}`;
    return fetchJson(url);
  });
  const unique = new Map<number, Kline>();
  for (const payload of payloads) {
    for (const row of decodeJettaCandles(payload as never)) {
      if (row.openTime >= START && row.openTime < END) unique.set(row.openTime, row);
    }
  }
  return [...unique.values()].sort((left, right) => left.openTime - right.openTime);
}

async function loadAsset(asset: Asset): Promise<MarketData> {
  const path = `${CACHE_DIR}/${asset.symbol}.json`;
  if (existsSync(path)) {
    const cached = JSON.parse(readFileSync(path, "utf8")) as MarketData;
    if (cached.bid[0]?.openTime <= START + 7 * DAY_MS && cached.bid.at(-1)?.openTime >= END - 7 * DAY_MS) {
      return cached;
    }
  }
  console.log(`${asset.symbol}: downloading Dukascopy BID/ASK hourly history`);
  const [bid, ask] = await Promise.all([fetchSide(asset, "BID"), fetchSide(asset, "ASK")]);
  if (bid.length < 20_000 || ask.length < 20_000) {
    throw new Error(`${asset.symbol}: insufficient history bid=${bid.length}, ask=${ask.length}`);
  }
  const data = { bid, ask };
  writeFileSync(path, JSON.stringify(data), "utf8");
  return data;
}

function pairBars(data: MarketData, timeframeHours: 1 | 4) {
  const interval = timeframeHours * HOUR_MS;
  const aggregate = (rows: Kline[]) => {
    const buckets = new Map<number, Kline>();
    for (const row of rows) {
      const openTime = Math.floor(row.openTime / interval) * interval;
      const current = buckets.get(openTime);
      if (!current) {
        buckets.set(openTime, { ...row, openTime, closeTime: openTime + interval - 1 });
      } else {
        current.high = Math.max(current.high, row.high);
        current.low = Math.min(current.low, row.low);
        current.close = row.close;
        current.volume += row.volume;
      }
    }
    return [...buckets.values()].sort((left, right) => left.openTime - right.openTime);
  };
  const bid = aggregate(data.bid);
  const askByTime = new Map(aggregate(data.ask).map((row) => [row.openTime, row]));
  return bid.flatMap((bidRow) => {
    const askRow = askByTime.get(bidRow.openTime);
    return askRow ? [{ openTime: bidRow.openTime, closeTime: bidRow.closeTime, bid: bidRow, ask: askRow }] : [];
  });
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
}

function buildAtr(rows: PairedBar[], period = 14) {
  const result: Array<number | null> = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index].bid, rows[index - 1].bid);
    if (index > period) sum -= trueRange(rows[index - period].bid, rows[index - period - 1].bid);
    if (index >= period) result[index] = sum / period;
  }
  return result;
}

function buildEma(rows: PairedBar[], period: number) {
  const result: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length < period) return result;
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.bid.close, 0) / period;
  result[period - 1] = value;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < rows.length; index += 1) {
    value = (rows[index].bid.close - value) * multiplier + value;
    result[index] = value;
  }
  return result;
}

function highest(rows: PairedBar[], start: number, end: number) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, rows[index].bid.high);
  return value;
}

function lowest(rows: PairedBar[], start: number, end: number) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, rows[index].ask.low);
  return value;
}

function createConfigs() {
  const configs: StrategyConfig[] = [];
  const emaPairs: Array<[number, number]> = [[20, 100], [50, 200]];
  for (const timeframeHours of [1, 4] as const) {
    for (const lookback of [20, 40, 80]) {
      for (const [fastEma, slowEma] of emaPairs) {
        for (const stopAtr of [0.75, 1]) {
          for (const targetR of [2, 3]) {
            configs.push({
              id: `breakout_${timeframeHours}h_ch${lookback}_ema${fastEma}_${slowEma}_s${stopAtr}_t${targetR}`,
              family: "trend_breakout",
              timeframeHours,
              lookback,
              fastEma,
              slowEma,
              stopAtr,
              targetR,
              maxHoldBars: timeframeHours === 1 ? 24 : 12,
            });
          }
        }
      }
    }
    for (const [fastEma, slowEma] of emaPairs) {
      for (const pullbackEma of [20, 34]) {
        for (const stopAtr of [0.75, 1]) {
          for (const targetR of [2, 3]) {
            configs.push({
              id: `pullback_${timeframeHours}h_ema${fastEma}_${slowEma}_p${pullbackEma}_s${stopAtr}_t${targetR}`,
              family: "trend_pullback",
              timeframeHours,
              fastEma,
              slowEma,
              pullbackEma,
              stopAtr,
              targetR,
              maxHoldBars: timeframeHours === 1 ? 24 : 12,
            });
          }
        }
      }
    }
  }
  for (const signalHour of [7, 8, 13, 14]) {
    for (const momentumBars of [6, 12]) {
      for (const minMoveAtr of [0.5, 1]) {
        for (const stopAtr of [0.75, 1]) {
          for (const targetR of [2, 3]) {
            configs.push({
              id: `session_1h_h${signalHour}_m${momentumBars}_min${minMoveAtr}_s${stopAtr}_t${targetR}`,
              family: "session_momentum",
              timeframeHours: 1,
              fastEma: 20,
              slowEma: 100,
              signalHour,
              momentumBars,
              minMoveAtr,
              stopAtr,
              targetR,
              maxHoldBars: 16,
            });
          }
        }
      }
    }
  }
  for (const timeframeHours of [1, 4] as const) {
    for (const efficiencyPeriod of [10, 20]) {
      for (const rangeZ of [1, 1.5]) {
        for (const targetR of [1.5, 2]) {
          configs.push({
            id: `adaptive_${timeframeHours}h_eff${efficiencyPeriod}_z${rangeZ}_s1_t${targetR}`,
            family: "adaptive_regime",
            timeframeHours,
            fastEma: 20,
            slowEma: 100,
            efficiencyPeriod,
            trendEfficiencyMin: 0.3,
            rangeEfficiencyMax: 0.2,
            rangeZ,
            stopAtr: 1,
            targetR,
            maxHoldBars: timeframeHours === 1 ? 18 : 8,
          });
        }
      }
    }
  }
  for (const timeframeHours of [1, 4] as const) {
    for (const lookback of [20, 40]) {
      for (const compressionRatio of [0.7, 0.85]) {
        for (const targetR of [2, 3]) {
          configs.push({
            id: `compression_${timeframeHours}h_ch${lookback}_r${compressionRatio}_s1_t${targetR}`,
            family: "compression_breakout",
            timeframeHours,
            lookback,
            fastEma: 20,
            slowEma: 100,
            compressionRatio,
            stopAtr: 1,
            targetR,
            maxHoldBars: timeframeHours === 1 ? 24 : 12,
          });
        }
      }
    }
  }
  for (const [rangeStartHour, rangeEndHour, signalEndHour] of [[0, 6, 11], [0, 7, 12], [12, 14, 18]]) {
    for (const sweepBufferAtr of [0, 0.1]) {
      for (const stopAtr of [0.75, 1]) {
        for (const targetR of [1.5, 2, 3]) {
          configs.push({
            id: `sweep_1h_${rangeStartHour}_${rangeEndHour}_${signalEndHour}_b${sweepBufferAtr}_s${stopAtr}_t${targetR}`,
            family: "liquidity_sweep_reclaim",
            timeframeHours: 1,
            fastEma: 20,
            slowEma: 100,
            rangeStartHour,
            rangeEndHour,
            signalEndHour,
            sweepBufferAtr,
            stopAtr,
            targetR,
            maxHoldBars: 12,
          });
        }
      }
    }
  }
  return configs;
}

function efficiencyAt(rows: PairedBar[], index: number, period: number) {
  if (index - period < 0) return null;
  const displacement = Math.abs(rows[index].bid.close - rows[index - period].bid.close);
  let movement = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    movement += Math.abs(rows[cursor].bid.close - rows[cursor - 1].bid.close);
  }
  return movement > 0 ? displacement / movement : 0;
}

function priorAtrMean(atrSeries: Array<number | null>, index: number, period = 50) {
  if (index - period < 0) return null;
  let sum = 0;
  for (let cursor = index - period; cursor < index; cursor += 1) {
    const value = atrSeries[cursor];
    if (value == null) return null;
    sum += value;
  }
  return sum / period;
}

function sessionRange(rows: PairedBar[], index: number, startHour: number, endHour: number) {
  const day = Math.floor(rows[index].openTime / DAY_MS) * DAY_MS;
  let high = -Infinity;
  let low = Infinity;
  let bars = 0;
  for (let cursor = index - 1; cursor >= 0 && rows[cursor].openTime >= day; cursor -= 1) {
    const hour = new Date(rows[cursor].openTime).getUTCHours();
    if (hour >= startHour && hour < endHour) {
      high = Math.max(high, rows[cursor].ask.high);
      low = Math.min(low, rows[cursor].bid.low);
      bars += 1;
    }
  }
  return bars >= Math.max(2, endHour - startHour - 1) ? { high, low } : null;
}

function signalDirection(
  config: StrategyConfig,
  rows: PairedBar[],
  index: number,
  atr: number,
  atrSeries: Array<number | null>,
  fast: number,
  slow: number,
  pullback: Array<number | null> | null
): Direction | null {
  const signal = rows[index].bid;
  if (config.family === "trend_breakout") {
    const high = highest(rows, index - config.lookback!, index);
    const low = lowest(rows, index - config.lookback!, index);
    const body = Math.abs(signal.close - signal.open);
    if (body < atr * 0.25) return null;
    if (signal.close > high && fast > slow) return "long";
    if (signal.close < low && fast < slow) return "short";
    return null;
  }
  if (config.family === "trend_pullback") {
    const currentPull = pullback?.[index];
    const previousPull = pullback?.[index - 1];
    if (currentPull == null || previousPull == null) return null;
    if (fast > slow && rows[index - 1].bid.close <= previousPull && signal.close > currentPull && signal.close > signal.open) return "long";
    if (fast < slow && rows[index - 1].bid.close >= previousPull && signal.close < currentPull && signal.close < signal.open) return "short";
    return null;
  }
  if (config.family === "adaptive_regime") {
    const efficiency = efficiencyAt(rows, index, config.efficiencyPeriod!);
    if (efficiency == null) return null;
    if (efficiency >= config.trendEfficiencyMin!) {
      if (fast > slow && signal.low <= fast && signal.close > fast && signal.close > signal.open) return "long";
      if (fast < slow && signal.high >= fast && signal.close < fast && signal.close < signal.open) return "short";
      return null;
    }
    if (efficiency <= config.rangeEfficiencyMax!) {
      const z = (signal.close - fast) / atr;
      if (z <= -config.rangeZ! && signal.close > signal.open) return "long";
      if (z >= config.rangeZ! && signal.close < signal.open) return "short";
    }
    return null;
  }
  if (config.family === "compression_breakout") {
    const baseline = priorAtrMean(atrSeries, index);
    const priorAtr = atrSeries[index - 1];
    if (baseline == null || priorAtr == null || priorAtr > baseline * config.compressionRatio!) return null;
    const high = highest(rows, index - config.lookback!, index);
    const low = lowest(rows, index - config.lookback!, index);
    if (signal.close > high && fast > slow && signal.close > signal.open) return "long";
    if (signal.close < low && fast < slow && signal.close < signal.open) return "short";
    return null;
  }
  if (config.family === "liquidity_sweep_reclaim") {
    const hour = new Date(rows[index].openTime).getUTCHours();
    if (hour < config.rangeEndHour! || hour >= config.signalEndHour!) return null;
    const range = sessionRange(rows, index, config.rangeStartHour!, config.rangeEndHour!);
    if (!range) return null;
    const buffer = atr * config.sweepBufferAtr!;
    if (rows[index].bid.low < range.low - buffer && signal.close > range.low && signal.close > signal.open) return "long";
    if (rows[index].ask.high > range.high + buffer && signal.close < range.high && signal.close < signal.open) return "short";
    return null;
  }
  if (new Date(rows[index].openTime).getUTCHours() !== config.signalHour) return null;
  const past = rows[index - config.momentumBars!].bid.close;
  const move = signal.close - past;
  if (move >= atr * config.minMoveAtr! && fast > slow) return "long";
  if (move <= -atr * config.minMoveAtr! && fast < slow) return "short";
  return null;
}

function generateTrades(asset: Asset, data: MarketData, config: StrategyConfig) {
  const rows = pairBars(data, config.timeframeHours);
  const atr = buildAtr(rows);
  const fast = buildEma(rows, config.fastEma);
  const slow = buildEma(rows, config.slowEma);
  const pullback = config.pullbackEma ? buildEma(rows, config.pullbackEma) : null;
  const trades: Trade[] = [];
  let position: {
    direction: Direction;
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskDistance: number;
    spreadR: number;
    barsHeld: number;
  } | null = null;
  const warmup = Math.max(config.lookback ?? 0, config.fastEma, config.slowEma, config.pullbackEma ?? 0, config.momentumBars ?? 0, 14) + 2;

  for (let index = warmup; index < rows.length; index += 1) {
    const current = rows[index];
    let exited = false;
    if (position) {
      position.barsHeld += 1;
      const side = position.direction === "long" ? current.bid : current.ask;
      const stopHit = position.direction === "long" ? side.low <= position.stopLoss : side.high >= position.stopLoss;
      const targetHit = position.direction === "long" ? side.high >= position.takeProfit : side.low <= position.takeProfit;
      const currentDate = new Date(current.openTime);
      const fridayExit = currentDate.getUTCDay() === 5 && currentDate.getUTCHours() >= 20;
      if (stopHit || targetHit || fridayExit || position.barsHeld >= config.maxHoldBars) {
        let exitPrice: number;
        let exitReason: string;
        if (stopHit) {
          exitPrice = position.direction === "long"
            ? Math.min(position.stopLoss, side.open)
            : Math.max(position.stopLoss, side.open);
          exitReason = "stop";
        } else if (targetHit) {
          exitPrice = position.direction === "long"
            ? Math.max(position.takeProfit, side.open)
            : Math.min(position.takeProfit, side.open);
          exitReason = "target";
        } else {
          exitPrice = side.close;
          exitReason = fridayExit ? "friday_exit" : "time";
        }
        const netR = position.direction === "long"
          ? (exitPrice - position.entryPrice) / position.riskDistance
          : (position.entryPrice - exitPrice) / position.riskDistance;
        trades.push({
          symbol: asset.symbol,
          assetClass: asset.assetClass,
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: current.openTime,
          entryPrice: position.entryPrice,
          exitPrice,
          riskDistance: position.riskDistance,
          netR,
          stressR: netR - position.spreadR * 0.5 - 0.05,
          exitReason,
        });
        position = null;
        exited = true;
      }
    }
    if (position || exited || index < 1) continue;
    const signalIndex = index - 1;
    const atrValue = atr[signalIndex];
    const fastValue = fast[signalIndex];
    const slowValue = slow[signalIndex];
    if (atrValue == null || fastValue == null || slowValue == null || !(atrValue > 0)) continue;
    const direction = signalDirection(config, rows, signalIndex, atrValue, atr, fastValue, slowValue, pullback);
    if (!direction) continue;
    const entryDate = new Date(current.openTime);
    const entryHour = entryDate.getUTCHours();
    if (entryHour >= 21 || (entryDate.getUTCDay() === 5 && entryHour >= 16)) continue;
    if (Math.abs(current.bid.open - rows[signalIndex].bid.close) > atrValue * 0.25) continue;
    const entryPrice = direction === "long" ? current.ask.open : current.bid.open;
    const riskDistance = atrValue * config.stopAtr;
    const spreadR = Math.max(0, current.ask.open - current.bid.open) / riskDistance;
    if (spreadR > 0.15) continue;
    position = {
      direction,
      entryTime: current.openTime,
      entryPrice,
      stopLoss: direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance,
      takeProfit: direction === "long" ? entryPrice + riskDistance * config.targetR : entryPrice - riskDistance * config.targetR,
      riskDistance,
      spreadR,
      barsHeld: 0,
    };
  }
  return trades;
}

function monthlyStarts(start: number, end: number) {
  const result: number[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() + 60 * DAY_MS <= end) {
    result.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function simulateChallenge(trades: Trade[], start: number, targetPct: 4 | 8, riskPct: number, stress = false): ChallengeWindow {
  const end = start + 60 * DAY_MS;
  const candidates = trades.filter((trade) => trade.entryTime >= start && trade.entryTime < end);
  const events = candidates.flatMap((trade, index) => [
    { time: trade.entryTime, type: "entry" as const, index, trade },
    { time: trade.exitTime, type: "exit" as const, index, trade },
  ]).sort((left, right) => left.time - right.time || (left.type === "exit" ? -1 : 1));
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;
  let currentDay = -1;
  let dayOpenEquity = 100;
  let dayProfit = 0;
  let worstDay = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let acceptedTrades = 0;
  const open = new Map<number, { riskAmount: number; symbol: string }>();
  let failureReason: string | null = null;
  let completionDays: number | null = null;

  for (const event of events) {
    if (event.time >= end) break;
    const day = Math.floor(event.time / DAY_MS) * DAY_MS;
    if (day !== currentDay) {
      currentDay = day;
      dayOpenEquity = equity;
      dayProfit = 0;
    }
    if (event.type === "entry") {
      const openRiskPct = [...open.values()].reduce((sum, value) => sum + value.riskAmount / equity * 100, 0);
      const realizedDayPct = dayProfit / dayOpenEquity * 100;
      if (realizedDayPct <= DAILY_ENTRY_STOP_PCT) continue;
      if (realizedDayPct - openRiskPct - riskPct <= DAILY_ENTRY_STOP_PCT) continue;
      if (openRiskPct + riskPct > MAX_CONCURRENT_RISK_PCT + 1e-9) continue;
      if ([...open.values()].some((position) => position.symbol === event.trade.symbol)) continue;
      open.set(event.index, { riskAmount: equity * riskPct / 100, symbol: event.trade.symbol });
      acceptedTrades += 1;
      continue;
    }
    const position = open.get(event.index);
    if (position == null) continue;
    open.delete(event.index);
    const resultR = stress ? event.trade.stressR : event.trade.netR;
    const profit = position.riskAmount * resultR;
    equity += profit;
    dayProfit += profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity / peak - 1) * 100);
    const dayPct = dayProfit / dayOpenEquity * 100;
    worstDay = Math.min(worstDay, dayPct);
    if (resultR < 0) {
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    } else if (resultR > 0) {
      lossStreak = 0;
    }
    if (dayPct <= DAILY_HARD_LIMIT_PCT) {
      failureReason = "daily_loss_limit";
      break;
    }
    if (equity <= 100 + TOTAL_LOSS_LIMIT_PCT) {
      failureReason = "total_loss_limit";
      break;
    }
    if (maxLossStreak > MAX_LOSS_STREAK) {
      failureReason = `loss_streak_above_${MAX_LOSS_STREAK}`;
      break;
    }
    if (equity >= 100 + targetPct) {
      completionDays = Math.ceil((event.time - start) / DAY_MS);
      break;
    }
  }
  const passed = completionDays != null && completionDays <= 60 && failureReason == null;
  return {
    start,
    end,
    targetPct,
    passed,
    safe: failureReason == null,
    completionDays,
    endEquity: equity,
    maxDrawdownPct: maxDrawdown,
    worstDayPct: worstDay,
    maxLossStreak,
    acceptedTrades,
    failureReason: failureReason ?? (passed ? null : "target_not_reached"),
  };
}

function summarizeWindows(windows: ChallengeWindow[]): WindowSet {
  const completion = windows.flatMap((window) => window.completionDays == null ? [] : [window.completionDays]).sort((a, b) => a - b);
  const reasons: Record<string, number> = {};
  for (const window of windows) {
    if (window.failureReason) reasons[window.failureReason] = (reasons[window.failureReason] ?? 0) + 1;
  }
  return {
    windows,
    starts: windows.length,
    passed: windows.filter((window) => window.passed).length,
    passRatePct: windows.length ? windows.filter((window) => window.passed).length / windows.length * 100 : 0,
    safeRatePct: windows.length ? windows.filter((window) => window.safe).length / windows.length * 100 : 0,
    allPassed: windows.length > 0 && windows.every((window) => window.passed),
    maxCompletionDays: completion.length ? Math.max(...completion) : null,
    medianCompletionDays: completion.length ? completion[Math.floor(completion.length / 2)] : null,
    worstDrawdownPct: windows.length ? Math.min(...windows.map((window) => window.maxDrawdownPct)) : 0,
    worstDayPct: windows.length ? Math.min(...windows.map((window) => window.worstDayPct)) : 0,
    maxLossStreak: windows.length ? Math.max(...windows.map((window) => window.maxLossStreak)) : 0,
    failureReasons: reasons,
  };
}

function evaluateWindows(trades: Trade[], start: number, end: number, target: 4 | 8, riskPct: number, stress = false) {
  return summarizeWindows(monthlyStarts(start, end).map((windowStart) => simulateChallenge(trades, windowStart, target, riskPct, stress)));
}

function trainingScore(phase1: WindowSet, phase2: WindowSet) {
  const passFloor = Math.min(phase1.passRatePct, phase2.passRatePct);
  return passFloor * 100 + phase1.safeRatePct * 10 + phase2.safeRatePct * 5 - (phase1.medianCompletionDays ?? 60) - phase1.maxLossStreak * 2;
}

function regime2026Score(phase1: WindowSet, phase2: WindowSet, stressPhase1: WindowSet) {
  return (
    phase1.passRatePct * 100 +
    phase2.passRatePct * 50 +
    stressPhase1.passRatePct * 30 +
    phase1.safeRatePct * 20 +
    stressPhase1.safeRatePct * 10 -
    (phase1.medianCompletionDays ?? 60) -
    phase1.maxLossStreak * 2
  );
}

function meetsResearchGate({
  trainPhase1,
  validationPhase1,
  testPhase1,
  testPhase2,
  stressPhase1,
}: {
  trainPhase1: WindowSet;
  validationPhase1: WindowSet;
  testPhase1: WindowSet;
  testPhase2: WindowSet;
  stressPhase1: WindowSet;
}) {
  return (
    trainPhase1.passRatePct >= 60 &&
    validationPhase1.passRatePct >= 60 &&
    testPhase1.passRatePct >= 60 &&
    testPhase2.passRatePct >= 70 &&
    stressPhase1.passRatePct >= 50 &&
    testPhase1.safeRatePct >= 85 &&
    stressPhase1.safeRatePct >= 80 &&
    testPhase1.maxLossStreak <= MAX_LOSS_STREAK &&
    stressPhase1.maxLossStreak <= MAX_LOSS_STREAK
  );
}

function compactWindowSet(set: WindowSet) {
  const { windows: _windows, ...summary } = set;
  return summary;
}

function compactRegimeCandidate(candidate: RegimeCandidateResult) {
  return {
    id: candidate.id,
    kind: candidate.kind,
    config: candidate.config,
    subsetId: candidate.subsetId,
    components: candidate.components,
    symbols: candidate.symbols,
    score: candidate.score,
    phase1: compactWindowSet(candidate.phase1),
    phase2: compactWindowSet(candidate.phase2),
    stressPhase1: compactWindowSet(candidate.stressPhase1),
  };
}

function candidateRow(candidate: CandidateResult) {
  return [
    candidate.trainScore,
    candidate.config.id,
    candidate.config.family,
    candidate.subsetId,
    candidate.symbols.join("|"),
    candidate.riskPct,
    candidate.trainPhase1.passRatePct,
    candidate.trainPhase1.safeRatePct,
    candidate.trainPhase1.medianCompletionDays,
    candidate.trainPhase1.maxCompletionDays,
    candidate.trainPhase1.maxLossStreak,
    candidate.trainPhase2.passRatePct,
    candidate.trainPhase2.medianCompletionDays,
  ];
}

function componentTrades(candidate: CandidateResult, market: Map<string, MarketData>) {
  return ASSETS
    .filter((asset) => candidate.symbols.includes(asset.symbol))
    .flatMap((asset) => generateTrades(asset, market.get(asset.symbol)!, candidate.config));
}

function componentPool(candidates: CandidateResult[]) {
  return ([
    "trend_breakout",
    "trend_pullback",
    "session_momentum",
    "adaptive_regime",
    "compression_breakout",
    "liquidity_sweep_reclaim",
  ] as Family[]).flatMap((family) => {
    const seen = new Set<string>();
    const selected: CandidateResult[] = [];
    for (const candidate of candidates) {
      if (candidate.config.family !== family) continue;
      const key = `${candidate.config.id}|${candidate.subsetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(candidate);
      if (selected.length === 2) break;
    }
    return selected;
  });
}

function componentCombinations(pool: CandidateResult[]) {
  const combinations: CandidateResult[][] = [];
  for (let left = 0; left < pool.length; left += 1) {
    for (let right = left + 1; right < pool.length; right += 1) {
      combinations.push([pool[left], pool[right]]);
      for (let third = right + 1; third < pool.length; third += 1) {
        combinations.push([pool[left], pool[right], pool[third]]);
      }
    }
  }
  return combinations;
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const market = new Map<string, MarketData>();
  for (const asset of ASSETS) {
    const data = await loadAsset(asset);
    market.set(asset.symbol, data);
    console.log(`${asset.symbol}: ${data.bid.length} BID, ${data.ask.length} ASK rows (${iso(data.bid[0].openTime)} to ${iso(data.bid.at(-1)!.openTime)})`);
  }

  const configs = createConfigs();
  const trainCandidates: CandidateResult[] = [];
  const regime2026Singles: RegimeCandidateResult[] = [];
  const assetCandidates = new Map(ASSETS.map((asset) => [asset.symbol, [] as AssetCandidateResult[]]));
  console.log(`Searching ${configs.length} fixed universal configurations`);
  for (let configIndex = 0; configIndex < configs.length; configIndex += 1) {
    const config = configs[configIndex];
    const tradesByAsset = new Map<string, Trade[]>();
    for (const asset of ASSETS) {
      tradesByAsset.set(asset.symbol, generateTrades(asset, market.get(asset.symbol)!, config));
    }
    for (const asset of ASSETS) {
      const trades = tradesByAsset.get(asset.symbol) ?? [];
      const phase1 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 8, RISK_LEVELS[0]);
      const phase2 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 4, RISK_LEVELS[0]);
      assetCandidates.get(asset.symbol)!.push({
        asset,
        config,
        trades,
        trainPhase1: phase1,
        trainPhase2: phase2,
        trainScore: trainingScore(phase1, phase2),
      });
    }
    for (const subset of SUBSETS) {
      const assets = ASSETS.filter((asset) => subset.classes.includes(asset.assetClass));
      const trades = assets.flatMap((asset) => tradesByAsset.get(asset.symbol) ?? []).sort((left, right) => left.entryTime - right.entryTime);
      const regimePhase1 = evaluateWindows(trades, REGIME_2026_START, END, 8, RISK_LEVELS[0]);
      const regimePhase2 = evaluateWindows(trades, REGIME_2026_START, END, 4, RISK_LEVELS[0]);
      const regimeStressPhase1 = evaluateWindows(trades, REGIME_2026_START, END, 8, RISK_LEVELS[0], true);
      regime2026Singles.push({
        id: `${config.id}:${subset.id}`,
        kind: "single",
        config,
        subsetId: subset.id,
        symbols: assets.map((asset) => asset.symbol),
        phase1: regimePhase1,
        phase2: regimePhase2,
        stressPhase1: regimeStressPhase1,
        score: regime2026Score(regimePhase1, regimePhase2, regimeStressPhase1),
      });
      for (const riskPct of RISK_LEVELS) {
        const phase1 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 8, riskPct);
        const phase2 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 4, riskPct);
        trainCandidates.push({
          config,
          subsetId: subset.id,
          symbols: assets.map((asset) => asset.symbol),
          riskPct,
          trainPhase1: phase1,
          trainPhase2: phase2,
          trainScore: trainingScore(phase1, phase2),
        });
      }
    }
    if ((configIndex + 1) % 20 === 0 || configIndex + 1 === configs.length) {
      console.log(`Search progress: ${configIndex + 1}/${configs.length}`);
    }
  }

  trainCandidates.sort((left, right) => right.trainScore - left.trainScore);
  const pool = componentPool(trainCandidates);
  const cachedComponentTrades = new Map<string, Trade[]>();
  const getComponentTrades = (candidate: CandidateResult) => {
    const key = `${candidate.config.id}|${candidate.subsetId}`;
    const cached = cachedComponentTrades.get(key);
    if (cached) return cached;
    const trades = componentTrades(candidate, market);
    cachedComponentTrades.set(key, trades);
    return trades;
  };
  const portfolioCandidates: PortfolioCandidateResult[] = [];
  const combinations = componentCombinations(pool);
  console.log(`Searching ${combinations.length} two/three-component portfolios from ${pool.length} train-selected components`);
  for (const components of combinations) {
    const trades = components
      .flatMap((component) => getComponentTrades(component))
      .sort((left, right) => left.entryTime - right.entryTime || left.symbol.localeCompare(right.symbol));
    for (const riskPct of RISK_LEVELS) {
      const phase1 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 8, riskPct);
      const phase2 = evaluateWindows(trades, TRAIN_START, TRAIN_END, 4, riskPct);
      portfolioCandidates.push({
        id: components.map((component) => `${component.config.id}:${component.subsetId}`).join("+"),
        components,
        riskPct,
        trades,
        trainPhase1: phase1,
        trainPhase2: phase2,
        trainScore: trainingScore(phase1, phase2),
      });
    }
  }
  portfolioCandidates.sort((left, right) => right.trainScore - left.trainScore);
  regime2026Singles.sort((left, right) => right.score - left.score);
  const regime2026Portfolios: RegimeCandidateResult[] = portfolioCandidates.map((candidate) => {
    const phase1 = evaluateWindows(candidate.trades, REGIME_2026_START, END, 8, RISK_LEVELS[0]);
    const phase2 = evaluateWindows(candidate.trades, REGIME_2026_START, END, 4, RISK_LEVELS[0]);
    const stressPhase1 = evaluateWindows(candidate.trades, REGIME_2026_START, END, 8, RISK_LEVELS[0], true);
    return {
      id: candidate.id,
      kind: "portfolio",
      components: candidate.components.map((component) => ({ configId: component.config.id, subsetId: component.subsetId })),
      symbols: [...new Set(candidate.components.flatMap((component) => component.symbols))],
      phase1,
      phase2,
      stressPhase1,
      score: regime2026Score(phase1, phase2, stressPhase1),
    };
  }).sort((left, right) => right.score - left.score);
  const regime2026Overall = [...regime2026Singles, ...regime2026Portfolios]
    .sort((left, right) => right.score - left.score);
  const selected2026Regime = regime2026Overall[0];
  const portfolioFinalists = portfolioCandidates.slice(0, TOP_TRAIN_CANDIDATES).map((candidate) => {
    const validationPhase1 = evaluateWindows(candidate.trades, TRAIN_END, VALIDATION_END, 8, candidate.riskPct);
    const validationPhase2 = evaluateWindows(candidate.trades, TRAIN_END, VALIDATION_END, 4, candidate.riskPct);
    return {
      ...candidate,
      validationPhase1,
      validationPhase2,
      validationScore: trainingScore(validationPhase1, validationPhase2),
    };
  }).sort((left, right) => right.validationScore - left.validationScore || right.trainScore - left.trainScore);
  const selectedPortfolio = portfolioFinalists[0];
  const portfolioTestPhase1 = evaluateWindows(selectedPortfolio.trades, VALIDATION_END, END, 8, selectedPortfolio.riskPct);
  const portfolioTestPhase2 = evaluateWindows(selectedPortfolio.trades, VALIDATION_END, END, 4, selectedPortfolio.riskPct);
  const portfolioStressPhase1 = evaluateWindows(selectedPortfolio.trades, VALIDATION_END, END, 8, selectedPortfolio.riskPct, true);
  const portfolioStressPhase2 = evaluateWindows(selectedPortfolio.trades, VALIDATION_END, END, 4, selectedPortfolio.riskPct, true);
  const portfolioQualified = meetsResearchGate({
    trainPhase1: selectedPortfolio.trainPhase1,
    validationPhase1: selectedPortfolio.validationPhase1,
    testPhase1: portfolioTestPhase1,
    testPhase2: portfolioTestPhase2,
    stressPhase1: portfolioStressPhase1,
  });

  const selectedAssetEngines = ASSETS.map((asset) => {
    const trainingRanked = [...(assetCandidates.get(asset.symbol) ?? [])]
      .sort((left, right) => right.trainScore - left.trainScore)
      .slice(0, 8);
    const validationRanked = trainingRanked.map((candidate) => {
      const validationPhase1 = evaluateWindows(candidate.trades, TRAIN_END, VALIDATION_END, 8, RISK_LEVELS[0]);
      const validationPhase2 = evaluateWindows(candidate.trades, TRAIN_END, VALIDATION_END, 4, RISK_LEVELS[0]);
      return {
        ...candidate,
        validationPhase1,
        validationPhase2,
        validationScore: trainingScore(validationPhase1, validationPhase2),
      };
    }).sort((left, right) => right.validationScore - left.validationScore || right.trainScore - left.trainScore);
    return validationRanked[0];
  });
  const assetSpecificTrades = selectedAssetEngines
    .flatMap((engine) => engine.trades)
    .sort((left, right) => left.entryTime - right.entryTime || left.symbol.localeCompare(right.symbol));
  const assetTrainPhase1 = evaluateWindows(assetSpecificTrades, TRAIN_START, TRAIN_END, 8, RISK_LEVELS[0]);
  const assetTrainPhase2 = evaluateWindows(assetSpecificTrades, TRAIN_START, TRAIN_END, 4, RISK_LEVELS[0]);
  const assetValidationPhase1 = evaluateWindows(assetSpecificTrades, TRAIN_END, VALIDATION_END, 8, RISK_LEVELS[0]);
  const assetValidationPhase2 = evaluateWindows(assetSpecificTrades, TRAIN_END, VALIDATION_END, 4, RISK_LEVELS[0]);
  const assetTestPhase1 = evaluateWindows(assetSpecificTrades, VALIDATION_END, END, 8, RISK_LEVELS[0]);
  const assetTestPhase2 = evaluateWindows(assetSpecificTrades, VALIDATION_END, END, 4, RISK_LEVELS[0]);
  const assetStressPhase1 = evaluateWindows(assetSpecificTrades, VALIDATION_END, END, 8, RISK_LEVELS[0], true);
  const assetStressPhase2 = evaluateWindows(assetSpecificTrades, VALIDATION_END, END, 4, RISK_LEVELS[0], true);
  const assetSpecificQualified = meetsResearchGate({
    trainPhase1: assetTrainPhase1,
    validationPhase1: assetValidationPhase1,
    testPhase1: assetTestPhase1,
    testPhase2: assetTestPhase2,
    stressPhase1: assetStressPhase1,
  });

  const finalists = trainCandidates.slice(0, TOP_TRAIN_CANDIDATES).map((candidate) => {
    const assets = ASSETS.filter((asset) => candidate.symbols.includes(asset.symbol));
    const trades = assets.flatMap((asset) => generateTrades(asset, market.get(asset.symbol)!, candidate.config)).sort((left, right) => left.entryTime - right.entryTime);
    const validationPhase1 = evaluateWindows(trades, TRAIN_END, VALIDATION_END, 8, candidate.riskPct);
    const validationPhase2 = evaluateWindows(trades, TRAIN_END, VALIDATION_END, 4, candidate.riskPct);
    const validationScore = trainingScore(validationPhase1, validationPhase2);
    return { ...candidate, trades, validationPhase1, validationPhase2, validationScore };
  }).sort((left, right) => right.validationScore - left.validationScore || right.trainScore - left.trainScore);

  const selected = finalists[0];
  const testPhase1 = evaluateWindows(selected.trades, VALIDATION_END, END, 8, selected.riskPct);
  const testPhase2 = evaluateWindows(selected.trades, VALIDATION_END, END, 4, selected.riskPct);
  const stressPhase1 = evaluateWindows(selected.trades, VALIDATION_END, END, 8, selected.riskPct, true);
  const stressPhase2 = evaluateWindows(selected.trades, VALIDATION_END, END, 4, selected.riskPct, true);
  const qualified = meetsResearchGate({
    trainPhase1: selected.trainPhase1,
    validationPhase1: selected.validationPhase1,
    testPhase1,
    testPhase2,
    stressPhase1,
  });
  const anyQualified = qualified || portfolioQualified || assetSpecificQualified;

  const output = {
    suite: "ROLLING_MONTHLY_PROP_CHALLENGE_RESEARCH",
    generatedAt: new Date().toISOString(),
    status: anyQualified ? "qualified_candidate" : "no_strategy_met_all_requirements",
    protocol: {
      train: [iso(TRAIN_START), iso(TRAIN_END)],
      validation: [iso(TRAIN_END), iso(VALIDATION_END)],
      untouchedTest: [iso(VALIDATION_END), iso(END)],
      monthlyRollingStarts: true,
      maximumStageDays: 60,
      phase1TargetPct: 8,
      phase2TargetPct: 4,
      dailyEntryStopPct: DAILY_ENTRY_STOP_PCT,
      dailyHardLimitPct: DAILY_HARD_LIMIT_PCT,
      totalLossLimitPct: TOTAL_LOSS_LIMIT_PCT,
      maxConcurrentRiskPct: MAX_CONCURRENT_RISK_PCT,
      maxLossStreak: MAX_LOSS_STREAK,
      researchApprovalGate: {
        minTrainPhase1PassPct: 60,
        minValidationPhase1PassPct: 60,
        minTestPhase1PassPct: 60,
        minTestPhase2PassPct: 70,
        minStressPhase1PassPct: 50,
        minTestSafetyPct: 85,
        minStressSafetyPct: 80,
      },
      selectionRule: `top ${TOP_TRAIN_CANDIDATES} on 2021-2023, one selected on 2024, 2025-2026 opened once`,
    },
    assets: ASSETS,
    searchedConfigurations: configs.length,
    evaluatedCandidates: trainCandidates.length,
    evaluatedPortfolios: portfolioCandidates.length,
    regime2026: {
      period: [iso(REGIME_2026_START), iso(END)],
      note: "2026-only in-sample regime ranking; not an out-of-sample approval result.",
      selected: compactRegimeCandidate(selected2026Regime),
      selectedWindows: {
        phase1: selected2026Regime.phase1.windows,
        phase2: selected2026Regime.phase2.windows,
        stressPhase1: selected2026Regime.stressPhase1.windows,
      },
      topSingles: regime2026Singles.slice(0, 30).map(compactRegimeCandidate),
      topPortfolios: regime2026Portfolios.slice(0, 30).map(compactRegimeCandidate),
      topOverall: regime2026Overall.slice(0, 50).map(compactRegimeCandidate),
    },
    selected: {
      config: selected.config,
      subsetId: selected.subsetId,
      symbols: selected.symbols,
      riskPct: selected.riskPct,
      trainPhase1: compactWindowSet(selected.trainPhase1),
      trainPhase2: compactWindowSet(selected.trainPhase2),
      validationPhase1: compactWindowSet(selected.validationPhase1),
      validationPhase2: compactWindowSet(selected.validationPhase2),
      testPhase1: compactWindowSet(testPhase1),
      testPhase2: compactWindowSet(testPhase2),
      stressTestPhase1: compactWindowSet(stressPhase1),
      stressTestPhase2: compactWindowSet(stressPhase2),
    },
    selectedPortfolio: {
      id: selectedPortfolio.id,
      components: selectedPortfolio.components.map((component) => ({
        config: component.config,
        subsetId: component.subsetId,
        symbols: component.symbols,
      })),
      riskPct: selectedPortfolio.riskPct,
      trainPhase1: compactWindowSet(selectedPortfolio.trainPhase1),
      trainPhase2: compactWindowSet(selectedPortfolio.trainPhase2),
      validationPhase1: compactWindowSet(selectedPortfolio.validationPhase1),
      validationPhase2: compactWindowSet(selectedPortfolio.validationPhase2),
      testPhase1: compactWindowSet(portfolioTestPhase1),
      testPhase2: compactWindowSet(portfolioTestPhase2),
      stressTestPhase1: compactWindowSet(portfolioStressPhase1),
      stressTestPhase2: compactWindowSet(portfolioStressPhase2),
      qualified: portfolioQualified,
    },
    selectedAssetSpecificPortfolio: {
      engines: selectedAssetEngines.map((engine) => ({
        symbol: engine.asset.symbol,
        assetClass: engine.asset.assetClass,
        config: engine.config,
        trainScore: engine.trainScore,
        validationScore: engine.validationScore,
      })),
      riskPct: RISK_LEVELS[0],
      trainPhase1: compactWindowSet(assetTrainPhase1),
      trainPhase2: compactWindowSet(assetTrainPhase2),
      validationPhase1: compactWindowSet(assetValidationPhase1),
      validationPhase2: compactWindowSet(assetValidationPhase2),
      testPhase1: compactWindowSet(assetTestPhase1),
      testPhase2: compactWindowSet(assetTestPhase2),
      stressTestPhase1: compactWindowSet(assetStressPhase1),
      stressTestPhase2: compactWindowSet(assetStressPhase2),
      qualified: assetSpecificQualified,
    },
    topTraining: trainCandidates.slice(0, 50).map((candidate) => ({
      config: candidate.config,
      subsetId: candidate.subsetId,
      symbols: candidate.symbols,
      riskPct: candidate.riskPct,
      score: candidate.trainScore,
      phase1: compactWindowSet(candidate.trainPhase1),
      phase2: compactWindowSet(candidate.trainPhase2),
    })),
    finalists: finalists.map((candidate) => ({
      config: candidate.config,
      subsetId: candidate.subsetId,
      symbols: candidate.symbols,
      riskPct: candidate.riskPct,
      trainScore: candidate.trainScore,
      validationScore: candidate.validationScore,
      trainPhase1: compactWindowSet(candidate.trainPhase1),
      validationPhase1: compactWindowSet(candidate.validationPhase1),
      validationPhase2: compactWindowSet(candidate.validationPhase2),
    })),
    testWindows: {
      phase1: testPhase1.windows,
      phase2: testPhase2.windows,
      stressPhase1: stressPhase1.windows,
      stressPhase2: stressPhase2.windows,
      portfolioPhase1: portfolioTestPhase1.windows,
      portfolioPhase2: portfolioTestPhase2.windows,
      portfolioStressPhase1: portfolioStressPhase1.windows,
      portfolioStressPhase2: portfolioStressPhase2.windows,
      assetSpecificPhase1: assetTestPhase1.windows,
      assetSpecificPhase2: assetTestPhase2.windows,
      assetSpecificStressPhase1: assetStressPhase1.windows,
      assetSpecificStressPhase2: assetStressPhase2.windows,
    },
  };
  writeFileSync(`${OUTPUT_DIR}/rolling_prop_challenge_research.json`, JSON.stringify(output, null, 2), "utf8");

  const candidateHeaders = ["train_score", "config_id", "family", "subset", "symbols", "risk_pct", "phase1_pass_pct", "phase1_safe_pct", "phase1_median_days", "phase1_max_days", "max_loss_streak", "phase2_pass_pct", "phase2_median_days"];
  writeCsv(`${OUTPUT_DIR}/rolling_prop_challenge_training_top.csv`, [candidateHeaders, ...trainCandidates.slice(0, 100).map(candidateRow)]);
  writeCsv(`${OUTPUT_DIR}/rolling_prop_2026_regime_top.csv`, [
    ["rank", "id", "kind", "family", "subset", "components", "symbols", "score", "phase1_pass_pct", "phase1_safe_pct", "phase1_median_days", "phase1_max_days", "max_loss_streak", "phase2_pass_pct", "stress_phase1_pass_pct", "stress_safety_pct"],
    ...regime2026Overall.slice(0, 100).map((candidate, index) => [
      index + 1,
      candidate.id,
      candidate.kind,
      candidate.config?.family ?? "multi_engine",
      candidate.subsetId ?? "",
      candidate.components?.map((component) => `${component.configId}:${component.subsetId}`).join("|") ?? "",
      candidate.symbols.join("|"),
      candidate.score,
      candidate.phase1.passRatePct,
      candidate.phase1.safeRatePct,
      candidate.phase1.medianCompletionDays,
      candidate.phase1.maxCompletionDays,
      candidate.phase1.maxLossStreak,
      candidate.phase2.passRatePct,
      candidate.stressPhase1.passRatePct,
      candidate.stressPhase1.safeRatePct,
    ]),
  ]);
  writeCsv(`${OUTPUT_DIR}/rolling_prop_2026_regime_selected_windows.csv`, [
    ["phase", "start", "passed", "safe", "completion_days", "end_equity", "max_dd_pct", "worst_day_pct", "max_loss_streak", "accepted_trades", "failure_reason"],
    ...([[
      "phase1",
      selected2026Regime.phase1,
    ], [
      "phase2",
      selected2026Regime.phase2,
    ], [
      "stress_phase1",
      selected2026Regime.stressPhase1,
    ]] as Array<[string, WindowSet]>).flatMap(([phase, set]) => set.windows.map((window) => [phase, iso(window.start), window.passed, window.safe, window.completionDays, window.endEquity, window.maxDrawdownPct, window.worstDayPct, window.maxLossStreak, window.acceptedTrades, window.failureReason])),
  ]);
  const testWindowSets: Array<readonly [string, WindowSet]> = [
    ["phase1", testPhase1],
    ["phase2", testPhase2],
    ["stress_phase1", stressPhase1],
    ["stress_phase2", stressPhase2],
    ["portfolio_phase1", portfolioTestPhase1],
    ["portfolio_phase2", portfolioTestPhase2],
    ["portfolio_stress_phase1", portfolioStressPhase1],
    ["portfolio_stress_phase2", portfolioStressPhase2],
    ["asset_specific_phase1", assetTestPhase1],
    ["asset_specific_phase2", assetTestPhase2],
    ["asset_specific_stress_phase1", assetStressPhase1],
    ["asset_specific_stress_phase2", assetStressPhase2],
  ];
  writeCsv(`${OUTPUT_DIR}/rolling_prop_challenge_test_windows.csv`, [
    ["phase", "start", "passed", "safe", "completion_days", "end_equity", "max_dd_pct", "worst_day_pct", "max_loss_streak", "accepted_trades", "failure_reason"],
    ...testWindowSets.flatMap(([phase, set]) => set.windows.map((window) => [phase, iso(window.start), window.passed, window.safe, window.completionDays, window.endEquity, window.maxDrawdownPct, window.worstDayPct, window.maxLossStreak, window.acceptedTrades, window.failureReason])),
  ]);

  const selectedSummary = output.selected;
  const portfolioSummary = output.selectedPortfolio;
  const assetSummary = output.selectedAssetSpecificPortfolio;
  const markdown = [
    "# Rolling prop challenge research",
    "",
    `Status: **${output.status}**`,
    "",
    `Rules: monthly rolling starts, 60 calendar days per stage, +8% phase 1, +4% phase 2, -3% daily, -10% total, fixed ${RISK_LEVELS[0]}% risk per position, maximum 2% concurrent risk and maximum ${MAX_LOSS_STREAK} consecutive losses.`,
    "Research approval requires at least 60% Phase 1 pass rate on train, validation and untouched test; at least 70% test Phase 2; at least 50% stressed Phase 1; and at least 85%/80% normal/stressed rule safety.",
    "",
    "## 2026 regime ranking (in-sample)",
    "",
    `- Selected: ${selected2026Regime.id}`,
    `- Type: ${selected2026Regime.kind}`,
    `- Rules/components: ${selected2026Regime.config ? JSON.stringify(selected2026Regime.config) : selected2026Regime.components?.map((component) => `${component.configId} [${component.subsetId}]`).join(" + ")}`,
    `- Assets: ${selected2026Regime.symbols.join(", ")}`,
    "",
    "| Phase | Pass rate | Safety | Median/max completion | Max loss streak |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Phase 1 | ${selected2026Regime.phase1.passRatePct.toFixed(1)}% | ${selected2026Regime.phase1.safeRatePct.toFixed(1)}% | ${selected2026Regime.phase1.medianCompletionDays ?? "-"}/${selected2026Regime.phase1.maxCompletionDays ?? "-"} | ${selected2026Regime.phase1.maxLossStreak} |`,
    `| Phase 2 | ${selected2026Regime.phase2.passRatePct.toFixed(1)}% | ${selected2026Regime.phase2.safeRatePct.toFixed(1)}% | ${selected2026Regime.phase2.medianCompletionDays ?? "-"}/${selected2026Regime.phase2.maxCompletionDays ?? "-"} | ${selected2026Regime.phase2.maxLossStreak} |`,
    `| Stress Phase 1 | ${selected2026Regime.stressPhase1.passRatePct.toFixed(1)}% | ${selected2026Regime.stressPhase1.safeRatePct.toFixed(1)}% | ${selected2026Regime.stressPhase1.medianCompletionDays ?? "-"}/${selected2026Regime.stressPhase1.maxCompletionDays ?? "-"} | ${selected2026Regime.stressPhase1.maxLossStreak} |`,
    "",
    "This 2026 ranking is intentionally in-sample and is a regime-specific baseline, not evidence of cross-year robustness.",
    "",
    "## Frozen selected candidate",
    "",
    `- Config: ${selected.config.id}`,
    `- Family: ${selected.config.family}`,
    `- Assets: ${selected.symbols.join(", ")}`,
    `- Risk: ${selected.riskPct}% per accepted trade`,
    `- Parameters: ${JSON.stringify(selected.config)}`,
    "",
    "| Segment | Phase 1 pass | Phase 2 pass | Phase 1 median/max days | Max loss streak |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Train 2021-2023 | ${selectedSummary.trainPhase1.passRatePct.toFixed(1)}% | ${selectedSummary.trainPhase2.passRatePct.toFixed(1)}% | ${selectedSummary.trainPhase1.medianCompletionDays ?? "-"}/${selectedSummary.trainPhase1.maxCompletionDays ?? "-"} | ${selectedSummary.trainPhase1.maxLossStreak} |`,
    `| Validation 2024 | ${selectedSummary.validationPhase1.passRatePct.toFixed(1)}% | ${selectedSummary.validationPhase2.passRatePct.toFixed(1)}% | ${selectedSummary.validationPhase1.medianCompletionDays ?? "-"}/${selectedSummary.validationPhase1.maxCompletionDays ?? "-"} | ${selectedSummary.validationPhase1.maxLossStreak} |`,
    `| Test 2025-2026 | ${selectedSummary.testPhase1.passRatePct.toFixed(1)}% | ${selectedSummary.testPhase2.passRatePct.toFixed(1)}% | ${selectedSummary.testPhase1.medianCompletionDays ?? "-"}/${selectedSummary.testPhase1.maxCompletionDays ?? "-"} | ${selectedSummary.testPhase1.maxLossStreak} |`,
    `| Stress test 2025-2026 | ${selectedSummary.stressTestPhase1.passRatePct.toFixed(1)}% | ${selectedSummary.stressTestPhase2.passRatePct.toFixed(1)}% | ${selectedSummary.stressTestPhase1.medianCompletionDays ?? "-"}/${selectedSummary.stressTestPhase1.maxCompletionDays ?? "-"} | ${selectedSummary.stressTestPhase1.maxLossStreak} |`,
    "",
    "## Frozen selected multi-engine portfolio",
    "",
    `- Components: ${selectedPortfolio.components.map((component) => `${component.config.id} [${component.subsetId}]`).join(" + ")}`,
    `- Risk: ${selectedPortfolio.riskPct}% per accepted trade`,
    "",
    "| Segment | Phase 1 pass | Phase 2 pass | Phase 1 median/max days | Max loss streak |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Train 2021-2023 | ${portfolioSummary.trainPhase1.passRatePct.toFixed(1)}% | ${portfolioSummary.trainPhase2.passRatePct.toFixed(1)}% | ${portfolioSummary.trainPhase1.medianCompletionDays ?? "-"}/${portfolioSummary.trainPhase1.maxCompletionDays ?? "-"} | ${portfolioSummary.trainPhase1.maxLossStreak} |`,
    `| Validation 2024 | ${portfolioSummary.validationPhase1.passRatePct.toFixed(1)}% | ${portfolioSummary.validationPhase2.passRatePct.toFixed(1)}% | ${portfolioSummary.validationPhase1.medianCompletionDays ?? "-"}/${portfolioSummary.validationPhase1.maxCompletionDays ?? "-"} | ${portfolioSummary.validationPhase1.maxLossStreak} |`,
    `| Test 2025-2026 | ${portfolioSummary.testPhase1.passRatePct.toFixed(1)}% | ${portfolioSummary.testPhase2.passRatePct.toFixed(1)}% | ${portfolioSummary.testPhase1.medianCompletionDays ?? "-"}/${portfolioSummary.testPhase1.maxCompletionDays ?? "-"} | ${portfolioSummary.testPhase1.maxLossStreak} |`,
    `| Stress test 2025-2026 | ${portfolioSummary.stressTestPhase1.passRatePct.toFixed(1)}% | ${portfolioSummary.stressTestPhase2.passRatePct.toFixed(1)}% | ${portfolioSummary.stressTestPhase1.medianCompletionDays ?? "-"}/${portfolioSummary.stressTestPhase1.maxCompletionDays ?? "-"} | ${portfolioSummary.stressTestPhase1.maxLossStreak} |`,
    "",
    "## Frozen asset-specific portfolio",
    "",
    ...selectedAssetEngines.map((engine) => `- ${engine.asset.symbol}: ${engine.config.id}`),
    "",
    "| Segment | Phase 1 pass | Phase 2 pass | Phase 1 median/max days | Max loss streak |",
    "| --- | ---: | ---: | ---: | ---: |",
    `| Train 2021-2023 | ${assetSummary.trainPhase1.passRatePct.toFixed(1)}% | ${assetSummary.trainPhase2.passRatePct.toFixed(1)}% | ${assetSummary.trainPhase1.medianCompletionDays ?? "-"}/${assetSummary.trainPhase1.maxCompletionDays ?? "-"} | ${assetSummary.trainPhase1.maxLossStreak} |`,
    `| Validation 2024 | ${assetSummary.validationPhase1.passRatePct.toFixed(1)}% | ${assetSummary.validationPhase2.passRatePct.toFixed(1)}% | ${assetSummary.validationPhase1.medianCompletionDays ?? "-"}/${assetSummary.validationPhase1.maxCompletionDays ?? "-"} | ${assetSummary.validationPhase1.maxLossStreak} |`,
    `| Test 2025-2026 | ${assetSummary.testPhase1.passRatePct.toFixed(1)}% | ${assetSummary.testPhase2.passRatePct.toFixed(1)}% | ${assetSummary.testPhase1.medianCompletionDays ?? "-"}/${assetSummary.testPhase1.maxCompletionDays ?? "-"} | ${assetSummary.testPhase1.maxLossStreak} |`,
    `| Stress test 2025-2026 | ${assetSummary.stressTestPhase1.passRatePct.toFixed(1)}% | ${assetSummary.stressTestPhase2.passRatePct.toFixed(1)}% | ${assetSummary.stressTestPhase1.medianCompletionDays ?? "-"}/${assetSummary.stressTestPhase1.maxCompletionDays ?? "-"} | ${assetSummary.stressTestPhase1.maxLossStreak} |`,
    "",
    anyQualified
      ? "A frozen candidate met the predefined probabilistic approval gate. It is eligible for untouched forward validation, not guaranteed real-money performance."
      : "No single strategy or multi-engine portfolio met the predefined probabilistic approval gate. The selected rows are the best frozen candidates, not approved strategies.",
  ].join("\n");
  writeFileSync(`${OUTPUT_DIR}/rolling_prop_challenge_research.md`, markdown, "utf8");

  console.log(markdown);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
