# Q2 2026 Prop Strategy

Status: READY FOR FORWARD TEST

This is the training-ranked #1 fixed portfolio. It was selected using
2025-01-01 through 2026-03-31 only. The final Q2 2026 period was not used to
replace it with a better-looking lower-ranked candidate.

## Risk rules

- Base risk: 1% per trade.
- Daily stop: -3%.
- Do not open another trade after the daily stop is reached.
- All five engines and parameters remain fixed.

## Fixed engines

1. GER40 opening drive, 30m:
   session start 13:00 UTC, 2-hour drive, efficiency period 8,
   minimum efficiency 0.30, minimum drive 0.8 ATR,
   minimum directional share 0.60, stop 1 ATR, target 2.5R,
   maximum hold 16 bars.
2. GER40 session stretch reversion, 60m:
   day open 00:00 UTC, signal hour 13:00 UTC,
   minimum stretch 1.5 ATR, stop 0.75 ATR, target 2R,
   maximum hold 10 bars.
3. GBPUSD session stretch reversion, 30m:
   day open 00:00 UTC, signal hour 11:00 UTC,
   minimum stretch 2.5 ATR, stop 0.75 ATR, target 2R,
   maximum hold 16 bars.
4. AUDUSD compression release, 30m:
   compression lookback 40, breakout lookback 12,
   efficiency period 10, maximum ATR ratio 0.80,
   minimum body 0.8 ATR, minimum efficiency 0.40,
   active session, stop 0.75 ATR, target 2.5R,
   maximum hold 24 bars.
5. USDJPY compression release, 60m:
   compression lookback 40, breakout lookback 12,
   efficiency period 10, maximum ATR ratio 0.80,
   minimum body 0.8 ATR, minimum efficiency 0.25,
   active session, stop 0.75 ATR, target 2.5R,
   maximum hold 16 bars.

## Untouched Q2 2026 result

- Trades: 50
- Return: +20.44%
- Profit factor: 1.63
- Maximum drawdown: -5.59%
- Worst day: -2.45%
- CPP: 86.16%
- Rules safety probability: 99.88%
- Median estimated phase completion: 36 trading days

Monthly results:

- April: +7.69%, PF 1.50
- May: +5.82%, PF 1.55
- June 1-15: +5.69%, PF 2.11

## Stress and dependency checks

- 1.5x costs: +16.45%, PF 1.48, DD -6.07%, safety 99.58%.
- 2x costs: +12.59%, PF 1.35, DD -6.55%, worst day -2.90%,
  safety 98.34%.
- Removing either individual GER40 engine keeps Q2 return above +13.6%.
- Removing both GER40 engines: +8.38%, PF 1.47, DD -4.78%.
- Removing any one of the five engines keeps the system profitable with
  PF between 1.52 and 1.80.

## Decision

The strategy passes the research gates and is ready for a forward/paper test.
It is not yet authorized for a paid prop challenge. Parameters must not be
changed during the forward test.
