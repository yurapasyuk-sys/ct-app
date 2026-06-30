import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Kline } from "../src/lib/binance";
import { fetchKlinesMultiBatch } from "../src/lib/binance";
import {
  runFxDonchianBacktest,
  runUniversalBbAtrBacktest,
  type NativeBacktestReport,
  type NativeBacktestTrade,
} from "../src/lib/data-handlers";
import { aggregateKlines, parseLocalCsvKlines } from "../src/lib/data-handlers/local-csv-market-data";

type Timeframe = "1h" | "4h";

interface StrategyRun {
  group: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  report: NativeBacktestReport;
}

interface AuditRow {
  group: string;
  strategy_id: string;
  strategy_name: string;
  symbol: string;
  timeframe: Timeframe;
  trades: number;
  win_rate: number;
  net_profit: number;
  return_pct: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown_pct: number;
  max_loss_streak: number;
  max_loss_streak_r: number;
  max_loss_streak_start: string;
  max_loss_streak_end: string;
  max_stop_streak: number;
  max_stop_streak_r: number;
  max_stop_streak_start: string;
  max_stop_streak_end: string;
  worst_5_trade_r: number;
  worst_10_trade_r: number;
  worst_day: string;
  worst_day_trades: number;
  worst_day_losses: number;
  worst_day_r: number;
  prop_risk_for_5pct_daily_cap: number;
  prop_risk_for_10pct_total_cap: number;
  verdict: string;
}

const DATA_DIR = "public/data/forex";
const OUT_DIR = "public/exports";
const INITIAL_CAPITAL = 10_000;
const START = Date.parse("2026-01-01T00:00:00.000Z");
const END = Date.parse("2026-06-17T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const LOCAL_FILES: Record<string, string> = {
  AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
  EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
  GER40: "GER40_1m_2024-01-01_2026-06-15.csv",
};

function iso(time: number) {
  return new Date(time).toISOString();
}

function dayKey(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(path: string, rows: unknown[][]) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function loadLocal1m(symbol: string) {
  const file = LOCAL_FILES[symbol];
  if (!file) throw new Error(`No local CSV configured for ${symbol}`);
  const path = `${DATA_DIR}/${file}`;
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  return parseLocalCsvKlines(readFileSync(path, "utf8"));
}

function filterRows(rows: Kline[], start: number, end: number) {
  return rows.filter((row) => row.openTime >= start && row.openTime < end);
}

async function remoteYahoo1h(symbol: string, warmupDays: number) {
  return fetchKlinesMultiBatch(
    {
      symbol,
      interval: "1h",
      startTime: START - warmupDays * ONE_DAY_MS,
      endTime: END,
      dataSource: "yahoo-fx",
    },
    Math.ceil((END - (START - warmupDays * ONE_DAY_MS)) / (60 * 60 * 1000)) + 10
  );
}

function maxConsecutive(
  trades: NativeBacktestTrade[],
  predicate: (trade: NativeBacktestTrade) => boolean
) {
  let currentCount = 0;
  let currentR = 0;
  let currentStart = 0;
  let currentEnd = 0;
  let bestCount = 0;
  let bestR = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (const trade of trades) {
    if (predicate(trade)) {
      if (currentCount === 0) currentStart = trade.exit_time;
      currentCount += 1;
      currentR += trade.r_multiple;
      currentEnd = trade.exit_time;
      if (currentCount > bestCount || (currentCount === bestCount && currentR < bestR)) {
        bestCount = currentCount;
        bestR = currentR;
        bestStart = currentStart;
        bestEnd = currentEnd;
      }
    } else {
      currentCount = 0;
      currentR = 0;
      currentStart = 0;
      currentEnd = 0;
    }
  }

  return { count: bestCount, r: bestR, start: bestStart, end: bestEnd };
}

function worstRollingR(trades: NativeBacktestTrade[], window: number) {
  if (trades.length < window) return trades.reduce((sum, trade) => sum + trade.r_multiple, 0);
  let worst = Infinity;
  for (let index = 0; index <= trades.length - window; index += 1) {
    const sum = trades.slice(index, index + window).reduce((total, trade) => total + trade.r_multiple, 0);
    worst = Math.min(worst, sum);
  }
  return Number.isFinite(worst) ? worst : 0;
}

function worstDay(trades: NativeBacktestTrade[]) {
  const days = new Map<string, { trades: number; losses: number; r: number }>();
  for (const trade of trades) {
    const key = dayKey(trade.exit_time);
    const row = days.get(key) ?? { trades: 0, losses: 0, r: 0 };
    row.trades += 1;
    row.losses += trade.r_multiple < 0 ? 1 : 0;
    row.r += trade.r_multiple;
    days.set(key, row);
  }

  return [...days.entries()].sort((a, b) => a[1].r - b[1].r)[0] ?? ["-", { trades: 0, losses: 0, r: 0 }];
}

function verdict(row: Pick<AuditRow, "max_stop_streak" | "worst_day_r" | "max_drawdown_pct" | "profit_factor" | "trades">) {
  if (row.trades < 10) return "замало угод для prop-висновку";
  if (row.max_stop_streak >= 8 || row.worst_day_r <= -8 || row.max_drawdown_pct <= -25) return "непридатна для prop без жорстких лімітів";
  if (row.max_stop_streak >= 5 || row.worst_day_r <= -5 || row.max_drawdown_pct <= -15) return "ризикована для prop, потрібен circuit breaker і <=0.5% risk";
  if (row.max_stop_streak >= 3 || row.worst_day_r <= -3) return "умовно придатна, краще <=0.5% risk";
  if (row.profit_factor > 1.2) return "prop-friendly за серіями";
  return "серії нормальні, але edge слабкий";
}

function audit(run: StrategyRun): AuditRow {
  const trades = [...run.report.trades].sort((a, b) => a.exit_time - b.exit_time);
  const lossStreak = maxConsecutive(trades, (trade) => trade.r_multiple < 0);
  const stopStreak = maxConsecutive(trades, (trade) => trade.result_status === "stop_loss");
  const [worstDayKey, worstDayStats] = worstDay(trades);
  const maxDrawdownPct = (run.report.metrics.max_drawdown / INITIAL_CAPITAL) * 100;
  const dailyCapR = worstDayStats.r < 0 ? 5 / Math.abs(worstDayStats.r) : 1;
  const totalCapR = maxDrawdownPct < 0 ? 10 / Math.abs(maxDrawdownPct) : 1;
  const row: AuditRow = {
    group: run.group,
    strategy_id: run.strategyId,
    strategy_name: run.strategyName,
    symbol: run.symbol,
    timeframe: run.timeframe,
    trades: run.report.metrics.total_trades,
    win_rate: run.report.metrics.win_rate,
    net_profit: run.report.metrics.net_profit,
    return_pct: (run.report.metrics.net_profit / INITIAL_CAPITAL) * 100,
    profit_factor: run.report.metrics.profit_factor,
    expectancy_r: run.report.metrics.expectancy_r,
    max_drawdown_pct: maxDrawdownPct,
    max_loss_streak: lossStreak.count,
    max_loss_streak_r: lossStreak.r,
    max_loss_streak_start: lossStreak.start ? iso(lossStreak.start) : "",
    max_loss_streak_end: lossStreak.end ? iso(lossStreak.end) : "",
    max_stop_streak: stopStreak.count,
    max_stop_streak_r: stopStreak.r,
    max_stop_streak_start: stopStreak.start ? iso(stopStreak.start) : "",
    max_stop_streak_end: stopStreak.end ? iso(stopStreak.end) : "",
    worst_5_trade_r: worstRollingR(trades, 5),
    worst_10_trade_r: worstRollingR(trades, 10),
    worst_day: worstDayKey,
    worst_day_trades: worstDayStats.trades,
    worst_day_losses: worstDayStats.losses,
    worst_day_r: worstDayStats.r,
    prop_risk_for_5pct_daily_cap: Math.min(1, dailyCapR),
    prop_risk_for_10pct_total_cap: Math.min(1, totalCapR),
    verdict: "",
  };
  row.verdict = verdict(row);
  return row;
}

function runUniversalForex(symbol: string, rows1m: Kline[]) {
  const rows4h = aggregateKlines(filterRows(rows1m, START - 120 * ONE_DAY_MS, END), "4h");
  return runUniversalBbAtrBacktest({
    klines4h: rows4h,
    config: {
      symbol,
      requestedExchange: "FOREX",
      marketType: "spot forex",
      marketDataProvider: "WORKSPACE_CSV_1M",
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
      tradeStartTime: START,
      tradeEndTime: END,
    },
  });
}

function runAudusd(rows1m: Kline[]) {
  const rows1h = aggregateKlines(filterRows(rows1m, START - 180 * ONE_DAY_MS, END), "1h");
  return runUniversalBbAtrBacktest({
    klines4h: rows1h,
    config: {
      symbol: "AUDUSD",
      requestedExchange: "FOREX",
      marketType: "spot forex",
      marketDataProvider: "WORKSPACE_CSV_1M",
      initialCapital: INITIAL_CAPITAL,
      riskPerTradePercent: 1,
      rewardRMultiple: 0,
      includePlanB: false,
      bbPeriod: 100,
      bandDeviation: 1.75,
      atrPeriod: 14,
      atrMultiplier: 0.75,
      maxHoldBars: 24,
      directionMode: "long_only",
      emaPeriod: 200,
      emaFilter: "countertrend",
      exitTarget: "opposite_band",
      setupVariant: "audusd_bb_atr_long_reversion_2026",
      strategyName: "AUDUSD BB/ATR Long Reversion 2026",
      strategyVersion: "research.2026-ytd.audusd-bb100-dev1_75-atr0_75-hold24-long-countertrend-opposite-1h.1",
      tradeStartTime: START,
      tradeEndTime: END,
    },
  });
}

function runGer40(rows1m: Kline[]) {
  const rows1h = aggregateKlines(filterRows(rows1m, START - 180 * ONE_DAY_MS, END), "1h");
  return runUniversalBbAtrBacktest({
    klines4h: rows1h,
    config: {
      symbol: "GER40",
      requestedExchange: "FOREX",
      marketType: "index CFD",
      marketDataProvider: "WORKSPACE_CSV_1M",
      initialCapital: INITIAL_CAPITAL,
      riskPerTradePercent: 1,
      rewardRMultiple: 0,
      includePlanB: false,
      bbPeriod: 80,
      bandDeviation: 2.25,
      atrPeriod: 14,
      atrMultiplier: 1.25,
      maxHoldBars: 72,
      directionMode: "short_only",
      emaPeriod: 200,
      emaFilter: "none",
      exitTarget: "opposite_band",
      setupVariant: "ger40_bb_atr_short_reversion_2026",
      strategyName: "GER40 BB/ATR Short Reversion 2026",
      strategyVersion: "research.2026-ytd.ger40-bb80-dev2_25-atr1_25-hold72-short-opposite-1h.1",
      tradeStartTime: START,
      tradeEndTime: END,
    },
  });
}

async function runFxUniversalLong(symbol: string) {
  const rows1h = await remoteYahoo1h(symbol, 220);
  const rows4h = aggregateKlines(rows1h, "4h");
  return runUniversalBbAtrBacktest({
    klines4h: rows4h,
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
      bandDeviation: 1.5,
      atrPeriod: 14,
      atrMultiplier: 0.5,
      maxHoldBars: 48,
      directionMode: "long_only",
      emaPeriod: 0,
      emaFilter: "none",
      exitTarget: "opposite_band",
      setupVariant: "fx_universal_long_bb_atr_2026",
      strategyName: "FX Universal Long BB/ATR 2026",
      strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
      tradeStartTime: START,
      tradeEndTime: END,
    },
  });
}

async function runFxShortPullback(symbol: string) {
  const rows1h = await remoteYahoo1h(symbol, 180);
  return runUniversalBbAtrBacktest({
    klines4h: rows1h,
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
      tradeStartTime: START,
      tradeEndTime: END,
    },
  });
}

function runAdaptive(symbol: string, rows1m: Kline[]) {
  const rows = aggregateKlines(filterRows(rows1m, START - 180 * ONE_DAY_MS, END), symbol === "AUDUSD" ? "4h" : "1h");
  const base = {
    symbol,
    requestedExchange: "FOREX",
    marketType: symbol === "GER40" ? "index CFD" : "spot forex",
    marketDataProvider: "WORKSPACE_CSV_1M",
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePercent: 1,
    rewardRMultiple: 0,
    includePlanB: false,
    tradeStartTime: START,
    tradeEndTime: END,
  };

  if (symbol === "EURUSD") {
    return runFxDonchianBacktest({
      klines4h: rows,
      config: {
        ...base,
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

  const params = {
    AUDUSD: [20, 2, 2, 6, "long_only", "none", "opposite_band"],
    GBPUSD: [80, 1.5, 1, 96, "short_only", "none", "mean"],
    USDJPY: [40, 2, 1, 96, "long_only", "none", "opposite_band"],
    GER40: [80, 2, 1, 96, "short_only", "none", "opposite_band"],
  }[symbol] as [number, number, number, number, "long_only" | "short_only", "none", "mean" | "opposite_band"];

  return runUniversalBbAtrBacktest({
    klines4h: rows,
    config: {
      ...base,
      bbPeriod: params[0],
      bandDeviation: params[1],
      atrPeriod: 14,
      atrMultiplier: params[2],
      maxHoldBars: params[3],
      directionMode: params[4],
      emaPeriod: 200,
      emaFilter: params[5],
      exitTarget: params[6],
      setupVariant: "research_2026_bb_atr_adaptive",
      strategyName: `Research 2026 ${symbol} BB/ATR Adaptive`,
      strategyVersion: `research.2026-ytd.${symbol.toLowerCase()}.adaptive.prop-audit`,
    },
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const localRows = new Map<string, Kline[]>();
  for (const symbol of Object.keys(LOCAL_FILES)) {
    localRows.set(symbol, loadLocal1m(symbol));
  }

  const runs: StrategyRun[] = [];

  for (const symbol of ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY"]) {
    const report = runUniversalForex(symbol, localRows.get(symbol)!);
    runs.push({ group: "active_backtest", strategyId: "universal_forex_bb_atr_mean_reversion_2026", strategyName: report.metadata.strategy_name, symbol, timeframe: "4h", report });
  }

  {
    const report = runAudusd(localRows.get("AUDUSD")!);
    runs.push({ group: "active_backtest", strategyId: "audusd_bb_atr_long_reversion_2026", strategyName: report.metadata.strategy_name, symbol: "AUDUSD", timeframe: "1h", report });
  }

  {
    const report = runGer40(localRows.get("GER40")!);
    runs.push({ group: "active_backtest", strategyId: "ger40_bb_atr_short_reversion_2026", strategyName: report.metadata.strategy_name, symbol: "GER40", timeframe: "1h", report });
  }

  for (const symbol of ["AUDUSD", "EURUSD", "GBPUSD", "USDJPY", "GER40"]) {
    const report = runAdaptive(symbol, localRows.get(symbol)!);
    runs.push({ group: "research_pack", strategyId: "research_2026_adaptive_pack", strategyName: report.metadata.strategy_name, symbol, timeframe: symbol === "AUDUSD" ? "4h" : "1h", report });
  }

  for (const symbol of ["EURJPY", "CHFJPY", "USDJPY", "GBPJPY"]) {
    try {
      const report = await runFxUniversalLong(symbol);
      runs.push({ group: "signal_profiles", strategyId: "fx_universal_long_bb_atr_2026", strategyName: report.metadata.strategy_name, symbol, timeframe: "4h", report });
    } catch (error) {
      console.warn(`${symbol} fx_universal_long failed:`, error instanceof Error ? error.message : error);
    }
  }

  for (const symbol of ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "CHFJPY"]) {
    try {
      const report = await runFxShortPullback(symbol);
      runs.push({ group: "active_backtest", strategyId: "fx_short_pullback_bb_atr_2026", strategyName: report.metadata.strategy_name, symbol, timeframe: "1h", report });
    } catch (error) {
      console.warn(`${symbol} fx_short_pullback failed:`, error instanceof Error ? error.message : error);
    }
  }

  const rows = runs.map(audit).sort((a, b) => {
    if (b.max_stop_streak !== a.max_stop_streak) return b.max_stop_streak - a.max_stop_streak;
    return a.worst_day_r - b.worst_day_r;
  });

  const headers = [
    "group",
    "strategy_id",
    "strategy_name",
    "symbol",
    "timeframe",
    "trades",
    "win_rate",
    "net_profit",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown_pct",
    "max_loss_streak",
    "max_loss_streak_r",
    "max_loss_streak_start",
    "max_loss_streak_end",
    "max_stop_streak",
    "max_stop_streak_r",
    "max_stop_streak_start",
    "max_stop_streak_end",
    "worst_5_trade_r",
    "worst_10_trade_r",
    "worst_day",
    "worst_day_trades",
    "worst_day_losses",
    "worst_day_r",
    "prop_risk_for_5pct_daily_cap",
    "prop_risk_for_10pct_total_cap",
    "verdict",
  ];

  writeCsv(`${OUT_DIR}/forex_prop_loss_streak_audit.csv`, [
    headers,
    ...rows.map((row) => headers.map((key) => row[key as keyof AuditRow])),
  ]);
  writeFileSync(
    `${OUT_DIR}/forex_prop_loss_streak_audit.json`,
    JSON.stringify(
      {
        generated_at: iso(Date.now()),
        period: { start: iso(START), end: iso(END) },
        risk_note: "risk columns are percent equity per setup needed to keep worst historical daily/total streak within common 5% daily / 10% total prop caps",
        rows,
      },
      null,
      2
    ),
    "utf8"
  );

  console.table(
    rows.slice(0, 30).map((row) => ({
      strategy: row.strategy_id,
      symbol: row.symbol,
      trades: row.trades,
      ret: `${row.return_pct.toFixed(1)}%`,
      pf: Number.isFinite(row.profit_factor) ? row.profit_factor.toFixed(2) : "Inf",
      maxSL: row.max_stop_streak,
      maxLoss: row.max_loss_streak,
      worstDayR: row.worst_day_r.toFixed(2),
      riskDaily: `${row.prop_risk_for_5pct_daily_cap.toFixed(2)}%`,
      verdict: row.verdict,
    }))
  );

  console.log(`${OUT_DIR}/forex_prop_loss_streak_audit.csv`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
