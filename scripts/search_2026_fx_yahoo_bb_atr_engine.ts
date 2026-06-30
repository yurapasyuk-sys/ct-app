import { mkdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines } from "../src/lib/data-handlers/local-csv-market-data";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-17T00:00:00.000Z");
const FETCH_WARMUP_START = START_TIME - 220 * 24 * 60 * 60 * 1000;

const SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "NZDUSD",
  "USDCAD",
  "USDCHF",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "AUDJPY",
  "CADJPY",
  "CHFJPY",
  "EURAUD",
  "GBPAUD",
  "AUDNZD",
  "EURCAD",
  "GBPCAD",
];

type Timeframe = "1h" | "4h";
type DirectionMode = "all" | "long_only" | "short_only";
type EmaFilter = "none" | "trend" | "countertrend";
type ExitTarget = "mean" | "opposite_band";

interface CandidateConfig {
  timeframe: Timeframe;
  bbPeriod: number;
  bandDeviation: number;
  atrMultiplier: number;
  maxHoldBars: number;
  directionMode: DirectionMode;
  emaFilter: EmaFilter;
  exitTarget: ExitTarget;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function parseYahooChart(payload: unknown): Kline[] {
  const chart = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
      error?: { code?: string; description?: string } | null;
    };
  };
  const error = chart.chart?.error;
  if (error) throw new Error(error.description || error.code || "Yahoo chart error");
  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || !timestamps.length) return [];
  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      return {
        openTime,
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
        closeTime: openTime + 60 * 60 * 1000 - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      } satisfies Kline;
    })
    .filter((row): row is Kline => row != null)
    .sort((a, b) => a.openTime - b.openTime);
}

async function fetchYahoo1h(symbol: string) {
  const period1 = Math.floor(FETCH_WARMUP_START / 1000);
  const period2 = Math.floor(END_TIME / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?period1=${period1}&period2=${period2}&interval=60m&includePrePost=true`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${symbol}: Yahoo ${response.status} ${response.statusText}`);
  return parseYahooChart(await response.json());
}

function costNet(report: ReturnType<typeof runUniversalBbAtrBacktest>, costPips: number) {
  return report.validation_report.execution_cost_simulation.find((row) => row.cost_pips === costPips)?.net_profit ?? 0;
}

function key(config: CandidateConfig) {
  return [
    config.timeframe,
    `bb${config.bbPeriod}`,
    `dev${config.bandDeviation}`,
    `atr${config.atrMultiplier}`,
    `hold${config.maxHoldBars}`,
    config.directionMode,
    config.emaFilter,
    config.exitTarget,
  ].join("_");
}

function configs() {
  const result: CandidateConfig[] = [];
  for (const timeframe of ["1h", "4h"] as const) {
    for (const bbPeriod of [20, 40, 80, 100]) {
      for (const bandDeviation of [1.25, 1.5, 2]) {
        for (const atrMultiplier of [0.5, 0.75, 1]) {
          for (const maxHoldBars of timeframe === "1h" ? [12, 24, 48] : [12, 24, 48]) {
            for (const directionMode of ["all", "long_only", "short_only"] as const) {
              for (const emaFilter of ["none", "trend", "countertrend"] as const) {
                for (const exitTarget of ["mean", "opposite_band"] as const) {
                  result.push({
                    timeframe,
                    bbPeriod,
                    bandDeviation,
                    atrMultiplier,
                    maxHoldBars,
                    directionMode,
                    emaFilter,
                    exitTarget,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return result;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const data = new Map<string, Record<Timeframe, Kline[]>>();
  for (const symbol of SYMBOLS) {
    const oneHour = await fetchYahoo1h(symbol);
    data.set(symbol, { "1h": oneHour, "4h": aggregateKlines(oneHour, "4h") });
    console.log(`${symbol}: ${oneHour.length} 1H rows`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const detailRows: unknown[][] = [[
    "variant",
    "symbol",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "cost_1_net_profit",
    "cost_1_return_pct",
  ]];
  const grouped = new Map<string, Array<Record<string, number | string>>>();

  for (const config of configs()) {
    const variant = key(config);
    for (const symbol of SYMBOLS) {
      const report = runUniversalBbAtrBacktest({
        klines4h: data.get(symbol)?.[config.timeframe] ?? [],
        config: {
          symbol,
          requestedExchange: "FOREX",
          marketType: "spot forex",
          marketDataProvider: "YAHOO_FINANCE_CHART",
          initialCapital: INITIAL_CAPITAL,
          riskPerTradePercent: 1,
          rewardRMultiple: 0,
          includePlanB: false,
          bbPeriod: config.bbPeriod,
          bandDeviation: config.bandDeviation,
          atrPeriod: 14,
          atrMultiplier: config.atrMultiplier,
          maxHoldBars: config.maxHoldBars,
          directionMode: config.directionMode,
          emaPeriod: config.emaFilter === "none" ? 0 : 200,
          emaFilter: config.emaFilter,
          exitTarget: config.exitTarget,
          setupVariant: "fx_short_pullback_bb_atr_2026",
          strategyName: "FX BB/ATR Engine Search",
          strategyVersion: `search.${variant}`,
          tradeStartTime: START_TIME,
          tradeEndTime: END_TIME,
        },
      });
      const row = {
        variant,
        symbol,
        trades: report.metrics.total_trades,
        win_rate: report.metrics.win_rate,
        net_profit: report.metrics.net_profit,
        return_pct: (report.metrics.net_profit / INITIAL_CAPITAL) * 100,
        profit_factor: report.metrics.profit_factor,
        expectancy_r: report.metrics.expectancy_r,
        max_drawdown: report.metrics.max_drawdown,
        cost_1_net_profit: costNet(report, 1),
        cost_1_return_pct: (costNet(report, 1) / INITIAL_CAPITAL) * 100,
      };
      if (!grouped.has(variant)) grouped.set(variant, []);
      grouped.get(variant)?.push(row);
      detailRows.push(Object.values(row));
    }
  }

  const summary = [...grouped.entries()].map(([variant, rows]) => {
    const valid = rows.filter((row) => Number(row.trades) >= 8);
    return {
      variant,
      valid_symbols: valid.length,
      profitable_symbols: valid.filter((row) => Number(row.net_profit) > 0 && Number(row.profit_factor) > 1).length,
      cost1_profitable_symbols: valid.filter((row) => Number(row.cost_1_net_profit) > 0).length,
      above_30_symbols: valid.filter((row) => Number(row.return_pct) >= 30).length,
      cost1_above_30_symbols: valid.filter((row) => Number(row.cost_1_return_pct) >= 30).length,
      total_net_profit: valid.reduce((sum, row) => sum + Number(row.net_profit), 0),
      total_cost_1_net_profit: valid.reduce((sum, row) => sum + Number(row.cost_1_net_profit), 0),
      avg_cost1_return_pct: valid.length ? valid.reduce((sum, row) => sum + Number(row.cost_1_return_pct), 0) / valid.length : -Infinity,
      min_cost1_return_pct: valid.length ? Math.min(...valid.map((row) => Number(row.cost_1_return_pct))) : -Infinity,
      min_trades: valid.length ? Math.min(...valid.map((row) => Number(row.trades))) : 0,
    };
  }).sort((a, b) => {
    if (b.cost1_above_30_symbols !== a.cost1_above_30_symbols) return b.cost1_above_30_symbols - a.cost1_above_30_symbols;
    if (b.cost1_profitable_symbols !== a.cost1_profitable_symbols) return b.cost1_profitable_symbols - a.cost1_profitable_symbols;
    return b.total_cost_1_net_profit - a.total_cost_1_net_profit;
  });

  writeCsv(`${OUT_DIR}/fx_yahoo_bb_atr_engine_rows.csv`, detailRows);
  writeCsv(`${OUT_DIR}/fx_yahoo_bb_atr_engine_summary.csv`, [
    Object.keys(summary[0] ?? { variant: "" }),
    ...summary.map((row) => Object.values(row)),
  ]);
  writeFileSync(`${OUT_DIR}/fx_yahoo_bb_atr_engine_summary.json`, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary.slice(0, 20), null, 2));
}

main();
