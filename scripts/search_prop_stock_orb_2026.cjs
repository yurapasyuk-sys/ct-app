const https = require("node:https");

const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const INITIAL = 10_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const SYMBOLS = [
  "NVDA",
  "TSLA",
  "AMD",
  "META",
  "MSFT",
  "AAPL",
  "GOOGL",
  "AMZN",
  "NFLX",
  "COIN",
  "MSTR",
  "PLTR",
  "SMCI",
  "AVGO",
  "ARM",
  "QQQ",
  "SPY",
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

function parseYahoo(payload) {
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
      return { openTime: timestamp * 1000, open, high, low, close, volume };
    })
    .filter(Boolean)
    .sort((left, right) => left.openTime - right.openTime);
}

async function fetch1h(symbol) {
  const period1 = Math.floor((START - 260 * DAY) / 1000);
  const period2 = Math.floor(END / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1}&period2=${period2}&interval=60m&includePrePost=false`;
  return parseYahoo(await getJson(url));
}

function dayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
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

function windowReturn(trades, start, days) {
  const end = start + days * DAY;
  let equity = INITIAL;
  let peak = INITIAL;
  let maxDrawdown = 0;
  let count = 0;
  for (const trade of trades) {
    if (trade.entry < start || trade.entry >= end) continue;
    count += 1;
    equity += trade.profit;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  return { count, returnPct: (equity / INITIAL - 1) * 100, maxDrawdownPct: (maxDrawdown / INITIAL) * 100 };
}

function rollingWindows(trades, days) {
  const rows = [];
  for (let start = START; start + days * DAY <= END; start += 7 * DAY) {
    rows.push({ start, ...windowReturn(trades, start, days) });
  }
  rows.sort((left, right) => left.returnPct - right.returnPct);
  return {
    worst: rows[0] ?? null,
    best: rows[rows.length - 1] ?? null,
  };
}

function runStockOrb(symbol, rows, config) {
  const atrValues = atr(rows, config.atrPeriod);
  const emaValues = ema(rows, config.emaPeriod);
  const byDay = new Map();
  for (const row of rows) {
    const key = dayKey(row.openTime);
    const bucket = byDay.get(key) ?? [];
    bucket.push(row);
    byDay.set(key, bucket);
  }
  const indexByTime = new Map(rows.map((row, index) => [row.openTime, index]));
  const trades = [];
  let equity = INITIAL;
  for (const bars of byDay.values()) {
    if (bars.length < 4) continue;
    const first = bars[0];
    if (first.openTime < START || first.openTime >= END) continue;
    const globalIndex = indexByTime.get(first.openTime);
    if (globalIndex == null || globalIndex < config.emaPeriod) continue;
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
          !position.breakEven &&
          ((position.direction === "long" && signal.high >= position.entry + position.riskDistance * config.breakEvenAtR) ||
            (position.direction === "short" && signal.low <= position.entry - position.riskDistance * config.breakEvenAtR))
        ) {
          position.stopLoss = position.entry;
          position.breakEven = true;
        }
        const stopHit = position.direction === "long" ? signal.low <= position.stopLoss : signal.high >= position.stopLoss;
        const targetHit =
          position.direction === "long" ? signal.high >= position.takeProfit : signal.low <= position.takeProfit;
        const endExit = index === bars.length - 1;
        if (stopHit || targetHit || endExit) {
          const exit = stopHit ? position.stopLoss : targetHit ? position.takeProfit : signal.close;
          const profit =
            position.direction === "long"
              ? (exit - position.entry) * position.quantity
              : (position.entry - exit) * position.quantity;
          trades.push({ entry: position.entryTime, exit: signal.openTime, direction: position.direction, profit, r: profit / position.riskAmount });
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
      const stopByRange = direction === "long" ? rangeLow : rangeHigh;
      const stopByAtr = direction === "long" ? entry - atrValue * config.stopAtr : entry + atrValue * config.stopAtr;
      const stopLoss =
        direction === "long" ? Math.max(stopByRange, stopByAtr) : Math.min(stopByRange, stopByAtr);
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
        quantity: riskAmount / riskDistance,
        breakEven: false,
      };
    }
  }
  return { tradeList: trades, ...metrics(trades) };
}

function configs() {
  const result = [];
  for (const openingBars of [1, 2]) {
    for (const direction of ["all", "long", "short"]) {
      for (const stopAtr of [0.35, 0.5, 0.75, 1]) {
        for (const rewardR of [1.5, 2, 2.5, 3]) {
          for (const breakEvenAtR of [0, 0.8, 1]) {
            for (const minRangeAtr of [0.2, 0.35]) {
              for (const maxRangeAtr of [1.2, 1.8, 2.5]) {
                result.push({
                  openingBars,
                  direction,
                  stopAtr,
                  rewardR,
                  breakEvenAtR,
                  minRangeAtr,
                  maxRangeAtr,
                  maxRiskAtr: 1.5,
                  atrPeriod: 14,
                  emaPeriod: 100,
                });
              }
            }
          }
        }
      }
    }
  }
  return result;
}

async function main() {
  const passing = [];
  const near = [];
  for (const symbol of SYMBOLS) {
    try {
      console.log(`fetching ${symbol}`);
      const rows = await fetch1h(symbol);
      for (const config of configs()) {
        const result = runStockOrb(symbol, rows, config);
        const row = { symbol, ...config, ...result };
        if (
          result.trades >= 6 &&
          result.returnPct >= 10 &&
          result.maxDrawdownPct >= -8 &&
          result.maxDailyLossPct >= -4 &&
          result.maxLossStreak <= 4 &&
          result.profitFactor >= 1.2
        ) {
          near.push(row);
        }
        if (
          result.trades >= 6 &&
          result.returnPct >= 20 &&
          result.maxDrawdownPct >= -8 &&
          result.maxDailyLossPct >= -4 &&
          result.maxLossStreak <= 4 &&
          result.profitFactor >= 1.5
        ) {
        row.roll60 = rollingWindows(result.tradeList, 60);
        row.roll90 = rollingWindows(result.tradeList, 90);
        passing.push(row);
      }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.warn(`${symbol}: ${error.message}`);
    }
  }
  passing.sort(
    (left, right) =>
      right.returnPct +
      right.profitFactor * 4 +
      right.expectancyR * 12 +
      right.maxDrawdownPct * 1.5 -
      (left.returnPct + left.profitFactor * 4 + left.expectancyR * 12 + left.maxDrawdownPct * 1.5)
  );
  near.sort(
    (left, right) =>
      right.returnPct +
      right.profitFactor * 4 +
      right.expectancyR * 12 +
      right.maxDrawdownPct * 1.5 -
      (left.returnPct + left.profitFactor * 4 + left.expectancyR * 12 + left.maxDrawdownPct * 1.5)
  );
  console.log(`PASS ${passing.length}`);
  console.table(
    passing.slice(0, 50).map((row) => ({
      symbol: row.symbol,
      ret: row.returnPct.toFixed(2),
      dd: row.maxDrawdownPct.toFixed(2),
      daily: row.maxDailyLossPct.toFixed(2),
      trades: row.trades,
      wr: row.winRate.toFixed(1),
      pf: row.profitFactor.toFixed(2),
      exR: row.expectancyR.toFixed(2),
      ls: row.maxLossStreak,
      bars: row.openingBars,
      dir: row.direction,
      stop: row.stopAtr,
      r: row.rewardR,
      be: row.breakEvenAtR,
      minR: row.minRangeAtr,
      maxR: row.maxRangeAtr,
    }))
  );
  console.log("NEAR");
  console.table(
    near.slice(0, 30).map((row) => ({
      symbol: row.symbol,
      ret: row.returnPct.toFixed(2),
      dd: row.maxDrawdownPct.toFixed(2),
      daily: row.maxDailyLossPct.toFixed(2),
      trades: row.trades,
      wr: row.winRate.toFixed(1),
      pf: row.profitFactor.toFixed(2),
      exR: row.expectancyR.toFixed(2),
      ls: row.maxLossStreak,
      bars: row.openingBars,
      dir: row.direction,
      stop: row.stopAtr,
      r: row.rewardR,
      be: row.breakEvenAtR,
      minR: row.minRangeAtr,
      maxR: row.maxRangeAtr,
    }))
  );
  console.log(JSON.stringify(passing[0] ?? null, null, 2));
  if (passing[0]) {
    console.table(
      passing[0].tradeList.map((trade, index) => ({
        n: index + 1,
        entry: new Date(trade.entry).toISOString(),
        exit: new Date(trade.exit).toISOString(),
        dir: trade.direction,
        r: trade.r.toFixed(2),
        profit: trade.profit.toFixed(2),
      }))
    );
  }
}

main();
