const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve("public/data/forex");
const OUT_DIR = path.resolve(".scratch/backtests");
const MINUTE = 60_000;
const DAY = 86_400_000;
const INITIAL = 10_000;
const TRAIN_START = Date.parse("2025-01-01T00:00:00Z");
const TRAIN_END = Date.parse("2026-04-01T00:00:00Z");
const TEST_START = TRAIN_END;
const END = Date.parse("2026-06-16T00:00:00Z");
const DAILY_STOP = -3;
const MAX_CONCURRENT_RISK = 2;
const RUNS = 5_000;
const FILES = {
  EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
  USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
};
const COST_PIPS = { EURUSD: 1.2, GBPUSD: 1.6, AUDUSD: 1.4, USDJPY: 1.4 };

function pipSize(symbol) {
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
}

function aggregateFile(filePath, bucketMs) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const buckets = new Map();
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(",");
    if (cells.length < 5) continue;
    const openTime = Date.parse(cells[0]);
    if (openTime < TRAIN_START - 60 * DAY || openTime >= END) continue;
    const open = Number(cells[1]);
    const high = Number(cells[2]);
    const low = Number(cells[3]);
    const close = Number(cells[4]);
    if (![openTime, open, high, low, close].every(Number.isFinite)) continue;
    const time = Math.floor(openTime / bucketMs) * bucketMs;
    const current = buckets.get(time);
    if (!current) buckets.set(time, { openTime: time, open, high, low, close });
    else {
      current.high = Math.max(current.high, high);
      current.low = Math.min(current.low, low);
      current.close = close;
    }
  }
  return [...buckets.values()].sort((left, right) => left.openTime - right.openTime);
}

function trueRange(current, previous) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atr(rows, period = 14) {
  const values = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index], rows[index - 1]);
    if (index > period) sum -= trueRange(rows[index - period], rows[index - period - 1]);
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function hour(timestamp) {
  return new Date(timestamp).getUTCHours();
}

function directionFor(symbol, usdStrength) {
  if (symbol === "USDJPY") return usdStrength > 0 ? "long" : "short";
  return usdStrength > 0 ? "short" : "long";
}

function alignedContribution(symbol, returnValue) {
  return symbol === "USDJPY" ? returnValue : -returnValue;
}

function closeTrade(position, row, exitPrice, reason) {
  const grossR =
    position.direction === "long"
      ? (exitPrice - position.entry) / position.riskDistance
      : (position.entry - exitPrice) / position.riskDistance;
  const costR =
    (COST_PIPS[position.symbol] * pipSize(position.symbol)) / position.riskDistance;
  return {
    symbol: position.symbol,
    family: position.family,
    config: position.config,
    direction: position.direction,
    entryTime: position.entryTime,
    exitTime: row.openTime,
    entryPrice: position.entry,
    exitPrice,
    grossR,
    netR: grossR - costR,
    exitReason: reason,
  };
}

function runStrategy(data, config) {
  const symbols = Object.keys(data);
  const maps = Object.fromEntries(
    symbols.map((symbol) => [symbol, new Map(data[symbol].rows.map((row, index) => [row.openTime, index]))])
  );
  const commonTimes = data.EURUSD.rows
    .map((row) => row.openTime)
    .filter((time) => symbols.every((symbol) => maps[symbol].has(time)));
  const trades = [];
  let position = null;

  for (const time of commonTimes) {
    const indexes = Object.fromEntries(symbols.map((symbol) => [symbol, maps[symbol].get(time)]));
    const referenceIndex = indexes.EURUSD;
    if (referenceIndex < config.lookback + 2) continue;

    if (position) {
      const index = indexes[position.symbol];
      const row = data[position.symbol].rows[index];
      const stopHit =
        position.direction === "long" ? row.low <= position.stop : row.high >= position.stop;
      const targetHit =
        position.direction === "long" ? row.high >= position.target : row.low <= position.target;
      const timeExit = row.openTime >= position.maxExitTime;
      if (stopHit || targetHit || timeExit) {
        const exit = stopHit ? position.stop : targetHit ? position.target : row.close;
        trades.push(
          closeTrade(position, row, exit, stopHit ? "stop" : targetHit ? "target" : "time")
        );
        position = null;
      }
    }
    if (position || time < TRAIN_START || time >= END) continue;
    if (config.activeHours && (hour(time) < 6 || hour(time) >= 18)) continue;

    const contributions = [];
    for (const symbol of symbols) {
      const index = indexes[symbol];
      const rows = data[symbol].rows;
      if (index == null || index < config.lookback + 2 || index >= rows.length - 1) {
        contributions.length = 0;
        break;
      }
      const atrValue = data[symbol].atr[index];
      if (!atrValue) continue;
      const rawReturn = (rows[index].close - rows[index - config.lookback].close) / atrValue;
      contributions.push({
        symbol,
        index,
        value: alignedContribution(symbol, rawReturn),
        atrValue,
      });
    }
    if (contributions.length !== symbols.length) continue;
    const positive = contributions.filter((item) => item.value > 0).length;
    const negative = contributions.filter((item) => item.value < 0).length;
    const usdDirection = positive >= config.minVotes ? 1 : negative >= config.minVotes ? -1 : 0;
    if (!usdDirection) continue;
    const aligned = contributions
      .filter((item) => Math.sign(item.value) === usdDirection)
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
    const factorStrength =
      aligned.reduce((sum, item) => sum + Math.abs(item.value), 0) / aligned.length;
    if (factorStrength < config.minFactorAtr) continue;

    const chosen = aligned[0];
    const rows = data[chosen.symbol].rows;
    const signal = rows[chosen.index];
    const previous = rows[chosen.index - 1];
    const entry = rows[chosen.index + 1];
    if (!entry) continue;
    const direction = directionFor(chosen.symbol, usdDirection);
    let confirmation = false;
    if (config.entryModel === "breakout") {
      const recent = rows.slice(chosen.index - config.confirmLookback, chosen.index);
      const high = Math.max(...recent.map((row) => row.high));
      const low = Math.min(...recent.map((row) => row.low));
      confirmation = direction === "long" ? signal.close > high : signal.close < low;
    } else {
      const pulledBack =
        direction === "long" ? previous.close < previous.open : previous.close > previous.open;
      const resumed = direction === "long" ? signal.close > signal.open : signal.close < signal.open;
      confirmation = pulledBack && resumed;
    }
    if (!confirmation) continue;
    const riskDistance = chosen.atrValue * config.stopAtr;
    position = {
      symbol: chosen.symbol,
      family: "cross_asset_usd_consensus",
      config: JSON.stringify(config),
      direction,
      entryTime: entry.openTime,
      entry: entry.open,
      riskDistance,
      stop: direction === "long" ? entry.open - riskDistance : entry.open + riskDistance,
      target:
        direction === "long"
          ? entry.open + riskDistance * config.rewardR
          : entry.open - riskDistance * config.rewardR,
      maxExitTime: entry.openTime + config.maxHoldBars * config.timeframeMinutes * MINUTE,
    };
  }
  return trades;
}

function simulate(rawTrades, riskPct, start, end, costMultiplier = 1) {
  const trades = rawTrades.filter((trade) => trade.entryTime >= start && trade.entryTime < end);
  let equity = INITIAL;
  let peak = INITIAL;
  let maxDrawdownPct = 0;
  let worstDayPct = 0;
  let currentDay = null;
  let dayOpen = equity;
  let dailyProfit = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  const completed = [];
  const daily = new Map();

  for (const trade of trades.sort((left, right) => left.exitTime - right.exitTime)) {
    const day = dayStart(trade.exitTime);
    if (day !== currentDay) {
      currentDay = day;
      dayOpen = equity;
      dailyProfit = 0;
    }
    if ((dailyProfit / dayOpen) * 100 <= DAILY_STOP) continue;
    const cost = trade.grossR - trade.netR;
    const netR = trade.grossR - cost * costMultiplier;
    const profit = equity * (riskPct / 100) * netR;
    equity += profit;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((equity - peak) / peak) * 100);
    dailyProfit += profit;
    daily.set(day, (daily.get(day) ?? 0) + profit);
    worstDayPct = Math.min(worstDayPct, (dailyProfit / dayOpen) * 100);
    if (profit > 0) {
      grossProfit += profit;
      winners += 1;
      lossStreak = 0;
    } else {
      grossLoss += Math.abs(profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
    completed.push({ ...trade, netR, profit });
  }
  let rolling = INITIAL;
  const dailyReturns = [];
  for (let day = dayStart(start); day < end; day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const profit = daily.get(day) ?? 0;
    dailyReturns.push((profit / rolling) * 100);
    rolling += profit;
  }
  const returnPct = ((equity - INITIAL) / INITIAL) * 100;
  return {
    trades: completed,
    tradeCount: completed.length,
    returnPct,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    expectancyR: completed.length
      ? completed.reduce((sum, trade) => sum + trade.netR, 0) / completed.length
      : 0,
    winRate: completed.length ? (winners / completed.length) * 100 : 0,
    maxDrawdownPct,
    worstDayPct,
    maxLossStreak,
    recoveryFactor: Math.abs(maxDrawdownPct) ? returnPct / Math.abs(maxDrawdownPct) : 0,
    dailyReturns,
  };
}

function compact(metrics) {
  const { trades, dailyReturns, ...rest } = metrics;
  return rest;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrap(source, random, length) {
  const result = [];
  while (result.length < length) {
    const start = Math.floor(random() * Math.max(1, source.length - 4));
    for (let offset = 0; offset < 5 && result.length < length; offset += 1) {
      result.push(source[(start + offset) % source.length]);
    }
  }
  return result;
}

function phase(path, start, target, maxDays) {
  let equity = 100;
  for (let index = 0; index < maxDays; index += 1) {
    const value = path[start + index] ?? 0;
    if (value <= -3) return { passed: false, safe: false, days: index + 1 };
    equity *= 1 + value / 100;
    if (equity <= 90) return { passed: false, safe: false, days: index + 1 };
    if (equity >= 100 + target) return { passed: true, safe: true, days: index + 1 };
  }
  return { passed: false, safe: true, days: maxDays };
}

function monteCarlo(dailyReturns) {
  const random = mulberry32(20260623);
  let passed = 0;
  let safe = 0;
  let phase1Passed = 0;
  const days = [];
  for (let run = 0; run < RUNS; run += 1) {
    const path = bootstrap(dailyReturns.length ? dailyReturns : [0], random, 120);
    const p1 = phase(path, 0, 8, 60);
    if (p1.safe) safe += 1;
    if (!p1.passed) continue;
    phase1Passed += 1;
    const p2 = phase(path, p1.days, 4, 40);
    if (p2.passed) {
      passed += 1;
      days.push(p1.days + p2.days);
    }
  }
  days.sort((left, right) => left - right);
  return {
    simulations: RUNS,
    cpp: (passed / RUNS) * 100,
    phase1Probability: (phase1Passed / RUNS) * 100,
    safety: (safe / RUNS) * 100,
    medianDays: days.length ? days[Math.floor(days.length / 2)] : null,
  };
}

function configs() {
  const result = [];
  for (const timeframeMinutes of [30, 60]) {
    for (const lookback of [12, 24, 48]) {
      for (const minVotes of [3, 4]) {
        for (const minFactorAtr of [0.6, 1, 1.5]) {
          for (const entryModel of ["breakout", "pullback"]) {
            for (const confirmLookback of [4, 8]) {
              for (const stopAtr of [0.75, 1, 1.25]) {
                for (const rewardR of [1.5, 2, 2.5]) {
                  result.push({
                    timeframeMinutes,
                    lookback,
                    minVotes,
                    minFactorAtr,
                    entryModel,
                    confirmLookback,
                    stopAtr,
                    rewardR,
                    maxHoldBars: timeframeMinutes === 30 ? 24 : 16,
                    activeHours: true,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return result;
}

function scoreTraining(metrics, windows) {
  const positive = windows.filter((window) => window.returnPct > 0).length;
  if (
    metrics.tradeCount < 40 ||
    positive < 3 ||
    metrics.profitFactor < 1 ||
    metrics.maxDrawdownPct < -12
  ) {
    return -Infinity;
  }
  return (
    positive * 100 +
    Math.min(...windows.map((window) => window.returnPct)) * 5 +
    metrics.expectancyR * 30 +
    metrics.recoveryFactor * 8 +
    metrics.profitFactor * 5 +
    metrics.maxDrawdownPct * 2
  );
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const allConfigs = configs();
  const datasets = {};
  for (const timeframeMinutes of [30, 60]) {
    const interval = timeframeMinutes * MINUTE;
    datasets[timeframeMinutes] = {};
    for (const [symbol, file] of Object.entries(FILES)) {
      const rows = aggregateFile(path.join(DATA_DIR, file), interval);
      datasets[timeframeMinutes][symbol] = { rows, atr: atr(rows) };
    }
  }

  const trainingWindows = [
    [Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    [Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    [Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    [Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    [Date.parse("2026-01-01T00:00:00Z"), TRAIN_END],
  ];
  let ranked = [];
  for (const config of allConfigs) {
    const trades = runStrategy(datasets[config.timeframeMinutes], config);
    for (const riskPct of [0.25, 0.5, 0.75, 1]) {
      const training = simulate(trades, riskPct, TRAIN_START, TRAIN_END);
      const windows = trainingWindows.map(([start, end]) => simulate(trades, riskPct, start, end));
      const row = {
        config,
        riskPct,
        trades,
        training,
        windows,
        score: scoreTraining(training, windows),
      };
      if (Number.isFinite(row.score)) ranked.push(row);
    }
    if (ranked.length > 120) {
      ranked.sort((left, right) => right.score - left.score);
      ranked = ranked.slice(0, 100);
    }
  }
  ranked.sort((left, right) => right.score - left.score);
  const evaluated = ranked.filter((row) => Number.isFinite(row.score)).slice(0, 30).map((row, index) => {
    const oos = simulate(row.trades, row.riskPct, TEST_START, END);
    const stress = simulate(row.trades, row.riskPct, TEST_START, END, 1.5);
    const mc = monteCarlo(oos.dailyReturns);
    const stressMc = monteCarlo(stress.dailyReturns);
    const passed =
      index === 0 &&
      oos.tradeCount >= 20 &&
      oos.returnPct > 0 &&
      oos.profitFactor >= 1.2 &&
      oos.maxDrawdownPct >= -6 &&
      mc.cpp >= 60 &&
      mc.safety >= 95 &&
      stress.profitFactor >= 1.05 &&
      stress.maxDrawdownPct >= -8 &&
      stressMc.safety >= 95;
    return {
      trainingRank: index + 1,
      config: row.config,
      riskPct: row.riskPct,
      training: compact(row.training),
      trainingWindows: row.windows.map(compact),
      q2Oos: compact(oos),
      monteCarlo: mc,
      costStress1_5x: compact(stress),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    hypothesis: "Cross-asset USD consensus with strongest-instrument execution",
    configsTested: allConfigs.length * 4,
    methodology: {
      training: ["2025-01-01", "2026-03-31"],
      untouchedQ2Test: ["2026-04-01", "2026-06-15"],
      finalCandidateRule: "training rank #1 only",
    },
    evaluated,
    selected: evaluated[0]?.verdict === "APPROVED" ? evaluated[0] : null,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "cross_asset_usd_consensus_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 15).map((row) => ({
      rank: row.trainingRank,
      tf: row.config.timeframeMinutes,
      risk: row.riskPct,
      model: row.config.entryModel,
      trainRet: row.training.returnPct.toFixed(2),
      trainPf: row.training.profitFactor.toFixed(2),
      q2Trades: row.q2Oos.tradeCount,
      q2Ret: row.q2Oos.returnPct.toFixed(2),
      q2Pf: row.q2Oos.profitFactor.toFixed(2),
      q2Dd: row.q2Oos.maxDrawdownPct.toFixed(2),
      cpp: row.monteCarlo.cpp.toFixed(1),
      safety: row.monteCarlo.safety.toFixed(1),
      stressPf: row.costStress1_5x.profitFactor.toFixed(2),
      verdict: row.verdict,
    }))
  );
}

main();
