# Telegram Signal Monitor

Local paper-signal monitor for `Research 2026 Adaptive Pack`.

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
SIGNAL_DRY_RUN=0
SIGNAL_DATA_DIR=logs
```

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
