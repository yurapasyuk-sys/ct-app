const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve("public/data/forex");
const START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-17T00:00:00Z");
const INITIAL = 10_000;
const DAY = 86_400_000;
const MINUTE = 60_000;
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
    if ([openTime, open, high, low, close].every(Number.isFinite)) rows.push({ openTime, open, high, low, close });
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

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
}

function utcHour(timestamp) {
  const date = new Date(timestamp);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
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

function prepare(rows1m) {
  const rows5m = aggregate(rows1m, 5 * MINUTE);
  const rows1h = aggregate(rows1m, HOUR);
  const atr1h = atr(rows1h, 14);
  const hourIndex = new Map(rows1h.map((row, index) => [row.openTime, { row, index }]));
  const days = new Map();
  for (const row of rows5m) {
    if (row.openTime < START - 10 * DAY || row.openTime >= END) continue;
    const day = dayStart(row.openTime);
    const bucket = days.get(day) ?? [];
    bucket.push(row);
    days.set(day, bucket);
  }
  return { atr1h, hourIndex, days };
}

function runRangeFade(symbol, prepared, config) {
  const trades = [];
  let equity = INITIAL;
  for (const [day, bars] of prepared.days) {
    if (day < START || day >= END) continue;
    const asian = bars.filter((bar) => utcHour(bar.openTime) >= 0 && utcHour(bar.openTime) < 7);
    if (asian.length < 60) continue;
    const high = Math.max(...asian.map((bar) => bar.high));
    const low = Math.min(...asian.map((bar) => bar.low));
    const mid = (high + low) / 2;
    const context = prepared.hourIndex.get(day + 6 * HOUR);
    if (!context) continue;
    const atrValue = prepared.atr1h[context.index];
    if (!atrValue) continue;
    const rangeAtr = (high - low) / atrValue;
    if (rangeAtr < config.minRangeAtr || rangeAtr > config.maxRangeAtr) continue;
    let position = null;
    let sweptHigh = false;
    let sweptLow = false;
    let traded = false;
    for (let index = 1; index < bars.length - 1; index += 1) {
      const bar = bars[index];
      const next = bars[index + 1];
      const hour = utcHour(bar.openTime);
      if (hour < config.startHour || hour >= config.endHour) continue;
      if (position) {
        if (
          config.breakEvenAtR > 0 &&
          !position.breakEven &&
          ((position.direction === "long" && bar.high >= position.entry + position.riskDistance * config.breakEvenAtR) ||
            (position.direction === "short" && bar.low <= position.entry - position.riskDistance * config.breakEvenAtR))
        ) {
          position.stopLoss = position.entry;
          position.breakEven = true;
        }
        const stopHit = position.direction === "long" ? bar.low <= position.stopLoss : bar.high >= position.stopLoss;
        const targetHit =
          position.direction === "long" ? bar.high >= position.takeProfit : bar.low <= position.takeProfit;
        const timeExit = bar.openTime >= position.maxExitTime;
        if (stopHit || targetHit || timeExit) {
          const exit = stopHit ? position.stopLoss : targetHit ? position.takeProfit : bar.close;
          const profit =
            position.direction === "long"
              ? (exit - position.entry) * position.quantity
              : (position.entry - exit) * position.quantity;
          trades.push({ entry: position.entryTime, exit: bar.openTime, direction: position.direction, profit, r: profit / position.riskAmount });
          equity += profit;
          position = null;
          traded = true;
          break;
        }
      }
      if (traded || position) continue;
      if (bar.high > high + atrValue * config.sweepAtr) sweptHigh = true;
      if (bar.low < low - atrValue * config.sweepAtr) sweptLow = true;
      let direction = null;
      if (sweptHigh && bar.close < high) direction = "short";
      if (sweptLow && bar.close > low) direction = "long";
      if (!direction) continue;
      if (config.direction !== "all" && config.direction !== direction) continue;
      const entry = next.open;
      const sweepExtreme = direction === "long" ? Math.min(bar.low, low) : Math.max(bar.high, high);
      let stopLoss =
        direction === "long"
          ? Math.min(sweepExtreme, entry - atrValue * config.stopAtr)
          : Math.max(sweepExtreme, entry + atrValue * config.stopAtr);
      const riskDistance = Math.abs(entry - stopLoss);
      if (riskDistance / atrValue > config.maxRiskAtr || riskDistance <= 0) continue;
      const riskAmount = equity * 0.01;
      const rangeTarget = config.target === "mid" ? mid : direction === "long" ? high : low;
      const rTarget = direction === "long" ? entry + riskDistance * config.rewardR : entry - riskDistance * config.rewardR;
      const takeProfit = direction === "long" ? Math.min(rangeTarget, rTarget) : Math.max(rangeTarget, rTarget);
      if ((direction === "long" && takeProfit <= entry) || (direction === "short" && takeProfit >= entry)) continue;
      position = {
        direction,
        entry,
        entryTime: next.openTime,
        stopLoss,
        takeProfit,
        riskDistance,
        riskAmount,
        quantity: riskAmount / riskDistance,
        maxExitTime: next.openTime + config.maxHoldBars * 5 * MINUTE,
        breakEven: false,
      };
    }
  }
  return { trades, ...metrics(trades) };
}

function configs() {
  const result = [];
  for (const startHour of [7, 13]) {
    for (const endHour of startHour === 13 ? [17] : [11]) {
      for (const direction of ["all", "long", "short"]) {
        for (const sweepAtr of [0.03, 0.08]) {
          for (const stopAtr of [0.35, 0.5]) {
            for (const rewardR of [1.5, 2]) {
              for (const breakEvenAtR of [0.8, 1]) {
                for (const minRangeAtr of [0.25]) {
                  for (const maxRangeAtr of [1.8, 2.5]) {
                    for (const target of ["mid", "edge"]) {
                      result.push({
                        startHour,
                        endHour,
                        direction,
                        sweepAtr,
                        stopAtr,
                        rewardR,
                        breakEvenAtR,
                        minRangeAtr,
                        maxRangeAtr,
                        target,
                        maxRiskAtr: 1,
                        maxHoldBars: 48,
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
  for (const file of files) {
    const symbol = file.split("_")[0];
    console.log(`loading ${symbol}`);
    const prepared = prepare(parseCsv(file));
    for (const config of configs()) {
      const result = runRangeFade(symbol, prepared, config);
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
      ret: row.returnPct.toFixed(2),
      dd: row.maxDrawdownPct.toFixed(2),
      daily: row.maxDailyLossPct.toFixed(2),
      trades: row.trades,
      wr: row.winRate.toFixed(1),
      pf: row.profitFactor.toFixed(2),
      exR: row.expectancyR.toFixed(2),
      ls: row.maxLossStreak,
      time: `${row.startHour}-${row.endHour}`,
      dir: row.direction,
      sweep: row.sweepAtr,
      stop: row.stopAtr,
      r: row.rewardR,
      be: row.breakEvenAtR,
      target: row.target,
      minR: row.minRangeAtr,
      maxR: row.maxRangeAtr,
    }))
  );
  console.log(JSON.stringify(passing[0] ?? null, null, 2));
}

main();
