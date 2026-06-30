import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  prepareSmcSessionRaidData,
  runSmcSessionRaidBacktest,
  smcMetrics,
  type SmcSessionRaidConfig,
} from "../src/lib/data-handlers/smc-session-raid-backtest";
import { parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

const FILES: Record<string, string> = {
  EURUSD: "public/data/forex/EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "public/data/forex/GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "public/data/forex/USDJPY_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "public/data/forex/AUDUSD_1m_2023-06-15_2026-06-15.csv",
};

const TRAIN_START = Date.parse("2025-01-01T00:00:00Z");
const TRAIN_MIDDLE = Date.parse("2025-07-01T00:00:00Z");
const TRAIN_END = Date.parse("2026-01-01T00:00:00Z");
const TEST_START = TRAIN_END;
const TEST_END = Date.parse("2026-06-21T00:00:00Z");
const OUTPUT_DIR = ".scratch/backtests";

function configKey(config: SmcSessionRaidConfig) {
  return JSON.stringify(config);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const datasets = new Map<string, ReturnType<typeof prepareSmcSessionRaidData>>();
  for (const [symbol, path] of Object.entries(FILES)) {
    if (!existsSync(path)) continue;
    const rows = parseLocalCsvKlines(readFileSync(path, "utf8"));
    datasets.set(symbol, prepareSmcSessionRaidData(rows));
    console.log(`${symbol}: ${rows.length} one-minute rows`);
  }

  const configs: SmcSessionRaidConfig[] = [];
  for (const session of ["london", "new_york"] as const) {
    for (const liquiditySource of ["asian", "previous_day", "either"] as const) {
      for (const entryModel of ["fvg", "order_block", "either"] as const) {
        for (const rewardR of [2, 3] as const) {
          for (const swingStrength of [2, 3] as const) {
            for (const displacementAtrMultiple of [0.8, 1] as const) {
              for (const biasFilter of ["none", "premium_discount"] as const) {
                for (const minRaidAtrMultiple of [0.05, 0.1] as const) {
                  configs.push({
                    session,
                    liquiditySource,
                    entryModel,
                    rewardR,
                    swingStrength,
                    displacementAtrMultiple,
                    biasFilter,
                    minRaidAtrMultiple,
                    entryExpiryBars: 12,
                    minRiskPips: 5,
                    stopBufferAtrMultiple: 0.05,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  const training = [];
  for (const config of configs) {
    const details = [];
    for (const [symbol, data] of datasets) {
      const trades = runSmcSessionRaidBacktest(
        symbol,
        data,
        config,
        TRAIN_START,
        TRAIN_END
      );
      const firstHalf = trades.filter((trade) => trade.entryTime < TRAIN_MIDDLE);
      const secondHalf = trades.filter((trade) => trade.entryTime >= TRAIN_MIDDLE);
      details.push({
        symbol,
        metrics: smcMetrics(trades, symbol),
        firstHalf: smcMetrics(firstHalf, symbol),
        secondHalf: smcMetrics(secondHalf, symbol),
      });
    }
    const active = details.filter((row) => row.metrics.trades >= 12);
    const robust = active.filter(
      (row) =>
        row.firstHalf.trades >= 5 &&
        row.secondHalf.trades >= 5 &&
        row.firstHalf.netProfit > 0 &&
        row.secondHalf.netProfit > 0
    ).length;
    const positive = active.filter(
      (row) => row.metrics.netProfit > 0 && row.metrics.profitFactor > 1
    ).length;
    const averageReturn = active.length
      ? active.reduce((sum, row) => sum + row.metrics.returnPct, 0) / active.length
      : -999;
    const minimumReturn = active.length
      ? Math.min(...active.map((row) => row.metrics.returnPct))
      : -999;
    const worstDrawdown = active.length
      ? Math.min(...active.map((row) => row.metrics.maxDrawdownPct))
      : -999;
    const totalTrades = active.reduce((sum, row) => sum + row.metrics.trades, 0);
    const score =
      robust * 160 +
      positive * 80 +
      minimumReturn * 4 +
      averageReturn * 2 +
      worstDrawdown * 3 +
      Math.min(40, totalTrades / 4);
    training.push({
      config,
      score,
      robustAssets: robust,
      positiveAssets: positive,
      activeAssets: active.length,
      averageReturn,
      minimumReturn,
      worstDrawdown,
      totalTrades,
      details,
    });
  }
  training.sort((left, right) => right.score - left.score);
  const selected = training[0];

  const universalTests = [];
  for (const [symbol, data] of datasets) {
    const trades = runSmcSessionRaidBacktest(
      symbol,
      data,
      selected.config,
      TEST_START,
      TEST_END
    );
    universalTests.push({
      symbol,
      metrics: smcMetrics(trades, symbol),
      executionCosts: [0, 0.5, 1].map((costPips) => ({
        costPips,
        ...smcMetrics(trades, symbol, costPips),
      })),
      trades,
    });
  }

  const assetTests = [];
  const assetCandidateStability = [];
  for (const [symbol, data] of datasets) {
    const candidates = training
      .map((row) => ({
        config: row.config,
        detail: row.details.find((detail) => detail.symbol === symbol)!,
      }))
      .filter(
        ({ detail }) =>
          detail.firstHalf.trades >= 5 &&
          detail.secondHalf.trades >= 5 &&
          detail.firstHalf.netProfit > 0 &&
          detail.secondHalf.netProfit > 0 &&
          detail.metrics.maxDrawdownPct >= -10
      )
      .sort((left, right) => {
        const leftScore =
          Math.min(left.detail.firstHalf.returnPct, left.detail.secondHalf.returnPct) * 8 +
          left.detail.metrics.returnPct * 2 +
          left.detail.metrics.profitFactor * 10 +
          left.detail.metrics.maxDrawdownPct * 3 -
          left.detail.metrics.maxLossStreak * 2;
        const rightScore =
          Math.min(right.detail.firstHalf.returnPct, right.detail.secondHalf.returnPct) * 8 +
          right.detail.metrics.returnPct * 2 +
          right.detail.metrics.profitFactor * 10 +
          right.detail.metrics.maxDrawdownPct * 3 -
          right.detail.metrics.maxLossStreak * 2;
        return rightScore - leftScore;
      });
    const chosen = candidates[0];
    if (!chosen) continue;
    const stability = candidates.slice(0, 10).map((candidate, rank) => {
      const candidateTrades = runSmcSessionRaidBacktest(
        symbol,
        data,
        candidate.config,
        TEST_START,
        TEST_END
      );
      return {
        rank: rank + 1,
        config: candidate.config,
        training: candidate.detail.metrics,
        test2026: smcMetrics(candidateTrades, symbol),
      };
    });
    assetCandidateStability.push({ symbol, candidates: stability });
    const trades = runSmcSessionRaidBacktest(
      symbol,
      data,
      chosen.config,
      TEST_START,
      TEST_END
    );
    assetTests.push({
      symbol,
      config: chosen.config,
      training: chosen.detail,
      test2026: smcMetrics(trades, symbol),
      executionCosts: [0, 0.5, 1].map((costPips) => ({
        costPips,
        ...smcMetrics(trades, symbol, costPips),
      })),
      trades,
    });
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    name: "SMC Session Raid + Shift + FVG/OB Entry",
    assumptions: {
      context:
        "Optional H1 premium/discount filter from the previous 20 fully closed H1 candles.",
      liquidity:
        "Asian 00:00-07:00 UTC high/low, previous-day high/low, or the first eligible source.",
      raid:
        "M5 wick through liquidity, close back inside, minimum 0.05 or 0.10 H1 ATR(14).",
      shift:
        "M5 close through the latest confirmed 2/3-bar swing with directional body >= 0.8/1.0 M5 ATR(14).",
      entry:
        "First M5 retest of strict three-candle FVG or last opposite M5 order block; entry at next M5 open.",
      stop: "Beyond the raid extreme plus 0.05 M5 ATR(14), minimum five pips.",
      target: "Fixed 2R or 3R.",
      execution:
        "M1 TP/SL resolution, same-minute ambiguity assigned to SL, time exit at session trade cutoff.",
      risk: "1% current equity, maximum one trade per pair per day.",
    },
    selectedUniversalTrainingConfiguration: selected,
    topTrainingConfigurations: training.slice(0, 20),
    universalTests2026: universalTests,
    robustAssetTests2026: assetTests,
    assetCandidateStability,
  };
  writeFileSync(
    `${OUTPUT_DIR}/smc_session_raid_research.json`,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  const headers = [
    "selection",
    "symbol",
    "trades",
    "win_rate",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown_pct",
    "max_loss_streak",
    "config",
  ];
  const rows = [
    ...universalTests.map((row) => [
      "universal_test_2026",
      row.symbol,
      row.metrics.trades,
      row.metrics.winRate,
      row.metrics.returnPct,
      row.metrics.profitFactor,
      row.metrics.expectancyR,
      row.metrics.maxDrawdownPct,
      row.metrics.maxLossStreak,
      configKey(selected.config),
    ]),
    ...assetTests.map((row) => [
      "asset_specific_test_2026",
      row.symbol,
      row.test2026.trades,
      row.test2026.winRate,
      row.test2026.returnPct,
      row.test2026.profitFactor,
      row.test2026.expectancyR,
      row.test2026.maxDrawdownPct,
      row.test2026.maxLossStreak,
      configKey(row.config),
    ]),
  ];
  writeFileSync(
    `${OUTPUT_DIR}/smc_session_raid_summary.csv`,
    [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        selectedUniversal: {
          config: selected.config,
          training: selected.details,
        },
        universalTests2026: universalTests.map((row) => ({
          symbol: row.symbol,
          ...row.metrics,
        })),
        assetTests2026: assetTests.map((row) => ({
          symbol: row.symbol,
          config: row.config,
          training: row.training.metrics,
          test2026: row.test2026,
          executionCosts: row.executionCosts,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
