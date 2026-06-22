import type { Kline } from "../binance";

interface JettaCandlePayload {
  timestamp?: number;
  multiplier?: number;
  shift?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  times?: number[];
  opens?: number[];
  highs?: number[];
  lows?: number[];
  closes?: number[];
  volumes?: number[];
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const BASE_URL = "https://jetta.dukascopy.com/v1";

export function decodeJettaCandles(payload: JettaCandlePayload): Kline[] {
  const times = payload.times ?? [];
  const opens = payload.opens ?? [];
  const highs = payload.highs ?? [];
  const lows = payload.lows ?? [];
  const closes = payload.closes ?? [];
  const volumes = payload.volumes ?? [];
  if (
    !times.length ||
    [opens, highs, lows, closes, volumes].some((values) => values.length !== times.length)
  ) {
    return [];
  }
  const multiplier = payload.multiplier ?? 1;
  const shift = payload.shift ?? 1;
  let timestamp = payload.timestamp ?? 0;
  let open = payload.open ?? 0;
  let high = payload.high ?? 0;
  let low = payload.low ?? 0;
  let close = payload.close ?? 0;
  const rows: Kline[] = [];
  for (let index = 0; index < times.length; index += 1) {
    timestamp += shift * times[index];
    open += opens[index] * multiplier;
    high += highs[index] * multiplier;
    low += lows[index] * multiplier;
    close += closes[index] * multiplier;
    rows.push({
      openTime: timestamp,
      open,
      high,
      low,
      close,
      volume: volumes[index] * 1_000_000,
      closeTime: timestamp + HOUR_MS - 1,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    });
  }
  return rows;
}

export function aggregateJettaHours(rows: Kline[], timeframeHours: 1 | 4) {
  if (timeframeHours === 1) return rows;
  const intervalMs = timeframeHours * HOUR_MS;
  const buckets = new Map<number, Kline>();
  for (const row of rows) {
    const openTime = row.openTime - (row.openTime % intervalMs);
    const existing = buckets.get(openTime);
    if (!existing) {
      buckets.set(openTime, {
        ...row,
        openTime,
        closeTime: openTime + intervalMs - 1,
      });
      continue;
    }
    existing.high = Math.max(existing.high, row.high);
    existing.low = Math.min(existing.low, row.low);
    existing.close = row.close;
    existing.volume += row.volume;
  }
  return [...buckets.values()].sort((left, right) => left.openTime - right.openTime);
}

function monthStarts(start: number, end: number) {
  const result: number[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= end) {
    result.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

async function fetchJettaJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      origin: "https://widgets.dukascopy.com",
      referer: "https://widgets.dukascopy.com/",
      "user-agent": "Centurion signal monitor/1.0",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dukascopy Jetta ${response.status}: ${body.slice(0, 180)}`);
  }
  return (await response.json()) as JettaCandlePayload;
}

async function fetchSide(code: string, side: "BID" | "ASK", start: number, end: number) {
  const now = Date.now();
  const currentMonth = new Date(now);
  const currentMonthStart = Date.UTC(
    currentMonth.getUTCFullYear(),
    currentMonth.getUTCMonth(),
    1
  );
  const payloads = await Promise.all(
    monthStarts(start, end).map(async (monthStart) => {
      const month = new Date(monthStart);
      const url =
        monthStart >= currentMonthStart
          ? `${BASE_URL}/candles/trade/hour/${encodeURIComponent(code)}/${side}?from=${Math.max(
              start,
              currentMonthStart
            )}`
          : `${BASE_URL}/candles/trade/hour/${encodeURIComponent(code)}/${side}/${month.getUTCFullYear()}/${
              month.getUTCMonth() + 1
            }`;
      return fetchJettaJson(url);
    })
  );
  const unique = new Map<number, Kline>();
  for (const payload of payloads) {
    for (const row of decodeJettaCandles(payload)) {
      if (row.openTime >= start && row.openTime <= end) unique.set(row.openTime, row);
    }
  }
  return [...unique.values()].sort((left, right) => left.openTime - right.openTime);
}

export async function fetchDukascopyJettaBidAsk({
  code,
  timeframeHours,
  lookbackDays = 45,
}: {
  code: string;
  timeframeHours: 1 | 4;
  lookbackDays?: number;
}) {
  const end = Date.now() + 5 * MINUTE_MS;
  const start = end - lookbackDays * 24 * HOUR_MS;
  const [bidHours, askHours] = await Promise.all([
    fetchSide(code, "BID", start, end),
    fetchSide(code, "ASK", start, end),
  ]);
  return {
    bid: aggregateJettaHours(bidHours, timeframeHours),
    ask: aggregateJettaHours(askHours, timeframeHours),
  };
}
