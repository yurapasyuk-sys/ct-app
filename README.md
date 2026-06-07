# Centurion App in Codex App

Centurion is a local-first crypto analytics dashboard meant to be opened, inspected, and customized inside the Codex in-app browser.

The project is intentionally a hackable app template, not a SaaS landing page. It boots directly into the dashboard and uses public market-data APIs so a fresh clone can run without auth, accounts, or private credentials.

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. By default this is usually:

```text
http://localhost:5173
```

## Run in Codex

Paste this prompt into Codex:

```text
Clone and run this crypto analytics app inside Codex.

Repository:
git@github.com:lubluniky/borkiss.site.git

Goals:
1. Clone the repository.
2. Read README.md and AGENTS.md.
3. Install dependencies with npm.
4. Start the local dev server.
5. Open the app in the Codex in-app browser.
6. Verify the dashboard loads without a framework error overlay.
7. Ask me what I want to customize first: indicators, layout, market data, backtest reports, alerts, or sharing output.

Do not deploy anything. Do not add paid dependencies. Do not print secrets. Keep changes local unless I explicitly ask you to commit or push.
Use the repo-local skills in .codex/skills before changing dashboard or backtest behavior.
```

## Current Dashboard

- Market overview chart with BTC perpetual candles.
- Bklit chart-kit rendering for candles and line series.
- Pulse alerts across 15m, 1h, and 4h.
- VWAP z-score cards and modal chart.
- Empty Backtest Reports section ready for future reports.
- Share-card generation with local, unauthenticated attribution.

## Tech Stack

- Vite
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Bklit chart registry components
- Visx/motion chart internals installed by Bklit

## Project Shape

```text
src/pages/Dashboard.tsx              # single app entry
src/pages/BacktestReports.tsx        # empty backtest reports section
src/components/charts/               # Bklit registry chart primitives
src/components/charts-kit/           # app-level chart wrappers
src/hooks/                           # market data hooks
src/lib/data-handlers/               # chart normalization, downsampling, backtest report handlers
src/lib/                             # Binance, indicators, tension, VWAP math
.codex/skills/                       # local App-in-Codex workflows
```

## App-in-Codex Skills

- `centurion-onboard`: interviews the user and routes the customization request.
- `centurion-dashboard`: adds or changes dashboard panels using only the Bklit chart kit.
- `centurion-backtest`: interviews the user about the desired strategy before implementing any backtest.

## Notes

- No Supabase auth is required.
- No landing page is routed.
- The app is designed for local iteration in Codex, then optional publishing when the customized version is ready.
