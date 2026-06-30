import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";
import {
  parseDukascopyBidAskCsv,
  type DukascopyBidAskMinute,
} from "../src/lib/data-handlers/microstructure-data";

const START = Date.parse(process.env.BOS_START ?? "2026-01-01T00:00:00Z");
const END = Date.parse(process.env.BOS_END ?? "2026-06-21T00:00:00Z");
const INITIAL_CAPITAL = 10_000;
const RISK_PERCENT = 1;
const MINUTE = 60_000;
const M15 = 15 * MINUTE;
const H4 = 4 * 60 * MINUTE;

const FILES: Record<string, string> = {
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "public/data/forex/AUDUSD_1m_2023-06-15_2026-06-15.csv",
};

type Direction = "long" | "short";

interface Config {
  swingStrength: number;
  h4OrderBlockSearch: number;
  entryExpiryBars: number;
  rewardR: number;
  stopBufferAtr: number;
}

interface StructureState {
  time: number;
  bias: Direction | null;
  poiLow: number | null;
  poiHigh: number | null;
  bosLevel: number | null;
}

interface Trade {
  symbol: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  profit: number;
  r: number;
  status: "SL" | "TP" | "OPEN_END";
}

function aggregate(rows: Kline[], bucketMs: number) {
  const buckets = new Map<number, Kline[]>();
  for (const row of rows) {
    const time = Math.floor(row.openTime / bucketMs) * bucketMs;
    const bucket = buckets.get(time) ?? [];
    bucket.push(row);
    buckets.set(time, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([openTime, bucket]) => {
      const sorted = bucket.sort((a, b) => a.openTime - b.openTime);
      return {
        ...sorted[0],
        openTime,
        open: sorted[0].open,
        high: Math.max(...sorted.map((row) => row.high)),
        low: Math.min(...sorted.map((row) => row.low)),
        close: sorted[sorted.length - 1].close,
        volume: sorted.reduce((sum, row) => sum + row.volume, 0),
        closeTime: openTime + bucketMs - 1,
      };
    });
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

function isPivotHigh(rows: Kline[], index: number, strength: number) {
  if (index - strength < 0 || index + strength >= rows.length) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (rows[index].high <= rows[index - offset].high || rows[index].high < rows[index + offset].high) return false;
  }
  return true;
}

function isPivotLow(rows: Kline[], index: number, strength: number) {
  if (index - strength < 0 || index + strength >= rows.length) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (rows[index].low >= rows[index - offset].low || rows[index].low > rows[index + offset].low) return false;
  }
  return true;
}

function findOrderBlock(rows: Kline[], bosIndex: number, direction: Direction, search: number) {
  for (let index = bosIndex - 1; index >= Math.max(0, bosIndex - search); index -= 1) {
    const bearish = rows[index].close < rows[index].open;
    const bullish = rows[index].close > rows[index].open;
    if ((direction === "long" && bearish) || (direction === "short" && bullish)) {
      return { low: rows[index].low, high: rows[index].high };
    }
  }
  return null;
}

function buildH4Structure(rows: Kline[], config: Config) {
  const states: StructureState[] = [];
  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;
  let bias: Direction | null = null;
  let poiLow: number | null = null;
  let poiHigh: number | null = null;
  let bosLevel: number | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const confirmedIndex = index - config.swingStrength;
    if (confirmedIndex >= 0) {
      if (isPivotHigh(rows, confirmedIndex, config.swingStrength)) lastSwingHigh = rows[confirmedIndex].high;
      if (isPivotLow(rows, confirmedIndex, config.swingStrength)) lastSwingLow = rows[confirmedIndex].low;
    }

    let direction: Direction | null = null;
    if (lastSwingHigh != null && rows[index].close > lastSwingHigh) direction = "long";
    if (lastSwingLow != null && rows[index].close < lastSwingLow) direction = "short";

    if (direction && direction !== bias) {
      const block = findOrderBlock(rows, index, direction, config.h4OrderBlockSearch);
      if (block) {
        bias = direction;
        poiLow = block.low;
        poiHigh = block.high;
        bosLevel = direction === "long" ? lastSwingHigh : lastSwingLow;
      }
    }

    if (bias === "long" && poiLow != null && rows[index].close < poiLow) {
      poiLow = null;
      poiHigh = null;
    }
    if (bias === "short" && poiHigh != null && rows[index].close > poiHigh) {
      poiLow = null;
      poiHigh = null;
    }

    states.push({ time: rows[index].closeTime, bias, poiLow, poiHigh, bosLevel });
  }
  return states;
}

function latestState(states: StructureState[], time: number) {
  let left = 0;
  let right = states.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (states[middle].time < time) left = middle + 1;
    else right = middle;
  }
  return states[Math.max(0, left - 1)] ?? null;
}

function overlaps(row: Kline, low: number, high: number) {
  return row.low <= high && row.high >= low;
}

function resolveTrade(
  symbol: string,
  direction: Direction,
  entryTime: number,
  entry: number,
  stop: number,
  target: number,
  oneMinute: Kline[],
  bidAskByTime: Map<number, DukascopyBidAskMinute> | null,
  startIndex: number,
  riskAmount: number
) {
  const riskDistance = Math.abs(entry - stop);
  const quantity = riskAmount / riskDistance;
  for (let index = startIndex; index < oneMinute.length; index += 1) {
    const row = oneMinute[index];
    const quote = bidAskByTime?.get(row.openTime);
    if (row.openTime < entryTime) continue;
    const hitStop =
      direction === "long"
        ? (quote?.bidLow ?? row.low) <= stop
        : (quote?.askHigh ?? row.high) >= stop;
    // The sequence inside the fill minute is unknown. Count an adverse stop
    // conservatively, but never award a target on that same minute.
    const hitTarget =
      index > startIndex &&
      (direction === "long"
        ? (quote?.bidHigh ?? row.high) >= target
        : (quote?.askLow ?? row.low) <= target);
    if (!hitStop && !hitTarget) continue;
    const exit = hitStop ? stop : target;
    const profit = direction === "long" ? (exit - entry) * quantity : (entry - exit) * quantity;
    return {
      trade: {
        symbol,
        direction,
        entryTime,
        exitTime: row.openTime,
        entry,
        stop,
        target,
        exit,
        profit,
        r: profit / riskAmount,
        status: hitStop ? "SL" : "TP",
      } satisfies Trade,
      exitIndex: index,
    };
  }
  const last = oneMinute[oneMinute.length - 1];
  const profit = direction === "long" ? (last.close - entry) * quantity : (entry - last.close) * quantity;
  return {
    trade: {
      symbol,
      direction,
      entryTime,
      exitTime: last.openTime,
      entry,
      stop,
      target,
      exit: last.close,
      profit,
      r: profit / riskAmount,
      status: "OPEN_END",
    } satisfies Trade,
    exitIndex: oneMinute.length - 1,
  };
}

function run(
  symbol: string,
  oneMinute: Kline[],
  config: Config,
  bidAskByTime: Map<number, DukascopyBidAskMinute> | null = null
) {
  const m15 = aggregate(oneMinute, M15);
  const h4 = aggregate(oneMinute, H4);
  const h4States = buildH4Structure(h4, config);
  const atr = atrSeries(m15);
  const trades: Trade[] = [];
  let equity = INITIAL_CAPITAL;
  let lastExitTime = -Infinity;
  let lastSwingHigh: number | null = null;
  let lastSwingLow: number | null = null;
  let armed: { direction: Direction; touchedAt: number } | null = null;
  let pending: {
    direction: Direction;
    low: number;
    high: number;
    createdAt: number;
    expiresAt: number;
    swingStop: number;
  } | null = null;

  const oneMinuteIndex = new Map(oneMinute.map((row, index) => [row.openTime, index]));

  for (let index = config.swingStrength * 2 + 15; index < m15.length - 1; index += 1) {
    const confirmedIndex = index - config.swingStrength;
    if (isPivotHigh(m15, confirmedIndex, config.swingStrength)) lastSwingHigh = m15[confirmedIndex].high;
    if (isPivotLow(m15, confirmedIndex, config.swingStrength)) lastSwingLow = m15[confirmedIndex].low;
    if (m15[index].openTime <= lastExitTime) continue;

    const state = latestState(h4States, m15[index].openTime);
    if (!state?.bias || state.poiLow == null || state.poiHigh == null) {
      armed = null;
      pending = null;
      continue;
    }

    if (pending && index > pending.expiresAt) pending = null;
    if (pending && pending.direction !== state.bias) pending = null;

    if (!armed && overlaps(m15[index], state.poiLow, state.poiHigh)) {
      armed = { direction: state.bias, touchedAt: index };
      pending = null;
    }
    if (armed && armed.direction !== state.bias) armed = null;

    if (armed && !pending) {
      const bos =
        armed.direction === "long"
          ? lastSwingHigh != null && m15[index].close > lastSwingHigh
          : lastSwingLow != null && m15[index].close < lastSwingLow;
      if (bos) {
        const block = findOrderBlock(m15, index, armed.direction, 6);
        if (block) {
          pending = {
            direction: armed.direction,
            low: block.low,
            high: block.high,
            createdAt: index,
            expiresAt: index + config.entryExpiryBars,
            swingStop:
              armed.direction === "long"
                ? Math.min(...m15.slice(armed.touchedAt, index + 1).map((row) => row.low))
                : Math.max(...m15.slice(armed.touchedAt, index + 1).map((row) => row.high)),
          };
        }
        armed = null;
      }
    }

    if (!pending || index <= pending.createdAt || !overlaps(m15[index], pending.low, pending.high)) continue;
    const atrValue = atr[index];
    if (atrValue == null || atrValue <= 0) continue;

    const entry = (pending.low + pending.high) / 2;
    if (entry < m15[index].low || entry > m15[index].high) continue;
    const stop =
      pending.direction === "long"
        ? Math.min(pending.low, pending.swingStop) - config.stopBufferAtr * atrValue
        : Math.max(pending.high, pending.swingStop) + config.stopBufferAtr * atrValue;
    const riskDistance = Math.abs(entry - stop);
    if (riskDistance <= 0 || riskDistance > 3 * atrValue) {
      pending = null;
      continue;
    }
    const target =
      pending.direction === "long"
        ? entry + config.rewardR * riskDistance
        : entry - config.rewardR * riskDistance;
    const barStartIndex =
      oneMinuteIndex.get(m15[index].openTime) ??
      oneMinute.findIndex((row) => row.openTime >= m15[index].openTime);
    if (barStartIndex < 0) break;
    let minuteStart = -1;
    for (
      let minuteIndex = barStartIndex;
      minuteIndex < oneMinute.length && oneMinute[minuteIndex].openTime < m15[index].openTime + M15;
      minuteIndex += 1
    ) {
      const minute = oneMinute[minuteIndex];
      const quote = bidAskByTime?.get(minute.openTime);
      const filled =
        pending.direction === "long"
          ? (quote?.askLow ?? minute.low) <= entry
          : (quote?.bidHigh ?? minute.high) >= entry;
      if (filled) {
        minuteStart = minuteIndex;
        break;
      }
    }
    if (minuteStart < 0) continue;
    const entryTime = oneMinute[minuteStart].openTime;
    if (entryTime < START || entryTime >= END) {
      pending = null;
      continue;
    }
    const resolved = resolveTrade(
      symbol,
      pending.direction,
      entryTime,
      entry,
      stop,
      target,
      oneMinute,
      bidAskByTime,
      minuteStart,
      equity * (RISK_PERCENT / 100)
    );
    trades.push(resolved.trade);
    equity += resolved.trade.profit;
    lastExitTime = resolved.trade.exitTime;
    pending = null;
    armed = null;
  }
  return trades;
}

function metrics(trades: Trade[]) {
  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  for (const trade of trades) {
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    if (trade.profit > 0) {
      winners += 1;
      grossProfit += trade.profit;
      lossStreak = 0;
    } else if (trade.profit < 0) {
      grossLoss += Math.abs(trade.profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }
  return {
    trades: trades.length,
    winners,
    losers: trades.filter((trade) => trade.profit < 0).length,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    netProfit: equity - INITIAL_CAPITAL,
    returnPct: (equity / INITIAL_CAPITAL - 1) * 100,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.r, 0) / trades.length : 0,
    maxDrawdown,
    maxDrawdownPct: (maxDrawdown / INITIAL_CAPITAL) * 100,
    maxLossStreak,
    finalEquity: equity,
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const universalConfig: Config = {
  swingStrength: 2,
  h4OrderBlockSearch: 8,
  entryExpiryBars: 8,
  rewardR: 2,
  stopBufferAtr: 0.05,
};
const configs: Config[] = [];
if (process.env.BOS_FIXED_CONFIG_JSON) {
  configs.push(JSON.parse(process.env.BOS_FIXED_CONFIG_JSON) as Config);
} else if (process.env.BOS_FIXED_UNIVERSAL === "1") {
  configs.push(universalConfig);
} else {
  for (const swingStrength of [2, 3]) {
    for (const h4OrderBlockSearch of [4, 8]) {
      for (const entryExpiryBars of [8, 16]) {
        for (const rewardR of [2, 3]) {
          for (const stopBufferAtr of [0.05, 0.1]) {
            configs.push({ swingStrength, h4OrderBlockSearch, entryExpiryBars, rewardR, stopBufferAtr });
          }
        }
      }
    }
  }
}

const outputSuffix = process.env.BOS_OUTPUT_SUFFIX ? `_${process.env.BOS_OUTPUT_SUFFIX}` : "";
const results: Array<{
  symbol: string;
  config: Config;
  metrics: ReturnType<typeof metrics>;
  trades: Trade[];
}> = [];

const selectedSymbols = new Set(
  (process.env.BOS_SYMBOLS ?? Object.keys(FILES).join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
);
const bidAskPath = process.env.BOS_BIDASK_FILE;

for (const [symbol, path] of Object.entries(FILES)) {
  if (!selectedSymbols.has(symbol)) continue;
  if (!existsSync(path)) continue;
  const bidAsk =
    bidAskPath && selectedSymbols.size === 1
      ? parseDukascopyBidAskCsv(readFileSync(bidAskPath, "utf8"))
      : null;
  const bidAskByTime = bidAsk ? new Map(bidAsk.map((row) => [row.time, row])) : null;
  const rows = (
    bidAsk
      ? bidAsk.map(
          (row) =>
            ({
              openTime: row.time,
              open: row.bidOpen,
              high: row.bidHigh,
              low: row.bidLow,
              close: row.bidClose,
              volume: row.bidVolume,
              closeTime: row.time + MINUTE - 1,
              quoteVolume: 0,
              trades: row.ticks,
              takerBuyBaseVolume: 0,
              takerBuyQuoteVolume: 0,
            }) satisfies Kline
        )
      : parseLocalCsvKlines(readFileSync(path, "utf8"))
  ).filter((row) => row.openTime >= START - 180 * 86_400_000 && row.openTime < END);
  console.log(`${symbol}: ${rows.length} one-minute rows`);
  for (const config of configs) {
    const trades = run(symbol, rows, config, bidAskByTime).filter(
      (trade) => trade.entryTime >= START && trade.entryTime < END
    );
    results.push({ symbol, config, metrics: metrics(trades), trades });
  }
}

results.sort((left, right) => {
  const leftScore =
    left.metrics.returnPct +
    left.metrics.profitFactor * 3 +
    left.metrics.expectancyR * 10 +
    left.metrics.maxDrawdownPct * 2 -
    Math.max(0, 12 - left.metrics.trades);
  const rightScore =
    right.metrics.returnPct +
    right.metrics.profitFactor * 3 +
    right.metrics.expectancyR * 10 +
    right.metrics.maxDrawdownPct * 2 -
    Math.max(0, 12 - right.metrics.trades);
  return rightScore - leftScore;
});

mkdirSync("public/exports", { recursive: true });
writeFileSync(
  `public/exports/bos_structure_research${outputSuffix || "_2026"}.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      period: { start: new Date(START).toISOString(), endExclusive: new Date(END).toISOString() },
      assumptions: {
        h4Structure: "Confirmed fractal swing BOS, no look-ahead use before right-side confirmation.",
        h4Poi: "Last opposite H4 candle before BOS.",
        m15Entry: "Touch H4 POI, confirmed M15 BOS, retrace to midpoint of last opposite M15 candle.",
        risk: "1% current equity",
        stop: "Beyond M15 order block or post-POI swing plus ATR buffer",
        target: "Fixed 2R or 3R",
        execution: bidAskPath
          ? "Dukascopy bid/ask minute execution"
          : "Bid OHLC execution without explicit spread",
      },
      results,
    },
    null,
    2
  ),
  "utf8"
);

const headers = [
  "symbol",
  "swing_strength",
  "h4_ob_search",
  "entry_expiry_bars",
  "reward_r",
  "stop_buffer_atr",
  "trades",
  "win_rate",
  "net_profit",
  "return_pct",
  "profit_factor",
  "expectancy_r",
  "max_drawdown",
  "max_drawdown_pct",
  "max_loss_streak",
  "final_equity",
];
const rows = results.map((result) => [
  result.symbol,
  result.config.swingStrength,
  result.config.h4OrderBlockSearch,
  result.config.entryExpiryBars,
  result.config.rewardR,
  result.config.stopBufferAtr,
  result.metrics.trades,
  result.metrics.winRate,
  result.metrics.netProfit,
  result.metrics.returnPct,
  result.metrics.profitFactor,
  result.metrics.expectancyR,
  result.metrics.maxDrawdown,
  result.metrics.maxDrawdownPct,
  result.metrics.maxLossStreak,
  result.metrics.finalEquity,
]);
writeFileSync(
  `public/exports/bos_structure_research${outputSuffix || "_2026"}.csv`,
  [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
  "utf8"
);

console.table(
  results.slice(0, 20).map((result) => ({
    symbol: result.symbol,
    trades: result.metrics.trades,
    ret: result.metrics.returnPct.toFixed(2),
    wr: result.metrics.winRate.toFixed(1),
    pf: result.metrics.profitFactor.toFixed(2),
    dd: result.metrics.maxDrawdownPct.toFixed(2),
    ls: result.metrics.maxLossStreak,
    config: JSON.stringify(result.config),
  }))
);
