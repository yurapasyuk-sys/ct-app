import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


INPUT = Path(".scratch/backtests/available_assets_holdout_2025_2026.json")
OUTPUT = Path(".scratch/backtests/usdchf_breakout_prop_validation_2026.json")
INITIAL_EQUITY = 10_000.0
START_2025 = int(datetime(2025, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
START_2026 = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
END_2026 = int(datetime(2026, 6, 17, tzinfo=timezone.utc).timestamp() * 1000)
DAILY_STOP_PCT = -3.0
TOTAL_LOSS_LIMIT_PCT = -10.0
ROUND_TRIP_COST_PRICE = {
    "EURUSD": 1.2 * 0.0001,
    "AUDUSD": 1.4 * 0.0001,
    "NZDUSD": 1.8 * 0.0001,
    "USDCHF": 1.8 * 0.0001,
    "USDCAD": 1.8 * 0.0001,
    "XAUUSD": 0.5,
    "US30": 4.0,
    "SPX500": 0.75,
}
RISK_LEVELS = (0.25, 0.5, 0.75, 1.0)
MAX_CONCURRENT_RISK_PCT = 2.0
MONTE_CARLO_RUNS = 5_000


def day_start_ms(timestamp):
    return timestamp - timestamp % 86_400_000


def select_candidate(rows):
    candidates = [
        row
        for row in rows
        if row["asset"] == "USDCHF"
        and row["strategy"] == "htf_breakout"
        and row["config"]["timeframe"] == "1h"
        and row["config"]["direction"] == "short"
        and row["config"]["lookback"] == 80
        and row["config"]["breakEvenAtR"] == 0
    ]
    if not candidates:
        raise RuntimeError("No eligible USDCHF training candidates")
    return max(candidates, key=lambda row: row["score"])


def select_nzd_candidate(rows):
    candidates = [
        row
        for row in rows
        if row["asset"] == "NZDUSD"
        and row["strategy"] == "opening_range_breakout"
        and row["config"]["openingBars"] == 2
        and row["config"]["direction"] == "all"
        and row["config"]["breakEvenAtR"] == 0
        and row["config"]["maxRangeAtr"] == 2.5
    ]
    if not candidates:
        raise RuntimeError("No eligible NZDUSD training candidates")
    return max(candidates, key=lambda row: row["score"])


def select_asset_breakout(rows, asset):
    candidates = [
        row
        for row in rows
        if row["asset"] == asset
        and row["strategy"] == "htf_breakout"
        and row["config"]["timeframe"] == "1h"
    ]
    if not candidates:
        raise RuntimeError(f"No eligible {asset} breakout training candidates")
    return max(candidates, key=lambda row: row["score"])


def select_asset_strategy(rows, asset, strategy):
    candidates = [
        row for row in rows if row["asset"] == asset and row["strategy"] == strategy
    ]
    if not candidates:
        raise RuntimeError(f"No eligible {asset} {strategy} training candidates")
    return max(candidates, key=lambda row: row["score"])


def net_trades(candidate, cost_multiplier, start=START_2026, end=END_2026):
    result = []
    for trade in candidate["tradeList"]:
        if not (start <= trade["entry"] < end):
            continue
        cost_price = ROUND_TRIP_COST_PRICE[candidate["asset"]]
        cost_r = cost_price * cost_multiplier / trade["riskDistance"]
        result.append(
            {
                **trade,
                "asset": candidate["asset"],
                "grossR": trade["r"],
                "costR": cost_r,
                "netR": trade["r"] - cost_r,
            }
        )
    return sorted(result, key=lambda trade: (trade["entry"], trade["exit"]))


def simulate(trades, risk_pct, start=START_2026, end=END_2026):
    events = []
    for index, trade in enumerate(trades):
        events.append((trade["entry"], 1, index, trade))
        events.append((max(trade["exit"], trade["entry"] + 1), 0, index, trade))
    events.sort()

    equity = INITIAL_EQUITY
    peak = equity
    max_drawdown_pct = 0.0
    current_day = None
    day_open_equity = equity
    daily_realized = 0.0
    worst_day_pct = 0.0
    open_positions = {}
    completed = []
    daily_profit = defaultdict(float)
    skipped_daily_stop = 0
    skipped_risk_cap = 0

    for timestamp, event_type, index, trade in events:
        day = day_start_ms(timestamp)
        if day != current_day:
            current_day = day
            day_open_equity = equity
            daily_realized = 0.0

        if event_type == 1:
            event_risk_pct = (
                risk_pct.get(trade["asset"], 0.0) if isinstance(risk_pct, dict) else risk_pct
            )
            if event_risk_pct <= 0:
                continue
            current_daily_pct = daily_realized / day_open_equity * 100
            if current_daily_pct <= DAILY_STOP_PCT:
                skipped_daily_stop += 1
                continue
            open_risk_pct = sum(position["riskPct"] for position in open_positions.values())
            if open_risk_pct + event_risk_pct > MAX_CONCURRENT_RISK_PCT + 1e-9:
                skipped_risk_cap += 1
                continue
            open_positions[index] = {
                "riskAmount": equity * event_risk_pct / 100,
                "riskPct": event_risk_pct,
            }
            continue

        position = open_positions.pop(index, None)
        if position is None:
            continue
        profit = position["riskAmount"] * trade["netR"]
        equity += profit
        peak = max(peak, equity)
        max_drawdown_pct = min(max_drawdown_pct, (equity - peak) / peak * 100)
        daily_realized += profit
        daily_profit[day_start_ms(trade["exit"])] += profit
        worst_day_pct = min(worst_day_pct, daily_realized / day_open_equity * 100)
        completed.append({**trade, "profit": profit})

    gross_profit = sum(max(0.0, trade["profit"]) for trade in completed)
    gross_loss = sum(max(0.0, -trade["profit"]) for trade in completed)
    winners = sum(trade["profit"] > 0 for trade in completed)

    daily_returns = []
    rolling_equity = INITIAL_EQUITY
    day = day_start_ms(start)
    while day < end:
        weekday = datetime.fromtimestamp(day / 1000, timezone.utc).weekday()
        if weekday < 5:
            profit = daily_profit[day]
            daily_returns.append(profit / rolling_equity * 100 if rolling_equity else 0.0)
            rolling_equity += profit
        day += 86_400_000

    return {
        "tradeCount": len(completed),
        "returnPct": (equity / INITIAL_EQUITY - 1) * 100,
        "winRate": winners / len(completed) * 100 if completed else 0.0,
        "profitFactor": gross_profit / gross_loss if gross_loss else 999.0 if gross_profit else 0.0,
        "expectancyR": sum(trade["netR"] for trade in completed) / len(completed) if completed else 0.0,
        "maxDrawdownPct": max_drawdown_pct,
        "worstDayPct": worst_day_pct,
        "skippedDailyStop": skipped_daily_stop,
        "skippedRiskCap": skipped_risk_cap,
        "dailyReturnsPct": daily_returns,
        "trades": completed,
    }


def sample_blocks(values, rng, length, block_size=5):
    sampled = []
    while len(sampled) < length:
        start = rng.randrange(len(values))
        for offset in range(block_size):
            sampled.append(values[(start + offset) % len(values)])
            if len(sampled) == length:
                break
    return sampled


def run_phase(days, target_pct, max_days):
    equity = 100.0
    for index in range(max_days):
        daily_return = days[index] if index < len(days) else 0.0
        if daily_return <= DAILY_STOP_PCT:
            return False, False, index + 1
        equity *= 1 + daily_return / 100
        if equity <= 100 + TOTAL_LOSS_LIMIT_PCT:
            return False, False, index + 1
        if equity >= 100 + target_pct:
            return True, True, index + 1
    return False, True, max_days


def monte_carlo(daily_returns, runs=MONTE_CARLO_RUNS):
    rng = random.Random(20260622)
    passed = phase1_passed = safe = 0
    completion_days = []
    for _ in range(runs):
        sampled = sample_blocks(daily_returns or [0.0], rng, 120)
        phase1, phase1_safe, phase1_days = run_phase(sampled[:60], 8, 60)
        safe += phase1_safe
        if not phase1:
            continue
        phase1_passed += 1
        phase2, _, phase2_days = run_phase(sampled[phase1_days : phase1_days + 40], 4, 40)
        if phase2:
            passed += 1
            completion_days.append(phase1_days + phase2_days)
    completion_days.sort()
    return {
        "runs": runs,
        "cpp": passed / runs * 100,
        "phase1PassProbability": phase1_passed / runs * 100,
        "phase2PassProbabilityConditional": passed / phase1_passed * 100 if phase1_passed else 0.0,
        "rulesSafetyProbability": safe / runs * 100,
        "medianCompletionDays": completion_days[len(completion_days) // 2] if completion_days else None,
    }


def monthly_breakdown(trades, risk_pct):
    grouped = defaultdict(list)
    for trade in trades:
        key = datetime.fromtimestamp(trade["entry"] / 1000, timezone.utc).strftime("%Y-%m")
        grouped[key].append(trade)
    result = {}
    for month, month_trades in sorted(grouped.items()):
        equity = 100.0
        for trade in month_trades:
            equity *= 1 + risk_pct / 100 * trade["netR"]
        result[month] = {
            "trades": len(month_trades),
            "returnPct": equity - 100,
            "expectancyR": sum(trade["netR"] for trade in month_trades) / len(month_trades),
        }
    return result


def compact(metrics):
    return {key: value for key, value in metrics.items() if key not in {"dailyReturnsPct", "trades"}}


def select_weights_2025(candidates):
    training_trades = [
        trade
        for candidate in candidates
        for trade in net_trades(candidate, 1.5, START_2025, START_2026)
    ]
    tested = []
    for core_risk in (0.75, 0.8, 0.85, 0.9, 0.95, 1.0):
        for overlay_risk in (0.1, 0.15, 0.2, 0.25, 0.3):
            risk_map = {
                "USDCHF": core_risk,
                "EURUSD": overlay_risk,
                "AUDUSD": overlay_risk,
                "USDCAD": overlay_risk,
            }
            metrics = simulate(training_trades, risk_map, START_2025, START_2026)
            mc = monte_carlo(metrics["dailyReturnsPct"], runs=1_000)
            eligible = (
                metrics["profitFactor"] >= 1.2
                and metrics["maxDrawdownPct"] > -10
                and metrics["worstDayPct"] > DAILY_STOP_PCT
                and mc["rulesSafetyProbability"] >= 95
            )
            tested.append(
                {
                    "riskMap": risk_map,
                    "eligible": eligible,
                    "metrics": compact(metrics),
                    "monteCarlo": mc,
                    "score": mc["cpp"] if eligible else -1,
                }
            )
    tested.sort(
        key=lambda row: (
            row["score"],
            row["metrics"]["returnPct"],
            row["metrics"]["maxDrawdownPct"],
        ),
        reverse=True,
    )
    if not tested or not tested[0]["eligible"]:
        return None, tested
    return tested[0], tested


def main():
    rows = json.loads(INPUT.read_text(encoding="utf-8"))
    candidate = select_candidate(rows)
    nzd_candidate = select_nzd_candidate(rows)
    fx_candidates = [
        candidate,
        select_asset_breakout(rows, "EURUSD"),
        select_asset_breakout(rows, "AUDUSD"),
        select_asset_breakout(rows, "USDCAD"),
    ]
    cross_asset_candidates = [
        candidate,
        select_asset_strategy(rows, "XAUUSD", "opening_range_breakout"),
        select_asset_strategy(rows, "US30", "opening_range_breakout"),
        select_asset_strategy(rows, "SPX500", "htf_breakout"),
    ]
    cross_asset_training_trades = [
        trade
        for cross_candidate in cross_asset_candidates
        for trade in net_trades(cross_candidate, 1.5, START_2025, START_2026)
    ]
    cross_asset_training_metrics = simulate(
        cross_asset_training_trades, 0.5, START_2025, START_2026
    )
    selected_weights, weight_search = select_weights_2025(fx_candidates)
    report = {
        "status": "candidate_under_validation",
        "selectionRule": "Highest 2025 training score inside the pre-defined USDCHF 1H short, lookback-80, no-break-even family.",
        "candidate": {
            "asset": candidate["asset"],
            "strategy": candidate["strategy"],
            "config": candidate["config"],
            "training2025": candidate["training"],
            "raw2026BeforeCosts": candidate["test"],
        },
        "nzdCandidate": {
            "asset": nzd_candidate["asset"],
            "strategy": nzd_candidate["strategy"],
            "config": nzd_candidate["config"],
            "training2025": nzd_candidate["training"],
            "raw2026BeforeCosts": nzd_candidate["test"],
        },
        "costAssumption": {
            "baselineRoundTripPips": {
                asset: price / 0.0001 for asset, price in ROUND_TRIP_COST_PRICE.items()
            },
            "stressMultipliers": [1.0, 1.5, 2.0],
        },
        "variants": [],
        "portfolioVariants": [],
        "fxTrendPortfolioCandidates": [
            {
                "asset": item["asset"],
                "config": item["config"],
                "training2025": item["training"],
                "raw2026BeforeCosts": item["test"],
            }
            for item in fx_candidates
        ],
        "fxTrendPortfolioVariants": [],
        "weightedFxPortfolioVariants": [],
        "weightSelection2025": {
            "method": "Grid ranked by 2025 CPP at 1.5x costs; PF>=1.2, DD>-10%, daily>-3%, safety>=95%.",
            "selected": selected_weights,
            "testedConfigurations": len(weight_search),
            "top5": weight_search[:5],
        },
        "trainingSelectedPortfolioVariants": [],
        "crossAssetCandidates": [
            {
                "asset": item["asset"],
                "strategy": item["strategy"],
                "config": item["config"],
                "training2025": item["training"],
                "raw2026BeforeCosts": item["test"],
            }
            for item in cross_asset_candidates
        ],
        "crossAssetPortfolioVariants": [],
        "crossAssetTraining2025At1_5xCosts": {
            "riskPctPerTrade": 0.5,
            "metrics": compact(cross_asset_training_metrics),
            "monteCarlo": monte_carlo(cross_asset_training_metrics["dailyReturnsPct"]),
        },
    }

    for cost_multiplier in (1.0, 1.5, 2.0):
        usdchf_trades = net_trades(candidate, cost_multiplier)
        nzd_trades = net_trades(nzd_candidate, cost_multiplier)
        fx_trades = [
            trade
            for fx_candidate in fx_candidates
            for trade in net_trades(fx_candidate, cost_multiplier)
        ]
        cross_asset_trades = [
            trade
            for cross_candidate in cross_asset_candidates
            for trade in net_trades(cross_candidate, cost_multiplier)
        ]
        for risk_pct in RISK_LEVELS:
            metrics = simulate(usdchf_trades, risk_pct)
            report["variants"].append(
                {
                    "costMultiplier": cost_multiplier,
                    "riskPct": risk_pct,
                    "metrics": compact(metrics),
                    "monteCarlo": monte_carlo(metrics["dailyReturnsPct"]),
                    "monthly": monthly_breakdown(metrics["trades"], risk_pct),
                }
            )
            portfolio_metrics = simulate(usdchf_trades + nzd_trades, risk_pct)
            report["portfolioVariants"].append(
                {
                    "costMultiplier": cost_multiplier,
                    "riskPctPerTrade": risk_pct,
                    "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
                    "metrics": compact(portfolio_metrics),
                    "monteCarlo": monte_carlo(portfolio_metrics["dailyReturnsPct"]),
                    "monthly": monthly_breakdown(portfolio_metrics["trades"], risk_pct),
                }
            )
            fx_metrics = simulate(fx_trades, risk_pct)
            report["fxTrendPortfolioVariants"].append(
                {
                    "costMultiplier": cost_multiplier,
                    "riskPctPerTrade": risk_pct,
                    "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
                    "metrics": compact(fx_metrics),
                    "monteCarlo": monte_carlo(fx_metrics["dailyReturnsPct"]),
                    "monthly": monthly_breakdown(fx_metrics["trades"], risk_pct),
                }
            )
        for label, risk_map in {
            "core_1_overlay_025": {
                "USDCHF": 1.0,
                "EURUSD": 0.25,
                "AUDUSD": 0.25,
                "USDCAD": 0.25,
            },
            "core_075_overlay_025": {
                "USDCHF": 0.75,
                "EURUSD": 0.25,
                "AUDUSD": 0.25,
                "USDCAD": 0.25,
            },
        }.items():
            weighted_metrics = simulate(fx_trades, risk_map)
            report["weightedFxPortfolioVariants"].append(
                {
                    "label": label,
                    "costMultiplier": cost_multiplier,
                    "riskByAssetPct": risk_map,
                    "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
                    "metrics": compact(weighted_metrics),
                    "monteCarlo": monte_carlo(weighted_metrics["dailyReturnsPct"]),
                }
            )
        if selected_weights is not None:
            selected_metrics = simulate(fx_trades, selected_weights["riskMap"])
            report["trainingSelectedPortfolioVariants"].append(
                {
                    "costMultiplier": cost_multiplier,
                    "riskByAssetPct": selected_weights["riskMap"],
                    "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
                    "metrics": compact(selected_metrics),
                    "monteCarlo": monte_carlo(selected_metrics["dailyReturnsPct"]),
                }
            )
        cross_metrics = simulate(cross_asset_trades, 0.5)
        report["crossAssetPortfolioVariants"].append(
            {
                "costMultiplier": cost_multiplier,
                "riskPctPerTrade": 0.5,
                "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
                "metrics": compact(cross_metrics),
                "monteCarlo": monte_carlo(cross_metrics["dailyReturnsPct"]),
                "monthly": monthly_breakdown(cross_metrics["trades"], 0.5),
            }
        )

    baseline = next(
        variant
        for variant in report["crossAssetPortfolioVariants"]
        if variant["costMultiplier"] == 1.5
    )
    report["decision"] = {
        "status": "promising_research_candidate_requires_broker_feed_confirmation",
        "recommendedRiskPctPerModule": 0.5,
        "maxConcurrentRiskPct": MAX_CONCURRENT_RISK_PCT,
        "passesMechanicalSafety": baseline["metrics"]["worstDayPct"] > DAILY_STOP_PCT
        and baseline["metrics"]["maxDrawdownPct"] > TOTAL_LOSS_LIMIT_PCT,
        "cppAtStress1_5x": baseline["monteCarlo"]["cpp"],
        "note": "2026 is the primary test but was visible during discovery. Confirm on broker-specific XAUUSD, US30, and SPX500 candles before bot integration.",
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("SELECTED", json.dumps(candidate["config"], ensure_ascii=False))
    print("NZD SELECTED", json.dumps(nzd_candidate["config"], ensure_ascii=False))
    for variant in report["variants"]:
        if variant["costMultiplier"] in (1.0, 1.5, 2.0) and variant["riskPct"] in (0.5, 1.0):
            metrics = variant["metrics"]
            mc = variant["monteCarlo"]
            print(
                f"cost={variant['costMultiplier']}x risk={variant['riskPct']}% "
                f"trades={metrics['tradeCount']} ret={metrics['returnPct']:.2f}% "
                f"PF={metrics['profitFactor']:.2f} DD={metrics['maxDrawdownPct']:.2f}% "
                f"day={metrics['worstDayPct']:.2f}% CPP={mc['cpp']:.1f}% "
                f"safe={mc['rulesSafetyProbability']:.1f}%"
            )
    print("PORTFOLIO")
    for variant in report["portfolioVariants"]:
        if variant["riskPctPerTrade"] in (0.5, 1.0):
            metrics = variant["metrics"]
            mc = variant["monteCarlo"]
            print(
                f"cost={variant['costMultiplier']}x risk={variant['riskPctPerTrade']}% "
                f"trades={metrics['tradeCount']} ret={metrics['returnPct']:.2f}% "
                f"PF={metrics['profitFactor']:.2f} DD={metrics['maxDrawdownPct']:.2f}% "
                f"day={metrics['worstDayPct']:.2f}% CPP={mc['cpp']:.1f}% "
                f"safe={mc['rulesSafetyProbability']:.1f}%"
            )
    print("FX TREND PORTFOLIO", [item["asset"] for item in fx_candidates])
    for variant in report["fxTrendPortfolioVariants"]:
        if variant["riskPctPerTrade"] in (0.5, 0.75, 1.0):
            metrics = variant["metrics"]
            mc = variant["monteCarlo"]
            print(
                f"cost={variant['costMultiplier']}x risk={variant['riskPctPerTrade']}% "
                f"trades={metrics['tradeCount']} ret={metrics['returnPct']:.2f}% "
                f"PF={metrics['profitFactor']:.2f} DD={metrics['maxDrawdownPct']:.2f}% "
                f"day={metrics['worstDayPct']:.2f}% CPP={mc['cpp']:.1f}% "
                f"safe={mc['rulesSafetyProbability']:.1f}% "
                f"skipCap={metrics['skippedRiskCap']}"
            )
    print("WEIGHTED FX PORTFOLIO")
    for variant in report["weightedFxPortfolioVariants"]:
        metrics = variant["metrics"]
        mc = variant["monteCarlo"]
        print(
            f"{variant['label']} cost={variant['costMultiplier']}x "
            f"trades={metrics['tradeCount']} ret={metrics['returnPct']:.2f}% "
            f"PF={metrics['profitFactor']:.2f} DD={metrics['maxDrawdownPct']:.2f}% "
            f"day={metrics['worstDayPct']:.2f}% CPP={mc['cpp']:.1f}% "
            f"safe={mc['rulesSafetyProbability']:.1f}% "
            f"skipCap={metrics['skippedRiskCap']}"
        )
    print(
        "TRAINING-SELECTED WEIGHTS",
        selected_weights["riskMap"] if selected_weights is not None else "REJECTED: no 2025 weight set passed",
    )
    for variant in report["trainingSelectedPortfolioVariants"]:
        metrics = variant["metrics"]
        mc = variant["monteCarlo"]
        print(
            f"cost={variant['costMultiplier']}x trades={metrics['tradeCount']} "
            f"ret={metrics['returnPct']:.2f}% PF={metrics['profitFactor']:.2f} "
            f"DD={metrics['maxDrawdownPct']:.2f}% day={metrics['worstDayPct']:.2f}% "
            f"CPP={mc['cpp']:.1f}% safe={mc['rulesSafetyProbability']:.1f}%"
        )
    print("CROSS-ASSET PORTFOLIO", [item["asset"] for item in cross_asset_candidates])
    for variant in report["crossAssetPortfolioVariants"]:
        metrics = variant["metrics"]
        mc = variant["monteCarlo"]
        print(
            f"cost={variant['costMultiplier']}x trades={metrics['tradeCount']} "
            f"ret={metrics['returnPct']:.2f}% PF={metrics['profitFactor']:.2f} "
            f"DD={metrics['maxDrawdownPct']:.2f}% day={metrics['worstDayPct']:.2f}% "
            f"CPP={mc['cpp']:.1f}% safe={mc['rulesSafetyProbability']:.1f}% "
            f"skipCap={metrics['skippedRiskCap']}"
        )
    print("WROTE", OUTPUT)


if __name__ == "__main__":
    main()
