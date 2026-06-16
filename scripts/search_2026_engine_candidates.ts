import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { Kline } from "../src/lib/binance";
import type { NativeBacktestReport } from "../src/lib/data-handlers/backtest";
import { runFxDonchianBacktest } from "../src/lib/data-handlers/fx-donchian-backtest";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";

const FOREX_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const END_TIME = Date.parse("2026-06-16T00:00:00.000Z");
const WARMUP_MS = 240 * 24 * 60 * 60 * 1000;

type Timeframe = "1h" | "4h";
type DirectionMode = "all" | "long_only" | "short_only";
type EmaFilter = "none" | "trend" | "countertrend";
type ExitTarget = "mean" | "opposite_band";

interface CandidateRow {
  symbol: string;
  family: "bb_atr" | "donchian";
  timeframe: Timeframe;
  variant: string;
  trades: number;
  win_rate: number;
  net_profit: number;
  return_pct: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
  cost_0_5_net_profit: number;
  cost_1_0_net_profit: number;
  cost_1_0_profit_factor: number;
  top_3_profit_pct: number;
  score: number;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function costNet(report: NativeBacktestReport, costPips: number) {
  return report.validation_report?.execution_cost_simulation.find((row) => row.cost_pips === costPips)?.net_profit ?? 0;
}

function costPf(report: NativeBacktestReport, costPips: number) {
  return report.validation_report?.execution_cost_simulation.find((row) => row.cost_pips === costPips)?.profit_factor ?? 0;
}

function top3Pct(report: NativeBacktestReport) {
  return report.validation_report?.outlier_dependency.percent_profit_from_top_3_trades ?? 0;
}

function score(report: NativeBacktestReport) {
  const metrics = report.metrics;
  const onePipNet = costNet(report, 1);
  const onePipPf = finite(costPf(report, 1));
  const outlierPenalty = Math.max(0, top3Pct(report) - 60) * 12;
  const tradePenalty = Math.max(0, 25 - metrics.total_trades) * 60;
  const ddPenalty = Math.max(0, Math.abs(metrics.max_drawdown) - 2_500) * 0.3;

  return (
    metrics.net_profit +
    onePipNet * 0.35 +
    Math.max(0, onePipPf - 1) * 900 -
    outlierPenalty -
    tradePenalty -
    ddPenalty
  );
}

function toRow({
  symbol,
  family,
  timeframe,
  variant,
  report,
}: {
  symbol: string;
  family: CandidateRow["family"];
  timeframe: Timeframe;
  variant: string;
  report: NativeBacktestReport;
}): CandidateRow {
  return {
    symbol,
    family,
    timeframe,
    variant,
    trades: report.metrics.total_trades,
    win_rate: report.metrics.win_rate,
    net_profit: report.metrics.net_profit,
    return_pct: (report.metrics.net_profit / INITIAL_CAPITAL) * 100,
    profit_factor: finite(report.metrics.profit_factor, 99),
    expectancy_r: report.metrics.expectancy,
    max_drawdown: report.metrics.max_drawdown,
    cost_0_5_net_profit: costNet(report, 0.5),
    cost_1_0_net_profit: costNet(report, 1),
    cost_1_0_profit_factor: finite(costPf(report, 1), 99),
    top_3_profit_pct: top3Pct(report),
    score: score(report),
  };
}

function baseConfig(symbol: string) {
  return {
    symbol,
    requestedExchange: "FOREX_CSV",
    marketType: "forex",
    marketDataProvider: "workspace_csv",
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePercent: 1,
    rewardRMultiple: 0,
    includePlanB: false,
    tradeStartTime: START_TIME,
    tradeEndTime: END_TIME,
  };
}

function loadSymbolRows(symbol: string) {
  const fileName = {
    AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
    EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
    GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
    GER40: "GER40_1m_2024-01-01_2026-06-15.csv",
    USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
  }[symbol as "AUDUSD" | "EURUSD" | "GBPUSD" | "GER40" | "USDJPY"];

  if (!fileName) throw new Error(`Unsupported symbol ${symbol}`);
  const path = `${FOREX_DIR}/${fileName}`;
  if (!existsSync(path)) throw new Error(`Missing ${path}`);

  const rows = parseLocalCsvKlines(readFileSync(path, "utf8")).filter(
    (row) => row.openTime >= START_TIME - WARMUP_MS && row.openTime < END_TIME
  );
  return { path, rows };
}

function runBbAtrSearch(symbol: string, timeframe: Timeframe, klines: Kline[]) {
  const rows: CandidateRow[] = [];
  const base = baseConfig(symbol);
  const bbPeriods = [40, 60, 80, 100];
  const deviations = [1.5, 1.75, 2, 2.25];
  const atrMultipliers = [0.75, 1, 1.25];
  const holds = timeframe === "1h" ? [12, 24, 48, 72, 96] : [6, 12, 18, 24, 36];
  const directions: DirectionMode[] = ["long_only", "short_only"];
  const emaFilters: EmaFilter[] = ["none", "trend", "countertrend"];
  const exits: ExitTarget[] = ["mean", "opposite_band"];

  for (const bbPeriod of bbPeriods) {
    for (const bandDeviation of deviations) {
      for (const atrMultiplier of atrMultipliers) {
        for (const maxHoldBars of holds) {
          for (const directionMode of directions) {
            for (const emaFilter of emaFilters) {
              for (const exitTarget of exits) {
                const variant = [
                  `bb${bbPeriod}`,
                  `dev${bandDeviation}`,
                  `atr${atrMultiplier}`,
                  `hold${maxHoldBars}`,
                  directionMode,
                  `ema_${emaFilter}`,
                  exitTarget,
                ].join("_");
                const report = runUniversalBbAtrBacktest({
                  klines4h: klines,
                  config: {
                    ...base,
                    bbPeriod,
                    bandDeviation,
                    atrPeriod: 14,
                    atrMultiplier,
                    maxHoldBars,
                    directionMode,
                    emaPeriod: emaFilter === "none" ? 0 : 200,
                    emaFilter,
                    exitTarget,
                    setupVariant: "research_2026_bb_atr_adaptive",
                    strategyName: `Search ${symbol} BB/ATR ${timeframe}`,
                    strategyVersion: `search.${variant}`,
                  },
                });

                if (report.metrics.total_trades >= 10 && report.metrics.net_profit > 0) {
                  rows.push(toRow({ symbol, family: "bb_atr", timeframe, variant, report }));
                }
              }
            }
          }
        }
      }
    }
  }

  return rows;
}

function runDonchianSearch(symbol: string, timeframe: Timeframe, klines: Kline[]) {
  const rows: CandidateRow[] = [];
  const base = baseConfig(symbol);
  const entryLookbacks = [20, 40, 55, 80, 100, 120];
  const exitLookbacks = [5, 10, 20, 40];
  const atrMultipliers = [0.75, 1, 1.25, 1.5, 2, 3];
  const directions: DirectionMode[] = ["all", "long_only", "short_only"];

  for (const entryLookback of entryLookbacks) {
    for (const exitLookback of exitLookbacks) {
      if (exitLookback >= entryLookback) continue;
      for (const atrMultiplier of atrMultipliers) {
        for (const directionMode of directions) {
          const variant = [
            `entry${entryLookback}`,
            `exit${exitLookback}`,
            `atr${atrMultiplier}`,
            directionMode,
          ].join("_");
          const report = runFxDonchianBacktest({
            klines4h: klines,
            config: {
              ...base,
              entryLookback,
              exitLookback,
              atrPeriod: 14,
              atrMultiplier,
              directionMode,
              setupVariant: "research_2026_donchian_1h_80_10",
              strategyName: `Search ${symbol} Donchian ${timeframe}`,
              strategyVersion: `search.${variant}`,
            },
          });

          if (report.metrics.total_trades >= 10 && report.metrics.net_profit > 0) {
            rows.push(toRow({ symbol, family: "donchian", timeframe, variant, report }));
          }
        }
      }
    }
  }

  return rows;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const requestedSymbols = process.env.SEARCH_SYMBOLS?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const symbols = requestedSymbols?.length ? requestedSymbols : ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY", "GER40"];
  const candidates: CandidateRow[] = [];

  for (const symbol of symbols) {
    const { path, rows } = loadSymbolRows(symbol);
    console.log(`${symbol}: ${rows.length} source 1M rows from ${basename(path)}`);
    const oneHour = aggregateKlines(rows, "1h");
    const fourHour = aggregateKlines(rows, "4h");

    for (const timeframe of ["1h", "4h"] as const) {
      const klines = timeframe === "1h" ? oneHour : fourHour;
      candidates.push(...runBbAtrSearch(symbol, timeframe, klines));
      candidates.push(...runDonchianSearch(symbol, timeframe, klines));
    }
  }

  const headers = [
    "symbol",
    "family",
    "timeframe",
    "variant",
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
    "score",
  ];
  const sorted = candidates.sort((a, b) => b.score - a.score);
  const above30 = sorted.filter((row) => row.return_pct >= 30);

  writeCsv(`${OUT_DIR}/engine_search_2026_candidates.csv`, [
    headers,
    ...sorted.map((row) => headers.map((key) => row[key as keyof CandidateRow])),
  ]);
  writeCsv(`${OUT_DIR}/engine_search_2026_above_30pct.csv`, [
    headers,
    ...above30.map((row) => headers.map((key) => row[key as keyof CandidateRow])),
  ]);
  writeFileSync(
    `${OUT_DIR}/engine_search_2026_candidates.json`,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        start: new Date(START_TIME).toISOString(),
        end: new Date(END_TIME).toISOString(),
        candidates: sorted,
        above_30pct: above30,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        candidates: candidates.length,
        above_30pct: above30.length,
        top: sorted.slice(0, 15),
        files: [
          `${OUT_DIR}/engine_search_2026_candidates.csv`,
          `${OUT_DIR}/engine_search_2026_above_30pct.csv`,
          `${OUT_DIR}/engine_search_2026_candidates.json`,
        ],
      },
      null,
      2
    )
  );
}

main();
