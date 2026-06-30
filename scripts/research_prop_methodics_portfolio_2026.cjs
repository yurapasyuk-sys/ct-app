const fs = require("node:fs");
const path = require("node:path");

const INPUT = path.resolve("public/exports/methodics_ohlcv_strategy_results.json");
const PRE2026_INPUT = path.resolve(
  ".scratch/backtests/methodics_2025/methodics_ohlcv_strategy_results.json"
);
const OUT_DIR = path.resolve(".scratch/backtests");
const INITIAL = 10_000;
const DAY = 86_400_000;
const DAILY_STOP_PCT = -3;
const TOTAL_STOP_PCT = -10;
const RISK_LEVELS = [0.25, 0.5, 0.75, 1];
const MAX_CONCURRENT_RISK_LEVELS = [1, 1.5, 2, 2.5];
const MONTE_CARLO_RUNS = 5_000;

const COST_PIPS = {
  EURUSD: 1.2,
  GBPUSD: 1.6,
  USDJPY: 1.4,
  AUDUSD: 1.4,
};

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
}

function candidateId(trade) {
  return `${trade.strategy} | ${trade.symbol}`;
}

function combinations(values, maxSize) {
  const result = [];
  function visit(start, selected) {
    if (selected.length) result.push([...selected]);
    if (selected.length >= maxSize) return;
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return result;
}

function normalizeTrade(trade) {
  const costR = (COST_PIPS[trade.symbol] ?? 1.5) / Math.max(5, trade.riskPips);
  return {
    id: candidateId(trade),
    strategy: trade.strategy,
    symbol: trade.symbol,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    grossR: trade.rMultiple,
    netR: trade.rMultiple - costR,
    result: trade.result,
  };
}

function simulate(trades, riskPct, maxConcurrentRiskPct, start, end) {
  const selected = trades
    .filter((trade) => trade.entryTime >= start && trade.entryTime < end)
    .sort((left, right) => left.entryTime - right.entryTime || left.exitTime - right.exitTime);
  const events = [];
  selected.forEach((trade, index) => {
    events.push({ time: trade.entryTime, type: "entry", index, trade });
    events.push({ time: trade.exitTime, type: "exit", index, trade });
  });
  events.sort((left, right) => {
    if (left.time !== right.time) return left.time - right.time;
    if (left.index === right.index) return left.type === "entry" ? -1 : 1;
    if (left.type !== right.type) return left.type === "exit" ? -1 : 1;
    return left.index - right.index;
  });

  let equity = INITIAL;
  let peak = INITIAL;
  let maxDrawdownPct = 0;
  let currentDay = null;
  let dayOpenEquity = INITIAL;
  let dailyRealized = 0;
  let worstDayPct = 0;
  let skippedDaily = 0;
  let skippedConcurrent = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  const open = new Map();
  const completed = [];
  const dailyProfit = new Map();

  for (const event of events) {
    const day = dayStart(event.time);
    if (day !== currentDay) {
      currentDay = day;
      dayOpenEquity = equity;
      dailyRealized = 0;
    }

    if (event.type === "entry") {
      const dailyPct = dayOpenEquity ? (dailyRealized / dayOpenEquity) * 100 : 0;
      if (dailyPct <= DAILY_STOP_PCT) {
        skippedDaily += 1;
        continue;
      }
      const openRisk = [...open.values()].reduce((sum, item) => sum + item.riskPct, 0);
      if (openRisk + riskPct > maxConcurrentRiskPct + 1e-9) {
        skippedConcurrent += 1;
        continue;
      }
      open.set(event.index, {
        riskPct,
        riskAmount: equity * (riskPct / 100),
      });
      continue;
    }

    const position = open.get(event.index);
    if (!position) continue;
    open.delete(event.index);
    const profit = position.riskAmount * event.trade.netR;
    equity += profit;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((equity - peak) / peak) * 100);
    dailyRealized += profit;
    dailyProfit.set(day, (dailyProfit.get(day) ?? 0) + profit);
    const dailyPct = dayOpenEquity ? (dailyRealized / dayOpenEquity) * 100 : 0;
    worstDayPct = Math.min(worstDayPct, dailyPct);

    if (profit > 0) {
      winners += 1;
      grossProfit += profit;
      lossStreak = 0;
    } else {
      grossLoss += Math.abs(profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
    completed.push({ ...event.trade, profit });
  }

  const dailyReturnsPct = [];
  let dailyEquity = INITIAL;
  for (let day = dayStart(start); day < end; day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const profit = dailyProfit.get(day) ?? 0;
    dailyReturnsPct.push(dailyEquity ? (profit / dailyEquity) * 100 : 0);
    dailyEquity += profit;
  }

  const netProfit = equity - INITIAL;
  const returnPct = (netProfit / INITIAL) * 100;
  return {
    trades: completed,
    tradeCount: completed.length,
    returnPct,
    netProfit,
    finalEquity: equity,
    winRate: completed.length ? (winners / completed.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    expectancyR: completed.length
      ? completed.reduce((sum, trade) => sum + trade.netR, 0) / completed.length
      : 0,
    maxDrawdownPct,
    worstDayPct,
    maxLossStreak,
    recoveryFactor: Math.abs(maxDrawdownPct) ? returnPct / Math.abs(maxDrawdownPct) : 0,
    skippedDaily,
    skippedConcurrent,
    dailyReturnsPct,
  };
}

function phaseAttempt(dailyReturns, startIndex, targetPct, maxDays) {
  let equity = 100;
  let peak = 100;
  for (let offset = 0; offset < maxDays; offset += 1) {
    const dailyReturn = dailyReturns[startIndex + offset] ?? 0;
    if (dailyReturn <= DAILY_STOP_PCT) {
      return { passed: false, safe: false, days: offset + 1, reason: "daily_limit" };
    }
    equity *= 1 + dailyReturn / 100;
    peak = Math.max(peak, equity);
    if ((equity / 100 - 1) * 100 <= TOTAL_STOP_PCT) {
      return { passed: false, safe: false, days: offset + 1, reason: "total_limit" };
    }
    if (equity >= 100 + targetPct) {
      return { passed: true, safe: true, days: offset + 1, reason: "target" };
    }
  }
  return { passed: false, safe: true, days: maxDays, reason: "timeout" };
}

function historicalChallengeStarts(dailyReturns) {
  const starts = [];
  for (let start = 0; start < dailyReturns.length; start += 5) {
    const phase1 = phaseAttempt(dailyReturns, start, 8, 60);
    if (!phase1.passed) {
      starts.push({ start, passed: false, safe: phase1.safe, days: phase1.days, phase1, phase2: null });
      continue;
    }
    const phase2 = phaseAttempt(dailyReturns, start + phase1.days, 4, 40);
    starts.push({
      start,
      passed: phase2.passed,
      safe: phase1.safe && phase2.safe,
      days: phase1.days + phase2.days,
      phase1,
      phase2,
    });
  }
  return {
    attempts: starts.length,
    passed: starts.filter((item) => item.passed).length,
    passRate: starts.length ? (starts.filter((item) => item.passed).length / starts.length) * 100 : 0,
    safeRate: starts.length ? (starts.filter((item) => item.safe).length / starts.length) * 100 : 0,
    details: starts,
  };
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrap(source, random, length, blockSize = 5) {
  const result = [];
  while (result.length < length) {
    const start = Math.floor(random() * Math.max(1, source.length - blockSize + 1));
    for (let offset = 0; offset < blockSize && result.length < length; offset += 1) {
      result.push(source[(start + offset) % source.length]);
    }
  }
  return result;
}

function monteCarlo(dailyReturns, runs = MONTE_CARLO_RUNS) {
  const random = mulberry32(20260621);
  let passed = 0;
  let safe = 0;
  let phase1Passed = 0;
  const completionDays = [];
  const drawdowns = [];

  for (let run = 0; run < runs; run += 1) {
    const path = bootstrap(dailyReturns, random, 120);
    let equity = 100;
    let peak = 100;
    let worstDrawdown = 0;
    let pathSafe = true;
    for (const dailyReturn of path) {
      if (dailyReturn <= DAILY_STOP_PCT) pathSafe = false;
      equity *= 1 + dailyReturn / 100;
      peak = Math.max(peak, equity);
      worstDrawdown = Math.min(worstDrawdown, ((equity - peak) / peak) * 100);
      if (equity <= 90) pathSafe = false;
    }
    if (pathSafe) safe += 1;
    drawdowns.push(worstDrawdown);

    const phase1 = phaseAttempt(path, 0, 8, 60);
    if (!phase1.passed) continue;
    phase1Passed += 1;
    const phase2 = phaseAttempt(path, phase1.days, 4, 40);
    if (phase2.passed) {
      passed += 1;
      completionDays.push(phase1.days + phase2.days);
    }
  }

  completionDays.sort((left, right) => left - right);
  drawdowns.sort((left, right) => left - right);
  return {
    simulations: runs,
    cpp: (passed / runs) * 100,
    phase1Probability: (phase1Passed / runs) * 100,
    rulesSafetyProbability: (safe / runs) * 100,
    medianCompletionDays: completionDays.length
      ? completionDays[Math.floor(completionDays.length / 2)]
      : null,
    p90CompletionDays: completionDays.length
      ? completionDays[Math.min(completionDays.length - 1, Math.floor(completionDays.length * 0.9))]
      : null,
    worstDrawdownP95: drawdowns[Math.floor(drawdowns.length * 0.05)] ?? 0,
  };
}

function compact(metrics) {
  const { trades, dailyReturnsPct, ...rest } = metrics;
  return rest;
}

function approvalStatus(candidate) {
  if (
    candidate.monteCarlo.cpp >= 60 &&
    candidate.monteCarlo.rulesSafetyProbability >= 95 &&
    candidate.metrics.maxDrawdownPct >= -8 &&
    candidate.metrics.worstDayPct >= DAILY_STOP_PCT
  ) {
    return "APPROVED";
  }
  if (
    candidate.monteCarlo.cpp >= 40 &&
    candidate.monteCarlo.rulesSafetyProbability >= 95 &&
    candidate.metrics.maxDrawdownPct >= -10
  ) {
    return "REVIEW REQUIRED";
  }
  return "REJECTED";
}

function score(metrics, historical) {
  if (metrics.tradeCount < 20 || metrics.maxDrawdownPct < -10 || metrics.worstDayPct < -3.1) {
    return -Infinity;
  }
  return (
    historical.passRate * 4 +
    metrics.returnPct * 3 +
    metrics.recoveryFactor * 8 +
    metrics.profitFactor * 5 +
    metrics.expectancyR * 20 +
    metrics.maxDrawdownPct * 2 +
    metrics.worstDayPct * 2
  );
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function monthWindows(start, end) {
  const windows = [];
  let cursor = new Date(start);
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  while (cursor.getTime() < end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    windows.push({
      month: cursor.toISOString().slice(0, 7),
      start: Math.max(start, cursor.getTime()),
      end: Math.min(end, next.getTime()),
    });
    cursor = next;
  }
  return windows;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const input = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const pre2026Input = fs.existsSync(PRE2026_INPUT)
    ? JSON.parse(fs.readFileSync(PRE2026_INPUT, "utf8"))
    : null;
  const start = Date.parse(input.period.start);
  const end = Math.min(Date.parse(input.period.end), Date.parse("2026-06-16T00:00:00Z"));
  const trades = input.trades.map(normalizeTrade);
  const pre2026Start = pre2026Input ? Date.parse(pre2026Input.period.start) : null;
  const pre2026End = pre2026Input ? Date.parse(pre2026Input.period.end) : null;
  const pre2026ById = new Map();
  for (const trade of pre2026Input ? pre2026Input.trades.map(normalizeTrade) : []) {
    const bucket = pre2026ById.get(trade.id) ?? [];
    bucket.push(trade);
    pre2026ById.set(trade.id, bucket);
  }
  const grouped = new Map();
  for (const trade of trades) {
    const bucket = grouped.get(trade.id) ?? [];
    bucket.push(trade);
    grouped.set(trade.id, bucket);
  }

  const candidates = [...grouped.entries()]
    .map(([id, rows]) => {
      const base = simulate(rows, 1, 1, start, end);
      return { id, trades: rows, base };
    })
    .filter(
      (candidate) =>
        candidate.base.tradeCount >= 12 &&
        candidate.base.expectancyR > 0.03 &&
        candidate.base.profitFactor > 1.05
    )
    .sort((left, right) => right.base.recoveryFactor - left.base.recoveryFactor)
    .slice(0, 12);

  console.log(`Candidate pool: ${candidates.length}`);
  const portfolios = combinations(candidates, 5);
  console.log(`Portfolio subsets: ${portfolios.length}`);
  const deterministic = [];

  for (const portfolio of portfolios) {
    const portfolioTrades = portfolio.flatMap((candidate) => candidate.trades);
    const portfolioPre2026Trades = portfolio.flatMap(
      (candidate) => pre2026ById.get(candidate.id) ?? []
    );
    for (const riskPct of RISK_LEVELS) {
      for (const maxConcurrentRiskPct of MAX_CONCURRENT_RISK_LEVELS) {
        if (maxConcurrentRiskPct < riskPct) continue;
        const metrics = simulate(portfolioTrades, riskPct, maxConcurrentRiskPct, start, end);
        const historical = historicalChallengeStarts(metrics.dailyReturnsPct);
        const priorMetrics =
          pre2026Start != null && pre2026End != null
            ? simulate(
                portfolioPre2026Trades,
                riskPct,
                maxConcurrentRiskPct,
                pre2026Start,
                pre2026End
              )
            : null;
        const priorHistorical = priorMetrics
          ? historicalChallengeStarts(priorMetrics.dailyReturnsPct)
          : null;
        const currentScore = score(metrics, historical);
        const priorScore = priorMetrics && priorHistorical ? score(priorMetrics, priorHistorical) : 0;
        const rankingScore =
          Number.isFinite(currentScore) && Number.isFinite(priorScore)
            ? currentScore + priorScore + Math.min(metrics.returnPct, priorMetrics.returnPct) * 5
            : -Infinity;
        if (!Number.isFinite(rankingScore)) continue;
        deterministic.push({
          ids: portfolio.map((candidate) => candidate.id),
          trades: portfolioTrades,
          riskPct,
          maxConcurrentRiskPct,
          metrics,
          historical,
          priorMetrics,
          priorHistorical,
          score: rankingScore,
        });
      }
    }
  }

  deterministic.sort((left, right) => right.score - left.score);
  const finalists = deterministic.slice(0, 120).map((candidate) => {
    const mc = monteCarlo(candidate.metrics.dailyReturnsPct);
    const priorMonteCarlo = candidate.priorMetrics
      ? monteCarlo(candidate.priorMetrics.dailyReturnsPct)
      : null;
    const months = monthWindows(start, end).map((window) => ({
      month: window.month,
      ...compact(
        simulate(candidate.trades, candidate.riskPct, candidate.maxConcurrentRiskPct, window.start, window.end)
      ),
    }));
    return {
      ...candidate,
      monteCarlo: mc,
      priorMonteCarlo,
      months,
      finalScore:
        Math.min(mc.cpp, priorMonteCarlo?.cpp ?? 0) * 12 +
        mc.cpp * 3 +
        (priorMonteCarlo?.cpp ?? 0) * 3 +
        mc.rulesSafetyProbability * 2 +
        (priorMonteCarlo?.rulesSafetyProbability ?? 0) * 2 +
        candidate.historical.passRate * 3 +
        candidate.metrics.recoveryFactor * 5 +
        candidate.metrics.maxDrawdownPct,
    };
  });

  function robustVerdict(candidate) {
    const current = approvalStatus(candidate);
    if (!candidate.priorMetrics || !candidate.priorMonteCarlo) return "REVIEW REQUIRED";
    const priorApproved =
      candidate.priorMetrics.tradeCount >= 100 &&
      candidate.priorMetrics.profitFactor >= 1 &&
      candidate.priorMetrics.maxDrawdownPct >= -8 &&
      candidate.priorMetrics.worstDayPct >= DAILY_STOP_PCT &&
      candidate.priorMonteCarlo.cpp >= 60 &&
      candidate.priorMonteCarlo.rulesSafetyProbability >= 95;
    if (current === "APPROVED" && priorApproved) return "APPROVED";
    if (
      current !== "REJECTED" &&
      candidate.priorMetrics.maxDrawdownPct >= -10 &&
      candidate.priorMonteCarlo.rulesSafetyProbability >= 90
    ) {
      return "REVIEW REQUIRED";
    }
    return "REJECTED";
  }

  const verdictRank = { APPROVED: 3, "REVIEW REQUIRED": 2, REJECTED: 1 };
  finalists.sort((left, right) => {
    const verdictDifference =
      verdictRank[robustVerdict(right)] - verdictRank[robustVerdict(left)];
    if (verdictDifference) return verdictDifference;
    return (
      Math.min(right.monteCarlo.cpp, right.priorMonteCarlo?.cpp ?? 0) -
        Math.min(left.monteCarlo.cpp, left.priorMonteCarlo?.cpp ?? 0) ||
      right.monteCarlo.rulesSafetyProbability - left.monteCarlo.rulesSafetyProbability ||
      right.metrics.recoveryFactor - left.metrics.recoveryFactor ||
      right.finalScore - left.finalScore
    );
  });
  const best = finalists[0];

  const output = {
    generatedAt: new Date().toISOString(),
    period: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    disclosure:
      "2026 data was explicitly allowed for strategy selection. Results are research/in-sample with monthly robustness checks, not an untouched final OOS estimate.",
    rules: {
      phase1TargetPct: 8,
      phase1MaxTradingDays: 60,
      phase2TargetPct: 4,
      phase2MaxTradingDays: 40,
      dailyStopPct: DAILY_STOP_PCT,
      totalStopPct: TOTAL_STOP_PCT,
      riskLevelsPct: RISK_LEVELS,
      maxConcurrentRiskLevelsPct: MAX_CONCURRENT_RISK_LEVELS,
      executionCostPips: COST_PIPS,
      monteCarloRuns: MONTE_CARLO_RUNS,
    },
    candidatePool: candidates.map((candidate) => ({
      id: candidate.id,
      metricsAtOnePercent: compact(candidate.base),
    })),
    portfoliosTested: deterministic.length,
    finalists: finalists.slice(0, 20).map((candidate) => ({
      ids: candidate.ids,
      riskPct: candidate.riskPct,
      maxConcurrentRiskPct: candidate.maxConcurrentRiskPct,
      metrics: compact(candidate.metrics),
      historical: candidate.historical,
      monteCarlo: candidate.monteCarlo,
      pre2026: candidate.priorMetrics
        ? {
            period: {
              start: new Date(pre2026Start).toISOString(),
              end: new Date(pre2026End).toISOString(),
            },
            metrics: compact(candidate.priorMetrics),
            historical: candidate.priorHistorical,
            monteCarlo: candidate.priorMonteCarlo,
          }
        : null,
      months: candidate.months,
      finalScore: candidate.finalScore,
    })),
    selected: best
      ? {
          ids: best.ids,
          riskPct: best.riskPct,
          maxConcurrentRiskPct: best.maxConcurrentRiskPct,
          metrics: compact(best.metrics),
          historical: best.historical,
          monteCarlo: best.monteCarlo,
          months: best.months,
          pre2026Validation: best.priorMetrics
            ? {
                period: {
                  start: new Date(pre2026Start).toISOString(),
                  end: new Date(pre2026End).toISOString(),
                },
                metrics: compact(best.priorMetrics),
                historical: best.priorHistorical,
                monteCarlo: best.priorMonteCarlo,
              }
            : null,
          verdict: robustVerdict(best),
        }
      : null,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "prop_methodics_portfolio_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );

  const rows = finalists.slice(0, 20).map((candidate) => [
    candidate.ids.join(" + "),
    candidate.riskPct,
    candidate.maxConcurrentRiskPct,
    candidate.metrics.tradeCount,
    candidate.metrics.returnPct,
    candidate.metrics.profitFactor,
    candidate.metrics.expectancyR,
    candidate.metrics.maxDrawdownPct,
    candidate.metrics.worstDayPct,
    candidate.historical.passRate,
    candidate.monteCarlo.cpp,
    candidate.monteCarlo.rulesSafetyProbability,
    candidate.monteCarlo.medianCompletionDays,
  ]);
  const headers = [
    "portfolio",
    "risk_pct",
    "max_concurrent_risk_pct",
    "trades",
    "return_pct",
    "profit_factor",
    "expectancy_r",
    "max_drawdown_pct",
    "worst_day_pct",
    "historical_pass_rate",
    "cpp",
    "rules_safety_probability",
    "median_completion_days",
  ];
  fs.writeFileSync(
    path.join(OUT_DIR, "prop_methodics_portfolio_2026_summary.csv"),
    [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8"
  );

  console.table(
    finalists.slice(0, 10).map((candidate) => ({
      strategies: candidate.ids.length,
      risk: candidate.riskPct,
      maxRisk: candidate.maxConcurrentRiskPct,
      trades: candidate.metrics.tradeCount,
      returnPct: candidate.metrics.returnPct.toFixed(2),
      pf: candidate.metrics.profitFactor.toFixed(2),
      dd: candidate.metrics.maxDrawdownPct.toFixed(2),
      worstDay: candidate.metrics.worstDayPct.toFixed(2),
      historicalPass: candidate.historical.passRate.toFixed(1),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      safety: candidate.monteCarlo.rulesSafetyProbability.toFixed(1),
    }))
  );
  console.log(best ? JSON.stringify(output.selected, null, 2) : "No finalist");
}

main();
