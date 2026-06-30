import { mkdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines } from "../src/lib/data-handlers/local-csv-market-data";

const HOUR = 3_600_000;
const INITIAL_CAPITAL = 10_000;
const RISK_PERCENT = 1;
const OUTPUT_DIR = "public/exports";
const CONFIG = {
  dxyBslLookback: Number(process.env.GARRY_DXY_BSL_LOOKBACK ?? 20),
  dxyDisplacementAtr: Number(process.env.GARRY_DXY_DISPLACEMENT_ATR ?? 1),
  dxyEventBars: Number(process.env.GARRY_DXY_EVENT_BARS ?? 3),
  dxyCorrectionBars: Number(process.env.GARRY_DXY_CORRECTION_BARS ?? 36),
  syncBars: Number(process.env.GARRY_SYNC_BARS ?? 1),
  resistanceLookback: Number(process.env.GARRY_RESISTANCE_LOOKBACK ?? 50),
  xauSslLookback: Number(process.env.GARRY_XAU_SSL_LOOKBACK ?? 20),
  xauSweepBars: Number(process.env.GARRY_XAU_SWEEP_BARS ?? 18),
  xauResistanceBars: Number(process.env.GARRY_XAU_RESISTANCE_BARS ?? 24),
  strictRejection: process.env.GARRY_STRICT_REJECTION !== "0",
};
const OUTPUT_SUFFIX = process.env.GARRY_OUTPUT_SUFFIX
  ? `_${process.env.GARRY_OUTPUT_SUFFIX}`
  : "";

const FOMC_RELEASES = [
  "2024-07-31T18:00:00Z",
  "2024-09-18T18:00:00Z",
  "2024-11-07T19:00:00Z",
  "2024-12-18T19:00:00Z",
  "2025-01-29T19:00:00Z",
  "2025-03-19T18:00:00Z",
  "2025-05-07T18:00:00Z",
  "2025-06-18T18:00:00Z",
  "2025-07-30T18:00:00Z",
  "2025-09-17T18:00:00Z",
  "2025-10-29T18:00:00Z",
  "2025-12-10T19:00:00Z",
  "2026-01-28T19:00:00Z",
  "2026-03-18T18:00:00Z",
  "2026-04-29T18:00:00Z",
  "2026-06-17T18:00:00Z",
].map(Date.parse);

type Direction = "short";

interface Fvg {
  direction: "bullish" | "bearish";
  low: number;
  high: number;
  formedIndex: number;
}

interface Trade {
  model: "DXY_EURUSD" | "XAUUSD_SSL_IDM";
  eventTime: number;
  direction: Direction;
  setupTime: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  result: "TP" | "SL" | "TIME";
  r: number;
  profit: number;
  notes: string;
}

interface Funnel {
  fomcEvents: number;
  dxyBslExpansion: number;
  dxyBullishFvg: number;
  dxyFvgCorrection: number;
  eurSynchronousResistance: number;
  eurTrades: number;
  xauExternalSslSweep: number;
  xauResistanceTouch: number;
  xauIdmTargetAvailable: number;
  xauTrades: number;
}

function parseYahoo(payload: unknown, intervalMs: number) {
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
      error?: { description?: string; code?: string } | null;
    };
  };
  if (chart.chart?.error) {
    throw new Error(chart.chart.error.description || chart.chart.error.code || "Yahoo error");
  }
  const result = chart.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  return (result?.timestamp ?? [])
    .map((timestamp, index) => {
      const open = quote?.open?.[index];
      const high = quote?.high?.[index];
      const low = quote?.low?.[index];
      const close = quote?.close?.[index];
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      return {
        openTime,
        open,
        high,
        low,
        close,
        volume: quote?.volume?.[index] ?? 0,
        closeTime: openTime + intervalMs - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      } satisfies Kline;
    })
    .filter((row): row is Kline => row != null)
    .sort((left, right) => left.openTime - right.openTime);
}

async function fetchYahoo1h(symbol: string) {
  const period1 = Math.floor(Date.parse("2024-06-25T00:00:00Z") / 1000);
  const period2 = Math.floor(Date.parse("2026-06-21T00:00:00Z") / 1000);
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError: unknown = null;
  for (const host of hosts) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1}&period2=${period2}&interval=60m&includePrePost=true`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseYahoo(await response.json(), HOUR);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

function classicFvg(rows: Kline[], candle3Index: number): Fvg[] {
  if (candle3Index < 2) return [];
  const candle1 = rows[candle3Index - 2];
  const candle3 = rows[candle3Index];
  const result: Fvg[] = [];
  if (candle1.high < candle3.low) {
    result.push({
      direction: "bullish",
      low: candle1.high,
      high: candle3.low,
      formedIndex: candle3Index,
    });
  }
  if (candle1.low > candle3.high) {
    result.push({
      direction: "bearish",
      low: candle3.high,
      high: candle1.low,
      formedIndex: candle3Index,
    });
  }
  return result;
}

function overlaps(row: Kline, zone: Fvg) {
  return row.low <= zone.high && row.high >= zone.low;
}

function findRecentFvg(
  rows: Kline[],
  endIndex: number,
  direction: Fvg["direction"],
  lookback: number,
  requireAbovePrice?: number
) {
  const candidates: Fvg[] = [];
  for (let index = Math.max(2, endIndex - lookback); index <= endIndex; index += 1) {
    for (const fvg of classicFvg(rows, index)) {
      if (fvg.direction !== direction) continue;
      if (requireAbovePrice != null && fvg.high <= requireAbovePrice) continue;
      candidates.push(fvg);
    }
  }
  return candidates.at(-1) ?? null;
}

function findFvgCreatedNear(
  rows: Kline[],
  startIndex: number,
  endIndex: number,
  direction: Fvg["direction"]
) {
  const candidates: Fvg[] = [];
  for (let index = Math.max(2, startIndex); index <= Math.min(rows.length - 1, endIndex); index += 1) {
    candidates.push(...classicFvg(rows, index).filter((fvg) => fvg.direction === direction));
  }
  return candidates.at(-1) ?? null;
}

function isPivotLow(rows: Kline[], index: number, strength = 1) {
  if (index - strength < 0 || index + strength >= rows.length) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (rows[index].low >= rows[index - offset].low || rows[index].low > rows[index + offset].low) {
      return false;
    }
  }
  return true;
}

function resolveShortTrade({
  model,
  eventTime,
  setupTime,
  rows,
  entryIndex,
  stop,
  target,
  equity,
  notes,
}: {
  model: Trade["model"];
  eventTime: number;
  setupTime: number;
  rows: Kline[];
  entryIndex: number;
  stop: number;
  target: number;
  equity: number;
  notes: string;
}) {
  const entry = rows[entryIndex].open;
  const riskDistance = stop - entry;
  if (riskDistance <= 0 || target >= entry) return null;
  const riskAmount = equity * (RISK_PERCENT / 100);
  const quantity = riskAmount / riskDistance;
  const maxExit = Math.min(rows.length - 1, entryIndex + 80);
  for (let index = entryIndex; index <= maxExit; index += 1) {
    const hitStop = rows[index].high >= stop;
    const hitTarget = rows[index].low <= target;
    if (!hitStop && !hitTarget) continue;
    const exit = hitStop ? stop : target;
    const profit = (entry - exit) * quantity;
    return {
      model,
      eventTime,
      direction: "short",
      setupTime,
      entryTime: rows[entryIndex].openTime,
      exitTime: rows[index].openTime,
      entry,
      stop,
      target,
      exit,
      result: hitStop ? "SL" : "TP",
      r: profit / riskAmount,
      profit,
      notes,
    } satisfies Trade;
  }
  const exit = rows[maxExit].close;
  const profit = (entry - exit) * quantity;
  return {
    model,
    eventTime,
    direction: "short",
    setupTime,
    entryTime: rows[entryIndex].openTime,
    exitTime: rows[maxExit].openTime,
    entry,
    stop,
    target,
    exit,
    result: "TIME",
    r: profit / riskAmount,
    profit,
    notes,
  } satisfies Trade;
}

function metrics(trades: Trade[]) {
  let equity = INITIAL_CAPITAL;
  let peak = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  for (const trade of [...trades].sort((left, right) => left.entryTime - right.entryTime)) {
    const scaledProfit = trade.r * equity * (RISK_PERCENT / 100);
    equity += scaledProfit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (scaledProfit > 0) {
      winners += 1;
      grossProfit += scaledProfit;
    } else if (scaledProfit < 0) {
      grossLoss += Math.abs(scaledProfit);
    }
  }
  return {
    trades: trades.length,
    winners,
    losers: trades.filter((trade) => trade.r < 0).length,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    netProfit: equity - INITIAL_CAPITAL,
    returnPct: (equity / INITIAL_CAPITAL - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.r, 0) / trades.length : 0,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / INITIAL_CAPITAL) * 100,
    finalEquity: equity,
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const [dxy1h, eur1h, xau1h] = await Promise.all([
    fetchYahoo1h("DX-Y.NYB"),
    fetchYahoo1h("EURUSD=X"),
    fetchYahoo1h("GC=F"),
  ]);
  const dxy4h = aggregateKlines(dxy1h, "4h");
  const eur4h = aggregateKlines(eur1h, "4h");
  const xau4h = aggregateKlines(xau1h, "4h");
  const dxyAtr = atrSeries(dxy4h);
  const eurAtr = atrSeries(eur4h);
  const xauAtr = atrSeries(xau4h);
  const trades: Trade[] = [];
  const funnel: Funnel = {
    fomcEvents: FOMC_RELEASES.length,
    dxyBslExpansion: 0,
    dxyBullishFvg: 0,
    dxyFvgCorrection: 0,
    eurSynchronousResistance: 0,
    eurTrades: 0,
    xauExternalSslSweep: 0,
    xauResistanceTouch: 0,
    xauIdmTargetAvailable: 0,
    xauTrades: 0,
  };
  const eventAudit: Array<Record<string, unknown>> = [];

  for (const eventTime of FOMC_RELEASES) {
    const audit: Record<string, unknown> = {
      eventTime: new Date(eventTime).toISOString(),
      dxyQualified: false,
      eurTrade: false,
      xauTrade: false,
    };
    const dxyEventIndex = lowerBound(dxy4h, eventTime) - 1;
    const eurEventIndex = lowerBound(eur4h, eventTime) - 1;
    const xauEventIndex = lowerBound(xau4h, eventTime) - 1;
    if (dxyEventIndex < 25 || eurEventIndex < 45 || xauEventIndex < 45) {
      audit.reason = "insufficient_history";
      eventAudit.push(audit);
      continue;
    }

    let dxyBreakIndex = -1;
    for (
      let index = dxyEventIndex;
      index <= Math.min(dxy4h.length - 1, dxyEventIndex + CONFIG.dxyEventBars);
      index += 1
    ) {
      const atr = dxyAtr[index];
      const bsl = highest(dxy4h, index - CONFIG.dxyBslLookback, index);
      const row = dxy4h[index];
      if (
        atr != null &&
        row.close > bsl &&
        row.close > row.open &&
        trueRange(row, dxy4h[index - 1]) >= CONFIG.dxyDisplacementAtr * atr
      ) {
        dxyBreakIndex = index;
        audit.dxyBsl = bsl;
        break;
      }
    }
    if (dxyBreakIndex < 0) {
      audit.reason = "no_dxy_bsl_displacement";
      eventAudit.push(audit);
      continue;
    }
    funnel.dxyBslExpansion += 1;
    audit.dxyQualified = true;
    audit.dxyBreakTime = new Date(dxy4h[dxyBreakIndex].openTime).toISOString();

    const dxyFvg = findFvgCreatedNear(dxy4h, dxyBreakIndex, dxyBreakIndex + 4, "bullish");
    if (!dxyFvg) {
      audit.reason = "no_dxy_bullish_fvg";
      eventAudit.push(audit);
      continue;
    }
    funnel.dxyBullishFvg += 1;
    audit.dxyFvg = [dxyFvg.low, dxyFvg.high];

    let dxyTouchIndex = -1;
    for (
      let index = dxyFvg.formedIndex + 1;
      index <= Math.min(dxy4h.length - 1, dxyFvg.formedIndex + CONFIG.dxyCorrectionBars);
      index += 1
    ) {
      if (overlaps(dxy4h[index], dxyFvg)) {
        dxyTouchIndex = index;
        break;
      }
    }
    if (dxyTouchIndex < 0) {
      audit.reason = "no_dxy_fvg_correction";
      eventAudit.push(audit);
      continue;
    }
    funnel.dxyFvgCorrection += 1;
    const correctionTime = dxy4h[dxyTouchIndex].openTime;
    audit.dxyCorrectionTime = new Date(correctionTime).toISOString();

    const eurSyncIndex = Math.max(2, lowerBound(eur4h, correctionTime));
    let eurSignalIndex = -1;
    let eurResistance: Fvg | null = null;
    for (
      let index = Math.max(2, eurSyncIndex - CONFIG.syncBars);
      index <= Math.min(eur4h.length - 2, eurSyncIndex + CONFIG.syncBars);
      index += 1
    ) {
      const resistance = findRecentFvg(
        eur4h,
        index - 1,
        "bearish",
        CONFIG.resistanceLookback,
        eur4h[index].close
      );
      const atr = eurAtr[index];
      if (
        resistance &&
        atr != null &&
        overlaps(eur4h[index], resistance) &&
        eur4h[index].close < eur4h[index].open &&
        (!CONFIG.strictRejection || eur4h[index].close < eur4h[index - 1].close)
      ) {
        eurSignalIndex = index;
        eurResistance = resistance;
        break;
      }
    }
    if (eurSignalIndex >= 0 && eurResistance) {
      funnel.eurSynchronousResistance += 1;
      const entryIndex = eurSignalIndex + 1;
      const atr = eurAtr[eurSignalIndex]!;
      const stop = Math.max(eur4h[eurSignalIndex].high, eurResistance.high) + 0.1 * atr;
      const entry = eur4h[entryIndex].open;
      const target = entry - 2 * (stop - entry);
      const trade = resolveShortTrade({
        model: "DXY_EURUSD",
        eventTime,
        setupTime: eur4h[eurSignalIndex].openTime,
        rows: eur4h,
        entryIndex,
        stop,
        target,
        equity: INITIAL_CAPITAL,
        notes: `DXY BSL breakout -> bullish FVG correction; EUR bearish FVG ${eurResistance.low}-${eurResistance.high}`,
      });
      if (trade) {
        trades.push(trade);
        funnel.eurTrades += 1;
        audit.eurTrade = true;
        audit.eurEntryTime = new Date(trade.entryTime).toISOString();
      }
    } else {
      audit.eurReason = "no_synchronous_bearish_fvg_rejection";
    }

    let xauSweepIndex = -1;
    let xauSsl = Number.NaN;
    for (
      let index = xauEventIndex;
      index <= Math.min(xau4h.length - 1, xauEventIndex + CONFIG.xauSweepBars);
      index += 1
    ) {
      const ssl = lowest(xau4h, index - CONFIG.xauSslLookback, index);
      if (xau4h[index].low < ssl && xau4h[index].close > ssl) {
        xauSweepIndex = index;
        xauSsl = ssl;
        break;
      }
    }
    if (xauSweepIndex < 0) {
      audit.xauReason = "no_external_ssl_sweep";
      eventAudit.push(audit);
      continue;
    }
    funnel.xauExternalSslSweep += 1;
    const xauResistance = findRecentFvg(
      xau4h,
      xauSweepIndex - 1,
      "bearish",
      CONFIG.resistanceLookback,
      xau4h[xauSweepIndex].close
    );
    if (!xauResistance) {
      audit.xauReason = "no_prior_bearish_fvg_resistance";
      eventAudit.push(audit);
      continue;
    }
    let xauSignalIndex = -1;
    for (
      let index = xauSweepIndex + 1;
      index <= Math.min(xau4h.length - 2, xauSweepIndex + CONFIG.xauResistanceBars);
      index += 1
    ) {
      if (
        overlaps(xau4h[index], xauResistance) &&
        xau4h[index].close < xau4h[index].open &&
        (!CONFIG.strictRejection || xau4h[index].close < xau4h[index - 1].close)
      ) {
        xauSignalIndex = index;
        break;
      }
    }
    if (xauSignalIndex < 0) {
      audit.xauReason = "no_resistance_rejection";
      eventAudit.push(audit);
      continue;
    }
    funnel.xauResistanceTouch += 1;

    let idmTarget: number | null = null;
    for (let index = xauSignalIndex - 2; index > xauSweepIndex; index -= 1) {
      if (isPivotLow(xau4h, index, 1) && xau4h[index].low < xau4h[xauSignalIndex + 1].open) {
        idmTarget = xau4h[index].low;
        break;
      }
    }
    if (idmTarget == null) {
      audit.xauReason = "no_confirmed_internal_swing_low_idm";
      eventAudit.push(audit);
      continue;
    }
    funnel.xauIdmTargetAvailable += 1;
    const entryIndex = xauSignalIndex + 1;
    const atr = xauAtr[xauSignalIndex];
    if (atr == null) {
      eventAudit.push(audit);
      continue;
    }
    const stop = Math.max(xau4h[xauSignalIndex].high, xauResistance.high) + 0.1 * atr;
    const entry = xau4h[entryIndex].open;
    const risk = stop - entry;
    if (risk <= 0 || idmTarget >= entry || (entry - idmTarget) / risk < 1) {
      audit.xauReason = "idm_target_below_1r";
      eventAudit.push(audit);
      continue;
    }
    const trade = resolveShortTrade({
      model: "XAUUSD_SSL_IDM",
      eventTime,
      setupTime: xau4h[xauSignalIndex].openTime,
      rows: xau4h,
      entryIndex,
      stop,
      target: idmTarget,
      equity: INITIAL_CAPITAL,
      notes: `EXT SSL ${xauSsl}; bearish FVG ${xauResistance.low}-${xauResistance.high}; IDM ${idmTarget}`,
    });
    if (trade) {
      trades.push(trade);
      funnel.xauTrades += 1;
      audit.xauTrade = true;
      audit.xauEntryTime = new Date(trade.entryTime).toISOString();
    }
    eventAudit.push(audit);
  }

  const eurTrades = trades.filter((trade) => trade.model === "DXY_EURUSD");
  const xauTrades = trades.filter((trade) => trade.model === "XAUUSD_SSL_IDM");
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePost: "https://t.me/CryptologyKey/9974",
    sourcePostContext: "https://t.me/s/CryptologyKey",
    data: {
      DXY: { symbol: "DX-Y.NYB", first: dxy1h[0]?.openTime, last: dxy1h.at(-1)?.openTime },
      EURUSD: { symbol: "EURUSD=X", first: eur1h[0]?.openTime, last: eur1h.at(-1)?.openTime },
      XAUUSD: { symbol: "GC=F", first: xau1h[0]?.openTime, last: xau1h.at(-1)?.openTime },
    },
    assumptions: {
      BSL: "Highest high of the previous 20 closed H4 candles.",
      DXYExpansion:
        "Within three H4 candles from FOMC: bullish close above BSL and true range >= ATR(14).",
      FVG: "Strict three-candle wick gap.",
      DXYCorrection: "First touch of the bullish expansion FVG within 36 H4 candles.",
      EURResistance:
        "Touch of a prior bearish H4 FVG within +/- one H4 candle of DXY correction, followed by bearish rejection.",
      EURExit: "SL above rejection/FVG plus 0.1 ATR; TP fixed at 2R.",
      ExternalSSL:
        "XAUUSD trades below the lowest low of the previous 20 H4 candles and closes back above it.",
      XAUResistance: "Touch and bearish rejection of the nearest prior bearish H4 FVG.",
      IDM:
        "Nearest confirmed internal H4 pivot low formed after the SSL sweep and before entry.",
      risk: "1% of current equity per trade.",
      costs: "Spread, commission, slippage, and swaps are not included.",
    },
    configuration: CONFIG,
    warning:
      "This is a transparent OHLC formalization of a discretionary narrative, not Garry's disclosed rule set.",
    funnel,
    metrics: {
      combined: metrics(trades),
      eurusd: metrics(eurTrades),
      xauusd: metrics(xauTrades),
    },
    trades,
    eventAudit,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    `${OUTPUT_DIR}/garry_dxy_short_narrative_research${OUTPUT_SUFFIX}.json`,
    JSON.stringify(report, null, 2),
    "utf8"
  );
  const csvHeaders = [
    "model",
    "event_time",
    "setup_time",
    "entry_time",
    "exit_time",
    "entry",
    "stop",
    "target",
    "exit",
    "result",
    "r",
    "profit",
    "notes",
  ];
  const csvRows = trades.map((trade) => [
    trade.model,
    new Date(trade.eventTime).toISOString(),
    new Date(trade.setupTime).toISOString(),
    new Date(trade.entryTime).toISOString(),
    new Date(trade.exitTime).toISOString(),
    trade.entry,
    trade.stop,
    trade.target,
    trade.exit,
    trade.result,
    trade.r,
    trade.profit,
    trade.notes,
  ]);
  writeFileSync(
    `${OUTPUT_DIR}/garry_dxy_short_narrative_trades${OUTPUT_SUFFIX}.csv`,
    [csvHeaders, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8"
  );

  console.log(JSON.stringify({ funnel, metrics: report.metrics, trades }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
