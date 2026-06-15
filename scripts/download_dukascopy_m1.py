#!/usr/bin/env python3
"""Download Dukascopy tick data and aggregate it into 1M OHLC CSV files.

The output format is compatible with Centurion's Local CSV 1M importer:
time,open,high,low,close,volume
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import lzma
import struct
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


BASE_URL = "https://datafeed.dukascopy.com/datafeed"
TICK_STRUCT = struct.Struct(">IIIff")
SYMBOL_ALIASES = {
    "GER40": "DEUIDXEUR",
}
INDEX_SYMBOLS = {
    "AUSIDXAUD",
    "CHEIDXCHF",
    "DEUIDXEUR",
    "ESPIDXEUR",
    "EUSIDXEUR",
    "FRAIDXEUR",
    "GBRIDXGBP",
    "HKGIDXHKD",
    "JPNIDXJPY",
    "USA30IDXUSD",
    "USA500IDXUSD",
    "USATECHIDXUSD",
}


def parse_date(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=dt.UTC)


def iter_hours(start: dt.datetime, end: dt.datetime):
    cursor = start.replace(minute=0, second=0, microsecond=0)
    while cursor < end:
        if is_fx_trading_hour(cursor):
            yield cursor
        cursor += dt.timedelta(hours=1)


def is_fx_trading_hour(hour: dt.datetime) -> bool:
    # Dukascopy FX is generally closed from late Friday UTC until Sunday evening UTC.
    # Avoiding those hours keeps the downloader fast and prevents noisy 503 responses.
    weekday = hour.weekday()
    if weekday == 5:
        return False
    if weekday == 6 and hour.hour < 21:
        return False
    if weekday == 4 and hour.hour >= 22:
        return False

    return True


def price_scale(symbol: str) -> int:
    normalized = SYMBOL_ALIASES.get(symbol.upper(), symbol.upper())
    if normalized in INDEX_SYMBOLS:
        return 1000

    return 1000 if normalized.endswith("JPY") else 100000


def dukascopy_url(symbol: str, hour: dt.datetime) -> str:
    normalized = SYMBOL_ALIASES.get(symbol.upper(), symbol.upper())
    return (
        f"{BASE_URL}/{normalized}/{hour.year}/"
        f"{hour.month - 1:02d}/{hour.day:02d}/{hour.hour:02d}h_ticks.bi5"
    )


def fetch_hour(symbol: str, hour: dt.datetime, timeout: int, retries: int):
    url = dukascopy_url(symbol, hour)
    last_error: Exception | None = None

    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Centurion/1.0"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                if response.status == 404:
                    return []
                raw = response.read()

            if not raw:
                return []

            data = lzma.decompress(raw)
            scale = price_scale(symbol)
            candles: dict[int, list[float]] = {}
            hour_ms = int(hour.timestamp() * 1000)

            for offset in range(0, len(data), TICK_STRUCT.size):
                chunk = data[offset : offset + TICK_STRUCT.size]
                if len(chunk) != TICK_STRUCT.size:
                    continue

                delta_ms, _ask, bid, _ask_volume, bid_volume = TICK_STRUCT.unpack(chunk)
                tick_time = hour_ms + delta_ms
                minute_time = tick_time - (tick_time % 60000)
                price = bid / scale

                candle = candles.get(minute_time)
                if candle is None:
                    candles[minute_time] = [price, price, price, price, float(bid_volume)]
                else:
                    candle[1] = max(candle[1], price)
                    candle[2] = min(candle[2], price)
                    candle[3] = price
                    candle[4] += float(bid_volume)

            return [
                (minute_time, values[0], values[1], values[2], values[3], values[4])
                for minute_time, values in candles.items()
            ]
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return []
            last_error = error
        except (TimeoutError, urllib.error.URLError, lzma.LZMAError) as error:
            last_error = error

        if attempt < retries:
            time.sleep(min(1.0 * (attempt + 1), 5.0))

    raise RuntimeError(f"Failed {symbol} {hour.isoformat()}: {last_error}")


def load_existing_minutes(path: Path):
    if not path.exists():
        return set()

    minutes: set[int] = set()
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            raw_time = row.get("time")
            if not raw_time:
                continue
            try:
                timestamp = int(dt.datetime.fromisoformat(raw_time.replace("Z", "+00:00")).timestamp() * 1000)
                minutes.add(timestamp)
            except ValueError:
                continue

    return minutes


def complete_existing_hours(existing_minutes: set[int], minimum_minutes: int):
    counts: dict[int, int] = {}
    for minute in existing_minutes:
        hour = minute - (minute % 3600000)
        counts[hour] = counts.get(hour, 0) + 1

    return {hour for hour, count in counts.items() if count >= minimum_minutes}


def write_csv(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    sorted_rows = sorted(rows, key=lambda item: item[0])

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["time", "open", "high", "low", "close", "volume"])
        for minute_time, open_, high, low, close, volume in sorted_rows:
            timestamp = dt.datetime.fromtimestamp(minute_time / 1000, tz=dt.UTC)
            writer.writerow(
                [
                    timestamp.isoformat().replace("+00:00", "Z"),
                    f"{open_:.5f}",
                    f"{high:.5f}",
                    f"{low:.5f}",
                    f"{close:.5f}",
                    f"{volume:.2f}",
                ]
            )


def download_symbol(
    symbol: str,
    start: dt.datetime,
    end: dt.datetime,
    output_dir: Path,
    workers: int,
    timeout: int,
    retries: int,
    min_existing_minutes_per_hour: int,
):
    output_symbol = symbol.upper()
    output_path = output_dir / f"{output_symbol}_1m_{start.date()}_{(end - dt.timedelta(days=1)).date()}.csv"
    existing_minutes = load_existing_minutes(output_path)
    existing_hours = complete_existing_hours(existing_minutes, min_existing_minutes_per_hour)
    hours = [hour for hour in iter_hours(start, end) if int(hour.timestamp() * 1000) not in existing_hours]
    rows = []

    if existing_minutes:
      with output_path.open("r", encoding="utf-8", newline="") as handle:
          reader = csv.DictReader(handle)
          for row in reader:
              timestamp = int(dt.datetime.fromisoformat(row["time"].replace("Z", "+00:00")).timestamp() * 1000)
              rows.append(
                  (
                      timestamp,
                      float(row["open"]),
                      float(row["high"]),
                      float(row["low"]),
                      float(row["close"]),
                      float(row.get("volume") or 0),
                  )
              )

    print(f"{symbol}: {len(hours)} hours to download, {len(existing_minutes)} existing minutes", flush=True)

    completed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_hour, symbol, hour, timeout, retries): hour
            for hour in hours
        }

        for future in as_completed(futures):
            hour = futures[future]
            try:
                rows.extend(future.result())
            except Exception as error:
                print(f"WARN {symbol} {hour.isoformat()}: {error}", file=sys.stderr, flush=True)

            completed += 1
            if completed % 250 == 0:
                write_csv(output_path, rows)
                print(f"{symbol}: {completed}/{len(hours)} hours processed", flush=True)

    write_csv(output_path, rows)
    print(f"{symbol}: wrote {output_path} ({len(rows)} candles)", flush=True)
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="+", default=["EURUSD"])
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default=dt.datetime.now(dt.UTC).strftime("%Y-%m-%d"))
    parser.add_argument("--output-dir", default="public/data/forex")
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--min-existing-minutes-per-hour", type=int, default=30)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    start = parse_date(args.start)
    end = parse_date(args.end) + dt.timedelta(days=1)
    output_dir = Path(args.output_dir)

    for symbol in args.symbols:
        download_symbol(
            symbol,
            start,
            end,
            output_dir,
            max(1, args.workers),
            max(1, args.timeout),
            max(0, args.retries),
            max(1, args.min_existing_minutes_per_hour),
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
