import type { Kline } from "@/lib/binance";

const ONE_MINUTE_MS = 60 * 1000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;

type SupportedInterval = "1m" | "5m" | "1h" | "4h";

const TIME_HEADERS = ["time", "timestamp", "date", "datetime", "open_time", "opentime"];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function detectDelimiter(line: string) {
  const candidates = [",", ";", "\t"];

  return candidates.reduce((best, delimiter) => {
    const count = line.split(delimiter).length;
    return count > line.split(best).length ? delimiter : best;
  }, ",");
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseTimestamp(raw: string) {
  const trimmed = raw.trim();
  const numeric = Number(trimmed);

  if (Number.isFinite(numeric)) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(raw: string) {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

function findColumn(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function intervalMs(interval: SupportedInterval) {
  if (interval === "1m") return ONE_MINUTE_MS;
  if (interval === "5m") return FIVE_MINUTES_MS;
  if (interval === "4h") return FOUR_HOURS_MS;

  return ONE_HOUR_MS;
}

export function parseLocalCsvKlines(csvText: string): Kline[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV file is empty or missing rows.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const timeIndex = findColumn(headers, TIME_HEADERS);
  const openIndex = findColumn(headers, ["open", "o"]);
  const highIndex = findColumn(headers, ["high", "h"]);
  const lowIndex = findColumn(headers, ["low", "l"]);
  const closeIndex = findColumn(headers, ["close", "c"]);
  const volumeIndex = findColumn(headers, ["volume", "vol", "v"]);

  if (timeIndex < 0 || openIndex < 0 || highIndex < 0 || lowIndex < 0 || closeIndex < 0) {
    throw new Error("CSV must include time, open, high, low, and close columns.");
  }

  const rows: Kline[] = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const openTime = parseTimestamp(cells[timeIndex] ?? "");
    const open = parseNumber(cells[openIndex] ?? "");
    const high = parseNumber(cells[highIndex] ?? "");
    const low = parseNumber(cells[lowIndex] ?? "");
    const close = parseNumber(cells[closeIndex] ?? "");
    const volume = volumeIndex >= 0 ? parseNumber(cells[volumeIndex] ?? "") ?? 0 : 0;

    if (openTime == null || open == null || high == null || low == null || close == null) {
      continue;
    }

    rows.push({
      openTime,
      open,
      high,
      low,
      close,
      volume,
      closeTime: openTime + ONE_MINUTE_MS - 1,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    });
  }

  if (!rows.length) {
    throw new Error("CSV did not contain any valid OHLC rows.");
  }

  const seen = new Set<number>();
  return rows
    .sort((a, b) => a.openTime - b.openTime)
    .filter((row) => {
      if (seen.has(row.openTime)) return false;
      seen.add(row.openTime);
      return true;
    });
}

export function aggregateKlines(klines: Kline[], interval: SupportedInterval): Kline[] {
  if (interval === "1m") return [...klines].sort((a, b) => a.openTime - b.openTime);

  const bucketMs = intervalMs(interval);
  const buckets = new Map<number, Kline[]>();

  for (const kline of klines) {
    const bucketTime = Math.floor(kline.openTime / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketTime) ?? [];
    bucket.push(kline);
    buckets.set(bucketTime, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([openTime, bucket]) => {
      const sorted = bucket.sort((a, b) => a.openTime - b.openTime);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      return {
        openTime,
        open: first.open,
        high: Math.max(...sorted.map((item) => item.high)),
        low: Math.min(...sorted.map((item) => item.low)),
        close: last.close,
        volume: sorted.reduce((sum, item) => sum + item.volume, 0),
        closeTime: openTime + bucketMs - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      };
    });
}

export function getLocalCsvKlinesForRange(
  klines1m: Kline[],
  interval: SupportedInterval,
  startTime: number,
  endTime: number
) {
  const source = klines1m.filter((kline) => kline.openTime >= startTime && kline.openTime < endTime);

  return aggregateKlines(source, interval);
}
