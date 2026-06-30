#!/usr/bin/env python3
import argparse
import csv
import datetime as dt
import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


BASE_URL = "https://jetta.dukascopy.com/v1"
SYMBOLS = {
    "USDCHF": "USD-CHF",
    "XAUUSD": "XAU-USD",
    "USA30IDXUSD": "USA30.IDX-USD",
    "USA500IDXUSD": "USA500.IDX-USD",
}


def parse_date(value):
    return dt.datetime.strptime(value, "%Y-%m-%d").date()


def dates_between(start, end):
    current = start
    while current < end:
        if current.weekday() < 5:
            yield current
        current += dt.timedelta(days=1)


def get_json(url, timeout, retries):
    last_error = None
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Origin": "https://widgets.dukascopy.com",
                    "Referer": "https://widgets.dukascopy.com/",
                },
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code in (400, 404):
                return None
            last_error = error
        except (TimeoutError, urllib.error.URLError, json.JSONDecodeError) as error:
            last_error = error
        if attempt < retries:
            time.sleep(min(2 ** attempt, 5))
    raise RuntimeError(f"{url}: {last_error}")


def decode_candles(payload):
    if not payload or not payload.get("times"):
        return {}
    count = len(payload["times"])
    required = ("opens", "highs", "lows", "closes", "volumes")
    if any(len(payload.get(name, [])) != count for name in required):
        raise ValueError("Inconsistent Jetta candle response")
    timestamp = int(payload.get("timestamp", 0))
    shift = int(payload.get("shift", 1))
    multiplier = float(payload.get("multiplier", 1))
    open_ = float(payload.get("open", 0))
    high = float(payload.get("high", 0))
    low = float(payload.get("low", 0))
    close = float(payload.get("close", 0))
    rows = {}
    for index in range(count):
        timestamp += shift * int(payload["times"][index])
        open_ += float(payload["opens"][index]) * multiplier
        high += float(payload["highs"][index]) * multiplier
        low += float(payload["lows"][index]) * multiplier
        close += float(payload["closes"][index]) * multiplier
        rows[timestamp] = {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": float(payload["volumes"][index]) * 1_000_000,
        }
    return rows


def fetch_day(code, day, timeout, retries):
    result = {}
    for side in ("BID", "ASK"):
        url = (
            f"{BASE_URL}/candles/minute/{code}/{side}/"
            f"{day.year}/{day.month}/{day.day}"
        )
        payload = get_json(url, timeout, retries)
        result[side] = decode_candles(payload)
    return day, result


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "time",
        "bid_open",
        "bid_high",
        "bid_low",
        "bid_close",
        "ask_open",
        "ask_high",
        "ask_low",
        "ask_close",
        "bid_volume",
        "ask_volume",
        "spread_open",
        "spread_high",
        "spread_low",
        "spread_close",
        "spread_mean",
        "ticks",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        for timestamp in sorted(rows):
            bid = rows[timestamp].get("BID")
            ask = rows[timestamp].get("ASK")
            if not bid or not ask:
                continue
            spreads = [
                ask["open"] - bid["open"],
                ask["high"] - bid["high"],
                ask["low"] - bid["low"],
                ask["close"] - bid["close"],
            ]
            timestamp_text = dt.datetime.fromtimestamp(
                timestamp / 1000, tz=dt.UTC
            ).isoformat().replace("+00:00", "Z")
            writer.writerow(
                [
                    timestamp_text,
                    f"{bid['open']:.5f}",
                    f"{bid['high']:.5f}",
                    f"{bid['low']:.5f}",
                    f"{bid['close']:.5f}",
                    f"{ask['open']:.5f}",
                    f"{ask['high']:.5f}",
                    f"{ask['low']:.5f}",
                    f"{ask['close']:.5f}",
                    f"{bid['volume']:.2f}",
                    f"{ask['volume']:.2f}",
                    f"{spreads[0]:.5f}",
                    f"{max(spreads):.5f}",
                    f"{min(spreads):.5f}",
                    f"{spreads[3]:.5f}",
                    f"{sum(spreads) / 4:.5f}",
                    0,
                ]
            )


def download_symbol(symbol, code, start, end, output_dir, workers, timeout, retries):
    days = list(dates_between(start, end))
    rows = {}
    completed = 0
    print(f"{symbol}: downloading {len(days)} weekdays from Jetta", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_day, code, day, timeout, retries): day for day in days
        }
        for future in as_completed(futures):
            day = futures[future]
            try:
                _day, sides = future.result()
                for side, candles in sides.items():
                    for timestamp, candle in candles.items():
                        rows.setdefault(timestamp, {})[side] = candle
            except Exception as error:
                print(f"WARN {symbol} {day}: {error}", flush=True)
            completed += 1
            if completed % 50 == 0:
                print(f"{symbol}: {completed}/{len(days)} days processed", flush=True)
    output_path = output_dir / (
        f"{symbol}_1m_bidask_{start}_{end - dt.timedelta(days=1)}.csv"
    )
    write_csv(output_path, rows)
    print(f"{symbol}: wrote {output_path} ({len(rows)} timestamps)", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", nargs="+", default=list(SYMBOLS))
    parser.add_argument("--start", default="2025-01-01")
    parser.add_argument("--end", default="2026-06-18")
    parser.add_argument("--output-dir", default=".scratch/dukascopy_control")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args()
    start = parse_date(args.start)
    end = parse_date(args.end)
    output_dir = Path(args.output_dir)
    for symbol in args.symbols:
        code = SYMBOLS.get(symbol, symbol)
        download_symbol(
            symbol,
            code,
            start,
            end,
            output_dir,
            args.workers,
            args.timeout,
            args.retries,
        )


if __name__ == "__main__":
    main()
