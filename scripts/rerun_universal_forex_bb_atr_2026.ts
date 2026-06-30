import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";

const FOREX_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-17T00:00:00.000Z");
const WARMUP_MS = 120 * 24 * 60 * 60 * 1000;

const FILES: Record<string, string> = {
  AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
  EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
};

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function costValue(report: ReturnType<typeof runUniversalBbAtrBacktest>, costPips: number, key: "net_profit" | "profit_factor") {
  return report.validation_report?.execution_cost_simulation.find((row) => row.cost_pips === costPips)?.[key] ?? "";
}

function loadRows(symbol: string) {
  const file = FILES[symbol];
  const path = `${FOREX_DIR}/${file}`;
  if (!existsSync(path)) throw new Error(`Missing local CSV for ${symbol}: ${path}`);

  return parseLocalCsvKlines(readFileSync(path, "utf8")).filter(
    (row) => row.openTime >= START_TIME - WARMUP_MS && row.openTime < END_TIME
  );
}

function runSymbol(symbol: string, rows1m: Kline[]) {
  const rows4h = aggregateKlines(rows1m, "4h");
  return runUniversalBbAtrBacktest({
    klines4h: rows4h,
    config: {
      symbol,
      requestedExchange: "FOREX_CSV",
      marketType: "forex",
      marketDataProvider: "workspace_csv",
      initialCapital: INITIAL_CAPITAL,
      riskPerTradePercent: 1,
      rewardRMultiple: 0,
      includePlanB: false,
      bbPeriod: 20,
      bandDeviation: 1.25,
      atrPeriod: 14,
      atrMultiplier: 0.75,
      maxHoldBars: 48,
      directionMode: "all",
      emaPeriod: 0,
      emaFilter: "none",
      exitTarget: "mean",
      setupVariant: "universal_forex_bb_atr_mean_reversion_2026",
      strategyName: "Universal Forex BB/ATR Mean Reversion 2026",
      strategyVersion: "research.2026-ytd.fx-bb20-dev1_25-atr0_75-hold48-4h-mean-risk1.1",
      tradeStartTime: START_TIME,
      tradeEndTime: END_TIME,
    },
  });
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reports = Object.keys(FILES).map((symbol) => {
    const rows = loadRows(symbol);
    const report = runSymbol(symbol, rows);
    return {
      symbol,
      source_file: FILES[symbol],
      source_last_time: new Date(rows[rows.length - 1]?.openTime ?? 0).toISOString(),
      report,
    };
  });

  const summaryHeaders = [
    "symbol",
    "source_file",
    "source_last_time",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "cost_0_5_net_profit",
    "cost_1_0_net_profit",
    "cost_1_0_profit_factor",
    "top_3_profit_pct",
  ];
  const summaryRows = reports.map(({ symbol, source_file, source_last_time, report }) => [
    symbol,
    source_file,
    source_last_time,
    report.metrics.total_trades,
    report.metrics.win_rate,
    report.metrics.net_profit,
    (report.metrics.net_profit / INITIAL_CAPITAL) * 100,
    report.metrics.profit_factor,
    report.metrics.expectancy,
    report.metrics.max_drawdown,
    costValue(report, 0.5, "net_profit"),
    costValue(report, 1, "net_profit"),
    costValue(report, 1, "profit_factor"),
    report.validation_report?.outlier_dependency.percent_profit_from_top_3_trades ?? "",
  ]);

  const output = {
    generated_at: new Date().toISOString(),
    period_requested: {
      start: new Date(START_TIME).toISOString(),
      end: new Date(END_TIME).toISOString(),
      note: "Backtest uses available local CSV rows up to each file's source_last_time.",
    },
    strategy: {
      name: "Universal Forex BB/ATR Mean Reversion 2026",
      timeframe: "4H",
      bb_period: 20,
      band_deviation: 1.25,
      atr_period: 14,
      atr_multiplier: 0.75,
      exit_target: "Bollinger mean",
      max_hold_bars: 48,
      risk_per_trade_percent: 1,
    },
    summary: reports.map(({ symbol, source_file, source_last_time, report }) => ({
      symbol,
      source_file,
      source_last_time,
      metrics: report.metrics,
      validation_report: report.validation_report,
    })),
  };

  writeCsv(`${OUT_DIR}/universal_forex_bb_atr_2026_summary.csv`, [summaryHeaders, ...summaryRows]);
  writeFileSync(`${OUT_DIR}/universal_forex_bb_atr_2026_summary.json`, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify(output.summary.map((row) => ({
    symbol: row.symbol,
    source_last_time: row.source_last_time,
    trades: row.metrics.total_trades,
    win_rate: row.metrics.win_rate,
    net_profit: row.metrics.net_profit,
    return_pct: (row.metrics.net_profit / INITIAL_CAPITAL) * 100,
    profit_factor: row.metrics.profit_factor,
    expectancy_r: row.metrics.expectancy,
    max_drawdown: row.metrics.max_drawdown,
    cost_1_0_net_profit: row.validation_report?.execution_cost_simulation.find((item) => item.cost_pips === 1)?.net_profit,
  })), null, 2));
}

main();
