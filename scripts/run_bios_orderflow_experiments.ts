import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";
import {
  runBiosOrderflowExperimentSuite,
  type IctExperimentReport,
  type IctExperimentTrade,
} from "../src/lib/data-handlers/ict-fvg-experiments";

const FOREX_FILES: Record<string, string> = {
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  GER40: "public/data/forex/GER40_1m_2024-01-01_2026-06-15.csv",
};

const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;

interface SuiteOutput {
  suite_name: "BIOS_ORDERFLOW_EXPERIMENTS_V1";
  suite_version: "v1";
  generated_at: string;
  initial_capital: number;
  warnings: string[];
  symbols: Array<{
    symbol: string;
    source_csv: string;
    first_1m: string;
    last_1m: string;
    rows_1m: number;
  }>;
  reports: IctExperimentReport[];
  paper_testing_candidates: IctExperimentReport[];
  best_variant: IctExperimentReport | null;
}

function iso(timestamp: number | null | undefined) {
  return timestamp == null ? "" : new Date(timestamp).toISOString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function costRow(report: IctExperimentReport, costPips: number) {
  return report.execution_cost_simulation.find((row) => row.cost_pips === costPips);
}

function summaryRow(report: IctExperimentReport) {
  const metrics = report.metrics;
  const halfPip = costRow(report, 0.5);
  const onePip = costRow(report, 1);
  return [
    report.symbol,
    report.strategy_family ?? "",
    report.variant_name,
    metrics.trades,
    metrics.winners,
    metrics.losers,
    metrics.breakeven,
    metrics.win_rate,
    metrics.resolved_win_rate,
    metrics.net_profit,
    metrics.gross_profit,
    metrics.gross_loss,
    metrics.profit_factor,
    metrics.expectancy_r,
    metrics.max_drawdown,
    metrics.final_equity,
    metrics.average_trade,
    metrics.best_trade,
    metrics.worst_trade,
    metrics.partial_win_rate ?? 0,
    metrics.full_tp_rate ?? 0,
    halfPip?.profit_factor ?? "",
    halfPip?.net_profit ?? "",
    halfPip?.resolved_win_rate ?? "",
    onePip?.profit_factor ?? "",
    onePip?.net_profit ?? "",
    report.outlier_dependency.percent_profit_from_top_3_trades,
    report.outlier_dependency.net_profit_without_top_3_trades,
    report.ranking_score,
    report.paper_testing_assessment?.status ?? "",
    report.paper_testing_assessment?.reasons.join("|") ?? "",
    report.warnings.join("|"),
  ];
}

function tradeRows(trades: IctExperimentTrade[]) {
  return trades.map((trade, index) => [
    index + 1,
    trade.symbol,
    trade.variant_name,
    trade.direction,
    trade.liquidity_source,
    iso(trade.entry_time),
    trade.entry_price,
    trade.stop_loss,
    trade.take_profit,
    iso(trade.exit_time),
    trade.exit_price,
    trade.result_status,
    trade.profit,
    trade.r_multiple,
    trade.risk_amount,
    trade.quantity,
    iso(trade.setup_time),
    iso(trade.sweep_time),
    trade.swept_level_price ?? trade.sweep_level,
    trade.sweep_depth_pips ?? "",
    trade.sweep_depth_atr ?? "",
    trade.fvg_size_pips ?? "",
    trade.fvg_size_atr ?? "",
    trade.risk_distance_pips ?? "",
    trade.partial_tp_hit ?? "",
    trade.full_tp_hit ?? "",
    trade.adx_1h ?? "",
    trade.atr_1h ?? "",
    trade.atr_sma_1h ?? "",
    trade.fvg_low,
    trade.fvg_high,
    iso(trade.fvg_candle_1_time),
    iso(trade.fvg_candle_2_time),
    iso(trade.fvg_candle_3_time),
    iso(trade.fvg_formed_time),
    iso(trade.fvg_test_time),
    iso(trade.confirmation_time),
  ]);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const reports: IctExperimentReport[] = [];
  const warnings: string[] = [];
  const symbols: SuiteOutput["symbols"] = [];

  for (const [symbol, path] of Object.entries(FOREX_FILES)) {
    if (!existsSync(path)) {
      const warning = `${symbol}: missing CSV ${path}`;
      warnings.push(warning);
      console.warn(`WARN ${warning}`);
      continue;
    }

    try {
      const rows = parseLocalCsvKlines(readFileSync(path, "utf8"));
      console.log(`${symbol}: ${rows.length} 1M rows from ${basename(path)}`);
      symbols.push({
        symbol,
        source_csv: path,
        first_1m: iso(rows[0]?.openTime),
        last_1m: iso(rows[rows.length - 1]?.openTime),
        rows_1m: rows.length,
      });
      reports.push(...runBiosOrderflowExperimentSuite(symbol, rows, INITIAL_CAPITAL));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${symbol}: ${message}`);
      console.warn(`WARN ${symbol}: ${message}`);
    }
  }

  const sorted = [...reports].sort((a, b) => b.ranking_score - a.ranking_score);
  const eligible = sorted.filter((report) => !report.warnings.includes("too_few_trades"));
  const paperTestingCandidates = sorted.filter((report) => report.paper_testing_assessment?.status === "pass");
  const bestVariant = eligible[0] ?? sorted[0] ?? null;
  const output: SuiteOutput = {
    suite_name: "BIOS_ORDERFLOW_EXPERIMENTS_V1",
    suite_version: "v1",
    generated_at: new Date().toISOString(),
    initial_capital: INITIAL_CAPITAL,
    warnings,
    symbols,
    reports,
    paper_testing_candidates: paperTestingCandidates,
    best_variant: bestVariant,
  };

  const summaryHeaders = [
    "symbol",
    "strategy_family",
    "variant_name",
    "trades",
    "winners",
    "losers",
    "breakeven",
    "win_rate",
    "resolved_win_rate",
    "net_profit",
    "gross_profit",
    "gross_loss",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "final_equity",
    "average_trade",
    "best_trade",
    "worst_trade",
    "partial_win_rate",
    "full_tp_rate",
    "profit_factor_after_0_5_pip_cost",
    "net_profit_after_0_5_pip_cost",
    "resolved_win_rate_after_0_5_pip_cost",
    "profit_factor_after_1_pip_cost",
    "net_profit_after_1_pip_cost",
    "percent_profit_from_top_3_trades",
    "net_profit_without_top_3_trades",
    "ranking_score",
    "paper_testing_status",
    "paper_testing_reasons",
    "warnings",
  ];

  writeFileSync(`${OUT_DIR}/bios_orderflow_experiment_summary.json`, JSON.stringify(output, null, 2), "utf8");
  writeCsv(`${OUT_DIR}/bios_orderflow_experiment_summary.csv`, [
    summaryHeaders,
    ...reports.map(summaryRow),
  ]);
  writeCsv(`${OUT_DIR}/bios_orderflow_best_variants.csv`, [
    summaryHeaders,
    ...sorted.slice(0, 20).map(summaryRow),
  ]);
  writeCsv(`${OUT_DIR}/bios_orderflow_paper_testing_candidates.csv`, [
    summaryHeaders,
    ...paperTestingCandidates.map(summaryRow),
  ]);

  if (bestVariant) {
    const tradeHeaders = [
      "trade_number",
      "symbol",
      "variant_name",
      "direction",
      "liquidity_source",
      "entry_time",
      "entry_price",
      "stop_loss",
      "take_profit",
      "exit_time",
      "exit_price",
      "result_status",
      "profit",
      "r_multiple",
      "risk_amount",
      "quantity",
      "setup_time",
      "sweep_time",
      "swept_level_price",
      "sweep_depth_pips",
      "sweep_depth_atr",
      "fvg_size_pips",
      "fvg_size_atr",
      "risk_distance_pips",
      "partial_tp_hit",
      "full_tp_hit",
      "adx_1h",
      "atr_1h",
      "atr_sma_1h",
      "fvg_low",
      "fvg_high",
      "fvg_c1_time",
      "fvg_c2_time",
      "fvg_c3_time",
      "fvg_formed_time",
      "fvg_test_time",
      "confirmation_time",
    ];
    writeCsv(`${OUT_DIR}/bios_orderflow_best_variant_trades.csv`, [
      tradeHeaders,
      ...tradeRows(bestVariant.trades),
    ]);
    writeFileSync(`${OUT_DIR}/bios_orderflow_best_variant_report.json`, JSON.stringify(bestVariant, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        reports: reports.length,
        best_variant: bestVariant
          ? {
              symbol: bestVariant.symbol,
              variant_name: bestVariant.variant_name,
              ranking_score: bestVariant.ranking_score,
              trades: bestVariant.metrics.trades,
              win_rate: bestVariant.metrics.win_rate,
              profit_factor: bestVariant.metrics.profit_factor,
              expectancy_r: bestVariant.metrics.expectancy_r,
              warnings: bestVariant.warnings,
            }
          : null,
        paper_testing_candidates: paperTestingCandidates.length,
        files: [
          "bios_orderflow_experiment_summary.csv",
          "bios_orderflow_experiment_summary.json",
          "bios_orderflow_best_variants.csv",
          "bios_orderflow_paper_testing_candidates.csv",
          "bios_orderflow_best_variant_trades.csv",
          "bios_orderflow_best_variant_report.json",
        ].map((file) => resolve(OUT_DIR, file)),
      },
      null,
      2
    )
  );
}

main();
