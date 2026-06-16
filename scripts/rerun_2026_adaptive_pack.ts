import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import {
  calculateNativeBacktestMetrics,
  runFxDonchianBacktest,
  runUniversalBbAtrBacktest,
  type NativeBacktestReport,
  type NativeBacktestTrade,
} from "../src/lib/data-handlers";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

const DATA_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START = Date.parse("2026-01-01T00:00:00Z");
const REQUESTED_END = Date.parse("2026-06-16T00:00:00Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function iso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function pipSize(symbol: string) {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40") return 1;
  return 0.0001;
}

function discoverFiles() {
  return readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".csv"))
    .map((file) => ({
      file,
      symbol: file.split("_")[0].toUpperCase(),
      path: `${DATA_DIR}/${file}`,
    }))
    .filter((item) => ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY", "GER40"].includes(item.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function profitFactor(profits: number[]) {
  const grossProfit = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = profits.filter((value) => value < 0).reduce((sum, value) => sum + value, 0);
  return grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
}

function maxDrawdown(profits: number[], initialCapital: number) {
  let equity = initialCapital;
  let peak = initialCapital;
  let drawdown = 0;
  for (const profit of profits) {
    equity += profit;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, equity - peak);
  }
  return drawdown;
}

function cagr(finalEquity: number, startTime: number, endTime: number) {
  const days = Math.max(1, (endTime - startTime) / ONE_DAY_MS);
  return ((finalEquity / INITIAL_CAPITAL) ** (365 / days) - 1) * 100;
}

function costAdjustedStats(symbol: string, trades: NativeBacktestTrade[], costPips: number) {
  let equity = INITIAL_CAPITAL;
  const profits = trades.map((trade) => {
    const riskDistancePips = Math.abs(trade.entry_price - trade.stop_loss) / pipSize(symbol);
    const costR = riskDistancePips > 0 ? costPips / riskDistancePips : 0;
    const adjustedR = trade.r_multiple - costR;
    const adjustedProfit = adjustedR * trade.risk_amount;
    equity += adjustedProfit;
    return adjustedProfit;
  });

  return {
    net_profit: equity - INITIAL_CAPITAL,
    profit_factor: profitFactor(profits),
    max_drawdown: maxDrawdown(profits, INITIAL_CAPITAL),
    final_equity: equity,
  };
}

function independentAudit(report: NativeBacktestReport, symbol: string) {
  const trades = [...report.trades].sort((a, b) => a.exit_time - b.exit_time);
  const profits = trades.map((trade) => trade.profit);
  const metrics = calculateNativeBacktestMetrics(trades, INITIAL_CAPITAL);
  const issues: string[] = [];

  const tolerance = 1e-6;
  const assertClose = (name: string, a: number, b: number) => {
    if (Math.abs(a - b) > tolerance) {
      issues.push(`${name}: expected ${a}, got ${b}`);
    }
  };

  assertClose("net_profit", metrics.net_profit, report.metrics.net_profit);
  assertClose("final_equity", metrics.final_equity, report.metrics.final_equity);
  assertClose("profit_factor", metrics.profit_factor, report.metrics.profit_factor);
  assertClose("max_drawdown", metrics.max_drawdown, report.metrics.max_drawdown);

  let equity = INITIAL_CAPITAL;
  let peak = INITIAL_CAPITAL;
  const curve = report.validation_report?.equity_curve ?? [];
  for (let index = 0; index < trades.length; index += 1) {
    equity += trades[index].profit;
    peak = Math.max(peak, equity);
    const expectedDrawdown = equity - peak;
    const point = curve[index];
    if (!point) {
      issues.push(`equity_curve missing point ${index + 1}`);
      continue;
    }
    assertClose(`equity_curve[${index + 1}].equity`, equity, point.equity);
    assertClose(`equity_curve[${index + 1}].drawdown`, expectedDrawdown, point.drawdown);
    if (point.drawdown > tolerance) {
      issues.push(`equity_curve[${index + 1}].drawdown is positive`);
    }
  }

  const validationCost1 = report.validation_report?.execution_cost_simulation.find((row) => row.cost_pips === 1);
  const independentCost1 = costAdjustedStats(symbol, trades, 1);
  if (validationCost1) {
    assertClose("cost1.net_profit", independentCost1.net_profit, validationCost1.net_profit);
    assertClose("cost1.profit_factor", independentCost1.profit_factor, validationCost1.profit_factor);
    assertClose("cost1.max_drawdown", independentCost1.max_drawdown, validationCost1.max_drawdown);
  } else {
    issues.push("missing cost1 simulation");
  }

  return {
    status: issues.length ? "fail" : "pass",
    issues,
    independent_metrics: metrics,
    independent_cost_1_pip: independentCost1,
  };
}

function runAdaptive(symbol: string, rows1m: Kline[], endTime: number) {
  const warmupStart = START - 180 * ONE_DAY_MS;
  const warmRows = rows1m.filter((row) => row.openTime >= warmupStart && row.openTime < endTime);
  const strategyRows = aggregateKlines(warmRows, symbol === "AUDUSD" ? "4h" : "1h");
  const baseConfig = {
    symbol,
    requestedExchange: "FOREX",
    marketType: symbol === "GER40" ? "index CFD" : "spot forex",
    marketDataProvider: "WORKSPACE_CSV_1M",
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePercent: 1,
    rewardRMultiple: 0,
    includePlanB: false,
    tradeStartTime: START,
    tradeEndTime: endTime,
  };

  if (symbol === "EURUSD") {
    return runFxDonchianBacktest({
      klines4h: strategyRows,
      config: {
        ...baseConfig,
        entryLookback: 80,
        exitLookback: 10,
        atrPeriod: 14,
        atrMultiplier: 1,
        directionMode: "all",
        setupVariant: "research_2026_donchian_1h_80_10",
        strategyName: "Research 2026 EURUSD Donchian 1H 80/10",
        strategyVersion: "research.2026-ytd.in-sample.eurusd-donchian-1h-80-10-atr1.1",
      },
    });
  }

  const adaptiveParams = {
    AUDUSD: {
      bbPeriod: 20,
      bandDeviation: 2,
      atrMultiplier: 2,
      maxHoldBars: 6,
      directionMode: "long_only" as const,
      emaFilter: "none" as const,
      exitTarget: "opposite_band" as const,
      strategyVersion: "research.2026-ytd.audusd-bb20-dev2-long-opposite-4h.1",
    },
    GBPUSD: {
      bbPeriod: 80,
      bandDeviation: 1.5,
      atrMultiplier: 1,
      maxHoldBars: 96,
      directionMode: "short_only" as const,
      emaFilter: "none" as const,
      exitTarget: "mean" as const,
      strategyVersion: "research.2026-ytd.in-sample.gbpusd-bb80-dev1_5-short-mean.1",
    },
    USDJPY: {
      bbPeriod: 40,
      bandDeviation: 2,
      atrMultiplier: 1,
      maxHoldBars: 96,
      directionMode: "long_only" as const,
      emaFilter: "none" as const,
      exitTarget: "opposite_band" as const,
      strategyVersion: "research.2026-ytd.in-sample.usdjpy-bb40-dev2-long-opposite.1",
    },
    GER40: {
      bbPeriod: 80,
      bandDeviation: 2,
      atrMultiplier: 1,
      maxHoldBars: 96,
      directionMode: "short_only" as const,
      emaFilter: "none" as const,
      exitTarget: "opposite_band" as const,
      strategyVersion: "research.2026-ytd.in-sample.ger40-bb80-dev2-short-opposite.1",
    },
  }[symbol as "AUDUSD" | "GBPUSD" | "USDJPY" | "GER40"];

  return runUniversalBbAtrBacktest({
    klines4h: strategyRows,
    config: {
      ...baseConfig,
      bbPeriod: adaptiveParams.bbPeriod,
      bandDeviation: adaptiveParams.bandDeviation,
      atrPeriod: 14,
      atrMultiplier: adaptiveParams.atrMultiplier,
      maxHoldBars: adaptiveParams.maxHoldBars,
      directionMode: adaptiveParams.directionMode,
      emaPeriod: 200,
      emaFilter: adaptiveParams.emaFilter,
      exitTarget: adaptiveParams.exitTarget,
      setupVariant: "research_2026_bb_atr_adaptive",
      strategyName: `Research 2026 ${symbol} BB/ATR Adaptive`,
      strategyVersion: adaptiveParams.strategyVersion,
    },
  });
}

function main() {
  if (!existsSync(DATA_DIR)) throw new Error(`Missing ${DATA_DIR}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const reports = discoverFiles().map((file) => {
    const rows = parseLocalCsvKlines(readFileSync(file.path, "utf8"));
    const lastTime = rows[rows.length - 1].openTime;
    const endTime = Math.min(REQUESTED_END, lastTime + 60_000);
    const report = runAdaptive(file.symbol, rows, endTime);
    const audit = independentAudit(report, file.symbol);
    const cost1 = costAdjustedStats(file.symbol, report.trades, 1);

    return {
      symbol: file.symbol,
      source_csv: file.file,
      test_start: iso(START),
      test_end: iso(endTime),
      strategy_name: report.metadata.strategy_name,
      strategy_version: report.metadata.strategy_version,
      metrics: report.metrics,
      cost_1_pip: {
        ...cost1,
        cagr_percent: cagr(cost1.final_equity, START, endTime),
      },
      cagr_percent: cagr(report.metrics.final_equity, START, endTime),
      audit,
      trades: report.trades,
      validation_report: report.validation_report,
    };
  });

  writeFileSync(
    `${OUT_DIR}/research_2026_adaptive_pack_rerun.json`,
    JSON.stringify(
      {
        generated_at: iso(Date.now()),
        drawdown_definition: "signed drawdown from running equity peak: equity - peak; values are <= 0 until a new high is made",
        initial_capital: INITIAL_CAPITAL,
        requested_period: { start: iso(START), end: iso(REQUESTED_END) },
        reports,
      },
      null,
      2
    ),
    "utf8"
  );

  writeCsv(`${OUT_DIR}/research_2026_adaptive_pack_rerun_summary.csv`, [
    [
      "symbol",
      "test_start",
      "test_end",
      "strategy_name",
      "trades",
      "win_rate",
      "net_profit",
      "profit_factor",
      "expectancy_r",
      "max_drawdown_signed",
      "max_drawdown_abs",
      "final_equity",
      "cagr_percent",
      "cost1_net_profit",
      "cost1_profit_factor",
      "cost1_max_drawdown_signed",
      "cost1_cagr_percent",
      "audit_status",
      "audit_issues",
    ],
    ...reports.map((row) => [
      row.symbol,
      row.test_start,
      row.test_end,
      row.strategy_name,
      row.metrics.total_trades,
      row.metrics.win_rate,
      row.metrics.net_profit,
      row.metrics.profit_factor,
      row.metrics.expectancy,
      row.metrics.max_drawdown,
      Math.abs(row.metrics.max_drawdown),
      row.metrics.final_equity,
      row.cagr_percent,
      row.cost_1_pip.net_profit,
      row.cost_1_pip.profit_factor,
      row.cost_1_pip.max_drawdown,
      row.cost_1_pip.cagr_percent,
      row.audit.status,
      row.audit.issues.join("|"),
    ]),
  ]);

  for (const row of reports) {
    writeCsv(`${OUT_DIR}/research_2026_adaptive_pack_${row.symbol}_trades.csv`, [
      [
        "direction",
        "setup_variant",
        "entry_time",
        "exit_time",
        "entry_price",
        "exit_price",
        "stop_loss",
        "take_profit",
        "profit",
        "r_multiple",
        "risk_amount",
        "result_status",
      ],
      ...row.trades.map((trade) => [
        trade.direction,
        trade.setup_variant,
        iso(trade.entry_time),
        iso(trade.exit_time),
        trade.entry_price,
        trade.exit_price,
        trade.stop_loss,
        trade.take_profit,
        trade.profit,
        trade.r_multiple,
        trade.risk_amount,
        trade.result_status,
      ]),
    ]);
  }

  console.log(
    JSON.stringify(
      {
        reports: reports.map((row) => ({
          symbol: row.symbol,
          trades: row.metrics.total_trades,
          net_profit: row.metrics.net_profit,
          profit_factor: row.metrics.profit_factor,
          max_drawdown_signed: row.metrics.max_drawdown,
          cagr_percent: row.cagr_percent,
          cost1_net_profit: row.cost_1_pip.net_profit,
          cost1_profit_factor: row.cost_1_pip.profit_factor,
          cost1_cagr_percent: row.cost_1_pip.cagr_percent,
          audit: row.audit.status,
        })),
        files: [
          `${OUT_DIR}/research_2026_adaptive_pack_rerun.json`,
          `${OUT_DIR}/research_2026_adaptive_pack_rerun_summary.csv`,
        ],
      },
      null,
      2
    )
  );
}

main();
