# Telegram Signal Monitor

Local paper-signal monitor for the configured strategy profiles, including the
fixed `Q2 Prop Portfolio 2026`.

It does not place trades. It scans 1H market data and sends Telegram messages with:

- symbol
- strategy
- direction
- entry
- stop loss
- take profit or dynamic exit rule
- risk distance
- signal reason
- short position-close alerts with the strategy, Kyiv entry time, `TAKE PROFIT` or `STOP LOSS` result, and actual exit price
- position-close alerts sent as replies to their original signal messages
- an interactive `/menu` and `/stats` flow for category and strategy statistics

## Setup

Create `.env.local` in the project root:

```env
TELEGRAM_BOT_TOKEN=your_botfather_token
TELEGRAM_CHAT_ID=your_destination_chat_id
SIGNAL_SYMBOLS=EURUSD,GBPUSD,USDJPY,GER40
SIGNAL_POLL_MS=300000
SIGNAL_MAX_SIGNAL_AGE_MINUTES=90
SIGNAL_MAX_EXIT_AGE_MINUTES=360
SIGNAL_DRY_RUN=0
SIGNAL_DATA_DIR=logs
```

To run only the five Q2 prop modules:

```env
SIGNAL_SYMBOLS=GER40,GBPUSD,AUDUSD,USDJPY
SIGNAL_PROFILE_IDS=q2_prop_ger40_opening_drive_30m,q2_prop_ger40_session_stretch_1h,q2_prop_gbpusd_session_stretch_30m,q2_prop_audusd_compression_release_30m,q2_prop_usdjpy_compression_release_1h
```

If `SIGNAL_PROFILE_IDS` is omitted, the new profiles are added alongside the
existing signal strategies.

## Approved Cross-Asset PropTrade Portfolio

The `Проптрейд` category also contains the broker-confirmed portfolio validated
on Dukascopy BID/ASK data:

- USDCHF 1H bearish 80-bar breakout, EMA100, 0.75 ATR stop, 2.5R target.
- XAUUSD 1H bearish opening-range breakout, 0.75 ATR stop, 2.5R target.
- US30 1H bullish opening-range breakout, 0.75 ATR stop, 2R target.
- SPX500 4H bullish 40-bar breakout, EMA100, 0.75 ATR stop, 2.5R target.

Each module risks 0.5%, with a shared 2% simultaneous-risk cap and -3% realized
daily stop. These profiles use Dukascopy Jetta BID/ASK candles in the live
monitor, matching the control backtest source.

To run only this approved portfolio:

```env
SIGNAL_SYMBOLS=USDCHF,XAUUSD,US30,SPX500
SIGNAL_PROFILE_IDS=approved_prop_usdchf_breakout_1h,approved_prop_xauusd_orb_1h,approved_prop_us30_orb_1h,approved_prop_spx500_breakout_4h
```

This approved portfolio is enabled by default and is added atomically even when
an older `SIGNAL_SYMBOLS` or `SIGNAL_PROFILE_IDS` list exists on Railway. Set
`SIGNAL_ENABLE_APPROVED_PROP_PORTFOLIO=false` only when it must be paused.

## Q2 Prop Portfolio 2026

The monitor contains the five fixed modules approved by the Q2 2026 holdout:

- GER40 Opening Drive, 30m, 1 ATR stop, 2.5R target, 16-bar time stop.
- GER40 Session Stretch Reversion, 1h, 0.75 ATR stop, 2R target,
  10-bar time stop.
- GBPUSD Session Stretch Reversion, 30m, 0.75 ATR stop, 2R target,
  16-bar time stop.
- AUDUSD Compression Release, 30m, 0.75 ATR stop, 2.5R target,
  24-bar time stop.
- USDJPY Compression Release, 1h, 0.75 ATR stop, 2.5R target,
  16-bar time stop.

Portfolio guards:

- 1% model risk per signal.
- no more than 2% simultaneous open model risk;
- no second position from the same module;
- stop opening new portfolio positions after -3R of realized results in one
  UTC day;
- fixed targets, stops, and time exits are monitored automatically.

The monitor remains paper-signal only and does not calculate broker lot size or
place orders.

GER40 warning: the research dataset used Dukascopy GER40 CFD, while the current
live monitor uses Yahoo `^GDAXI`, a cash-index proxy with different session
coverage. GER40 alerts explicitly show this source warning. Before using those
two modules for a paid challenge, connect the bot to the same GER40 CFD feed
used by the backtest and run a parity check.

`TELEGRAM_CHAT_ID` is the destination chat, not the bot id. For a Telegram supergroup it usually starts with `-100`.

On Railway, attach a persistent Volume to the signal-monitor service. The monitor automatically uses
`RAILWAY_VOLUME_MOUNT_PATH` for its state and journal files. Without a Volume, deployment restarts can
discard the list of sent signals and open positions.

## Commands

Send one test message:

```bash
npm run signals:test-telegram
```

Scan once:

```bash
npm run signals:once
```

Run continuously:

```bash
npm run signals:monitor
```

Dry run without Telegram sending:

```bash
SIGNAL_DRY_RUN=1 npm run signals:once
```

On PowerShell:

```powershell
$env:SIGNAL_DRY_RUN="1"; npm run signals:once
```

Dry-run scans never modify `signal-monitor-state.json`. Historical exits older
than `SIGNAL_MAX_EXIT_AGE_MINUTES` are recorded in state without sending a late
Telegram notification. An exit alert is sent only when the original signal's
Telegram message id is present, so position closes remain replies to their
opening signals.

## Logs

The monitor writes:

- `logs/signal-journal.csv`
- `logs/signal-monitor-state.json`

The state file prevents duplicate Telegram messages for the same signal.
It also stores open positions and up to 5,000 completed trades used by the statistics menu.

## Statistics menu

Send `/menu` or `/stats` to the bot. The menu flow is:

```text
Statistics -> category -> strategy -> results
```

The strategy result includes completed trades, successful trades, stop losses, break-even trades,
win rate excluding break-even, and currently open positions. Statistics accumulate only for exits
recorded by this deployed monitor; old Telegram messages are not imported automatically.
