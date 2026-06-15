import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Kline } from "../src/lib/binance";
import {
  calculateNativeBacktestValidationReport,
  type NativeBacktestReport,
} from "../src/lib/data-handlers/backtest";
import { runCenturionNativeBacktest } from "../src/lib/data-handlers/centurion-native-backtest";
import { runFxDonchianBacktest } from "../src/lib/data-handlers/fx-donchian-backtest";
import { runFxLondonSweepBacktest } from "../src/lib/data-handlers/fx-london-sweep-backtest";
import { runUniversalBbAtrBacktest } from "../src/lib/data-handlers/universal-bb-atr-backtest";
import {
  runBiosOrderflowExperimentSuite,
  runIctExperimentSuite,
  type IctBreakdownRow,
  type IctCostSimulationRow,
  type IctExperimentReport,
  type IctOutlierDependency,
} from "../src/lib/data-handlers/ict-fvg-experiments";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

const FOREX_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type StrategyFamily =
  | "Native ICT"
  | "Donchian"
  | "London"
  | "Universal"
  | "ICT Experiments"
  | "BIOS"
  | "Order Flow Proxy";

interface MatrixReport {
  symbol: string;
  variant_name: string;
  strategy_family: StrategyFamily;
  metrics: {
    trades: number;
    winners: number;
    losers: number;
    breakeven: number;
    win_rate: number;
    resolved_win_rate: number;
    net_profit: number;
    gross_profit: number;
    gross_loss: number;
    profit_factor: number;
    expectancy_r: number;
    max_drawdown: number;
    final_equity: number;
    average_trade: number;
    best_trade: number;
    worst_trade: number;
  };
  ranking_score: number;
  warnings: string[];
  paper_testing_assessment?: IctExperimentReport["paper_testing_assessment"];
  execution_cost_simulation: IctCostSimulationRow[];
  yearly_breakdown: IctBreakdownRow[];
  direction_breakdown: IctBreakdownRow[];
  liquidity_source_breakdown: IctBreakdownRow[];
  monthly_breakdown: IctBreakdownRow[];
  outlier_dependency: IctOutlierDependency;
  status: "success" | "failed";
  error_message?: string;
  source: "native" | "experiment";
}

interface SuiteOutput {
  suite_name: "ALL_STRATEGY_BACKTEST_MATRIX";
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
  reports: MatrixReport[];
  best_variant: MatrixReport | null;
  paper_testing_candidates: MatrixReport[];
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

function profitFactor(profits: number[]) {
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
}

function resolvedWinRate(winners: number, losers: number) {
  return winners + losers ? (winners / (winners + losers)) * 100 : 0;
}

function finiteScore(value: number) {
  return Number.isFinite(value) ? value : 5;
}

function nativeRankingScore(report: NativeBacktestReport) {
  const metrics = report.metrics;
  const validation = report.validation_report ?? calculateNativeBacktestValidationReport([], INITIAL_CAPITAL, report.metadata.symbol);
  const halfPipPf = validation.execution_cost_simulation.find((row) => row.cost_pips === 0.5)?.profit_factor ?? 0;
  return (
    metrics.expectancy * 100 +
    Math.max(0, finiteScore(metrics.profit_factor) - 1) * 50 +
    Math.max(0, finiteScore(halfPipPf) - 1) * 50 -
    Math.abs(validation.outlier_dependency.percent_profit_from_top_3_trades) * 0.15 -
    Math.max(0, 30 - metrics.total_trades) * 2 -
    Math.max(0, 1.15 - finiteScore(halfPipPf)) * 70
  );
}

function nativePaperAssessment(report: NativeBacktestReport): MatrixReport["paper_testing_assessment"] {
  const validation = report.validation_report ?? calculateNativeBacktestValidationReport([], INITIAL_CAPITAL, report.metadata.symbol);
  const half = validation.execution_cost_simulation.find((row) => row.cost_pips === 0.5);
  const one = validation.execution_cost_simulation.find((row) => row.cost_pips === 1);
  const reasons: string[] = [];
  const pfHalf = half?.profit_factor ?? 0;
  const pfOne = one?.profit_factor ?? 0;
  const expHalf = half?.expectancy_r ?? 0;
  const expOne = one?.expectancy_r ?? 0;

  if (report.metrics.total_trades < 30) reasons.push("trades_below_30");
  if (pfHalf < 1.15) reasons.push("pf_after_0_5_pip_below_1_15");
  if (pfOne < 1) reasons.push("pf_after_1_pip_below_1_0");
  if (expHalf <= 0) reasons.push("expectancy_after_0_5_pip_not_positive");
  if (validation.outlier_dependency.percent_profit_from_top_3_trades > 60) reasons.push("top_3_profit_above_60_percent");
  if (validation.yearly_breakdown.some((row) => row.trades >= 5 && row.profit_factor < 0.8)) {
    reasons.push("unstable_yearly_pf_below_0_8");
  }

  return {
    status: reasons.length ? "fail" : "pass",
    reasons,
    min_trades: 30,
    max_top_3_profit_percent: 60,
    min_profit_factor_after_0_5_pip_cost: 1.15,
    min_profit_factor_after_1_pip_cost: 1,
    profit_factor_after_0_5_pip_cost: pfHalf,
    profit_factor_after_1_pip_cost: pfOne,
    expectancy_r_after_0_5_pip_cost: expHalf,
    expectancy_r_after_1_pip_cost: expOne,
  };
}

function nativeWarnings(report: NativeBacktestReport) {
  const warnings: string[] = [];
  const validation = report.validation_report ?? calculateNativeBacktestValidationReport([], INITIAL_CAPITAL, report.metadata.symbol);
  const halfPf = validation.execution_cost_simulation.find((row) => row.cost_pips === 0.5)?.profit_factor ?? 0;
  if (report.metadata.status === "failed") warnings.push("failed");
  if (report.metrics.total_trades < 20) warnings.push("too_few_trades");
  if (report.metrics.profit_factor < 1.3) warnings.push("profit_factor_below_1_3");
  if (halfPf < 1.15) warnings.push("weak_after_cost");
  if (report.metrics.expectancy <= 0) warnings.push("non_positive_expectancy");
  if (validation.outlier_dependency.percent_profit_from_top_3_trades > 60) warnings.push("outlier_dependent");
  if (validation.yearly_breakdown.some((row) => row.trades >= 5 && row.profit_factor < 0.8)) warnings.push("unstable_yearly");
  return [...new Set(warnings)];
}

function nativeToMatrix(report: NativeBacktestReport, variantName: string, family: StrategyFamily): MatrixReport {
  const validation = report.validation_report ?? calculateNativeBacktestValidationReport([], INITIAL_CAPITAL, report.metadata.symbol);
  const winners = report.metrics.winning_trades;
  const losers = report.metrics.losing_trades;
  return {
    symbol: report.metadata.symbol,
    variant_name: variantName,
    strategy_family: family,
    metrics: {
      trades: report.metrics.total_trades,
      winners,
      losers,
      breakeven: report.metrics.breakeven_trades,
      win_rate: report.metrics.win_rate,
      resolved_win_rate: resolvedWinRate(winners, losers),
      net_profit: report.metrics.net_profit,
      gross_profit: report.metrics.gross_profit,
      gross_loss: report.metrics.gross_loss,
      profit_factor: report.metrics.profit_factor,
      expectancy_r: report.metrics.expectancy,
      max_drawdown: report.metrics.max_drawdown,
      final_equity: report.metrics.final_equity,
      average_trade: report.metrics.average_trade,
      best_trade: report.metrics.best_trade,
      worst_trade: report.metrics.worst_trade,
    },
    ranking_score: nativeRankingScore(report),
    warnings: nativeWarnings(report),
    paper_testing_assessment: nativePaperAssessment(report),
    execution_cost_simulation: validation.execution_cost_simulation.map((row) => ({
      ...row,
      resolved_win_rate: row.win_rate,
    })),
    yearly_breakdown: validation.yearly_breakdown.map((row) => ({
      key: String(row.year),
      trades: row.trades,
      win_rate: row.win_rate,
      net_profit: row.net_profit,
      profit_factor: row.profit_factor,
      expectancy_r: row.expectancy_r,
      max_drawdown: row.max_drawdown,
    })),
    direction_breakdown: validation.direction_breakdown.map((row) => ({
      key: row.direction,
      trades: row.trades,
      win_rate: row.win_rate,
      net_profit: row.net_profit,
      profit_factor: row.profit_factor,
      expectancy_r: row.expectancy_r,
      max_drawdown: row.max_drawdown,
    })),
    liquidity_source_breakdown: [],
    monthly_breakdown: validation.monthly_breakdown.map((row) => ({
      key: row.year_month,
      trades: row.trades,
      win_rate: 0,
      net_profit: row.net_profit,
      profit_factor: row.profit_factor,
      expectancy_r: row.expectancy_r,
      max_drawdown: 0,
    })),
    outlier_dependency: validation.outlier_dependency,
    status: report.metadata.status,
    error_message: report.metadata.error_message,
    source: "native",
  };
}

function experimentToMatrix(report: IctExperimentReport, familyOverride?: StrategyFamily): MatrixReport {
  return {
    ...report,
    strategy_family: familyOverride ?? (report.strategy_family as StrategyFamily) ?? "ICT Experiments",
    status: "success",
    source: "experiment",
  };
}

function nativeConfig(symbol: string, firstTime: number, lastTime: number) {
  return {
    symbol,
    requestedExchange: "FOREX_CSV",
    marketType: "forex",
    marketDataProvider: "workspace_csv",
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePercent: 1,
    rewardRMultiple: 2,
    includePlanB: false,
    tradeStartTime: firstTime,
    tradeEndTime: lastTime,
  };
}

function runNativeStrategies(symbol: string, oneMinuteRows: Kline[]) {
  const firstTime = oneMinuteRows[0]?.openTime ?? 0;
  const lastTime = (oneMinuteRows[oneMinuteRows.length - 1]?.openTime ?? firstTime) + 60_000;
  const warmup14Start = firstTime + 14 * ONE_DAY_MS;
  const oneHour = aggregateKlines(oneMinuteRows, "1h");
  const fiveMinute = aggregateKlines(oneMinuteRows, "5m");
  const fourHour = aggregateKlines(oneMinuteRows, "4h");

  const reports: MatrixReport[] = [];
  const base = nativeConfig(symbol, firstTime, lastTime);

  reports.push(
    nativeToMatrix(
      runCenturionNativeBacktest({
        klines1h: oneHour,
        klines5m: fiveMinute,
        klines1m: oneMinuteRows,
        config: { ...base, rewardRMultiple: 2.2, includePlanB: false, strategyProfile: "centurion_ict" },
      }),
      "centurion_ict",
      "Native ICT"
    )
  );

  reports.push(
    nativeToMatrix(
      runCenturionNativeBacktest({
        klines1h: oneHour,
        klines5m: fiveMinute,
        klines1m: oneMinuteRows,
        config: {
          ...base,
          rewardRMultiple: 2.2,
          includePlanB: false,
          entryWindowMode: "kyiv_killzones",
          strategyProfile: "centurion_ict",
        },
      }),
      "centurion_ict_kyiv_killzones",
      "Native ICT"
    )
  );

  reports.push(
    nativeToMatrix(
      runCenturionNativeBacktest({
        klines1h: oneHour,
        klines5m: fiveMinute,
        klines1m: oneMinuteRows,
        config: {
          ...base,
          rewardRMultiple: 1.5,
          strategyProfile: "ict_ema_atr",
          breakEvenEnabled: false,
          emaPeriod: 200,
          sweepAtrPeriod: 14,
          sweepDepthAtrMultiple: 0.05,
          fvgAtrPeriod: 14,
          fvgSizeAtrMultiple: 0.05,
          confirmationLookback: 1,
          tradeStartTime: warmup14Start,
        },
      }),
      "ict_ema_atr_fvg",
      "Native ICT"
    )
  );

  reports.push(
    nativeToMatrix(
      runCenturionNativeBacktest({
        klines1h: oneHour,
        klines5m: fiveMinute,
        klines1m: oneMinuteRows,
        config: {
          ...base,
          rewardRMultiple: 2,
          strategyProfile: "ict_improved_v2",
          breakEvenEnabled: true,
          sweepAtrPeriod: 14,
          sweepDepthAtrMultiple: 0.1,
          confirmationLookback: 3,
          tradeStartTime: warmup14Start,
        },
      }),
      "ict_improved_v2",
      "Native ICT"
    )
  );

  reports.push(
    nativeToMatrix(
      runCenturionNativeBacktest({
        klines1h: oneHour,
        klines5m: fiveMinute,
        klines1m: oneMinuteRows,
        config: {
          ...base,
          rewardRMultiple: 2,
          strategyProfile: "ict_improved_v3",
          breakEvenEnabled: true,
          sweepAtrPeriod: 14,
          sweepDepthAtrMultiple: 0.1,
          confirmationLookback: 3,
          minRiskPips: 5,
          skipMinRiskPipsValidation: true,
          tradeStartTime: warmup14Start,
        },
      }),
      "ict_improved_v3",
      "Native ICT"
    )
  );

  reports.push(
    nativeToMatrix(
      runFxDonchianBacktest({
        klines4h: fourHour,
        config: { ...base, rewardRMultiple: 0, includePlanB: false },
      }),
      "fx_donchian",
      "Donchian"
    )
  );

  reports.push(
    nativeToMatrix(
      runFxLondonSweepBacktest({
        klines5m: fiveMinute,
        config: { ...base, rewardRMultiple: 2, includePlanB: false },
      }),
      "fx_london_sweep",
      "London"
    )
  );

  reports.push(
    nativeToMatrix(
      runUniversalBbAtrBacktest({
        klines4h: fourHour,
        config: {
          ...base,
          rewardRMultiple: 0,
          includePlanB: false,
          bbPeriod: 40,
          bandDeviation: 2,
          atrPeriod: 14,
          atrMultiplier: 3,
          maxHoldBars: 12,
        },
      }),
      "universal_bb_atr_mean_reversion",
      "Universal"
    )
  );

  reports.push(
    nativeToMatrix(
      runUniversalBbAtrBacktest({
        klines4h: fourHour,
        config: {
          ...base,
          riskPerTradePercent: 2,
          rewardRMultiple: 0,
          includePlanB: false,
          bbPeriod: 80,
          bandDeviation: 1.5,
          atrPeriod: 14,
          atrMultiplier: 1,
          maxHoldBars: 48,
          directionMode: "long_only",
          emaPeriod: 200,
          emaFilter: "countertrend",
          setupVariant: "universal_bb_atr_target15",
          strategyName: "Universal BB ATR Target 15",
          strategyVersion: "mvp.4h-bb80-k1_5-atr14-stop1-long-countertrend-risk2.1",
        },
      }),
      "universal_bb_atr_target15",
      "Universal"
    )
  );

  return reports;
}

function discoverForexFiles() {
  if (!existsSync(FOREX_DIR)) return [];
  return readdirSync(FOREX_DIR)
    .filter((file) => file.toLowerCase().endsWith(".csv"))
    .map((file) => {
      const symbol = file.split("_")[0]?.toUpperCase() ?? file.replace(/\.csv$/i, "").toUpperCase();
      return { symbol, path: `${FOREX_DIR}/${file}` };
    })
    .filter((item) => ["EURUSD", "GBPUSD", "USDJPY", "GER40"].includes(item.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function costValue(report: MatrixReport, costPips: number, key: "profit_factor" | "net_profit") {
  return report.execution_cost_simulation.find((row) => row.cost_pips === costPips)?.[key] ?? "";
}

function summaryRow(report: MatrixReport) {
  return [
    report.symbol,
    report.strategy_family,
    report.variant_name,
    report.status,
    report.metrics.trades,
    report.metrics.winners,
    report.metrics.losers,
    report.metrics.breakeven,
    report.metrics.win_rate,
    report.metrics.resolved_win_rate,
    report.metrics.net_profit,
    report.metrics.profit_factor,
    report.metrics.expectancy_r,
    report.metrics.max_drawdown,
    report.metrics.final_equity,
    costValue(report, 0.5, "profit_factor"),
    costValue(report, 1, "profit_factor"),
    costValue(report, 0.5, "net_profit"),
    costValue(report, 1, "net_profit"),
    report.outlier_dependency.percent_profit_from_top_3_trades,
    report.ranking_score,
    report.paper_testing_assessment?.status ?? "",
    report.paper_testing_assessment?.reasons.join("|") ?? "",
    report.warnings.join("|"),
    report.error_message ?? "",
  ];
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const reports: MatrixReport[] = [];
  const warnings: string[] = [];
  const symbols: SuiteOutput["symbols"] = [];
  const files = discoverForexFiles();

  if (!files.length) warnings.push(`No CSV files found in ${FOREX_DIR}.`);

  for (const file of files) {
    try {
      const rows = parseLocalCsvKlines(readFileSync(file.path, "utf8"));
      console.log(`${file.symbol}: ${rows.length} 1M rows from ${basename(file.path)}`);
      symbols.push({
        symbol: file.symbol,
        source_csv: file.path,
        first_1m: iso(rows[0]?.openTime),
        last_1m: iso(rows[rows.length - 1]?.openTime),
        rows_1m: rows.length,
      });

      reports.push(...runNativeStrategies(file.symbol, rows));
      reports.push(...runIctExperimentSuite(file.symbol, rows, INITIAL_CAPITAL).map((report) => experimentToMatrix(report, "ICT Experiments")));
      reports.push(...runBiosOrderflowExperimentSuite(file.symbol, rows, INITIAL_CAPITAL).map((report) => experimentToMatrix(report)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${file.symbol}: ${message}`);
      console.warn(`WARN ${file.symbol}: ${message}`);
    }
  }

  const sorted = [...reports].sort((a, b) => b.ranking_score - a.ranking_score);
  const paperTestingCandidates = sorted.filter((report) => report.paper_testing_assessment?.status === "pass");
  const bestVariant =
    paperTestingCandidates[0] ??
    sorted.find((report) => report.status === "success" && report.metrics.trades >= 30) ??
    sorted.find((report) => report.status === "success" && report.metrics.trades > 0) ??
    sorted[0] ??
    null;
  const output: SuiteOutput = {
    suite_name: "ALL_STRATEGY_BACKTEST_MATRIX",
    suite_version: "v1",
    generated_at: new Date().toISOString(),
    initial_capital: INITIAL_CAPITAL,
    warnings,
    symbols,
    reports,
    best_variant: bestVariant,
    paper_testing_candidates: paperTestingCandidates,
  };

  const headers = [
    "symbol",
    "strategy_family",
    "variant_name",
    "status",
    "trades",
    "winners",
    "losers",
    "breakeven",
    "win_rate",
    "resolved_win_rate",
    "net_profit",
    "profit_factor",
    "expectancy_r",
    "max_drawdown",
    "final_equity",
    "profit_factor_after_0_5_pip_cost",
    "profit_factor_after_1_pip_cost",
    "net_profit_after_0_5_pip_cost",
    "net_profit_after_1_pip_cost",
    "percent_profit_from_top_3_trades",
    "ranking_score",
    "paper_testing_status",
    "paper_testing_reasons",
    "warnings",
    "error_message",
  ];

  writeFileSync(`${OUT_DIR}/all_strategy_backtest_matrix_summary.json`, JSON.stringify(output, null, 2), "utf8");
  writeCsv(`${OUT_DIR}/all_strategy_backtest_matrix_summary.csv`, [headers, ...reports.map(summaryRow)]);
  writeCsv(`${OUT_DIR}/all_strategy_backtest_matrix_top.csv`, [headers, ...sorted.slice(0, 50).map(summaryRow)]);
  writeCsv(`${OUT_DIR}/all_strategy_backtest_matrix_paper_candidates.csv`, [
    headers,
    ...paperTestingCandidates.map(summaryRow),
  ]);

  console.log(
    JSON.stringify(
      {
        reports: reports.length,
        paper_testing_candidates: paperTestingCandidates.length,
        best_variant: bestVariant
          ? {
              symbol: bestVariant.symbol,
              strategy_family: bestVariant.strategy_family,
              variant_name: bestVariant.variant_name,
              trades: bestVariant.metrics.trades,
              win_rate: bestVariant.metrics.win_rate,
              profit_factor: bestVariant.metrics.profit_factor,
              expectancy_r: bestVariant.metrics.expectancy_r,
              ranking_score: bestVariant.ranking_score,
              paper: bestVariant.paper_testing_assessment?.status,
            }
          : null,
        files: [
          "all_strategy_backtest_matrix_summary.json",
          "all_strategy_backtest_matrix_summary.csv",
          "all_strategy_backtest_matrix_top.csv",
          "all_strategy_backtest_matrix_paper_candidates.csv",
        ].map((name) => resolve(OUT_DIR, name)),
      },
      null,
      2
    )
  );
}

main();
