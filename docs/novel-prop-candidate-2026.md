# Novel Prop Candidate 2026

## Status

REJECTED — SUPERSEDED

## Portfolio

1. EURUSD — Session Stretch Reversion, 1H
2. GBPUSD — New York Opening Drive Persistence, 30m
3. USDJPY — Volatility Compression Release, 1H
4. AUDUSD — Volatility Compression Release, 30m

## Risk Rules

- Risk per trade: 0.75%
- Daily stop: -3%
- Maximum concurrent risk: 2%
- No martingale, grid, averaging down, or recovery scaling

## Validation

- In-sample return: 53.72%
- 2026 out-of-sample return: 5.14%
- 2026 Profit Factor: 1.14
- 2026 Max Drawdown: -6.72%
- 2026 Worst Day: -2.40%
- 2026 Trade Count: 73
- Monte Carlo simulations: 5,000
- CPP: 43.16%
- Rules Safety Probability: 99.54%
- Median completion time among successful simulations: 54 trading days

## Verdict

The portfolio did not meet the required CPP threshold and has been superseded
by the strict fixed multi-engine candidate.

The main weakness is regime dependence: 2026 Q1 was positive, while 2026 Q2 was
slightly negative. The next cycle should add a regime-selection layer without
changing the underlying entry rules.
