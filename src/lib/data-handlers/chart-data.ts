import type { OHLCDataPoint } from "@/components/charts/candlestick-chart";
import type { Kline } from "@/lib/binance";

export interface TimeValuePoint {
  date: Date;
  value: number;
}

export interface NamedTimeValuePoint extends TimeValuePoint {
  [key: string]: Date | number | string;
}

export interface MarketOhlcPoint extends OHLCDataPoint {
  timestamp: number;
  volume?: number;
}

export function toMarketOhlcPoint(kline: Kline): MarketOhlcPoint {
  return {
    date: new Date(kline.openTime),
    timestamp: kline.openTime,
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
    volume: kline.volume,
  };
}

export function toMarketOhlcSeries(klines: Kline[]): MarketOhlcPoint[] {
  return klines.map(toMarketOhlcPoint);
}

export function downsampleOhlcSeries(
  data: MarketOhlcPoint[],
  maxPoints = 650
): MarketOhlcPoint[] {
  if (data.length <= maxPoints) return data;

  const bucketSize = Math.ceil(data.length / maxPoints);
  const buckets: MarketOhlcPoint[] = [];

  for (let index = 0; index < data.length; index += bucketSize) {
    const bucket = data.slice(index, index + bucketSize);
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    if (!first || !last) continue;

    buckets.push({
      date: first.date,
      timestamp: first.timestamp,
      open: first.open,
      high: Math.max(...bucket.map((point) => point.high)),
      low: Math.min(...bucket.map((point) => point.low)),
      close: last.close,
      volume: bucket.reduce((sum, point) => sum + (point.volume ?? 0), 0),
    });
  }

  return buckets;
}

export function toNamedLineSeries<T>(
  data: T[],
  getTimestamp: (point: T) => number,
  series: Record<string, (point: T) => number>
): NamedTimeValuePoint[] {
  return data.map((point) => {
    const row: NamedTimeValuePoint = {
      date: new Date(getTimestamp(point)),
      value: 0,
    };

    for (const [key, getter] of Object.entries(series)) {
      row[key] = getter(point);
    }

    const firstSeriesKey = Object.keys(series)[0];
    if (firstSeriesKey) {
      row.value = row[firstSeriesKey] as number;
    }

    return row;
  });
}

export function downsampleNamedLineSeries(
  data: NamedTimeValuePoint[],
  maxPoints = 900
): NamedTimeValuePoint[] {
  if (data.length <= maxPoints) return data;

  const bucketSize = Math.ceil(data.length / maxPoints);
  const sampled: NamedTimeValuePoint[] = [];

  for (let index = 0; index < data.length; index += bucketSize) {
    const bucket = data.slice(index, index + bucketSize);
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    if (!first || !last) continue;

    sampled.push({
      ...last,
      date: first.date,
    });
  }

  return sampled;
}

export function toLineSeries<T>(
  data: T[],
  getTimestamp: (point: T) => number,
  getValue: (point: T) => number
): TimeValuePoint[] {
  return data.map((point) => ({
    date: new Date(getTimestamp(point)),
    value: getValue(point),
  }));
}

export function compactPrice(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }

  return `$${value.toFixed(2)}`;
}

export function compactMetric(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}
