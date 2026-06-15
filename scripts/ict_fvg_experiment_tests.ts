import { readFileSync } from "node:fs";
import {
  riskDistancePips,
  runBiosOrderflowExperimentSuite,
  type IctExperimentReport,
} from "../src/lib/data-handlers/ict-fvg-experiments";
import type { Kline } from "../src/lib/binance";

interface SuiteOutput {
  reports: IctExperimentReport[];
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function nearlyEqual(a: number, b: number, epsilon = 1e-9) {
  return Math.abs(a - b) <= epsilon;
}

function main() {
  assert(nearlyEqual(riskDistancePips("EURUSD", 1.1000, 1.0990), 10), "non-JPY pip distance failed");
  assert(nearlyEqual(riskDistancePips("GBPUSD", 1.2500, 1.2495), 5), "GBPUSD pip distance failed");
  assert(nearlyEqual(riskDistancePips("USDJPY", 160.0, 159.9), 10), "JPY pip distance failed");

  const suite = JSON.parse(
    readFileSync("public/exports/ict_fvg_experiment_summary.json", "utf8")
  ) as SuiteOutput;
  assert(suite.reports.length > 0, "experiment runner summary is empty");

  const partial = suite.reports.find((report) => report.variant_name === "v3_partial_tp");
  assert(partial, "partial TP variant missing");

  for (const report of suite.reports) {
    const costPips = report.execution_cost_simulation.map((row) => row.cost_pips).join(",");
    assert(costPips === "0,0.5,1,1.5", `${report.symbol}/${report.variant_name}: cost simulation rows mismatch`);

    const seen = new Set<string>();
    for (const trade of report.trades) {
      const duplicateKey = `${trade.entry_time}:${trade.direction}`;
      assert(!seen.has(duplicateKey), `${report.symbol}/${report.variant_name}: duplicate trade at entry`);
      seen.add(duplicateKey);

      assert(
        trade.fvg_test_time > trade.fvg_candle_3_time,
        `${report.symbol}/${report.variant_name}: FVG test used candle_3 or earlier`
      );
      assert(
        trade.entry_time > trade.confirmation_time,
        `${report.symbol}/${report.variant_name}: entry is not after confirmation`
      );
      assert(
        ["previous_1h", "asian_range", "previous_day"].includes(trade.liquidity_source),
        `${report.symbol}/${report.variant_name}: invalid liquidity_source`
      );
    }
  }

  const asian = suite.reports.find((report) => report.variant_name === "v3_asian_liquidity");
  assert(
    !asian || asian.trades.every((trade) => trade.liquidity_source === "asian_range"),
    "asian liquidity source detection failed"
  );

  const previousDay = suite.reports.find((report) => report.variant_name === "v3_previous_day_liquidity");
  assert(
    !previousDay || previousDay.trades.every((trade) => trade.liquidity_source === "previous_day"),
    "previous-day liquidity source detection failed"
  );

  const biosSuite = JSON.parse(
    readFileSync("public/exports/bios_orderflow_experiment_summary.json", "utf8")
  ) as SuiteOutput;
  const expectedVariants = [
    "bios_v4_multi_liquidity",
    "bios_v4_long_bias_short_filtered",
    "bios_v4_partial_tp",
    "order_flow_proxy_1_5r",
    "order_flow_proxy_2r",
    "order_flow_proxy_partial_tp",
  ];
  for (const variant of expectedVariants) {
    assert(
      biosSuite.reports.some((report) => report.variant_name === variant),
      `BIOS/OrderFlow variant missing: ${variant}`
    );
  }

  for (const report of biosSuite.reports) {
    assert(report.paper_testing_assessment, `${report.symbol}/${report.variant_name}: paper testing assessment missing`);
    assert(
      ["pass", "fail"].includes(report.paper_testing_assessment.status),
      `${report.symbol}/${report.variant_name}: invalid paper testing status`
    );
    const costPips = report.execution_cost_simulation.map((row) => row.cost_pips).join(",");
    assert(costPips === "0,0.5,1,1.5", `${report.symbol}/${report.variant_name}: cost simulation rows mismatch`);
    assert(
      report.execution_cost_simulation.every((row) => typeof row.resolved_win_rate === "number"),
      `${report.symbol}/${report.variant_name}: resolved win rate missing in cost simulation`
    );

    const seen = new Set<string>();
    let lastExit = -Infinity;
    for (const trade of report.trades) {
      assert(trade.entry_time > lastExit, `${report.symbol}/${report.variant_name}: overlapping positions detected`);
      lastExit = trade.exit_time;

      const duplicateKey = `${trade.entry_time}:${trade.direction}`;
      assert(!seen.has(duplicateKey), `${report.symbol}/${report.variant_name}: duplicate trade at entry`);
      seen.add(duplicateKey);

      assert(
        ["previous_1h", "asian_range", "previous_day"].includes(trade.liquidity_source),
        `${report.symbol}/${report.variant_name}: invalid liquidity source`
      );
      assert((trade.risk_distance_pips ?? 0) >= 5, `${report.symbol}/${report.variant_name}: min risk filter failed`);

      if (!report.variant_name.startsWith("order_flow_proxy")) {
        assert(
          trade.fvg_high > trade.fvg_low,
          `${report.symbol}/${report.variant_name}: strict FVG zone is invalid`
        );
        assert(
          trade.fvg_test_time > trade.fvg_candle_3_time,
          `${report.symbol}/${report.variant_name}: FVG test used candle_3 or earlier`
        );
        assert(
          trade.entry_time > trade.confirmation_time,
          `${report.symbol}/${report.variant_name}: entry is not after confirmation`
        );
      }
    }

    if (report.variant_name.includes("partial_tp")) {
      const allowed = new Set([-1, 0.5, 1.5]);
      for (const trade of report.trades.filter((item) => item.result_status !== "open_at_end")) {
        assert(
          allowed.has(trade.r_multiple),
          `${report.symbol}/${report.variant_name}: unexpected partial TP R multiple ${trade.r_multiple}`
        );
      }
    }
  }

  const warningSet = new Set(biosSuite.reports.flatMap((report) => report.warnings));
  for (const warning of ["weak_after_cost", "outlier_dependent", "unstable_yearly"]) {
    assert(warningSet.has(warning), `ranking flag not observed in BIOS suite: ${warning}`);
  }

  const noVolumeRows: Kline[] = Array.from({ length: 90 }, (_, index) => {
    const open = 1.1 + index * 0.00001;
    return {
      openTime: Date.parse("2025-01-01T00:00:00Z") + index * 60_000,
      open,
      high: open + 0.0002,
      low: open - 0.0002,
      close: open + 0.00001,
      volume: 0,
      closeTime: Date.parse("2025-01-01T00:00:00Z") + index * 60_000 + 59_999,
      quoteVolume: 0,
      trades: 0,
      takerBuyBaseVolume: 0,
      takerBuyQuoteVolume: 0,
    };
  });
  const noVolumeReports = runBiosOrderflowExperimentSuite("EURUSD", noVolumeRows);
  assert(
    noVolumeReports
      .filter((report) => report.variant_name.startsWith("order_flow_proxy"))
      .every((report) => report.warnings.includes("Order Flow Proxy requires volume column.")),
    "order flow proxy did not skip missing volume data"
  );
  assert(
    noVolumeReports.some((report) => report.warnings.includes("too_few_trades")),
    "too_few_trades ranking flag not observed in synthetic suite"
  );

  console.log("ict_fvg_experiment_tests: ok");
}

main();
