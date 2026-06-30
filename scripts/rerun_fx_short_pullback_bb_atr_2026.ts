import { mkdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-17T00:00:00.000Z");
const FETCH_WARMUP_START = START_TIME - 180 * 24 * 60 * 60 * 1000;

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const summaryRows: unknown[][] = [[
    "symbol",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "cost_0_5_net_profit",
    "cost_1_0_net_profit",
  ]];
  const json = [];

  for (const symbol of SYMBOLS) {
    const klines1h = await fetchYahoo1h(symbol);
    const report = runUniversalBbAtrBacktest({
      klines4h: klines1h,
      config: {
        symbol,
        requestedExchange: "FOREX",
        marketType: "spot forex",
        marketDataProvider: "YAHOO_FINANCE_CHART",
        initialCapital: INITIAL_CAPITAL,
        riskPerTradePercent: 1,
        rewardRMultiple: 0,
        includePlanB: false,
        bbPeriod: 80,
        bandDeviation: 1.25,
        atrPeriod: 14,
        atrMultiplier: 0.75,
        maxHoldBars: 24,
        directionMode: "short_only",
        emaPeriod: 200,
        emaFilter: "trend",
        exitTarget: "opposite_band",
        setupVariant: "fx_short_pullback_bb_atr_2026",
        strategyName: "FX Short Pullback BB/ATR 2026",
        strategyVersion: "research.2026-ytd.fx-1h-bb80-dev1_25-short-ema200-trend-atr0_75-opposite.1",
        tradeStartTime: START_TIME,
        tradeEndTime: END_TIME,
      },
    });
    const row = {
      symbol,
      trades: report.metrics.total_trades,
      win_rate: report.metrics.win_rate,
      net_profit: report.metrics.net_profit,
      return_pct: (report.metrics.net_profit / INITIAL_CAPITAL) * 100,
      profit_factor: report.metrics.profit_factor,
      expectancy_r: report.metrics.expectancy_r,
      max_drawdown: report.metrics.max_drawdown,
      cost_0_5_net_profit: costNet(report, 0.5),
      cost_1_0_net_profit: costNet(report, 1),
    };
    json.push(row);
    summaryRows.push(Object.values(row));
    console.log(`${symbol}: trades=${row.trades} return=${row.return_pct.toFixed(1)} cost1=${row.cost_1_0_net_profit.toFixed(2)} pf=${row.profit_factor.toFixed(2)}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  json.sort((a, b) => b.net_profit - a.net_profit);
  writeCsv(`${OUT_DIR}/fx_short_pullback_bb_atr_2026_engine_summary.csv`, summaryRows);
  writeFileSync(`${OUT_DIR}/fx_short_pullback_bb_atr_2026_engine_summary.json`, JSON.stringify(json, null, 2), "utf8");
}

main();
