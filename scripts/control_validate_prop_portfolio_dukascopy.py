import argparse
import csv
import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


DAY_MS = 86_400_000
HOUR_MS = 3_600_000
INITIAL_EQUITY = 10_000.0
RISK_PCT = 0.5
MAX_CONCURRENT_RISK_PCT = 2.0
DAILY_STOP_PCT = -3.0
TOTAL_LOSS_LIMIT_PCT = -10.0
MONTE_CARLO_RUNS = 5_000
START = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
END = int(datetime(2026, 6, 17, tzinfo=timezone.utc).timestamp() * 1000)

PROFILES = {
    "USDCHF": {
        "file_symbol": "USDCHF",
        "strategy": "breakout",
        "timeframe_hours": 1,
        "lookback": 80,
        "stop_atr": 0.75,
        "reward_r": 2.5,
        "direction": "short",
        "ema_period": 100,
        "atr_period": 14,
        "max_hold_bars": 24,
    },
    "XAUUSD": {
        "file_symbol": "XAUUSD",
        "strategy": "orb",
        "timeframe_hours": 1,
        "opening_bars": 1,
        "stop_atr": 0.75,
        "reward_r": 2.5,
        "direction": "short",
        "ema_period": 100,
        "atr_period": 14,
        "min_range_atr": 0.15,
        "max_range_atr": 2.5,
        "max_risk_atr": 1.5,
    },
    "US30": {
        "file_symbol": "USA30IDXUSD",
        "strategy": "orb",
        "timeframe_hours": 1,
        "opening_bars": 1,
        "stop_atr": 0.75,
        "reward_r": 2.0,
        "direction": "long",
        "ema_period": 100,
        "atr_period": 14,
        "min_range_atr": 0.3,
        "max_range_atr": 1.5,
        "max_risk_atr": 1.5,
    },
    "SPX500": {
        "file_symbol": "USA500IDXUSD",
        "strategy": "breakout",
        "timeframe_hours": 4,
        "lookback": 40,
        "stop_atr": 0.75,
        "reward_r": 2.5,
        "direction": "long",
        "ema_period": 100,
        "atr_period": 14,
        "max_hold_bars": 12,
    },
}


def timestamp_ms(value):
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)


def load_bidask(path):
    rows = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            timestamp = timestamp_ms(row["time"])
            rows.append(
                {
                    "time": timestamp,
                    "bid_open": float(row["bid_open"]),
                    "bid_high": float(row["bid_high"]),
                    "bid_low": float(row["bid_low"]),
                    "bid_close": float(row["bid_close"]),
                    "ask_open": float(row["ask_open"]),
                    "ask_high": float(row["ask_high"]),
                    "ask_low": float(row["ask_low"]),
                    "ask_close": float(row["ask_close"]),
                    "spread_mean": float(row["spread_mean"]),
                }
            )
    rows.sort(key=lambda item: item["time"])
    return rows


def aggregate(rows, hours):
    interval = hours * HOUR_MS
    buckets = {}
    for row in rows:
        bucket_time = row["time"] - row["time"] % interval
        bucket = buckets.get(bucket_time)
        if bucket is None:
            buckets[bucket_time] = {
                "time": bucket_time,
                "bid_open": row["bid_open"],
                "bid_high": row["bid_high"],
                "bid_low": row["bid_low"],
                "bid_close": row["bid_close"],
            }
        else:
            bucket["bid_high"] = max(bucket["bid_high"], row["bid_high"])
            bucket["bid_low"] = min(bucket["bid_low"], row["bid_low"])
            bucket["bid_close"] = row["bid_close"]
    return [buckets[key] for key in sorted(buckets)]


def ema(rows, period):
    values = [None] * len(rows)
    if len(rows) < period:
        return values
    value = sum(row["bid_close"] for row in rows[:period]) / period
    values[period - 1] = value
    multiplier = 2 / (period + 1)
    for index in range(period, len(rows)):
        value = (rows[index]["bid_close"] - value) * multiplier + value
        values[index] = value
    return values


def atr(rows, period):
    values = [None] * len(rows)
    ranges = [None]
    for index in range(1, len(rows)):
        current = rows[index]
        previous = rows[index - 1]
        ranges.append(
            max(
                current["bid_high"] - current["bid_low"],
                abs(current["bid_high"] - previous["bid_close"]),
                abs(current["bid_low"] - previous["bid_close"]),
            )
        )
    rolling = 0.0
    for index in range(1, len(rows)):
        rolling += ranges[index]
        if index > period:
            rolling -= ranges[index - period]
        if index >= period:
            values[index] = rolling / period
    return values


def minute_index(rows):
    return {row["time"]: index for index, row in enumerate(rows)}


def execute_trade(
    minutes,
    start_index,
    direction,
    entry,
    stop,
    target,
    time_exit,
    close_before_time_exit=False,
):
    risk_distance = abs(entry - stop)
    if risk_distance <= 0:
        return None
    entry_spread = minutes[start_index]["ask_open"] - minutes[start_index]["bid_open"]
    spread_samples = [entry_spread]
    path = []
    for index in range(start_index, len(minutes)):
        row = minutes[index]
        if row["time"] >= time_exit:
            if close_before_time_exit and index > start_index:
                previous = minutes[index - 1]
                exit_price = (
                    previous["bid_close"] if direction == "long" else previous["ask_close"]
                )
                exit_time = previous["time"]
            else:
                exit_price = row["bid_open"] if direction == "long" else row["ask_open"]
                exit_time = row["time"]
            reason = "time"
            break
        spread_samples.append(row["spread_mean"])
        mark_price = row["bid_close"] if direction == "long" else row["ask_close"]
        mark_r = (
            (mark_price - entry) / risk_distance
            if direction == "long"
            else (entry - mark_price) / risk_distance
        )
        path.append((row["time"], mark_r))
        if direction == "long":
            stop_hit = row["bid_low"] <= stop
            target_hit = row["bid_high"] >= target
        else:
            stop_hit = row["ask_high"] >= stop
            target_hit = row["ask_low"] <= target
        if stop_hit:
            exit_price = stop
            reason = "stop"
            exit_time = row["time"]
            break
        if target_hit:
            exit_price = target
            reason = "target"
            exit_time = row["time"]
            break
    else:
        row = minutes[-1]
        exit_price = row["bid_close"] if direction == "long" else row["ask_close"]
        reason = "data_end"
        exit_time = row["time"]

    net_r = (
        (exit_price - entry) / risk_distance
        if direction == "long"
        else (entry - exit_price) / risk_distance
    )
    path.append((exit_time, net_r))
    return {
        "entryTime": minutes[start_index]["time"],
        "exitTime": exit_time,
        "direction": direction,
        "entryPrice": entry,
        "exitPrice": exit_price,
        "riskDistance": risk_distance,
        "netR": net_r,
        "exitReason": reason,
        "meanSpread": sum(spread_samples) / len(spread_samples),
        "_path": path,
    }


def breakout_trades(symbol, minutes, profile):
    bars = aggregate(minutes, profile["timeframe_hours"])
    atr_values = atr(bars, profile["atr_period"])
    ema_values = ema(bars, profile["ema_period"])
    by_minute = minute_index(minutes)
    interval = profile["timeframe_hours"] * HOUR_MS
    trades = []
    next_free_time = 0
    warmup = max(profile["lookback"], profile["ema_period"], profile["atr_period"])
    for index in range(warmup + 1, len(bars) - 1):
        signal = bars[index]
        entry_time = bars[index + 1]["time"]
        if entry_time < START or entry_time >= END or entry_time < next_free_time:
            continue
        atr_value = atr_values[index]
        ema_value = ema_values[index]
        if atr_value is None or ema_value is None:
            continue
        high = max(row["bid_high"] for row in bars[index - profile["lookback"] : index])
        low = min(row["bid_low"] for row in bars[index - profile["lookback"] : index])
        long_signal = signal["bid_close"] > high and signal["bid_close"] > ema_value
        short_signal = signal["bid_close"] < low and signal["bid_close"] < ema_value
        direction = "long" if long_signal else "short" if short_signal else None
        if direction != profile["direction"]:
            continue
        minute_pos = by_minute.get(entry_time)
        if minute_pos is None:
            continue
        entry = minutes[minute_pos]["ask_open"] if direction == "long" else minutes[minute_pos]["bid_open"]
        distance = atr_value * profile["stop_atr"]
        stop = entry - distance if direction == "long" else entry + distance
        target = entry + distance * profile["reward_r"] if direction == "long" else entry - distance * profile["reward_r"]
        time_exit = entry_time + profile["max_hold_bars"] * interval
        trade = execute_trade(minutes, minute_pos, direction, entry, stop, target, time_exit)
        if trade:
            trade["asset"] = symbol
            trades.append(trade)
            next_free_time = trade["exitTime"] + 1
    return trades


def orb_trades(symbol, minutes, profile):
    bars = aggregate(minutes, 1)
    atr_values = atr(bars, profile["atr_period"])
    ema_values = ema(bars, profile["ema_period"])
    by_minute = minute_index(minutes)
    bars_by_day = defaultdict(list)
    index_by_time = {row["time"]: index for index, row in enumerate(bars)}
    for bar in bars:
        bars_by_day[bar["time"] - bar["time"] % DAY_MS].append(bar)
    trades = []
    for day, day_bars in sorted(bars_by_day.items()):
        if len(day_bars) <= profile["opening_bars"] + 1:
            continue
        first = day_bars[0]
        global_index = index_by_time[first["time"]]
        if global_index < max(profile["atr_period"], profile["ema_period"]):
            continue
        atr_value = atr_values[global_index]
        ema_value = ema_values[global_index]
        if atr_value is None or ema_value is None:
            continue
        opening = day_bars[: profile["opening_bars"]]
        range_high = max(row["bid_high"] for row in opening)
        range_low = min(row["bid_low"] for row in opening)
        opening_range = range_high - range_low
        ratio = opening_range / atr_value if atr_value else 0
        if ratio < profile["min_range_atr"] or ratio > profile["max_range_atr"]:
            continue
        for offset in range(profile["opening_bars"], len(day_bars) - 1):
            signal = day_bars[offset]
            entry_bar = day_bars[offset + 1]
            if entry_bar["time"] < START or entry_bar["time"] >= END:
                continue
            direction = None
            if signal["bid_close"] > range_high and first["bid_close"] > ema_value:
                direction = "long"
            if signal["bid_close"] < range_low and first["bid_close"] < ema_value:
                direction = "short"
            if direction != profile["direction"]:
                continue
            minute_pos = by_minute.get(entry_bar["time"])
            if minute_pos is None:
                continue
            entry = minutes[minute_pos]["ask_open"] if direction == "long" else minutes[minute_pos]["bid_open"]
            atr_stop = entry - atr_value * profile["stop_atr"] if direction == "long" else entry + atr_value * profile["stop_atr"]
            range_stop = range_low if direction == "long" else range_high
            stop = max(atr_stop, range_stop) if direction == "long" else min(atr_stop, range_stop)
            distance = abs(entry - stop)
            if distance <= 0 or distance / atr_value > profile["max_risk_atr"]:
                continue
            target = entry + distance * profile["reward_r"] if direction == "long" else entry - distance * profile["reward_r"]
            trade = execute_trade(
                minutes,
                minute_pos,
                direction,
                entry,
                stop,
                target,
                day + DAY_MS,
                close_before_time_exit=True,
            )
            if trade:
                trade["asset"] = symbol
                trades.append(trade)
            break
    return trades


def apply_spread_stress(trades, multiplier):
    stressed = []
    for trade in trades:
        extra_cost_r = max(0.0, multiplier - 1.0) * trade["meanSpread"] / trade["riskDistance"]
        stressed.append(
            {
                **trade,
                "netR": trade["netR"] - extra_cost_r,
                "_path": [
                    (timestamp, mark_r - extra_cost_r)
                    for timestamp, mark_r in trade["_path"]
                ],
            }
        )
    return stressed


def portfolio_metrics(trades):
    events = []
    for index, trade in enumerate(trades):
        events.append((trade["entryTime"], 1, index, trade))
        events.append((max(trade["exitTime"], trade["entryTime"] + 1), 0, index, trade))
    events.sort()
    equity = INITIAL_EQUITY
    peak = equity
    current_day = None
    day_open = equity
    day_profit = 0.0
    worst_day = 0.0
    max_drawdown = 0.0
    open_positions = {}
    completed = []
    daily_profit = defaultdict(float)
    skipped_daily = skipped_risk = 0
    for timestamp, event_type, index, trade in events:
        day = timestamp - timestamp % DAY_MS
        if day != current_day:
            current_day = day
            day_open = equity
            day_profit = 0.0
        if event_type == 1:
            if day_profit / day_open * 100 <= DAILY_STOP_PCT:
                skipped_daily += 1
                continue
            if len(open_positions) * RISK_PCT + RISK_PCT > MAX_CONCURRENT_RISK_PCT + 1e-9:
                skipped_risk += 1
                continue
            open_positions[index] = equity * RISK_PCT / 100
            continue
        risk_amount = open_positions.pop(index, None)
        if risk_amount is None:
            continue
        profit = risk_amount * trade["netR"]
        equity += profit
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, (equity - peak) / peak * 100)
        day_profit += profit
        worst_day = min(worst_day, day_profit / day_open * 100)
        exit_day = trade["exitTime"] - trade["exitTime"] % DAY_MS
        daily_profit[exit_day] += profit
        completed.append(
            {
                **trade,
                "profit": profit,
                "_riskAmount": risk_amount,
                "_positionIndex": index,
            }
        )
    gross_profit = sum(max(0, row["profit"]) for row in completed)
    gross_loss = sum(max(0, -row["profit"]) for row in completed)
    daily_returns = []
    rolling = INITIAL_EQUITY
    day = START - START % DAY_MS
    while day < END:
        if datetime.fromtimestamp(day / 1000, timezone.utc).weekday() < 5:
            profit = daily_profit[day]
            daily_returns.append(profit / rolling * 100)
            rolling += profit
        day += DAY_MS
    worst_day_equity = mark_to_market_worst_day(completed)
    return {
        "tradeCount": len(completed),
        "returnPct": (equity / INITIAL_EQUITY - 1) * 100,
        "profitFactor": gross_profit / gross_loss if gross_loss else 999 if gross_profit else 0,
        "winRate": sum(row["profit"] > 0 for row in completed) / len(completed) * 100 if completed else 0,
        "expectancyR": sum(row["netR"] for row in completed) / len(completed) if completed else 0,
        "maxDrawdownPct": max_drawdown,
        "worstDayPct": worst_day,
        "worstDayEquityPct": worst_day_equity,
        "skippedDailyStop": skipped_daily,
        "skippedRiskCap": skipped_risk,
        "dailyReturnsPct": daily_returns,
        "trades": completed,
    }


def mark_to_market_worst_day(completed):
    events = []
    for trade in completed:
        position_id = trade["_positionIndex"]
        risk_amount = trade["_riskAmount"]
        for timestamp, mark_r in trade["_path"]:
            events.append((timestamp, 0, position_id, risk_amount * mark_r))
        events.append((trade["exitTime"], 1, position_id, trade["profit"]))
    events.sort()
    realized_equity = INITIAL_EQUITY
    open_marks = {}
    current_day = None
    day_open_equity = INITIAL_EQUITY
    worst = 0.0
    for timestamp, event_type, position_id, value in events:
        day = timestamp - timestamp % DAY_MS
        if day != current_day:
            current_day = day
            day_open_equity = realized_equity + sum(open_marks.values())
        if event_type == 0:
            open_marks[position_id] = value
        else:
            realized_equity += value
            open_marks.pop(position_id, None)
        equity = realized_equity + sum(open_marks.values())
        if day_open_equity:
            worst = min(worst, (equity - day_open_equity) / day_open_equity * 100)
    return worst


def sample_blocks(values, rng, length, block=5):
    result = []
    while len(result) < length:
        start = rng.randrange(len(values))
        for offset in range(block):
            result.append(values[(start + offset) % len(values)])
            if len(result) == length:
                break
    return result


def run_phase(days, target, max_days):
    equity = 100.0
    for index in range(max_days):
        value = days[index] if index < len(days) else 0.0
        if value <= DAILY_STOP_PCT:
            return False, False, index + 1
        equity *= 1 + value / 100
        if equity <= 100 + TOTAL_LOSS_LIMIT_PCT:
            return False, False, index + 1
        if equity >= 100 + target:
            return True, True, index + 1
    return False, True, max_days


def monte_carlo(daily_returns):
    values = daily_returns or [0.0]
    rng = random.Random(20260622)
    passed = phase1_passed = safe = 0
    completion = []
    for _ in range(MONTE_CARLO_RUNS):
        sample = sample_blocks(values, rng, 120)
        phase1, phase1_safe, phase1_days = run_phase(sample[:60], 8, 60)
        safe += phase1_safe
        if not phase1:
            continue
        phase1_passed += 1
        phase2, _, phase2_days = run_phase(sample[phase1_days : phase1_days + 40], 4, 40)
        if phase2:
            passed += 1
            completion.append(phase1_days + phase2_days)
    completion.sort()
    return {
        "runs": MONTE_CARLO_RUNS,
        "cpp": passed / MONTE_CARLO_RUNS * 100,
        "phase1PassProbability": phase1_passed / MONTE_CARLO_RUNS * 100,
        "phase2PassProbabilityConditional": passed / phase1_passed * 100 if phase1_passed else 0,
        "rulesSafetyProbability": safe / MONTE_CARLO_RUNS * 100,
        "medianCompletionDays": completion[len(completion) // 2] if completion else None,
    }


def compact(metrics):
    return {key: value for key, value in metrics.items() if key not in {"dailyReturnsPct", "trades"}}


def monthly_breakdown(trades):
    grouped = defaultdict(list)
    for trade in trades:
        month = datetime.fromtimestamp(
            trade["entryTime"] / 1000, timezone.utc
        ).strftime("%Y-%m")
        grouped[month].append(trade)
    result = {}
    for month, rows in sorted(grouped.items()):
        equity = 100.0
        for trade in rows:
            equity *= 1 + RISK_PCT / 100 * trade["netR"]
        result[month] = {
            "trades": len(rows),
            "returnPct": equity - 100,
            "expectancyR": sum(row["netR"] for row in rows) / len(rows),
        }
    return result


def yahoo_comparison(path, assets):
    if not path.exists():
        return None
    rows = json.loads(path.read_text(encoding="utf-8"))
    strategy_by_asset = {
        "USDCHF": ("htf_breakout", 2),
        "XAUUSD": ("opening_range_breakout", 3),
        "US30": ("opening_range_breakout", 3),
        "SPX500": ("htf_breakout", 6),
    }
    result = {}
    for asset, (strategy, tolerance_hours) in strategy_by_asset.items():
        candidates = [
            row
            for row in rows
            if row["asset"] == asset and row["strategy"] == strategy
        ]
        if not candidates:
            continue
        selected = max(candidates, key=lambda row: row["score"])
        yahoo_entries = [
            trade["entry"]
            for trade in selected["tradeList"]
            if START <= trade["entry"] < END
        ]
        dukascopy_entries = assets[asset]["tradeEntries"]
        tolerance = tolerance_hours * HOUR_MS
        near_matches = sum(
            any(abs(entry - candidate) <= tolerance for candidate in dukascopy_entries)
            for entry in yahoo_entries
        )
        yahoo_days = {entry - entry % DAY_MS for entry in yahoo_entries}
        dukascopy_days = {entry - entry % DAY_MS for entry in dukascopy_entries}
        result[asset] = {
            "yahooSignals": len(yahoo_entries),
            "dukascopySignals": len(dukascopy_entries),
            "nearMatches": near_matches,
            "toleranceHours": tolerance_hours,
            "sameUtcDayMatches": len(yahoo_days & dukascopy_days),
        }
    return result


def locate_file(data_dir, file_symbol):
    matches = sorted(data_dir.glob(f"{file_symbol}_1m_bidask_2025-01-01_2026-06-17.csv"))
    if not matches:
        matches = sorted(data_dir.glob(f"{file_symbol}_1m_bidask_*.csv"))
    if not matches:
        raise FileNotFoundError(f"No bid/ask CSV for {file_symbol} in {data_dir}")
    return matches[-1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=".scratch/dukascopy_control")
    parser.add_argument(
        "--output",
        default=".scratch/backtests/prop_cross_asset_dukascopy_control_2026.json",
    )
    parser.add_argument(
        "--yahoo-holdout",
        default=".scratch/backtests/available_assets_holdout_2025_2026.json",
    )
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    all_trades = []
    assets = {}
    for symbol, profile in PROFILES.items():
        path = locate_file(data_dir, profile["file_symbol"])
        minutes = load_bidask(path)
        trades = (
            breakout_trades(symbol, minutes, profile)
            if profile["strategy"] == "breakout"
            else orb_trades(symbol, minutes, profile)
        )
        all_trades.extend(trades)
        asset_metrics = portfolio_metrics(trades)
        assets[symbol] = {
            "source": str(path),
            "minuteRows": len(minutes),
            "first": minutes[0]["time"] if minutes else None,
            "last": minutes[-1]["time"] if minutes else None,
            "tradeCount": len(trades),
            "meanSpread": sum(row["spread_mean"] for row in minutes) / len(minutes) if minutes else None,
            "metricsAtActualSpread": compact(asset_metrics),
            "tradeEntries": [trade["entryTime"] for trade in trades],
        }
        print(symbol, "minutes", len(minutes), "trades", len(trades))
    variants = []
    for multiplier in (1.0, 1.5, 2.0):
        metrics = portfolio_metrics(apply_spread_stress(all_trades, multiplier))
        variants.append(
            {
                "spreadStressMultiplier": multiplier,
                "metrics": compact(metrics),
                "monteCarlo": monte_carlo(metrics["dailyReturnsPct"]),
                "monthly": monthly_breakdown(metrics["trades"]),
            }
        )
        print(
            f"spread={multiplier}x trades={metrics['tradeCount']} "
            f"ret={metrics['returnPct']:.2f}% PF={metrics['profitFactor']:.2f} "
            f"DD={metrics['maxDrawdownPct']:.2f}% day={metrics['worstDayPct']:.2f}% "
            f"CPP={variants[-1]['monteCarlo']['cpp']:.1f}% "
            f"safe={variants[-1]['monteCarlo']['rulesSafetyProbability']:.1f}%"
        )
    baseline = variants[1]
    report = {
        "status": (
            "APPROVED"
            if baseline["monteCarlo"]["cpp"] >= 60
            and baseline["monteCarlo"]["rulesSafetyProbability"] >= 95
            and baseline["metrics"]["profitFactor"] >= 1.2
            and baseline["metrics"]["maxDrawdownPct"] > -10
            and baseline["metrics"]["worstDayEquityPct"] > DAILY_STOP_PCT
            else "REJECTED"
        ),
        "period": {"start": "2026-01-01", "endExclusive": "2026-06-17"},
        "execution": "Dukascopy minute bid/ask; long ask-entry/bid-exit, short bid-entry/ask-exit; stop checked before target.",
        "riskPctPerModule": RISK_PCT,
        "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
        "assets": assets,
        "signalComparisonToYahoo": yahoo_comparison(
            Path(args.yahoo_holdout), assets
        ),
        "variants": variants,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", output)


if __name__ == "__main__":
    main()
