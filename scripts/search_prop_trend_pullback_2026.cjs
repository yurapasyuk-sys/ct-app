const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve("public/data/forex");
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const INITIAL = 10_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseTimestamp(raw) {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(raw) {
  const value = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseCsv(fileName) {
  const lines = fs.readFileSync(path.join(DATA_DIR, fileName), "utf8").split(/\r?\n/).filter(Boolean);
  const delimiter = [",", ";", "\t"].reduce((best, item) =>
    lines[0].split(item).length > lines[0].split(best).length ? item : best
  );
  const headers = parseCsvLine(lines[0], delimiter).map((header) =>
    header.trim().toLowerCase().replace(/\s+/g, "_")
  );
  const column = (names) => headers.findIndex((header) => names.includes(header));
  const timeIndex = column(["time", "timestamp", "date", "datetime", "open_time", "opentime"]);
  const openIndex = column(["open", "o"]);
  const highIndex = column(["high", "h"]);
  const lowIndex = column(["low", "l"]);
  const closeIndex = column(["close", "c"]);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line, delimiter);
    const openTime = parseTimestamp(cells[timeIndex]);
    const open = parseNumber(cells[openIndex]);
    const high = parseNumber(cells[highIndex]);
    const low = parseNumber(cells[lowIndex]);
    const close = parseNumber(cells[closeIndex]);
    if ([openTime, open, high, low, close].every(Number.isFinite)) {
      rows.push({ openTime, open, high, low, close });
    }
  }
  return rows.sort((left, right) => left.openTime - right.openTime);
}

function aggregate(rows, bucketMs) {
  const buckets = new Map();
  for (const row of rows) {
    const key = Math.floor(row.openTime / bucketMs) * bucketMs;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([openTime, bucket]) => ({
      openTime,
      open: bucket[0].open,
      high: Math.max(...bucket.map((row) => row.high)),
      low: Math.min(...bucket.map((row) => row.low)),
      close: bucket[bucket.length - 1].close,
    }));
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

function rsi(rows, period) {
  const values = Array(rows.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  values[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let index = period + 1; index < rows.length; index += 1) {
    const change = rows[index].close - rows[index - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    values[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return values;
}

function utcHour(timestamp) {
  return new Date(timestamp).getUTCHours();
}

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
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
      grossProfit += trade.profit;
      winners += 1;
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

function runTrendPullback(symbol, rows, config) {
  const atrValues = atr(rows, 14);
  const fastEma = ema(rows, config.fastEma);
  const slowEma = ema(rows, config.slowEma);
  const rsiValues = rsi(rows, 14);
  const trades = [];
  let equity = INITIAL;
  let position = null;
  const warmup = Math.max(config.fastEma, config.slowEma, 30) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const previous = rows[index - 1];
    const current = rows[index + 1];

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
      const stopHit =
        position.direction === "long" ? signal.low <= position.stopLoss : signal.high >= position.stopLoss;
      const targetHit =
        position.direction === "long" ? signal.high >= position.takeProfit : signal.low <= position.takeProfit;
      const trendExit =
        config.exitOnFastEma &&
        ((position.direction === "long" && signal.close < fastEma[index]) ||
          (position.direction === "short" && signal.close > fastEma[index]));
      const timeExit = index - position.entryIndex >= config.maxHoldBars;
      if (stopHit || targetHit || trendExit || timeExit) {
        const exit = stopHit ? position.stopLoss : targetHit ? position.takeProfit : current.open;
        const profit =
          position.direction === "long"
            ? (exit - position.entry) * position.quantity
            : (position.entry - exit) * position.quantity;
        trades.push({
          entry: position.entryTime,
          exit: current.openTime,
          direction: position.direction,
          profit,
          r: profit / position.riskAmount,
        });
        equity += profit;
        position = null;
      }
    }

    if (position || current.openTime < START || current.openTime >= END) continue;
    const hour = utcHour(signal.openTime);
    if (config.session === "active" && (hour < 7 || hour >= 17)) continue;
    const atrValue = atrValues[index];
    const fast = fastEma[index];
    const slow = slowEma[index];
    const prevFast = fastEma[index - 1];
    const rsiValue = rsiValues[index];
    const prevRsi = rsiValues[index - 1];
    if (!atrValue || !fast || !slow || !prevFast || rsiValue == null || prevRsi == null) continue;

    const slope = fast - prevFast;
    const longTrend = fast > slow && signal.close > slow && slope > atrValue * config.minSlopeAtr;
    const shortTrend = fast < slow && signal.close < slow && slope < -atrValue * config.minSlopeAtr;
    const touchedLong = signal.low <= fast + atrValue * config.touchAtr;
    const touchedShort = signal.high >= fast - atrValue * config.touchAtr;
    const reclaimLong = signal.close > fast && previous.close <= fast;
    const reclaimShort = signal.close < fast && previous.close >= fast;
    const rsiLong = prevRsi <= config.rsiLong && rsiValue > config.rsiLong;
    const rsiShort = prevRsi >= config.rsiShort && rsiValue < config.rsiShort;

    let direction = null;
    if (longTrend && touchedLong && (reclaimLong || rsiLong)) direction = "long";
    if (shortTrend && touchedShort && (reclaimShort || rsiShort)) direction = "short";
    if (!direction) continue;
    if (config.direction !== "all" && direction !== config.direction) continue;

    const entry = current.open;
    const riskDistance = atrValue * config.stopAtr;
    const riskAmount = equity * 0.01;
    position = {
      direction,
      entry,
      entryTime: current.openTime,
      entryIndex: index + 1,
      stopLoss: direction === "long" ? entry - riskDistance : entry + riskDistance,
      takeProfit: direction === "long" ? entry + riskDistance * config.rewardR : entry - riskDistance * config.rewardR,
      quantity: riskAmount / riskDistance,
      riskAmount,
      riskDistance,
      breakEven: false,
    };
  }

  return { trades, ...metrics(trades) };
}

function configs() {
  const result = [];
  for (const timeframe of ["1h", "4h"]) {
    for (const fastEma of [20, 34]) {
      for (const slowEma of [200]) {
        for (const stopAtr of [0.5, 0.75, 1]) {
          for (const rewardR of [2, 2.5, 3]) {
            for (const breakEvenAtR of [0.8, 1]) {
              for (const touchAtr of [0.15, 0.3]) {
                for (const minSlopeAtr of [0, 0.02]) {
                  for (const direction of ["all", "long", "short"]) {
                    for (const session of ["all", "active"]) {
                      result.push({
                        timeframe,
                        fastEma,
                        slowEma,
                        stopAtr,
                        rewardR,
                        breakEvenAtR,
                        touchAtr,
                        minSlopeAtr,
                        direction,
                        session,
                        rsiLong: 50,
                        rsiShort: 50,
                        maxHoldBars: timeframe === "1h" ? 48 : 24,
                        exitOnFastEma: false,
                      });
                    }
                  }
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

function main() {
  const onlySymbols = new Set(
    (process.env.PROP_SYMBOLS ?? "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  );
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith(".csv"))
    .filter((file) => !onlySymbols.size || onlySymbols.has(file.split("_")[0].toUpperCase()));
  const passing = [];
  const allConfigs = configs();
  for (const file of files) {
    const symbol = file.split("_")[0];
    console.log(`loading ${symbol}`);
    const rows1m = parseCsv(file);
    const prepared = {
      "1h": aggregate(rows1m, HOUR),
      "4h": aggregate(rows1m, 4 * HOUR),
    };
    for (const config of allConfigs) {
      const result = runTrendPullback(symbol, prepared[config.timeframe], config);
      const row = { symbol, ...config, ...result };
      if (
        result.trades >= 6 &&
        result.returnPct >= 20 &&
        result.maxDrawdownPct >= -8 &&
        result.maxDailyLossPct >= -4 &&
        result.maxLossStreak <= 4 &&
        result.profitFactor >= 1.5
      ) {
        passing.push(row);
      }
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
  console.log(`PASS ${passing.length}`);
  console.table(
    passing.slice(0, 50).map((row) => ({
      symbol: row.symbol,
      tf: row.timeframe,
      ret: row.returnPct.toFixed(2),
      dd: row.maxDrawdownPct.toFixed(2),
      daily: row.maxDailyLossPct.toFixed(2),
      trades: row.trades,
      wr: row.winRate.toFixed(1),
      pf: row.profitFactor.toFixed(2),
      exR: row.expectancyR.toFixed(2),
      ls: row.maxLossStreak,
      fast: row.fastEma,
      slow: row.slowEma,
      stop: row.stopAtr,
      r: row.rewardR,
      be: row.breakEvenAtR,
      touch: row.touchAtr,
      slope: row.minSlopeAtr,
      dir: row.direction,
      session: row.session,
    }))
  );
  console.log(JSON.stringify(passing[0] ?? null, null, 2));
}

main();
