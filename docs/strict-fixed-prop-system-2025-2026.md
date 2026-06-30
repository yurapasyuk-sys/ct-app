# Strict Fixed Prop System 2025-2026

## Status

REJECTED — SUPERSEDED

Зафіксовано: 2026-06-21.

Система працює з незмінним складом і правилами. Квартальне, календарне або
режимне перемикання engines не використовується.

## Fixed Engines

1. GBPUSD — Session Stretch Reversion, 30m
   - Open reference: 00:00 UTC
   - Signal time: 11:00 UTC
   - Minimum stretch: 2.5 ATR
   - Stop: 0.75 ATR
   - Target: 2R
   - Maximum hold: 16 bars

2. USDJPY — Volatility Compression Release, 1H
   - ATR compression ratio: 0.65
   - Breakout lookback: 12 bars
   - Minimum candle body: 0.5 ATR
   - Minimum efficiency ratio: 0.25
   - Stop: 0.75 ATR
   - Target: 2.5R
   - Maximum hold: 16 bars

3. AUDUSD — Volatility Compression Release, 15m
   - ATR compression ratio: 0.65
   - Breakout lookback: 12 bars
   - Minimum candle body: 0.8 ATR
   - Minimum efficiency ratio: 0.25
   - Stop: 1 ATR
   - Target: 2.5R
   - Maximum hold: 32 bars

4. EURUSD — Session Stretch Reversion, 1H
   - Open reference: 00:00 UTC
   - Signal time: 13:00 UTC
   - Minimum stretch: 2.5 ATR
   - Stop: 0.75 ATR
   - Target: 2R
   - Maximum hold: 10 bars

5. GBPUSD — New York Opening Drive Persistence, 15m
   - Session start: 13:00 UTC
   - Drive window: 2 hours
   - Minimum efficiency ratio: 0.5
   - Minimum drive: 0.8 ATR
   - Minimum directional share: 0.6
   - Stop: 1 ATR
   - Target: 2R
   - Maximum hold: 24 bars

## Risk Rules

- Risk per trade: 1%
- Maximum concurrent risk: 2%
- Daily stop: -3%
- Total loss limit: -10%
- No martingale, averaging down, grid, recovery scaling, or risk increase after losses

## Validation

- Period: 2025-01-01 to 2026-06-15
- Positive quarters: 6 of 6
- Worst quarter: +1.82%
- Trade count: 201
- Return: +92.70%
- Profit Factor: 1.59
- Expectancy: 0.338R
- Max Drawdown: -7.81%
- Worst Day: -2.37%
- Max Loss Streak: 5
- Monte Carlo simulations: 5,000
- Challenge Pass Probability: 62.68%
- Rules Safety Probability: 99.32%
- Median Phase 1 + Phase 2 completion: 46 trading days
- P90 completion: 70 trading days

## Robustness

- A second neighboring five-engine composition also passed with CPP 61.0%.
- At 0.75% risk the same system remains profitable in all six quarters, but CPP
  falls to 45.86%.
- Removing any one engine preserves broad profitability, but lowers CPP below
  60%; the full fixed diversification is required for the prop objective.
- Baseline execution costs are 1.2 pips for EURUSD, 1.6 for GBPUSD, and 1.4 for
  USDJPY/AUDUSD.
- At 1.5x execution costs CPP falls to 48.22% and drawdown reaches -8.67%.
- With an extra 0.1R penalty on every trade CPP falls to 44.62%.
- Therefore this candidate is sensitive to execution quality and must not be
  moved to a paid challenge before forward spreads and slippage are measured.

## Forward Test

- Runner: `npm.cmd run forward:strict-prop`
- State: `.scratch/forward/strict-fixed-prop-system/state.json`
- Journal: `.scratch/forward/strict-fixed-prop-system/journal.csv`
- Forward baseline equity: $10,000
- Frozen at: 2026-06-21
- The runner imports no historical signals. Only signals formed after the frozen
  timestamp are recorded.

## Verdict

REJECTED.

Reason: the system was selected using the full 2025-2026 period and therefore
does not have a truly untouched 2026 validation window. It also fails the stricter
1.5x execution-cost gate. The forward runner remains available only as a
technical artifact and must not be treated as an approved candidate.
