---
name: centurion-dashboard
description: Use when adding or changing Centurion dashboard panels, chart views, chart data handlers, layout, sidebar routes, or market analytics UI. Enforces the Bklit chart kit as the only chart rendering path.
---

# Centurion Dashboard

## Hard Rules

- Use Bklit chart components only for chart rendering.
- Do not add Recharts, lightweight-charts, Chart.js, ECharts, TradingView widgets, or ad hoc SVG/canvas charts.
- Put chart wrappers in `src/components/charts-kit`.
- Put data normalization in `src/lib/data-handlers`.
- Keep panels under `src/components` or route pages under `src/pages`.
- Verify rendered output in the Codex in-app browser after UI changes.

## Chart Registry

The project registry aliases are already configured in `components.json`:

```bash
npx shadcn@latest add @bklit/area-chart
npx shadcn@latest add @bklit/bar-chart
npx shadcn@latest add @bklit/candlestick-chart
npx shadcn@latest add @bklit/choropleth-chart
npx shadcn@latest add @bklit/composed-chart
npx shadcn@latest add @bklit/funnel-chart
npx shadcn@latest add @bklit/gauge-chart
npx shadcn@latest add @bklit/line-chart
npx shadcn@latest add @bklit/live-line-chart
npx shadcn@latest add @bklit/pie-chart
npx shadcn@latest add @bklit/radar-chart
```

## Workflow

1. Inspect current route/page/panel and existing data handlers.
2. Normalize data into `date: Date` records in `src/lib/data-handlers`.
3. Render through wrappers from `src/components/charts-kit`.
4. For high-density time series, downsample before rendering:
   - Candles: use OHLC bucket aggregation and preserve open/high/low/close.
   - Lines: sample to a bounded point count unless the task needs exact point inspection.
5. Run `npm run build` and `npm run lint`.
6. Open the page in the in-app browser and verify it is responsive and not visibly lagging.

## Current Wrappers

- `BklitCandlestickPanel`: high-density OHLC chart wrapper.
- `BklitLinePanel`: line chart wrapper for indicators, equity curves, and card sparklines.

Add new wrappers only when they create a reusable app-level chart pattern.
