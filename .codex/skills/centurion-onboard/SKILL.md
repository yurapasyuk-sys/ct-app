---
name: centurion-onboard
description: Use when starting a Centurion App-in-Codex customization session. The agent must interview the user, identify what they want to add, and route the work to dashboard, chart, data, backtest, alerts, or docs changes before editing.
---

# Centurion Onboard

Start with a short interview. Do not edit code until the target surface is clear.

Ask up to 5 concise questions:

1. What do you want to add or change: dashboard view, chart, data source, indicator, backtest, alert, report, or share output?
2. Which market/universe: symbol(s), exchange, spot/futures, timeframe, and lookback?
3. What should the user see first: chart, metric cards, report table, empty state, or interactive controls?
4. What data contract is expected: live fetch, static fixture, imported CSV/JSON, or generated backtest output?
5. What does “done” mean: visual proof in browser, saved report, reusable component, or local prompt/skill update?

After the interview:

- Summarize the requested app change in 3-5 bullets.
- Pick one owner layer: dashboard UI, chart kit, data handler, backtest logic, or documentation.
- Use the relevant repository skill:
  - `centurion-dashboard` for dashboard/chart/layout changes.
  - `centurion-backtest` for strategy testing/report generation.
- Keep the app local-first. Do not add auth, landing pages, hosted pipelines, or secrets.
