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

## Setup

Create `.env.local` in the project root:

```env
TELEGRAM_BOT_TOKEN=your_botfather_token
TELEGRAM_CHAT_ID=your_destination_chat_id
SIGNAL_SYMBOLS=EURUSD,GBPUSD,USDJPY,GER40
SIGNAL_POLL_MS=300000
SIGNAL_MAX_SIGNAL_AGE_MINUTES=90
SIGNAL_DRY_RUN=0
```

`TELEGRAM_CHAT_ID` is the destination chat, not the bot id. For a Telegram supergroup it usually starts with `-100`.

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
