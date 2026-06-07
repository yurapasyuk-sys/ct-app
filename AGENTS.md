# AGENTS.md

This repository is a Codex-native crypto analytics app template.

## Product Contract

- Treat the first screen as the product: the app should boot directly into the dashboard.
- Do not add a marketing landing page unless explicitly requested.
- Do not add authentication, account tiers, paywalls, or private user profile flows.
- Keep the app runnable with public market data and no secrets.
- Prefer local-first customization over hosted SaaS assumptions.

## Development

- Use `npm install` for dependencies.
- Use `npm run dev` for local development.
- Use `npm run build` as the primary production validation.
- Use `npm run lint` for static validation.
- After UI changes, open the Vite dev server in the Codex in-app browser and verify the dashboard renders.

## Local Skills

- Use `.codex/skills/centurion-onboard/SKILL.md` when starting a new customization session.
- Use `.codex/skills/centurion-dashboard/SKILL.md` for dashboard, chart, route, panel, and market-data UI work.
- Use `.codex/skills/centurion-backtest/SKILL.md` for any backtest request.
- Backtest work must start by interviewing the user about the strategy and assumptions. Do not assume a canned strategy.

## Chart Standard

- Render charts only through the Bklit chart kit installed under `src/components/charts`.
- Prefer app-level wrappers in `src/components/charts-kit` over raw chart primitives in feature code.
- Put chart data normalization, downsampling, and backtest report shaping in `src/lib/data-handlers`.
- Do not add Recharts, lightweight-charts, Chart.js, ECharts, TradingView widgets, or ad hoc SVG/canvas charts.
- For dense market data, downsample before rendering. Preserve OHLC semantics for candles.

## Editing Rules

- Preserve the dashboard-first app entry in `src/App.tsx` and `src/pages/Dashboard.tsx`.
- Keep market-data logic in `src/hooks` and `src/lib`.
- Keep reusable visual panels under `src/components`.
- Do not introduce real secrets, private API keys, cookies, or auth tokens.
- Do not add production dependencies unless the requested feature clearly requires them.
- Prefer small, inspectable indicator modules over framework-like abstractions.

## Current User-Visible Flow

The default flow is:

```text
npm run dev -> open local Vite URL -> dashboard renders -> user customizes indicators/layout/data
```
