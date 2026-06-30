const https = require("node:https");
const fs = require("node:fs");

const HOLDOUT_MODE = process.env.HOLDOUT_MODE === "1";
const START = Date.parse("2025-01-01T00:00:00Z");
const TEST_START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const INITIAL = 10_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const ASSETS = [
  ["EURUSD", "EURUSD=X", "forex"],
  ["GBPUSD", "GBPUSD=X", "forex"],
  ["USDJPY", "USDJPY=X", "forex"],
  ["USDCHF", "USDCHF=X", "forex"],
  ["USDCAD", "USDCAD=X", "forex"],
  ["AUDUSD", "AUDUSD=X", "forex"],
  ["NZDUSD", "NZDUSD=X", "forex"],
  ["EURJPY", "EURJPY=X", "forex"],
  ["GBPJPY", "GBPJPY=X", "forex"],
  ["EURGBP", "EURGBP=X", "forex"],
  ["XAUUSD", "GC=F", "metal"],
  ["XAGUSD", "SI=F", "metal"],
  ["US100", "NQ=F", "index"],
  ["US30", "YM=F", "index"],
  ["SPX500", "ES=F", "index"],
  ["GER40", "^GDAXI", "index"],
  ["UK100", "^FTSE", "index"],
  ["FRA40", "^FCHI", "index"],
  ["JP225", "^N225", "index"],
  ["WTI", "CL=F", "energy"],
  ["BRENT", "BZ=F", "energy"],
];

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 160)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function parseYahoo(payload, intervalMs) {
  const error = payload.chart?.error;
  if (error) throw new Error(error.description || error.code);
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];
  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      const volume = quote.volume?.[index] ?? 0;
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      return { openTime, open, high, low, close, volume, closeTime: openTime + intervalMs - 1 };
    })
    .filter(Boolean)
    .sort((left, right) => left.openTime - right.openTime);
}

async function fetchYahoo(symbol, interval) {
  const intervalMs = interval === "4h" ? 4 * HOUR : HOUR;
  const period1 = Math.floor((START - 120 * DAY) / 1000);
  const period2 = Math.floor(END / 1000);
  const yahooInterval = interval === "4h" ? "4h" : "60m";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1}&period2=${period2}&interval=${yahooInterval}&includePrePost=true`;
  return parseYahoo(await getJson(url), intervalMs);
}

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
}

function trueRange(current, previous) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atr(rows, period) {
  const values = Array(rows.length).fill(null);
  let sum = 0;
  for (let index = 1; index < rows.length; index += 1) {
    sum += trueRange(rows[index], rows[index - 1]);
    if (index > period) sum -= trueRange(rows[index - period], rows[index - period - 1]);
    if (index >= period) values[index] = sum / period;
  }
  return values;
}

function ema(rows, period) {
  const values = Array(rows.length).fill(null);
  if (rows.length < period) return values;
  const multiplier = 2 / (period + 1);
  let value = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  values[period - 1] = value;
  for (let index = period; index < rows.length; index += 1) {
    value = (rows[index].close - value) * multiplier + value;
    values[index] = value;
  }
  return values;
}

function highest(rows, start, end) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, rows[index].high);
  return value;
}

function lowest(rows, start, end) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, rows[index].low);
  return value;
}

function metrics(trades) {
  let equity = INITIAL;
  let peak = INITIAL;
  let maxDrawdown = 0;
  let maxDailyLoss = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  const dayOpen = new Map();
  for (const trade of trades) {
    const day = dayStart(trade.exit);
    if (!dayOpen.has(day)) dayOpen.set(day, equity);
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
    maxDailyLoss = Math.min(maxDailyLoss, equity - dayOpen.get(day));
    if (trade.profit > 0) {
      winners += 1;
      grossProfit += trade.profit;
      lossStreak = 0;
    } else if (trade.profit < 0) {
      grossLoss += Math.abs(trade.profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }
  return {
    trades: trades.length,
    netProfit: equity - INITIAL,
    returnPct: (equity / INITIAL - 1) * 100,
    winRate: trades.length ? (winners / trades.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    maxDrawdownPct: (maxDrawdown / INITIAL) * 100,
    maxDailyLossPct: (maxDailyLoss / INITIAL) * 100,
    maxLossStreak,
    expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.r, 0) / trades.length : 0,
  };
}

function metricsFromR(trades, start, end, riskPct = 1) {
  let equity = INITIAL;
  let peak = INITIAL;
  let maxDrawdown = 0;
  let maxDailyLoss = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  const dayOpen = new Map();
  const selected = trades
    .filter((trade) => trade.entry >= start && trade.entry < end)
    .sort((left, right) => left.exit - right.exit);
  for (const trade of selected) {
    const day = dayStart(trade.exit);
    if (!dayOpen.has(day)) dayOpen.set(day, equity);
    const profit = equity * (riskPct / 100) * trade.r;
    equity += profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, ((equity - peak) / peak) * 100);
    maxDailyLoss = Math.min(
      maxDailyLoss,
      ((equity - dayOpen.get(day)) / dayOpen.get(day)) * 100
    );
    if (profit > 0) {
      winners += 1;
      grossProfit += profit;
      lossStreak = 0;
    } else if (profit < 0) {
      grossLoss += Math.abs(profit);
      lossStreak += 1;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }
  }
  return {
    trades: selected.length,
    returnPct: (equity / INITIAL - 1) * 100,
    winRate: selected.length ? (winners / selected.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    maxDrawdownPct: maxDrawdown,
    maxDailyLossPct: maxDailyLoss,
    maxLossStreak,
    expectancyR: selected.length
      ? selected.reduce((sum, trade) => sum + trade.r, 0) / selected.length
      : 0,
  };
}

function runBreakout(asset, rows, config) {
  const atrValues = atr(rows, config.atrPeriod);
  const emaValues = ema(rows, config.emaPeriod);
  const trades = [];
  let equity = INITIAL;
  let position = null;
  for (let index = Math.max(config.lookback, config.emaPeriod, config.atrPeriod) + 1; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      if (
        config.breakEvenAtR > 0 &&
        !position.be &&
        ((position.direction === "long" && signal.high >= position.entry + position.riskDistance * config.breakEvenAtR) ||
          (position.direction === "short" && signal.low <= position.entry - position.riskDistance * config.breakEvenAtR))
      ) {
        position.stopLoss = position.entry;
        position.be = true;
      }
      const stopHit = position.direction === "long" ? signal.low <= position.stopLoss : signal.high >= position.stopLoss;
      const targetHit = position.direction === "long" ? signal.high >= position.takeProfit : signal.low <= position.takeProfit;
      const timeExit = index - position.entryIndex >= config.maxHoldBars;
      if (stopHit || targetHit || timeExit) {
        const exit = stopHit ? position.stopLoss : targetHit ? position.takeProfit : next.open;
        const profit =
          position.direction === "long" ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty;
        trades.push({
          entry: position.entryTime,
          exit: next.openTime,
          direction: position.direction,
          entryPrice: position.entry,
          riskDistance: position.riskDistance,
          profit,
          r: profit / position.riskAmount,
        });
        equity += profit;
        position = null;
      }
    }
    if (position || next.openTime < START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    const emaValue = emaValues[index];
    if (!atrValue || !emaValue) continue;
    const high = highest(rows, index - config.lookback, index);
    const low = lowest(rows, index - config.lookback, index);
    const longSignal = signal.close > high && signal.close > emaValue;
    const shortSignal = signal.close < low && signal.close < emaValue;
    let direction = longSignal ? "long" : shortSignal ? "short" : null;
    if (!direction) continue;
    if (config.direction !== "all" && direction !== config.direction) continue;
    const entry = next.open;
    const riskDistance = atrValue * config.stopAtr;
    const riskAmount = equity * 0.01;
    position = {
      direction,
      entry,
      entryTime: next.openTime,
      entryIndex: index + 1,
      stopLoss: direction === "long" ? entry - riskDistance : entry + riskDistance,
      takeProfit: direction === "long" ? entry + riskDistance * config.rewardR : entry - riskDistance * config.rewardR,
      riskDistance,
      riskAmount,
      qty: riskAmount / riskDistance,
      be: false,
    };
  }
  return { asset, strategy: "htf_breakout", config, tradeList: trades, ...metrics(trades) };
}

function runOpeningRange(asset, rows, config) {
  const atrValues = atr(rows, config.atrPeriod);
  const emaValues = ema(rows, config.emaPeriod);
  const byDay = new Map();
  for (const row of rows) {
    const day = dayStart(row.openTime);
    const bucket = byDay.get(day) ?? [];
    bucket.push(row);
    byDay.set(day, bucket);
  }
  const indexByTime = new Map(rows.map((row, index) => [row.openTime, index]));
  const trades = [];
  let equity = INITIAL;
  for (const bars of byDay.values()) {
    if (bars.length <= config.openingBars + 1) continue;
    const first = bars[0];
    if (first.openTime < START || first.openTime >= END) continue;
    const globalIndex = indexByTime.get(first.openTime);
    if (globalIndex == null || globalIndex < Math.max(config.emaPeriod, config.atrPeriod)) continue;
    const atrValue = atrValues[globalIndex];
    const emaValue = emaValues[globalIndex];
    if (!atrValue || !emaValue) continue;
    const rangeHigh = Math.max(...bars.slice(0, config.openingBars).map((bar) => bar.high));
    const rangeLow = Math.min(...bars.slice(0, config.openingBars).map((bar) => bar.low));
    const range = rangeHigh - rangeLow;
    if (range / atrValue < config.minRangeAtr || range / atrValue > config.maxRangeAtr) continue;
    let position = null;
    for (let index = config.openingBars; index < bars.length; index += 1) {
      const signal = bars[index];
      const next = bars[index + 1] ?? signal;
      if (position) {
        if (
          config.breakEvenAtR > 0 &&
          !position.be &&
          ((position.direction === "long" && signal.high >= position.entry + position.riskDistance * config.breakEvenAtR) ||
            (position.direction === "short" && signal.low <= position.entry - position.riskDistance * config.breakEvenAtR))
        ) {
          position.stopLoss = position.entry;
          position.be = true;
        }
        const stopHit = position.direction === "long" ? signal.low <= position.stopLoss : signal.high >= position.stopLoss;
        const targetHit = position.direction === "long" ? signal.high >= position.takeProfit : signal.low <= position.takeProfit;
        const endExit = index === bars.length - 1;
        if (stopHit || targetHit || endExit) {
          const exit = stopHit ? position.stopLoss : targetHit ? position.takeProfit : signal.close;
          const profit =
            position.direction === "long" ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty;
          trades.push({
            entry: position.entryTime,
            exit: signal.openTime,
            direction: position.direction,
            entryPrice: position.entry,
            riskDistance: position.riskDistance,
            profit,
            r: profit / position.riskAmount,
          });
          equity += profit;
          position = null;
          break;
        }
      }
      if (position) continue;
      let direction = null;
      if (signal.close > rangeHigh && first.close > emaValue) direction = "long";
      if (signal.close < rangeLow && first.close < emaValue) direction = "short";
      if (!direction) continue;
      if (config.direction !== "all" && direction !== config.direction) continue;
      const entry = next.open;
      const atrStop = direction === "long" ? entry - atrValue * config.stopAtr : entry + atrValue * config.stopAtr;
      const rangeStop = direction === "long" ? rangeLow : rangeHigh;
      const stopLoss = direction === "long" ? Math.max(atrStop, rangeStop) : Math.min(atrStop, rangeStop);
      const riskDistance = Math.abs(entry - stopLoss);
      if (riskDistance <= 0 || riskDistance / atrValue > config.maxRiskAtr) continue;
      const riskAmount = equity * 0.01;
      position = {
        direction,
        entry,
        entryTime: next.openTime,
        stopLoss,
        takeProfit: direction === "long" ? entry + riskDistance * config.rewardR : entry - riskDistance * config.rewardR,
        riskDistance,
        riskAmount,
        qty: riskAmount / riskDistance,
        be: false,
      };
    }
  }
  return { asset, strategy: "opening_range_breakout", config, tradeList: trades, ...metrics(trades) };
}

function breakoutConfigs() {
  const result = [];
  for (const lookback of [20, 40, 80]) {
    for (const stopAtr of [0.75, 1, 1.5, 2]) {
      for (const rewardR of [1.5, 2, 2.5, 3]) {
        for (const breakEvenAtR of [0, 1]) {
          for (const direction of ["all", "long", "short"]) {
            result.push({ lookback, stopAtr, rewardR, breakEvenAtR, direction, atrPeriod: 14, emaPeriod: 100, maxHoldBars: 24 });
          }
        }
      }
    }
  }
  return result;
}

function orbConfigs() {
  const result = [];
  for (const openingBars of [1, 2]) {
    for (const direction of ["all", "long", "short"]) {
      for (const stopAtr of [0.35, 0.5, 0.75, 1]) {
        for (const rewardR of [1.5, 2, 2.5, 3]) {
          for (const breakEvenAtR of [0, 1]) {
            for (const minRangeAtr of [0.15, 0.3]) {
              for (const maxRangeAtr of [1.5, 2.5]) {
                result.push({ openingBars, direction, stopAtr, rewardR, breakEvenAtR, minRangeAtr, maxRangeAtr, maxRiskAtr: 1.5, atrPeriod: 14, emaPeriod: 100 });
              }
            }
          }
        }
      }
    }
  }
  return result;
}

function rollingReturn(trades, days) {
  const rows = [];
  for (let start = START; start + days * DAY <= END; start += 7 * DAY) {
    const end = start + days * DAY;
    let equity = INITIAL;
    let count = 0;
    for (const trade of trades) {
      if (trade.entry >= start && trade.entry < end) {
        count += 1;
        equity += trade.profit;
      }
    }
    rows.push({ start, count, returnPct: (equity / INITIAL - 1) * 100 });
  }
  rows.sort((a, b) => a.returnPct - b.returnPct);
  return { worst: rows[0] ?? null, best: rows[rows.length - 1] ?? null };
}

async function main() {
  const passing = [];
  const holdoutCandidates = [];
  for (const [asset, yahoo, group] of ASSETS) {
    try {
      console.log(`fetching ${asset} ${yahoo}`);
      const rows1h = await fetchYahoo(yahoo, "1h");
      const rows4h = await fetchYahoo(yahoo, "4h").catch(() => []);
      const candidates = [];
      for (const config of orbConfigs()) candidates.push(runOpeningRange(asset, rows1h, config));
      for (const config of breakoutConfigs()) {
        candidates.push(runBreakout(asset, rows1h, { ...config, timeframe: "1h" }));
        if (rows4h.length) candidates.push(runBreakout(asset, rows4h, { ...config, timeframe: "4h", maxHoldBars: 12 }));
      }
      for (const row of candidates) {
        row.yahoo = yahoo;
        row.group = group;
        if (HOLDOUT_MODE) {
          const training = metricsFromR(row.tradeList, START, TEST_START);
          const test = metricsFromR(row.tradeList, TEST_START, END);
          if (
            training.trades >= 30 &&
            training.returnPct > 0 &&
            training.profitFactor >= 1.2 &&
            training.maxDrawdownPct >= -8 &&
            training.maxDailyLossPct >= -3 &&
            training.maxLossStreak <= 6
          ) {
            holdoutCandidates.push({
              asset,
              yahoo,
              group,
              strategy: row.strategy,
              config: row.config,
              training,
              test,
              tradeList: row.tradeList,
              score:
                training.expectancyR * 30 +
                training.profitFactor * 5 +
                training.returnPct +
                training.maxDrawdownPct * 2,
            });
          }
          continue;
        }
        if (
          row.trades >= 6 &&
          row.returnPct >= 20 &&
          row.maxDrawdownPct >= -8 &&
          row.maxDailyLossPct >= -4 &&
          row.maxLossStreak <= 4 &&
          row.profitFactor >= 1.5
        ) {
          row.roll60 = rollingReturn(row.tradeList, 60);
          row.roll90 = rollingReturn(row.tradeList, 90);
          passing.push(row);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.warn(`${asset}: ${error.message}`);
    }
  }

  if (HOLDOUT_MODE) {
    holdoutCandidates.sort((left, right) => right.score - left.score);
    console.log(`HOLDOUT TRAINING PASS ${holdoutCandidates.length}`);
    console.table(
      holdoutCandidates.slice(0, 50).map((row, index) => ({
        rank: index + 1,
        asset: row.asset,
        group: row.group,
        strategy: row.strategy,
        trainTrades: row.training.trades,
        trainRet: row.training.returnPct.toFixed(2),
        trainPf: row.training.profitFactor.toFixed(2),
        trainDd: row.training.maxDrawdownPct.toFixed(2),
        testTrades: row.test.trades,
        testRet: row.test.returnPct.toFixed(2),
        testPf: row.test.profitFactor.toFixed(2),
        testDd: row.test.maxDrawdownPct.toFixed(2),
        config: JSON.stringify(row.config),
      }))
    );
    if (process.env.HOLDOUT_JSON) {
      fs.writeFileSync(process.env.HOLDOUT_JSON, JSON.stringify(holdoutCandidates, null, 2));
      console.log(`WROTE ${process.env.HOLDOUT_JSON}`);
    }
    console.log(JSON.stringify(holdoutCandidates[0] ?? null, null, 2));
    return;
  }

  passing.sort(
    (left, right) =>
      right.returnPct +
      right.profitFactor * 4 +
      right.expectancyR * 12 +
      right.maxDrawdownPct * 1.5 -
      (left.returnPct + left.profitFactor * 4 + left.expectancyR * 12 + left.maxDrawdownPct * 1.5)
  );
  console.log(`PASS ${passing.length}`);
  console.table(
    passing.slice(0, 40).map((row) => ({
      asset: row.asset,
      group: row.group,
      strategy: row.strategy,
      ret: row.returnPct.toFixed(2),
      dd: row.maxDrawdownPct.toFixed(2),
      daily: row.maxDailyLossPct.toFixed(2),
      trades: row.trades,
      wr: row.winRate.toFixed(1),
      pf: row.profitFactor.toFixed(2),
      exR: row.expectancyR.toFixed(2),
      ls: row.maxLossStreak,
      config: JSON.stringify(row.config),
      best60: row.roll60?.best?.returnPct.toFixed(2),
      best90: row.roll90?.best?.returnPct.toFixed(2),
    }))
  );
  console.log(JSON.stringify(passing[0] ?? null, null, 2));
}

main();
