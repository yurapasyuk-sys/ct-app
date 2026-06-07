---
name: centurion-backtest
description: Use when the user wants to run, design, implement, or display a backtest in Centurion. The agent must interview the user about the desired strategy and assumptions before coding; no default strategy is assumed.
---

# Centurion Backtest

Do not assume a default strategy. Do not run a canned MA-cross, RSI, MACD, or any other template unless the user explicitly asks for it.

## Required Interview

Before editing code, ask the user for the missing pieces. Keep it short, but gather enough to make the backtest meaningful:

1. Market: symbol(s), exchange, spot/futures, timeframe, and lookback window.
2. Strategy logic: exact entry, exit, invalidation, and optional short rules.
3. Execution assumptions: candle close/open execution, fees, slippage, leverage, position sizing, and whether partial fills matter.
4. Risk model: fixed size, percent equity, stop loss, take profit, max positions, cooldowns, or no risk layer.
5. Output: report cards, equity curve, drawdown, trade table, downloadable JSON/CSV, or dashboard panel.

If the user describes the strategy informally, convert it into a clear strategy spec and show it back before implementing.

## Implementation Rules

- Put reusable backtest math in `src/lib/data-handlers/backtest.ts`.
- Convert strategy rules into timestamped `BacktestSignal[]`.
- Use `runSignalBacktest(...)` for execution/accounting once signals are generated.
- Add strategy-specific logic in a clearly named local module, not inside chart components.
- Render reports through `src/pages/BacktestReports.tsx` and Bklit chart wrappers.
- Store temporary generated reports under `.scratch/backtests` unless the user asks for committed fixtures.

## Validation

- Validate strategy signals on a small sample before rendering a full report.
- Check edge cases: no trades, open position at end, insufficient candles, missing data, and fee/slippage assumptions.
- Run `npm run build` and inspect the report in the in-app browser when UI is touched.
