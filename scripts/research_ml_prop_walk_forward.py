from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier


DATA_DIR = Path("public/data/forex")
OUTPUT_PATH = Path(".scratch/backtests/ml_prop_walk_forward_2026.json")
INITIAL_EQUITY = 10_000.0
DAILY_STOP_PCT = -3.0
MAX_CONCURRENT_RISK_PCT = 2.0
FILES = {
    "EURUSD": "EURUSD_1m_2024-01-01_2026-06-12.csv",
    "GBPUSD": "GBPUSD_1m_2025-01-01_2026-06-13.csv",
    "USDJPY": "USDJPY_1m_2025-01-01_2026-06-13.csv",
    "AUDUSD": "AUDUSD_1m_2023-06-15_2026-06-15.csv",
    "GER40": "GER40_1m_2024-01-01_2026-06-15.csv",
}
COST = {"EURUSD": 1.2, "GBPUSD": 1.6, "USDJPY": 1.4, "AUDUSD": 1.4, "GER40": 2.0}


@dataclass
class Trade:
    symbol: str
    direction: int
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp
    net_r: float
    probability: float


def pip_size(symbol: str) -> float:
    if symbol == "GER40":
        return 1.0
    return 0.01 if symbol.endswith("JPY") else 0.0001


def load_bars(symbol: str, filename: str) -> pd.DataFrame:
    source = pd.read_csv(
        DATA_DIR / filename,
        usecols=[0, 1, 2, 3, 4],
        names=["time", "open", "high", "low", "close"],
        header=0,
    )
    source["time"] = pd.to_datetime(source["time"], utc=True, errors="coerce")
    source = source.dropna().set_index("time").sort_index()
    bars = source.resample("30min").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    )
    bars = bars.dropna().loc["2024-12-01":"2026-06-16"].copy()
    bars["symbol"] = symbol
    return bars


def add_features(bars: pd.DataFrame, symbol_code: int) -> pd.DataFrame:
    result = bars.copy()
    previous_close = result["close"].shift(1)
    true_range = pd.concat(
        [
            result["high"] - result["low"],
            (result["high"] - previous_close).abs(),
            (result["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    result["atr"] = true_range.rolling(14).mean()
    for period in [1, 3, 6, 12, 24]:
        result[f"ret_{period}"] = result["close"].pct_change(period)
    for period in [20, 50, 100]:
        ema = result["close"].ewm(span=period, adjust=False).mean()
        result[f"ema_dist_{period}"] = (result["close"] - ema) / result["atr"]
    movement = result["close"].diff().abs().rolling(10).sum()
    result["efficiency_10"] = (result["close"] - result["close"].shift(10)).abs() / movement
    result["atr_ratio"] = result["atr"] / result["atr"].rolling(40).mean()
    candle_range = (result["high"] - result["low"]).replace(0, np.nan)
    result["body_atr"] = (result["close"] - result["open"]) / result["atr"]
    result["upper_wick"] = (
        result["high"] - result[["open", "close"]].max(axis=1)
    ) / candle_range
    result["lower_wick"] = (
        result[["open", "close"]].min(axis=1) - result["low"]
    ) / candle_range
    hour = result.index.hour + result.index.minute / 60
    result["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    result["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    result["dow_sin"] = np.sin(2 * np.pi * result.index.dayofweek / 5)
    result["dow_cos"] = np.cos(2 * np.pi * result.index.dayofweek / 5)
    result["symbol_code"] = symbol_code
    return result


FEATURE_COLUMNS = [
    "ret_1",
    "ret_3",
    "ret_6",
    "ret_12",
    "ret_24",
    "ema_dist_20",
    "ema_dist_50",
    "ema_dist_100",
    "efficiency_10",
    "atr_ratio",
    "body_atr",
    "upper_wick",
    "lower_wick",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "symbol_code",
    "direction",
]


def outcome(
    bars: pd.DataFrame,
    index: int,
    direction: int,
    stop_atr: float,
    reward_r: float,
    max_hold: int,
    symbol: str,
) -> tuple[float, pd.Timestamp] | None:
    if index + 1 >= len(bars):
        return None
    signal = bars.iloc[index]
    entry_row = bars.iloc[index + 1]
    atr_value = float(signal["atr"])
    if not math.isfinite(atr_value) or atr_value <= 0:
        return None
    entry = float(entry_row["open"])
    risk_distance = atr_value * stop_atr
    stop = entry - direction * risk_distance
    target = entry + direction * risk_distance * reward_r
    gross_r = 0.0
    exit_time = bars.index[min(len(bars) - 1, index + max_hold + 1)]
    exit_price = float(bars.iloc[min(len(bars) - 1, index + max_hold + 1)]["close"])
    for cursor in range(index + 1, min(len(bars), index + max_hold + 2)):
        row = bars.iloc[cursor]
        stop_hit = float(row["low"]) <= stop if direction > 0 else float(row["high"]) >= stop
        target_hit = float(row["high"]) >= target if direction > 0 else float(row["low"]) <= target
        if stop_hit:
            gross_r = -1.0
            exit_time = bars.index[cursor]
            exit_price = stop
            break
        if target_hit:
            gross_r = reward_r
            exit_time = bars.index[cursor]
            exit_price = target
            break
    else:
        gross_r = direction * (exit_price - entry) / risk_distance
    cost_r = COST[symbol] * pip_size(symbol) / risk_distance
    return gross_r - cost_r, exit_time


def build_samples(
    featured: dict[str, pd.DataFrame],
    stop_atr: float,
    reward_r: float,
    max_hold: int,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for symbol, bars in featured.items():
        clean = bars.reset_index()
        for index in range(110, len(bars) - max_hold - 2):
            feature_row = bars.iloc[index]
            if feature_row[FEATURE_COLUMNS[:-1]].isna().any():
                continue
            for direction in [1, -1]:
                result = outcome(bars, index, direction, stop_atr, reward_r, max_hold, symbol)
                if result is None:
                    continue
                net_r, exit_time = result
                row = {column: float(feature_row[column]) for column in FEATURE_COLUMNS[:-1]}
                row.update(
                    {
                        "direction": direction,
                        "time": clean.iloc[index]["time"],
                        "entry_time": clean.iloc[index + 1]["time"],
                        "exit_time": exit_time,
                        "symbol": symbol,
                        "net_r": net_r,
                        "target": int(net_r > 0),
                    }
                )
                rows.append(row)
    return pd.DataFrame(rows).sort_values("time").reset_index(drop=True)


def simulate(
    trades: list[Trade],
    risk_pct: float,
    concurrent_risk_pct: float | None = None,
) -> dict[str, object]:
    events: list[tuple[pd.Timestamp, int, int, Trade]] = []
    for index, trade in enumerate(trades):
        events.append((trade.entry_time, 1, index, trade))
        events.append((trade.exit_time, 0, index, trade))
    events.sort(key=lambda item: (item[0], item[1], item[2]))
    equity = INITIAL_EQUITY
    peak = equity
    max_dd = 0.0
    worst_day = 0.0
    open_positions: dict[int, tuple[float, float]] = {}
    completed: list[float] = []
    day = None
    day_start_equity = equity
    daily_realized = 0.0
    daily_profit: dict[pd.Timestamp, float] = {}
    for timestamp, event_type, index, trade in events:
        current_day = timestamp.floor("D")
        if day is None or current_day != day:
            day = current_day
            day_start_equity = equity
            daily_realized = 0.0
        if event_type == 1:
            daily_pct = daily_realized / day_start_equity * 100
            if daily_pct <= DAILY_STOP_PCT:
                continue
            entry_risk_pct = (
                risk_pct
                if not open_positions or concurrent_risk_pct is None
                else concurrent_risk_pct
            )
            open_risk_pct = sum(value[1] for value in open_positions.values())
            if open_risk_pct + entry_risk_pct > MAX_CONCURRENT_RISK_PCT + 1e-9:
                continue
            open_positions[index] = (equity * entry_risk_pct / 100, entry_risk_pct)
            continue
        position = open_positions.pop(index, None)
        if position is None:
            continue
        risk_amount, _entry_risk_pct = position
        profit = risk_amount * trade.net_r
        equity += profit
        daily_realized += profit
        daily_profit[current_day] = daily_profit.get(current_day, 0.0) + profit
        peak = max(peak, equity)
        max_dd = min(max_dd, (equity - peak) / peak * 100)
        worst_day = min(worst_day, daily_realized / day_start_equity * 100)
        completed.append(trade.net_r)
    gross_profit = sum(value for value in completed if value > 0)
    gross_loss = abs(sum(value for value in completed if value < 0))
    days = pd.date_range("2026-01-01", "2026-06-15", freq="B", tz="UTC")
    rolling = INITIAL_EQUITY
    daily_returns = []
    for current_day in days:
        profit = daily_profit.get(current_day, 0.0)
        daily_returns.append(profit / rolling * 100 if rolling else 0.0)
        rolling += profit
    return {
        "tradeCount": len(completed),
        "returnPct": (equity - INITIAL_EQUITY) / INITIAL_EQUITY * 100,
        "profitFactor": gross_profit / gross_loss if gross_loss else 999.0,
        "expectancyR": float(np.mean(completed)) if completed else 0.0,
        "winRate": sum(value > 0 for value in completed) / len(completed) * 100 if completed else 0.0,
        "maxDrawdownPct": max_dd,
        "worstDayPct": worst_day,
        "dailyReturnsPct": daily_returns,
    }


def phase(days: list[float], target: float, maximum: int) -> tuple[bool, bool, int]:
    equity = 100.0
    for index, daily_return in enumerate(days[:maximum]):
        if daily_return <= DAILY_STOP_PCT:
            return False, False, index + 1
        equity *= 1 + daily_return / 100
        if equity <= 90:
            return False, False, index + 1
        if equity >= 100 + target:
            return True, True, index + 1
    return False, True, maximum


def monte_carlo(days: list[float], runs: int = 5_000) -> dict[str, float | int | None]:
    rng = np.random.default_rng(20260621)
    passed = safe = phase1_passed = phase2_passed = 0
    completion: list[int] = []
    source = np.asarray(days if days else [0.0])
    for _ in range(runs):
        sampled: list[float] = []
        while len(sampled) < 120:
            start = int(rng.integers(0, max(1, len(source) - 4)))
            sampled.extend(source[start : start + 5].tolist())
        first_passed, first_safe, first_days = phase(sampled, 8, 60)
        safe += int(first_safe)
        if not first_passed:
            continue
        phase1_passed += 1
        second_passed, _, second_days = phase(sampled[first_days:], 4, 40)
        if second_passed:
            phase2_passed += 1
            passed += 1
            completion.append(first_days + second_days)
    return {
        "simulations": runs,
        "cpp": passed / runs * 100,
        "phase1PassProbability": phase1_passed / runs * 100,
        "phase2PassProbabilityConditional": phase2_passed / phase1_passed * 100
        if phase1_passed
        else 0.0,
        "rulesSafetyProbability": safe / runs * 100,
        "medianCompletionDays": float(np.median(completion)) if completion else None,
    }


def main() -> None:
    featured = {
        symbol: add_features(load_bars(symbol, filename), code)
        for code, (symbol, filename) in enumerate(FILES.items())
    }
    geometries = [
        {"stop_atr": 0.75, "reward_r": 1.5, "max_hold": 8},
        {"stop_atr": 0.75, "reward_r": 2.0, "max_hold": 12},
        {"stop_atr": 0.75, "reward_r": 2.0, "max_hold": 16},
    ]
    model_configs = [
        {"learning_rate": 0.05, "max_leaf_nodes": 15, "min_samples_leaf": 100},
    ]
    thresholds = [0.55, 0.60]
    results = []
    for geometry in geometries:
        samples = build_samples(featured, **geometry)
        for model_config in model_configs:
            predictions = []
            for month_start in pd.date_range(
                "2026-01-01", "2026-06-01", freq="MS", tz="UTC"
            ):
                month_end = month_start + pd.offsets.MonthBegin(1)
                train_end = month_start - pd.Timedelta(
                    minutes=30 * geometry["max_hold"]
                )
                train = samples[
                    (samples["time"] >= pd.Timestamp("2025-01-01", tz="UTC"))
                    & (samples["time"] < train_end)
                ]
                test = samples[
                    (samples["time"] >= month_start)
                    & (samples["time"] < month_end)
                    & (samples["time"] < pd.Timestamp("2026-06-16", tz="UTC"))
                ].copy()
                if len(train) < 5_000 or test.empty:
                    continue
                model = HistGradientBoostingClassifier(
                    max_iter=100,
                    l2_regularization=1.0,
                    class_weight="balanced",
                    random_state=20260621,
                    **model_config,
                )
                model.fit(train[FEATURE_COLUMNS], train["target"])
                test["probability"] = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
                predictions.append(test)
            predicted = pd.concat(predictions, ignore_index=True)
            for threshold in thresholds:
                eligible = predicted[predicted["probability"] >= threshold]
                selected = (
                    eligible.sort_values("probability", ascending=False)
                    .drop_duplicates("time")
                    .sort_values("entry_time")
                )
                trades = [
                    Trade(
                        symbol=row.symbol,
                        direction=int(row.direction),
                        entry_time=row.entry_time,
                        exit_time=row.exit_time,
                        net_r=float(row.net_r),
                        probability=float(row.probability),
                    )
                    for row in selected.itertuples()
                ]
                risk_policies = [
                    {"lead": 0.25, "concurrent": None, "name": "fixed_0.25"},
                ]
                for policy in risk_policies:
                    risk_pct = policy["lead"]
                    metrics = simulate(trades, risk_pct, policy["concurrent"])
                    mc = monte_carlo(metrics["dailyReturnsPct"])
                    verdict = (
                        metrics["tradeCount"] >= 80
                        and metrics["returnPct"] > 0
                        and metrics["profitFactor"] >= 1.2
                        and metrics["maxDrawdownPct"] >= -6
                        and metrics["worstDayPct"] >= DAILY_STOP_PCT
                        and mc["cpp"] >= 60
                        and mc["rulesSafetyProbability"] >= 95
                    )
                    results.append(
                        {
                            "geometry": geometry,
                            "model": model_config,
                            "threshold": threshold,
                            "riskPct": risk_pct,
                            "riskPolicy": policy["name"],
                            "metrics": {
                                key: value
                                for key, value in metrics.items()
                                if key != "dailyReturnsPct"
                            },
                            "monteCarlo": mc,
                            "verdict": "APPROVED" if verdict else "REJECTED",
                        }
                    )
    results.sort(
        key=lambda row: (
            row["monteCarlo"]["cpp"],
            row["metrics"]["profitFactor"],
            row["metrics"]["returnPct"],
        ),
        reverse=True,
    )
    output = {
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "methodology": {
            "primaryYear": 2026,
            "walkForward": "Retrain at each month start using only prior samples.",
            "target": "Probability that the trade exits with positive net R after costs.",
            "dailyStopPct": DAILY_STOP_PCT,
            "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
        },
        "results": results,
        "selected": results[0] if results else None,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(
        pd.DataFrame(
            [
                {
                    "threshold": row["threshold"],
                    "risk": row["riskPct"],
                    "trades": row["metrics"]["tradeCount"],
                    "return": round(row["metrics"]["returnPct"], 2),
                    "pf": round(row["metrics"]["profitFactor"], 2),
                    "dd": round(row["metrics"]["maxDrawdownPct"], 2),
                    "cpp": round(row["monteCarlo"]["cpp"], 1),
                    "safety": round(row["monteCarlo"]["rulesSafetyProbability"], 1),
                    "verdict": row["verdict"],
                }
                for row in results[:20]
            ]
        ).to_string(index=False)
    )


if __name__ == "__main__":
    main()
