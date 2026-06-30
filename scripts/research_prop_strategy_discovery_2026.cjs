const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve("public/data/forex");
const OUTPUT_DIR = path.resolve(".scratch/backtests");
const INITIAL_EQUITY = 10_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IS_START = Date.parse("2025-01-01T00:00:00Z");
const IS_MID = Date.parse("2025-07-01T00:00:00Z");
const OOS_START = Date.parse("2026-01-01T00:00:00Z");
const END = Date.parse("2026-06-16T00:00:00Z");
const RISK_LEVELS = [0.25, 0.5, 0.75, 1];
const DAILY_STOP_PCT = -3;
const MAX_CONCURRENT_RISK_PCT = 2;
const MONTE_CARLO_RUNS = Number(process.env.MONTE_CARLO_RUNS ?? 2_000);

const FILES = {
  EURUSD: "EURUSD_1m_2024-01-01_2026-06-12.csv",
  GBPUSD: "GBPUSD_1m_2025-01-01_2026-06-13.csv",
  USDJPY: "USDJPY_1m_2025-01-01_2026-06-13.csv",
  AUDUSD: "AUDUSD_1m_2023-06-15_2026-06-15.csv",
  GER40: "GER40_1m_2024-01-01_2026-06-15.csv",
};

const EXECUTION_COST_PIPS = {
  EURUSD: 1.2,
  GBPUSD: 1.6,
  USDJPY: 1.4,
  AUDUSD: 1.4,
  GER40: 2,
};

function dayStart(timestamp) {
  return Math.floor(timestamp / DAY) * DAY;
}

function utcHour(timestamp) {
  const date = new Date(timestamp);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
}

function pipSize(symbol) {
  if (symbol === "GER40") return 1;
  return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function parseAndAggregate(filePath, intervals) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const bucketsByInterval = new Map(intervals.map((interval) => [interval, new Map()]));

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (cells.length < 5) continue;
    const openTime = Date.parse(cells[0]);
    const open = Number(cells[1]);
    const high = Number(cells[2]);
    const low = Number(cells[3]);
    const close = Number(cells[4]);
    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      openTime < IS_START - 30 * DAY ||
      openTime >= END
    ) {
      continue;
    }

    for (const interval of intervals) {
      const bucketTime = Math.floor(openTime / interval) * interval;
      const buckets = bucketsByInterval.get(interval);
      const current = buckets.get(bucketTime);
      if (!current) {
        buckets.set(bucketTime, { openTime: bucketTime, open, high, low, close });
      } else {
        current.high = Math.max(current.high, high);
        current.low = Math.min(current.low, low);
        current.close = close;
      }
    }
  }

  return Object.fromEntries(
    intervals.map((interval) => [
      interval,
      [...bucketsByInterval.get(interval).values()].sort((left, right) => left.openTime - right.openTime),
    ])
  );
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
    const value = trueRange(rows[index], rows[index - 1]);
    sum += value;
    if (index > period) {
      sum -= trueRange(rows[index - period], rows[index - period - 1]);
    }
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

function rollingHigh(rows, period) {
  const values = Array(rows.length).fill(null);
  for (let index = period; index < rows.length; index += 1) {
    let value = -Infinity;
    for (let cursor = index - period; cursor < index; cursor += 1) {
      value = Math.max(value, rows[cursor].high);
    }
    values[index] = value;
  }
  return values;
}

function rollingLow(rows, period) {
  const values = Array(rows.length).fill(null);
  for (let index = period; index < rows.length; index += 1) {
    let value = Infinity;
    for (let cursor = index - period; cursor < index; cursor += 1) {
      value = Math.min(value, rows[cursor].low);
    }
    values[index] = value;
  }
  return values;
}

function closePosition(position, bar, exitPrice, reason, symbol, family, configId) {
  const grossR =
    position.direction === "long"
      ? (exitPrice - position.entryPrice) / position.riskDistance
      : (position.entryPrice - exitPrice) / position.riskDistance;
  const costPrice = EXECUTION_COST_PIPS[symbol] * pipSize(symbol);
  const netR = grossR - costPrice / position.riskDistance;
  return {
    symbol,
    family,
    configId,
    direction: position.direction,
    entryTime: position.entryTime,
    exitTime: bar.openTime,
    entryPrice: position.entryPrice,
    exitPrice,
    grossR,
    netR,
    exitReason: reason,
  };
}

function managePosition(position, bar, index, config, symbol, family, configId) {
  const stopHit =
    position.direction === "long" ? bar.low <= position.stopLoss : bar.high >= position.stopLoss;
  const targetHit =
    position.direction === "long" ? bar.high >= position.takeProfit : bar.low <= position.takeProfit;
  if (stopHit) {
    return closePosition(position, bar, position.stopLoss, "stop_loss", symbol, family, configId);
  }
  if (targetHit) {
    return closePosition(position, bar, position.takeProfit, "take_profit", symbol, family, configId);
  }
  if (index - position.entryIndex >= config.maxHoldBars) {
    return closePosition(position, bar, bar.close, "time_exit", symbol, family, configId);
  }
  return null;
}

function createPosition(direction, entryBar, index, atrValue, config) {
  const riskDistance = atrValue * config.stopAtr;
  if (!(riskDistance > 0)) return null;
  return {
    direction,
    entryTime: entryBar.openTime,
    entryIndex: index,
    entryPrice: entryBar.open,
    riskDistance,
    stopLoss: direction === "long" ? entryBar.open - riskDistance : entryBar.open + riskDistance,
    takeProfit:
      direction === "long"
        ? entryBar.open + riskDistance * config.rewardR
        : entryBar.open - riskDistance * config.rewardR,
  };
}

function runDonchian(symbol, rows, config) {
  const family = "volatility_expansion";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trendEma = ema(rows, config.emaPeriod);
  const highs = rollingHigh(rows, config.channel);
  const lows = rollingLow(rows, config.channel);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.emaPeriod, config.channel, 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    const emaValue = trendEma[index];
    if (!atrValue || !emaValue || highs[index] == null || lows[index] == null) continue;
    const hour = utcHour(signal.openTime);
    if (config.session === "active" && (hour < 6 || hour >= 18)) continue;
    const longSignal = signal.close > highs[index] && signal.close > emaValue;
    const shortSignal = signal.close < lows[index] && signal.close < emaValue;
    if (longSignal) position = createPosition("long", next, index + 1, atrValue, config);
    if (shortSignal) position = createPosition("short", next, index + 1, atrValue, config);
  }
  return trades;
}

function runTrendPullback(symbol, rows, config) {
  const family = "trend_pullback";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const fast = ema(rows, config.fastEma);
  const slow = ema(rows, config.slowEma);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.fastEma, config.slowEma, 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const previous = rows[index - 1];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    const fastValue = fast[index];
    const slowValue = slow[index];
    if (!atrValue || !fastValue || !slowValue) continue;
    const hour = utcHour(signal.openTime);
    if (config.session === "active" && (hour < 6 || hour >= 18)) continue;
    const longSignal =
      fastValue > slowValue &&
      signal.low <= fastValue + atrValue * config.touchAtr &&
      signal.close > fastValue &&
      previous.close <= fastValue;
    const shortSignal =
      fastValue < slowValue &&
      signal.high >= fastValue - atrValue * config.touchAtr &&
      signal.close < fastValue &&
      previous.close >= fastValue;
    if (longSignal) position = createPosition("long", next, index + 1, atrValue, config);
    if (shortSignal) position = createPosition("short", next, index + 1, atrValue, config);
  }
  return trades;
}

function runSessionBreakout(symbol, rows, config) {
  const family = "session_breakout";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trendEma = ema(rows, config.emaPeriod);
  const trades = [];
  const dayIndexes = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const day = dayStart(rows[index].openTime);
    const indexes = dayIndexes.get(day) ?? [];
    indexes.push(index);
    dayIndexes.set(day, indexes);
  }

  for (const [day, indexes] of dayIndexes) {
    if (day < IS_START || day >= END) continue;
    const rangeIndexes = indexes.filter((index) => {
      const hour = utcHour(rows[index].openTime);
      return hour >= config.rangeStart && hour < config.rangeEnd;
    });
    if (rangeIndexes.length < 2) continue;
    const rangeHigh = Math.max(...rangeIndexes.map((index) => rows[index].high));
    const rangeLow = Math.min(...rangeIndexes.map((index) => rows[index].low));
    const contextIndex = rangeIndexes[rangeIndexes.length - 1];
    const atrValue = atrValues[contextIndex];
    const emaValue = trendEma[contextIndex];
    if (!atrValue || !emaValue) continue;
    const rangeAtr = (rangeHigh - rangeLow) / atrValue;
    if (rangeAtr < config.minRangeAtr || rangeAtr > config.maxRangeAtr) continue;

    let position = null;
    for (const index of indexes) {
      if (index <= contextIndex || index >= rows.length - 1) continue;
      const signal = rows[index];
      const previous = rows[index - 1];
      const next = rows[index + 1];
      const hour = utcHour(signal.openTime);
      if (position) {
        const closed = managePosition(position, signal, index, config, symbol, family, configId);
        if (closed) {
          trades.push(closed);
          position = null;
          break;
        }
      }
      if (position || hour < config.tradeStart || hour >= config.tradeEnd) continue;
      const buffer = atrValue * config.breakBufferAtr;
      const trendLong = signal.close > emaValue;
      const trendShort = signal.close < emaValue;
      const longSignal =
        signal.close > rangeHigh + buffer && previous.close <= rangeHigh + buffer && trendLong;
      const shortSignal =
        signal.close < rangeLow - buffer && previous.close >= rangeLow - buffer && trendShort;
      if (longSignal) position = createPosition("long", next, index + 1, atrValue, config);
      if (shortSignal) position = createPosition("short", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runMultiSessionStateMachine(symbol, rows, config) {
  const family = "multi_session_state_machine";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trendEma = ema(rows, config.trendEma);
  const dayIndexes = new Map();
  const trades = [];
  for (let index = 0; index < rows.length; index += 1) {
    const day = dayStart(rows[index].openTime);
    const indexes = dayIndexes.get(day) ?? [];
    indexes.push(index);
    dayIndexes.set(day, indexes);
  }

  for (const [day, indexes] of dayIndexes) {
    if (day < IS_START || day >= END) continue;
    const asian = indexes.filter((index) => {
      const hour = utcHour(rows[index].openTime);
      return hour >= config.asianStart && hour < config.asianEnd;
    });
    if (asian.length < 4) continue;
    const rangeHigh = Math.max(...asian.map((index) => rows[index].high));
    const rangeLow = Math.min(...asian.map((index) => rows[index].low));
    const contextIndex = asian[asian.length - 1];
    const atrValue = atrValues[contextIndex];
    const emaValue = trendEma[contextIndex];
    const oldEma = trendEma[contextIndex - config.slopeLookback];
    if (!atrValue || emaValue == null || oldEma == null) continue;
    const rangeAtr = (rangeHigh - rangeLow) / atrValue;
    if (rangeAtr < config.minRangeAtr || rangeAtr > config.maxRangeAtr) continue;
    const trendSlope = (emaValue - oldEma) / atrValue;
    const trendLong = rows[contextIndex].close > emaValue && trendSlope >= config.minSlopeAtr;
    const trendShort = rows[contextIndex].close < emaValue && trendSlope <= -config.minSlopeAtr;
    let state = "waiting";
    let triggerIndex = null;
    let direction = null;

    for (const index of indexes) {
      if (index <= contextIndex || index >= rows.length - 1) continue;
      const signal = rows[index];
      const next = rows[index + 1];
      const hour = utcHour(signal.openTime);
      if (hour < config.londonStart || hour >= config.entryEnd) continue;
      const signalAtr = atrValues[index];
      if (!signalAtr) continue;
      const buffer = signalAtr * config.bufferAtr;

      if (state === "waiting") {
        const sweptHigh =
          signal.high > rangeHigh + buffer && signal.close < rangeHigh;
        const sweptLow =
          signal.low < rangeLow - buffer && signal.close > rangeLow;
        const brokeHigh = signal.close > rangeHigh + buffer;
        const brokeLow = signal.close < rangeLow - buffer;
        if (config.entryModel === "sweep_reversal") {
          if (sweptHigh && (config.regimeMode === "all" || trendShort)) {
            direction = "short";
            triggerIndex = index;
            state = "armed";
          } else if (sweptLow && (config.regimeMode === "all" || trendLong)) {
            direction = "long";
            triggerIndex = index;
            state = "armed";
          }
        } else if (brokeHigh && trendLong) {
          direction = "long";
          triggerIndex = index;
          state = "armed";
        } else if (brokeLow && trendShort) {
          direction = "short";
          triggerIndex = index;
          state = "armed";
        }
        continue;
      }

      if (state === "armed" && triggerIndex != null && direction) {
        if (index - triggerIndex > config.confirmBars) break;
        let confirmed = false;
        if (config.entryModel === "sweep_reversal") {
          confirmed =
            direction === "long"
              ? signal.close > rows[triggerIndex].high
              : signal.close < rows[triggerIndex].low;
        } else {
          confirmed =
            direction === "long"
              ? signal.low <= rangeHigh + signalAtr * config.retestAtr &&
                signal.close > rangeHigh
              : signal.high >= rangeLow - signalAtr * config.retestAtr &&
                signal.close < rangeLow;
        }
        if (!confirmed) continue;
        const position = createPosition(
          direction,
          next,
          index + 1,
          signalAtr,
          config
        );
        if (!position) break;
        for (
          let cursor = index + 1;
          cursor < Math.min(rows.length, index + config.maxHoldBars + 2);
          cursor += 1
        ) {
          const closed = managePosition(
            position,
            rows[cursor],
            cursor,
            config,
            symbol,
            family,
            configId
          );
          if (closed) {
            trades.push(closed);
            break;
          }
        }
        break;
      }
    }
  }
  return trades;
}

function buildMultiSessionConfigs() {
  const configs = [];
  for (const entryModel of ["sweep_reversal", "breakout_retest"]) {
    for (const trendEma of [96, 192]) {
      for (const minSlopeAtr of [0, 0.05, 0.1]) {
        for (const minRangeAtr of [0.5, 0.8]) {
          for (const maxRangeAtr of [2, 3]) {
            for (const bufferAtr of [0, 0.1]) {
              for (const confirmBars of [2, 4, 6]) {
                for (const stopAtr of [0.75, 1]) {
                  for (const rewardR of [1.5, 2, 2.5]) {
                    configs.push({
                      family: "multi_session_state_machine",
                      timeframeMinutes: 30,
                      asianStart: 0,
                      asianEnd: 6,
                      londonStart: 6,
                      entryEnd: 13,
                      entryModel,
                      regimeMode: entryModel === "sweep_reversal" ? "all" : "trend",
                      trendEma,
                      slopeLookback: 8,
                      minSlopeAtr,
                      minRangeAtr,
                      maxRangeAtr,
                      bufferAtr,
                      confirmBars,
                      retestAtr: 0.15,
                      stopAtr,
                      rewardR,
                      maxHoldBars: 20,
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
  return configs;
}

function rollingMean(values, period) {
  const result = Array(values.length).fill(null);
  let sum = 0;
  let valid = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value != null) {
      sum += value;
      valid += 1;
    }
    if (index >= period) {
      const removed = values[index - period];
      if (removed != null) {
        sum -= removed;
        valid -= 1;
      }
    }
    if (index >= period - 1 && valid === period) result[index] = sum / period;
  }
  return result;
}

function efficiencyRatio(rows, period) {
  const values = Array(rows.length).fill(null);
  for (let index = period; index < rows.length; index += 1) {
    const direction = Math.abs(rows[index].close - rows[index - period].close);
    let movement = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      movement += Math.abs(rows[cursor].close - rows[cursor - 1].close);
    }
    values[index] = movement > 0 ? direction / movement : 0;
  }
  return values;
}

function runCompressionRelease(symbol, rows, config) {
  const family = "novel_compression_release";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const slowAtr = rollingMean(atrValues, config.compressionLookback);
  const highs = rollingHigh(rows, config.breakoutLookback);
  const lows = rollingLow(rows, config.breakoutLookback);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.compressionLookback + 20, config.breakoutLookback, config.efficiencyPeriod) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    const baselineAtr = slowAtr[index];
    const er = efficiency[index];
    if (!atrValue || !baselineAtr || er == null || highs[index] == null || lows[index] == null) continue;
    const hour = utcHour(signal.openTime);
    if (config.session === "active" && (hour < 6 || hour >= 18)) continue;
    const compressed = atrValue / baselineAtr <= config.maxAtrRatio;
    const body = Math.abs(signal.close - signal.open);
    const impulsive = body >= atrValue * config.minBodyAtr && er >= config.minEfficiency;
    if (!compressed || !impulsive) continue;
    if (signal.close > highs[index]) {
      position = createPosition("long", next, index + 1, atrValue, config);
    } else if (signal.close < lows[index]) {
      position = createPosition("short", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runFailedExpansion(symbol, rows, config) {
  const family = "novel_failed_expansion";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const highs = rollingHigh(rows, config.lookback);
  const lows = rollingLow(rows, config.lookback);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.lookback, config.efficiencyPeriod, 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    const er = efficiency[index];
    if (!atrValue || er == null || highs[index] == null || lows[index] == null) continue;
    const hour = utcHour(signal.openTime);
    if (hour < config.tradeStart || hour >= config.tradeEnd || er > config.maxEfficiency) continue;
    const buffer = atrValue * config.raidAtr;
    const range = signal.high - signal.low;
    if (range < atrValue * config.minRangeAtr) continue;
    const failedHigh = signal.high > highs[index] + buffer && signal.close < highs[index];
    const failedLow = signal.low < lows[index] - buffer && signal.close > lows[index];
    if (failedHigh) {
      position = createPosition("short", next, index + 1, atrValue, config);
    } else if (failedLow) {
      position = createPosition("long", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runOpeningDrivePersistence(symbol, rows, config) {
  const family = "novel_opening_drive";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const trades = [];
  const dayIndexes = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const day = dayStart(rows[index].openTime);
    const indexes = dayIndexes.get(day) ?? [];
    indexes.push(index);
    dayIndexes.set(day, indexes);
  }

  for (const [day, indexes] of dayIndexes) {
    if (day < IS_START || day >= END) continue;
    const drive = indexes.filter((index) => {
      const hour = utcHour(rows[index].openTime);
      return hour >= config.sessionStart && hour < config.sessionStart + config.driveHours;
    });
    if (drive.length < 2) continue;
    const first = rows[drive[0]];
    const lastIndex = drive[drive.length - 1];
    const last = rows[lastIndex];
    const atrValue = atrValues[lastIndex];
    const er = efficiency[lastIndex];
    if (!atrValue || er == null || er < config.minEfficiency) continue;
    const netMove = last.close - first.open;
    const driveRange = Math.max(...drive.map((index) => rows[index].high)) -
      Math.min(...drive.map((index) => rows[index].low));
    if (driveRange < atrValue * config.minDriveAtr || Math.abs(netMove) / driveRange < config.minDirectionalShare) {
      continue;
    }
    const direction = netMove > 0 ? "long" : "short";
    const entryIndex = lastIndex + 1;
    const entryBar = rows[entryIndex];
    if (!entryBar) continue;
    const position = createPosition(direction, entryBar, entryIndex, atrValue, config);
    if (!position) continue;
    for (let index = entryIndex; index < Math.min(rows.length, entryIndex + config.maxHoldBars + 1); index += 1) {
      const closed = managePosition(position, rows[index], index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        break;
      }
    }
  }
  return trades;
}

function runExhaustionReversal(symbol, rows, config) {
  const family = "novel_exhaustion_reversal";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trades = [];
  let position = null;

  for (let index = config.streakBars + 20; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const atrValue = atrValues[index];
    if (!atrValue) continue;
    const hour = utcHour(signal.openTime);
    if (hour < 6 || hour >= 18) continue;
    const streak = rows.slice(index - config.streakBars + 1, index + 1);
    const allUp = streak.every((row) => row.close > row.open);
    const allDown = streak.every((row) => row.close < row.open);
    if (!allUp && !allDown) continue;
    const netMove = Math.abs(signal.close - streak[0].open);
    if (netMove < atrValue * config.minStretchAtr) continue;
    const range = signal.high - signal.low;
    if (!(range > 0)) continue;
    const upperWick = signal.high - Math.max(signal.open, signal.close);
    const lowerWick = Math.min(signal.open, signal.close) - signal.low;
    const rejectedUp = allUp && upperWick / range >= config.minWickShare;
    const rejectedDown = allDown && lowerWick / range >= config.minWickShare;
    if (rejectedUp) {
      position = createPosition("short", next, index + 1, atrValue, config);
    } else if (rejectedDown) {
      position = createPosition("long", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runSessionStretchReversion(symbol, rows, config) {
  const family = "novel_session_stretch_reversion";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trades = [];
  const dayIndexes = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const day = dayStart(rows[index].openTime);
    const indexes = dayIndexes.get(day) ?? [];
    indexes.push(index);
    dayIndexes.set(day, indexes);
  }

  for (const [day, indexes] of dayIndexes) {
    if (day < IS_START || day >= END) continue;
    const openIndex = indexes.find((index) => utcHour(rows[index].openTime) >= config.dayOpenHour);
    const signalIndex = indexes.find((index) => utcHour(rows[index].openTime) >= config.signalHour);
    if (openIndex == null || signalIndex == null || signalIndex >= rows.length - 1) continue;
    const dayOpen = rows[openIndex].open;
    const signal = rows[signalIndex];
    const next = rows[signalIndex + 1];
    const atrValue = atrValues[signalIndex];
    if (!atrValue) continue;
    const stretch = (signal.close - dayOpen) / atrValue;
    const bearishRejection = stretch >= config.minStretchAtr && signal.close < signal.open;
    const bullishRejection = stretch <= -config.minStretchAtr && signal.close > signal.open;
    let position = null;
    if (bearishRejection) {
      position = createPosition("short", next, signalIndex + 1, atrValue, config);
    } else if (bullishRejection) {
      position = createPosition("long", next, signalIndex + 1, atrValue, config);
    }
    if (!position) continue;
    for (
      let index = signalIndex + 1;
      index < Math.min(rows.length, signalIndex + config.maxHoldBars + 2);
      index += 1
    ) {
      const closed = managePosition(position, rows[index], index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        break;
      }
    }
  }
  return trades;
}

function previousDayLevels(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = dayStart(row.openTime);
    const current = byDay.get(day);
    if (!current) {
      byDay.set(day, { high: row.high, low: row.low });
    } else {
      current.high = Math.max(current.high, row.high);
      current.low = Math.min(current.low, row.low);
    }
  }
  const days = [...byDay.keys()].sort((left, right) => left - right);
  const previous = new Map();
  for (let index = 1; index < days.length; index += 1) {
    previous.set(days[index], byDay.get(days[index - 1]));
  }
  return previous;
}

function runComplexLiquidityRegimeReversal(symbol, rows, config) {
  const family = "complex_liquidity_regime_reversal";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trendEma = ema(rows, config.emaPeriod);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const previousLevels = previousDayLevels(rows);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.emaPeriod, config.efficiencyPeriod, 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const hour = utcHour(signal.openTime);
    if (hour < config.tradeStart || hour >= config.tradeEnd) continue;
    const atrValue = atrValues[index];
    const er = efficiency[index];
    const emaValue = trendEma[index];
    const levels = previousLevels.get(dayStart(signal.openTime));
    if (!atrValue || er == null || emaValue == null || !levels || er > config.maxEfficiency) {
      continue;
    }
    const range = signal.high - signal.low;
    if (!(range > 0)) continue;
    const upperWickShare = (signal.high - Math.max(signal.open, signal.close)) / range;
    const lowerWickShare = (Math.min(signal.open, signal.close) - signal.low) / range;
    const buffer = atrValue * config.sweepBufferAtr;
    const sweptHigh =
      signal.high > levels.high + buffer &&
      signal.close < levels.high &&
      signal.close < signal.open &&
      upperWickShare >= config.minWickShare;
    const sweptLow =
      signal.low < levels.low - buffer &&
      signal.close > levels.low &&
      signal.close > signal.open &&
      lowerWickShare >= config.minWickShare;
    const shortRegime =
      config.regimeMode === "countertrend" ? signal.close > emaValue : signal.close < emaValue;
    const longRegime =
      config.regimeMode === "countertrend" ? signal.close < emaValue : signal.close > emaValue;
    if (sweptHigh && shortRegime) {
      position = createPosition("short", next, index + 1, atrValue, config);
    } else if (sweptLow && longRegime) {
      position = createPosition("long", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runComplexRegimePullback(symbol, rows, config) {
  const family = "complex_regime_pullback";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const baselineAtr = rollingMean(atrValues, config.volatilityLookback);
  const fastEma = ema(rows, config.fastEma);
  const slowEma = ema(rows, config.slowEma);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.slowEma, config.volatilityLookback + 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const previous = rows[index - 1];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const hour = utcHour(signal.openTime);
    if (hour < config.tradeStart || hour >= config.tradeEnd) continue;
    const atrValue = atrValues[index];
    const baseline = baselineAtr[index];
    const fast = fastEma[index];
    const slow = slowEma[index];
    const oldSlow = slowEma[index - config.slopeLookback];
    const er = efficiency[index];
    if (!atrValue || !baseline || fast == null || slow == null || oldSlow == null || er == null) {
      continue;
    }
    const atrRatio = atrValue / baseline;
    if (
      er < config.minEfficiency ||
      atrRatio < config.minAtrRatio ||
      atrRatio > config.maxAtrRatio
    ) {
      continue;
    }
    const slope = (slow - oldSlow) / atrValue;
    const longTrend = fast > slow && slope >= config.minSlopeAtr;
    const shortTrend = fast < slow && slope <= -config.minSlopeAtr;
    const longPullback =
      longTrend &&
      previous.low <= fast + atrValue * config.touchAtr &&
      signal.close > fast &&
      signal.close > signal.open;
    const shortPullback =
      shortTrend &&
      previous.high >= fast - atrValue * config.touchAtr &&
      signal.close < fast &&
      signal.close < signal.open;
    if (longPullback) {
      position = createPosition("long", next, index + 1, atrValue, config);
    } else if (shortPullback) {
      position = createPosition("short", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function runComplexSqueezeExpansion(symbol, rows, config) {
  const family = "complex_squeeze_expansion";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const baselineAtr = rollingMean(atrValues, config.volatilityLookback);
  const trendEma = ema(rows, config.emaPeriod);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const highs = rollingHigh(rows, config.breakoutLookback);
  const lows = rollingLow(rows, config.breakoutLookback);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.emaPeriod, config.volatilityLookback + 20) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const hour = utcHour(signal.openTime);
    if (hour < config.tradeStart || hour >= config.tradeEnd) continue;
    const atrValue = atrValues[index];
    const baseline = baselineAtr[index];
    const emaValue = trendEma[index];
    const er = efficiency[index];
    if (
      !atrValue ||
      !baseline ||
      emaValue == null ||
      er == null ||
      highs[index] == null ||
      lows[index] == null
    ) {
      continue;
    }
    let compressedBars = 0;
    for (let cursor = index - config.compressionBars; cursor < index; cursor += 1) {
      const cursorAtr = atrValues[cursor];
      const cursorBaseline = baselineAtr[cursor];
      if (cursorAtr && cursorBaseline && cursorAtr / cursorBaseline <= config.maxCompressionRatio) {
        compressedBars += 1;
      }
    }
    if (compressedBars < config.minCompressedBars) continue;
    const bodyAtr = Math.abs(signal.close - signal.open) / atrValue;
    if (bodyAtr < config.minBodyAtr || er < config.minEfficiency) continue;
    const longSignal = signal.close > highs[index] && signal.close > emaValue;
    const shortSignal = signal.close < lows[index] && signal.close < emaValue;
    if (longSignal) {
      position = createPosition("long", next, index + 1, atrValue, config);
    } else if (shortSignal) {
      position = createPosition("short", next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function buildComplexConfigs() {
  const configs = [];
  for (const timeframeMinutes of [30, 60]) {
    for (const maxEfficiency of [0.35, 0.5]) {
      for (const sweepBufferAtr of [0, 0.1]) {
        for (const minWickShare of [0.25, 0.4]) {
          for (const regimeMode of ["countertrend", "trend"]) {
            for (const stopAtr of [0.75, 1]) {
              for (const rewardR of [1.5, 2, 2.5]) {
                configs.push({
                  family: "complex_liquidity_regime_reversal",
                  timeframeMinutes,
                  emaPeriod: 100,
                  efficiencyPeriod: 10,
                  maxEfficiency,
                  sweepBufferAtr,
                  minWickShare,
                  regimeMode,
                  tradeStart: 6,
                  tradeEnd: 18,
                  stopAtr,
                  rewardR,
                  maxHoldBars: timeframeMinutes === 30 ? 16 : 10,
                });
              }
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [30, 60]) {
    for (const slowEma of [100, 200]) {
      for (const minEfficiency of [0.25, 0.4]) {
        for (const minSlopeAtr of [0.05, 0.1]) {
          for (const touchAtr of [0, 0.25]) {
            for (const stopAtr of [0.75, 1]) {
              for (const rewardR of [1.5, 2, 2.5]) {
                configs.push({
                  family: "complex_regime_pullback",
                  timeframeMinutes,
                  fastEma: 20,
                  slowEma,
                  slopeLookback: 5,
                  minSlopeAtr,
                  efficiencyPeriod: 10,
                  minEfficiency,
                  volatilityLookback: 40,
                  minAtrRatio: 0.7,
                  maxAtrRatio: 1.5,
                  touchAtr,
                  tradeStart: 6,
                  tradeEnd: 18,
                  stopAtr,
                  rewardR,
                  maxHoldBars: timeframeMinutes === 30 ? 20 : 12,
                });
              }
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [30, 60]) {
    for (const maxCompressionRatio of [0.7, 0.8]) {
      for (const minCompressedBars of [3, 5]) {
        for (const minEfficiency of [0.3, 0.45]) {
          for (const minBodyAtr of [0.6, 0.9]) {
            for (const stopAtr of [0.75, 1]) {
              for (const rewardR of [1.5, 2, 2.5]) {
                configs.push({
                  family: "complex_squeeze_expansion",
                  timeframeMinutes,
                  emaPeriod: 100,
                  efficiencyPeriod: 10,
                  minEfficiency,
                  volatilityLookback: 40,
                  compressionBars: 8,
                  minCompressedBars,
                  maxCompressionRatio,
                  breakoutLookback: 20,
                  minBodyAtr,
                  tradeStart: 6,
                  tradeEnd: 18,
                  stopAtr,
                  rewardR,
                  maxHoldBars: timeframeMinutes === 30 ? 20 : 12,
                });
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function runCrossSectionalMomentum(datasets, config) {
  const family = "cross_sectional_relative_strength";
  const configId = JSON.stringify(config);
  const symbols = ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY"].filter(
    (symbol) => datasets[symbol]?.[config.timeframeMinutes * MINUTE]
  );
  const context = {};
  for (const symbol of symbols) {
    const rows = datasets[symbol][config.timeframeMinutes * MINUTE];
    context[symbol] = {
      rows,
      atr: atr(rows),
      efficiency: efficiencyRatio(rows, config.efficiencyPeriod),
      indexByTime: new Map(rows.map((row, index) => [row.openTime, index])),
    };
  }
  const timestamps = [
    ...new Set(
      symbols.flatMap((symbol) =>
        context[symbol].rows
          .filter((row) => utcHour(row.openTime) === config.signalHour)
          .map((row) => row.openTime)
      )
    ),
  ].sort((left, right) => left - right);
  const trades = [];

  for (const timestamp of timestamps) {
    const ranked = [];
    for (const symbol of symbols) {
      const item = context[symbol];
      const index = item.indexByTime.get(timestamp);
      if (index == null || index < config.momentumLookback || index >= item.rows.length - 1) {
        continue;
      }
      const atrValue = item.atr[index];
      const er = item.efficiency[index];
      if (!atrValue || er == null || er < config.minEfficiency) continue;
      const move = item.rows[index].close - item.rows[index - config.momentumLookback].close;
      ranked.push({ symbol, index, score: move / atrValue, atrValue });
    }
    if (ranked.length < 4) continue;
    ranked.sort((left, right) => right.score - left.score);
    const strongest = ranked[0];
    const weakest = ranked[ranked.length - 1];
    if (strongest.score - weakest.score < config.minScoreSpread) continue;

    for (const selection of [
      { ...strongest, direction: "long" },
      { ...weakest, direction: "short" },
    ]) {
      const item = context[selection.symbol];
      const entryIndex = selection.index + 1;
      const entryBar = item.rows[entryIndex];
      if (!entryBar || entryBar.openTime < IS_START || entryBar.openTime >= END) continue;
      const position = createPosition(
        selection.direction,
        entryBar,
        entryIndex,
        selection.atrValue,
        config
      );
      if (!position) continue;
      for (
        let index = entryIndex;
        index < Math.min(item.rows.length, entryIndex + config.maxHoldBars + 1);
        index += 1
      ) {
        const closed = managePosition(
          position,
          item.rows[index],
          index,
          config,
          selection.symbol,
          family,
          configId
        );
        if (closed) {
          trades.push(closed);
          break;
        }
      }
    }
  }
  return trades;
}

function buildCrossSectionalConfigs() {
  const configs = [];
  for (const signalHour of [7, 12, 16]) {
    for (const momentumLookback of [24, 48, 96]) {
      for (const minEfficiency of [0.15, 0.3]) {
        for (const minScoreSpread of [1.5, 2.5, 3.5]) {
          for (const stopAtr of [0.75, 1]) {
            for (const rewardR of [1.5, 2, 2.5]) {
              for (const maxHoldBars of [12, 24, 48]) {
                configs.push({
                  family: "cross_sectional_relative_strength",
                  timeframeMinutes: 60,
                  signalHour,
                  momentumLookback,
                  efficiencyPeriod: 10,
                  minEfficiency,
                  minScoreSpread,
                  stopAtr,
                  rewardR,
                  maxHoldBars,
                });
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function runCurrencyStrengthRotation(datasets, config) {
  const family = "currency_strength_rotation";
  const configId = JSON.stringify(config);
  const pairDefinitions = [
    { symbol: "EURUSD", base: "EUR", quote: "USD" },
    { symbol: "GBPUSD", base: "GBP", quote: "USD" },
    { symbol: "AUDUSD", base: "AUD", quote: "USD" },
    { symbol: "USDJPY", base: "USD", quote: "JPY" },
  ];
  const context = {};
  for (const definition of pairDefinitions) {
    const rows = datasets[definition.symbol]?.[config.timeframeMinutes * MINUTE];
    if (!rows) continue;
    context[definition.symbol] = {
      ...definition,
      rows,
      atr: atr(rows),
      indexByTime: new Map(rows.map((row, index) => [row.openTime, index])),
    };
  }
  const timestamps = [
    ...new Set(
      Object.values(context).flatMap((item) =>
        item.rows
          .filter((row) => utcHour(row.openTime) === config.signalHour)
          .map((row) => row.openTime)
      )
    ),
  ].sort((left, right) => left - right);
  const trades = [];

  for (const timestamp of timestamps) {
    const scores = new Map();
    const counts = new Map();
    const candidates = [];
    for (const item of Object.values(context)) {
      const index = item.indexByTime.get(timestamp);
      if (
        index == null ||
        index < config.longLookback ||
        index >= item.rows.length - 1
      ) {
        continue;
      }
      const atrValue = item.atr[index];
      if (!atrValue) continue;
      const shortMove =
        (item.rows[index].close - item.rows[index - config.shortLookback].close) /
        atrValue;
      const longMove =
        (item.rows[index].close - item.rows[index - config.longLookback].close) /
        atrValue;
      const move =
        shortMove * config.shortWeight + longMove * (1 - config.shortWeight);
      scores.set(item.base, (scores.get(item.base) ?? 0) + move);
      scores.set(item.quote, (scores.get(item.quote) ?? 0) - move);
      counts.set(item.base, (counts.get(item.base) ?? 0) + 1);
      counts.set(item.quote, (counts.get(item.quote) ?? 0) + 1);
      candidates.push({ item, index, atrValue });
    }
    if (candidates.length < 4) continue;
    for (const [currency, value] of scores) {
      scores.set(currency, value / (counts.get(currency) ?? 1));
    }

    const rankedPairs = candidates
      .map((candidate) => {
        const baseScore = scores.get(candidate.item.base) ?? 0;
        const quoteScore = scores.get(candidate.item.quote) ?? 0;
        return {
          ...candidate,
          baseScore,
          quoteScore,
          spread: Math.abs(baseScore - quoteScore),
          direction: baseScore > quoteScore ? "long" : "short",
        };
      })
      .sort((left, right) => right.spread - left.spread);
    const selected = rankedPairs[0];
    if (!selected || selected.spread < config.minStrengthSpread) continue;
    const signal = selected.item.rows[selected.index];
    const previous = selected.item.rows[selected.index - 1];
    const next = selected.item.rows[selected.index + 1];
    if (!next || next.openTime < IS_START || next.openTime >= END) continue;
    if (config.confirmation === "body") {
      const aligned =
        selected.direction === "long"
          ? signal.close > signal.open
          : signal.close < signal.open;
      if (!aligned) continue;
    } else if (config.confirmation === "pullback") {
      const aligned =
        selected.direction === "long"
          ? previous.close < signal.close && signal.low < previous.low
          : previous.close > signal.close && signal.high > previous.high;
      if (!aligned) continue;
    }
    const position = createPosition(
      selected.direction,
      next,
      selected.index + 1,
      selected.atrValue,
      config
    );
    if (!position) continue;
    for (
      let index = selected.index + 1;
      index <
      Math.min(
        selected.item.rows.length,
        selected.index + config.maxHoldBars + 2
      );
      index += 1
    ) {
      const closed = managePosition(
        position,
        selected.item.rows[index],
        index,
        config,
        selected.item.symbol,
        family,
        configId
      );
      if (closed) {
        trades.push(closed);
        break;
      }
    }
  }
  return trades;
}

function buildCurrencyStrengthConfigs() {
  const configs = [];
  for (const signalHour of [0, 6, 12, 16]) {
    for (const shortLookback of [12, 24, 48]) {
      for (const longLookback of [96, 192]) {
        if (longLookback <= shortLookback) continue;
        for (const shortWeight of [0.4, 0.6, 0.8]) {
          for (const minStrengthSpread of [1.5, 2.5, 3.5]) {
            for (const confirmation of ["none", "body", "pullback"]) {
              for (const stopAtr of [0.75, 1]) {
                for (const rewardR of [1.5, 2, 2.5]) {
                  configs.push({
                    family: "currency_strength_rotation",
                    timeframeMinutes: 60,
                    signalHour,
                    shortLookback,
                    longLookback,
                    shortWeight,
                    minStrengthSpread,
                    confirmation,
                    stopAtr,
                    rewardR,
                    maxHoldBars: 24,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function runMacroVolatilityTrend(symbol, rows, config) {
  const family = "macro_volatility_trend";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trendEma = ema(rows, config.emaPeriod);
  const trades = [];
  let position = null;
  const warmup = Math.max(config.momentumLookback, config.emaPeriod) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    const atrValue = atrValues[index];
    const emaValue = trendEma[index];
    if (!atrValue || emaValue == null) continue;
    const momentum = signal.close - rows[index - config.momentumLookback].close;
    const normalizedMomentum = momentum / atrValue;

    if (position) {
      if (position.direction === "long") {
        position.highest = Math.max(position.highest, signal.high);
        position.stopLoss = Math.max(
          position.stopLoss,
          position.highest - atrValue * config.trailingAtr
        );
      } else {
        position.lowest = Math.min(position.lowest, signal.low);
        position.stopLoss = Math.min(
          position.stopLoss,
          position.lowest + atrValue * config.trailingAtr
        );
      }
      const stopHit =
        position.direction === "long"
          ? signal.low <= position.stopLoss
          : signal.high >= position.stopLoss;
      const flipped =
        position.direction === "long"
          ? normalizedMomentum <= -config.flipThreshold
          : normalizedMomentum >= config.flipThreshold;
      const timedOut = index - position.entryIndex >= config.maxHoldBars;
      if (stopHit || flipped || timedOut) {
        const exitPrice = stopHit ? position.stopLoss : signal.close;
        trades.push(
          closePosition(
            position,
            signal,
            exitPrice,
            stopHit ? "trailing_stop" : flipped ? "momentum_flip" : "time_exit",
            symbol,
            family,
            configId
          )
        );
        position = null;
      }
    }

    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    if (utcHour(signal.openTime) !== config.signalHour) continue;
    const longSignal =
      normalizedMomentum >= config.minMomentumAtr && signal.close > emaValue;
    const shortSignal =
      normalizedMomentum <= -config.minMomentumAtr && signal.close < emaValue;
    if (!longSignal && !shortSignal) continue;
    const direction = longSignal ? "long" : "short";
    const riskDistance = atrValue * config.stopAtr;
    position = {
      direction,
      entryTime: next.openTime,
      entryIndex: index + 1,
      entryPrice: next.open,
      riskDistance,
      stopLoss:
        direction === "long" ? next.open - riskDistance : next.open + riskDistance,
      takeProfit: direction === "long" ? Infinity : -Infinity,
      highest: next.open,
      lowest: next.open,
    };
  }
  return trades;
}

function buildMacroTrendConfigs() {
  const configs = [];
  for (const signalHour of [0, 8, 16]) {
    for (const momentumLookback of [30, 60, 120]) {
      for (const emaPeriod of [50, 100]) {
        for (const minMomentumAtr of [2, 4, 6]) {
          for (const stopAtr of [1.5, 2, 2.5]) {
            for (const trailingAtr of [1.5, 2.5, 3.5]) {
              for (const maxHoldBars of [30, 60, 120]) {
                configs.push({
                  family: "macro_volatility_trend",
                  timeframeMinutes: 240,
                  signalHour,
                  momentumLookback,
                  emaPeriod,
                  minMomentumAtr,
                  flipThreshold: 1,
                  stopAtr,
                  trailingAtr,
                  maxHoldBars,
                });
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function rollingSpreadStats(values, index, lookback) {
  if (index - lookback + 1 < 0) return null;
  const window = values.slice(index - lookback + 1, index + 1);
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const variance =
    window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  return sd > 0 ? { mean, sd } : null;
}

function runPairMeanReversion(datasets, config) {
  const pairs = [
    ["EURUSD", "GBPUSD"],
    ["EURUSD", "AUDUSD"],
    ["GBPUSD", "AUDUSD"],
  ];
  const trades = [];
  for (const [leftSymbol, rightSymbol] of pairs) {
    const leftRows = datasets[leftSymbol]?.[config.timeframeMinutes * MINUTE];
    const rightRows = datasets[rightSymbol]?.[config.timeframeMinutes * MINUTE];
    if (!leftRows || !rightRows) continue;
    const rightByTime = new Map(rightRows.map((row) => [row.openTime, row]));
    const aligned = leftRows
      .map((left) => {
        const right = rightByTime.get(left.openTime);
        return right ? { time: left.openTime, left, right } : null;
      })
      .filter(Boolean);
    const spreads = aligned.map(
      (item) => Math.log(item.left.close) - Math.log(item.right.close)
    );
    let position = null;
    for (let index = config.lookback; index < aligned.length - 1; index += 1) {
      const item = aligned[index];
      const next = aligned[index + 1];
      const stats = rollingSpreadStats(spreads, index, config.lookback);
      if (!stats) continue;
      const z = (spreads[index] - stats.mean) / stats.sd;

      if (position) {
        const leftReturn = Math.log(item.left.close / position.leftEntry);
        const rightReturn = Math.log(item.right.close / position.rightEntry);
        const spreadPnl =
          position.direction === "short_spread"
            ? -leftReturn + rightReturn
            : leftReturn - rightReturn;
        const reverted = Math.abs(z) <= config.exitZ;
        const stopped =
          position.direction === "short_spread" ? z >= config.stopZ : z <= -config.stopZ;
        const timedOut = index - position.entryIndex >= config.maxHoldBars;
        if (reverted || stopped || timedOut) {
          const grossR = spreadPnl / position.riskSpread;
          const leftCost =
            (EXECUTION_COST_PIPS[leftSymbol] * pipSize(leftSymbol)) / position.leftEntry;
          const rightCost =
            (EXECUTION_COST_PIPS[rightSymbol] * pipSize(rightSymbol)) / position.rightEntry;
          const costR = (leftCost + rightCost) / position.riskSpread;
          trades.push({
            symbol: `${leftSymbol}_${rightSymbol}`,
            family: "pair_mean_reversion",
            configId: JSON.stringify(config),
            direction: position.direction === "short_spread" ? "short" : "long",
            entryTime: position.entryTime,
            exitTime: item.time,
            entryPrice: position.leftEntry / position.rightEntry,
            exitPrice: item.left.close / item.right.close,
            grossR,
            netR: grossR - costR,
            exitReason: stopped ? "spread_stop" : reverted ? "mean_reversion" : "time_exit",
          });
          position = null;
        }
      }
      if (position || next.time < IS_START || next.time >= END) continue;
      if (utcHour(item.time) !== config.signalHour) continue;
      if (Math.abs(z) < config.entryZ) continue;
      const stopDistanceZ = config.stopZ - config.entryZ;
      if (!(stopDistanceZ > 0)) continue;
      position = {
        direction: z > 0 ? "short_spread" : "long_spread",
        entryTime: next.time,
        entryIndex: index + 1,
        leftEntry: next.left.open,
        rightEntry: next.right.open,
        riskSpread: stats.sd * stopDistanceZ,
      };
    }
  }
  return trades;
}

function buildPairConfigs() {
  const configs = [];
  for (const timeframeMinutes of [60, 240]) {
    for (const signalHour of [0, 8, 16]) {
      for (const lookback of [60, 120, 240]) {
        for (const entryZ of [1.5, 2, 2.5]) {
          for (const stopZ of [3, 3.5, 4]) {
            if (stopZ <= entryZ) continue;
            for (const exitZ of [0.25, 0.5]) {
              for (const maxHoldBars of [24, 48, 96]) {
                configs.push({
                  family: "pair_mean_reversion",
                  timeframeMinutes,
                  signalHour,
                  lookback,
                  entryZ,
                  stopZ,
                  exitZ,
                  maxHoldBars,
                });
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function rollingCloseStats(rows, index, lookback) {
  if (index - lookback + 1 < 0) return null;
  const values = rows
    .slice(index - lookback + 1, index + 1)
    .map((row) => row.close);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return sd > 0 ? { mean, sd } : null;
}

function runAdaptiveRegimeRotation(symbol, rows, config) {
  const family = "adaptive_regime_rotation";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const efficiency = efficiencyRatio(rows, config.efficiencyPeriod);
  const trendEma = ema(rows, config.emaPeriod);
  const highs = rollingHigh(rows, config.breakoutLookback);
  const lows = rollingLow(rows, config.breakoutLookback);
  const trades = [];
  let position = null;
  const warmup =
    Math.max(
      config.efficiencyPeriod,
      config.emaPeriod,
      config.breakoutLookback,
      config.meanLookback
    ) + 2;

  for (let index = warmup; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    if (position) {
      const closed = managePosition(position, signal, index, config, symbol, family, configId);
      if (closed) {
        trades.push(closed);
        position = null;
      }
    }
    if (position || next.openTime < IS_START || next.openTime >= END) continue;
    const hour = utcHour(signal.openTime);
    if (hour < config.tradeStart || hour >= config.tradeEnd) continue;
    const atrValue = atrValues[index];
    const er = efficiency[index];
    const emaValue = trendEma[index];
    const stats = rollingCloseStats(rows, index, config.meanLookback);
    if (
      !atrValue ||
      er == null ||
      emaValue == null ||
      !stats ||
      highs[index] == null ||
      lows[index] == null
    ) {
      continue;
    }
    let direction = null;
    if (er >= config.trendThreshold) {
      if (signal.close > highs[index] && signal.close > emaValue) direction = "long";
      if (signal.close < lows[index] && signal.close < emaValue) direction = "short";
    } else if (er <= config.rangeThreshold) {
      const z = (signal.close - stats.mean) / stats.sd;
      if (z <= -config.entryZ && signal.close < emaValue) direction = "long";
      if (z >= config.entryZ && signal.close > emaValue) direction = "short";
    }
    if (direction) {
      position = createPosition(direction, next, index + 1, atrValue, config);
    }
  }
  return trades;
}

function buildAdaptiveRegimeConfigs() {
  const configs = [];
  for (const timeframeMinutes of [30, 60]) {
    for (const efficiencyPeriod of [10, 20]) {
      for (const rangeThreshold of [0.15, 0.25]) {
        for (const trendThreshold of [0.35, 0.5]) {
          if (trendThreshold <= rangeThreshold) continue;
          for (const breakoutLookback of [12, 24]) {
            for (const entryZ of [1.5, 2]) {
              for (const stopAtr of [0.75, 1]) {
                for (const rewardR of [1.5, 2, 2.5]) {
                  configs.push({
                    family: "adaptive_regime_rotation",
                    timeframeMinutes,
                    efficiencyPeriod,
                    rangeThreshold,
                    trendThreshold,
                    emaPeriod: 100,
                    breakoutLookback,
                    meanLookback: 40,
                    entryZ,
                    tradeStart: 6,
                    tradeEnd: 18,
                    stopAtr,
                    rewardR,
                    maxHoldBars: timeframeMinutes === 30 ? 20 : 12,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return configs;
}

function runCalendarSessionEdge(symbol, rows, config) {
  const family = "calendar_session_edge";
  const configId = JSON.stringify(config);
  const atrValues = atr(rows);
  const trades = [];
  for (let index = Math.max(20, config.momentumBars) + 1; index < rows.length - 1; index += 1) {
    const signal = rows[index];
    const next = rows[index + 1];
    const date = new Date(signal.openTime);
    if (
      date.getUTCDay() !== config.weekday ||
      utcHour(signal.openTime) !== config.entryHour ||
      next.openTime < IS_START ||
      next.openTime >= END
    ) {
      continue;
    }
    const atrValue = atrValues[index];
    if (!atrValue) continue;
    const momentum = signal.close - rows[index - config.momentumBars].close;
    let direction = config.direction;
    if (direction === "momentum") direction = momentum >= 0 ? "long" : "short";
    if (direction === "reversal") direction = momentum >= 0 ? "short" : "long";
    const position = createPosition(direction, next, index + 1, atrValue, config);
    if (!position) continue;
    for (
      let cursor = index + 1;
      cursor < Math.min(rows.length, index + config.maxHoldBars + 2);
      cursor += 1
    ) {
      const closed = managePosition(
        position,
        rows[cursor],
        cursor,
        config,
        symbol,
        family,
        configId
      );
      if (closed) {
        trades.push(closed);
        break;
      }
    }
  }
  return trades;
}

function buildCalendarEdgeConfigs() {
  const configs = [];
  for (const weekday of [1, 2, 3, 4, 5]) {
    for (const entryHour of [0, 4, 7, 9, 12, 14, 16, 20]) {
      for (const direction of ["long", "short", "momentum", "reversal"]) {
        for (const momentumBars of [6, 12]) {
          for (const stopAtr of [0.75, 1]) {
            for (const rewardR of [1.5, 2, 2.5]) {
              configs.push({
                family: "calendar_session_edge",
                timeframeMinutes: 60,
                weekday,
                entryHour,
                direction,
                momentumBars,
                stopAtr,
                rewardR,
                maxHoldBars: 12,
              });
            }
          }
        }
      }
    }
  }
  return configs;
}

function buildNovelConfigs() {
  const configs = [];
  for (const timeframeMinutes of [15, 30, 60]) {
    for (const maxAtrRatio of [0.65, 0.8]) {
      for (const minBodyAtr of [0.5, 0.8]) {
        for (const minEfficiency of [0.25, 0.4]) {
          for (const stopAtr of [0.75, 1]) {
            for (const rewardR of [1.5, 2, 2.5]) {
              configs.push({
                family: "novel_compression_release",
                timeframeMinutes,
                compressionLookback: 40,
                breakoutLookback: 12,
                efficiencyPeriod: 10,
                maxAtrRatio,
                minBodyAtr,
                minEfficiency,
                stopAtr,
                rewardR,
                session: "active",
                maxHoldBars: timeframeMinutes === 15 ? 32 : timeframeMinutes === 30 ? 24 : 16,
              });
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [15, 30, 60]) {
    for (const lookback of [12, 24]) {
      for (const maxEfficiency of [0.25, 0.4]) {
        for (const raidAtr of [0, 0.1]) {
          for (const stopAtr of [0.5, 0.75, 1]) {
            for (const rewardR of [1, 1.5, 2]) {
              configs.push({
                family: "novel_failed_expansion",
                timeframeMinutes,
                lookback,
                efficiencyPeriod: 10,
                maxEfficiency,
                raidAtr,
                minRangeAtr: 0.8,
                tradeStart: 6,
                tradeEnd: 18,
                stopAtr,
                rewardR,
                maxHoldBars: timeframeMinutes === 15 ? 24 : timeframeMinutes === 30 ? 16 : 10,
              });
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [15, 30]) {
    for (const sessionStart of [7, 13]) {
      for (const driveHours of [1, 2]) {
        for (const minEfficiency of [0.3, 0.5]) {
          for (const minDriveAtr of [0.8, 1.2]) {
            for (const stopAtr of [0.75, 1]) {
              for (const rewardR of [1.5, 2, 2.5]) {
                configs.push({
                  family: "novel_opening_drive",
                  timeframeMinutes,
                  sessionStart,
                  driveHours,
                  efficiencyPeriod: 8,
                  minEfficiency,
                  minDriveAtr,
                  minDirectionalShare: 0.6,
                  stopAtr,
                  rewardR,
                  maxHoldBars: timeframeMinutes === 15 ? 24 : 16,
                });
              }
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [15, 30, 60]) {
    for (const streakBars of [3, 4]) {
      for (const minStretchAtr of [1.2, 1.8]) {
        for (const minWickShare of [0.25, 0.4]) {
          for (const stopAtr of [0.5, 0.75, 1]) {
            for (const rewardR of [1, 1.5, 2]) {
              configs.push({
                family: "novel_exhaustion_reversal",
                timeframeMinutes,
                streakBars,
                minStretchAtr,
                minWickShare,
                stopAtr,
                rewardR,
                maxHoldBars: timeframeMinutes === 15 ? 20 : timeframeMinutes === 30 ? 12 : 8,
              });
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [15, 30, 60]) {
    for (const signalHour of [11, 13, 16]) {
      for (const minStretchAtr of [1.5, 2, 2.5]) {
        for (const stopAtr of [0.5, 0.75, 1]) {
          for (const rewardR of [1, 1.5, 2]) {
            configs.push({
              family: "novel_session_stretch_reversion",
              timeframeMinutes,
              dayOpenHour: 0,
              signalHour,
              minStretchAtr,
              stopAtr,
              rewardR,
              maxHoldBars: timeframeMinutes === 15 ? 24 : timeframeMinutes === 30 ? 16 : 10,
            });
          }
        }
      }
    }
  }
  return configs;
}

function buildConfigs() {
  const configs = [];
  for (const timeframeMinutes of [30, 60]) {
    for (const channel of [20, 40, 60]) {
      for (const stopAtr of [0.75, 1, 1.25]) {
        for (const rewardR of [1.5, 2, 2.5]) {
          for (const session of ["all", "active"]) {
            configs.push({
              family: "volatility_expansion",
              timeframeMinutes,
              channel,
              emaPeriod: 200,
              stopAtr,
              rewardR,
              session,
              maxHoldBars: timeframeMinutes === 30 ? 48 : 30,
            });
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [30, 60]) {
    for (const fastEma of [20, 34]) {
      for (const slowEma of [100, 200]) {
        for (const stopAtr of [0.75, 1, 1.25]) {
          for (const rewardR of [1.5, 2, 2.5]) {
            for (const touchAtr of [0.1, 0.25]) {
              for (const session of ["all", "active"]) {
                configs.push({
                  family: "trend_pullback",
                  timeframeMinutes,
                  fastEma,
                  slowEma,
                  stopAtr,
                  rewardR,
                  touchAtr,
                  session,
                  maxHoldBars: timeframeMinutes === 30 ? 48 : 30,
                });
              }
            }
          }
        }
      }
    }
  }
  for (const timeframeMinutes of [15, 30]) {
    for (const rangeEnd of [6, 7]) {
      for (const tradeEnd of [11, 16]) {
        for (const stopAtr of [0.5, 0.75, 1]) {
          for (const rewardR of [1.5, 2, 2.5]) {
            for (const minRangeAtr of [0.3, 0.6]) {
              configs.push({
                family: "session_breakout",
                timeframeMinutes,
                rangeStart: 0,
                rangeEnd,
                tradeStart: rangeEnd,
                tradeEnd,
                emaPeriod: 200,
                stopAtr,
                rewardR,
                minRangeAtr,
                maxRangeAtr: 3,
                breakBufferAtr: 0.05,
                maxHoldBars: timeframeMinutes === 15 ? 32 : 20,
              });
            }
          }
        }
      }
    }
  }
  return configs;
}

function filterTrades(trades, start, end) {
  return trades.filter((trade) => trade.entryTime >= start && trade.entryTime < end);
}

function simulatePortfolio(rawTrades, riskPct, start, end) {
  const trades = filterTrades(rawTrades, start, end).sort(
    (left, right) => left.entryTime - right.entryTime || left.exitTime - right.exitTime
  );
  const events = [];
  trades.forEach((trade, index) => {
    events.push({ time: trade.entryTime, type: "entry", index, trade });
    events.push({ time: trade.exitTime, type: "exit", index, trade });
  });
  events.sort((left, right) => {
    if (left.time !== right.time) return left.time - right.time;
    if (left.index === right.index) return left.type === "entry" ? -1 : 1;
    if (left.type !== right.type) return left.type === "exit" ? -1 : 1;
    return left.index - right.index;
  });

  let equity = INITIAL_EQUITY;
  let peak = equity;
  let maxDrawdownPct = 0;
  let currentDay = null;
  let dayStartEquity = equity;
  let dailyRealized = 0;
  let worstDayPct = 0;
  let skippedDailyStop = 0;
  let skippedRiskCap = 0;
  const open = new Map();
  const completed = [];
  const dailyProfit = new Map();

  for (const event of events) {
    const day = dayStart(event.time);
    if (currentDay !== day) {
      currentDay = day;
      dayStartEquity = equity;
      dailyRealized = 0;
    }
    if (event.type === "entry") {
      const dailyPct = dayStartEquity ? (dailyRealized / dayStartEquity) * 100 : 0;
      if (dailyPct <= DAILY_STOP_PCT) {
        skippedDailyStop += 1;
        continue;
      }
      const openRiskPct = [...open.values()].reduce((sum, item) => sum + item.riskPct, 0);
      if (openRiskPct + riskPct > MAX_CONCURRENT_RISK_PCT + 1e-9) {
        skippedRiskCap += 1;
        continue;
      }
      open.set(event.index, {
        riskPct,
        riskAmount: equity * (riskPct / 100),
        entryEquity: equity,
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
    const exitDay = dayStart(event.trade.exitTime);
    dailyProfit.set(exitDay, (dailyProfit.get(exitDay) ?? 0) + profit);
    const dailyPct = dayStartEquity ? (dailyRealized / dayStartEquity) * 100 : 0;
    worstDayPct = Math.min(worstDayPct, dailyPct);
    completed.push({ ...event.trade, profit, riskPct: position.riskPct });
  }

  let grossProfit = 0;
  let grossLoss = 0;
  let winners = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  for (const trade of completed) {
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

  const tradingDays = [];
  for (let day = dayStart(start); day < end; day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    tradingDays.push(day);
  }
  let rollingEquity = INITIAL_EQUITY;
  const dailyReturnsPct = tradingDays.map((day) => {
    const profit = dailyProfit.get(day) ?? 0;
    const value = rollingEquity ? (profit / rollingEquity) * 100 : 0;
    rollingEquity += profit;
    return value;
  });
  const dailyMean = dailyReturnsPct.length
    ? dailyReturnsPct.reduce((sum, value) => sum + value, 0) / dailyReturnsPct.length
    : 0;
  const dailyVariance = dailyReturnsPct.length
    ? dailyReturnsPct.reduce((sum, value) => sum + (value - dailyMean) ** 2, 0) /
      dailyReturnsPct.length
    : 0;
  const dailyStd = Math.sqrt(dailyVariance);
  const netProfit = equity - INITIAL_EQUITY;
  const returnPct = (netProfit / INITIAL_EQUITY) * 100;
  const expectancyR = completed.length
    ? completed.reduce((sum, trade) => sum + trade.netR, 0) / completed.length
    : 0;

  return {
    trades: completed,
    tradeCount: completed.length,
    finalEquity: equity,
    netProfit,
    returnPct,
    winRate: completed.length ? (winners / completed.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 999 : 0,
    expectancyR,
    maxDrawdownPct,
    worstDayPct,
    maxLossStreak,
    recoveryFactor: Math.abs(maxDrawdownPct) > 0 ? returnPct / Math.abs(maxDrawdownPct) : 0,
    sharpe: dailyStd > 0 ? (dailyMean / dailyStd) * Math.sqrt(252) : 0,
    skippedDailyStop,
    skippedRiskCap,
    dailyReturnsPct,
  };
}

function compactMetrics(metrics) {
  return {
    tradeCount: metrics.tradeCount,
    netProfit: metrics.netProfit,
    returnPct: metrics.returnPct,
    winRate: metrics.winRate,
    profitFactor: metrics.profitFactor,
    expectancyR: metrics.expectancyR,
    maxDrawdownPct: metrics.maxDrawdownPct,
    worstDayPct: metrics.worstDayPct,
    maxLossStreak: metrics.maxLossStreak,
    recoveryFactor: metrics.recoveryFactor,
    sharpe: metrics.sharpe,
    skippedDailyStop: metrics.skippedDailyStop,
    skippedRiskCap: metrics.skippedRiskCap,
  };
}

function compactTradeBreakdown(metrics) {
  const trades = metrics.trades;
  const countBy = (key, value) => trades.filter((trade) => trade[key] === value).length;
  const winningTrades = trades.filter((trade) => trade.profit > 0);
  const losingTrades = trades.filter((trade) => trade.profit < 0);
  return {
    longTrades: countBy("direction", "long"),
    shortTrades: countBy("direction", "short"),
    takeProfits: countBy("exitReason", "take_profit"),
    stopLosses: countBy("exitReason", "stop_loss"),
    timeExits: countBy("exitReason", "time_exit"),
    averageProfitPerTrade: trades.length
      ? trades.reduce((sum, trade) => sum + trade.profit, 0) / trades.length
      : 0,
    averageWinningTrade: winningTrades.length
      ? winningTrades.reduce((sum, trade) => sum + trade.profit, 0) / winningTrades.length
      : 0,
    averageLosingTrade: losingTrades.length
      ? losingTrades.reduce((sum, trade) => sum + trade.profit, 0) / losingTrades.length
      : 0,
    bestTrade: trades.length ? Math.max(...trades.map((trade) => trade.profit)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((trade) => trade.profit)) : 0,
  };
}

function trainingScore(full, firstHalf, secondHalf) {
  if (full.tradeCount < 30 || firstHalf.tradeCount < 10 || secondHalf.tradeCount < 10) return -Infinity;
  const suspiciousPenalty = full.profitFactor > 4 && full.tradeCount < 150 ? 100 : 0;
  const gatePenalty = trainingGatePassed(full, firstHalf, secondHalf) ? 0 : 40;
  return (
    Math.min(firstHalf.returnPct, secondHalf.returnPct) * 4 +
    full.expectancyR * 30 +
    full.recoveryFactor * 5 +
    Math.min(150, full.tradeCount) * 0.08 +
    full.profitFactor * 4 +
    full.maxDrawdownPct * 1.5 +
    full.worstDayPct * 2 -
    full.maxLossStreak * 0.5 -
    suspiciousPenalty -
    gatePenalty
  );
}

function trainingGatePassed(full, firstHalf, secondHalf) {
  return (
    full.tradeCount >= 60 &&
    firstHalf.tradeCount >= 20 &&
    secondHalf.tradeCount >= 20 &&
    full.maxDrawdownPct >= -10 &&
    full.worstDayPct >= -4 &&
    full.profitFactor >= 1 &&
    firstHalf.returnPct > 0 &&
    secondHalf.returnPct > 0
  );
}

function assetTrainingScore(full, firstHalf, secondHalf) {
  if (full.tradeCount < 20 || firstHalf.tradeCount < 6 || secondHalf.tradeCount < 6) return -Infinity;
  const stable =
    full.profitFactor >= 1 &&
    full.maxDrawdownPct >= -10 &&
    firstHalf.returnPct > 0 &&
    secondHalf.returnPct > 0;
  return (
    Math.min(firstHalf.returnPct, secondHalf.returnPct) * 5 +
    full.expectancyR * 25 +
    full.recoveryFactor * 4 +
    Math.min(100, full.tradeCount) * 0.06 +
    full.profitFactor * 3 +
    full.maxDrawdownPct * 1.2 -
    full.maxLossStreak * 0.4 -
    (stable ? 0 : 30)
  );
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleBlock(days, random, length, blockSize = 5) {
  const result = [];
  while (result.length < length) {
    const start = Math.floor(random() * Math.max(1, days.length - blockSize + 1));
    for (let offset = 0; offset < blockSize && result.length < length; offset += 1) {
      result.push(days[(start + offset) % days.length]);
    }
  }
  return result;
}

function runPhase(days, targetPct, maxDays) {
  let equity = 100;
  let peak = 100;
  for (let index = 0; index < maxDays; index += 1) {
    const dailyReturn = days[index] ?? 0;
    if (dailyReturn <= DAILY_STOP_PCT) {
      return { passed: false, safe: false, days: index + 1, reason: "daily_limit" };
    }
    equity *= 1 + dailyReturn / 100;
    peak = Math.max(peak, equity);
    if (equity <= 90) {
      return { passed: false, safe: false, days: index + 1, reason: "total_limit" };
    }
    if (equity >= 100 + targetPct) {
      return { passed: true, safe: true, days: index + 1, reason: "target" };
    }
  }
  return { passed: false, safe: true, days: maxDays, reason: "timeout" };
}

function monteCarlo(dailyReturnsPct, runs = MONTE_CARLO_RUNS) {
  const usable = dailyReturnsPct.length ? dailyReturnsPct : [0];
  const random = mulberry32(20260621);
  let passed = 0;
  let safe = 0;
  let phase1Passed = 0;
  let phase2Passed = 0;
  const completionDays = [];
  const worstDrawdowns = [];

  for (let run = 0; run < runs; run += 1) {
    const sampled = sampleBlock(usable, random, 120);
    let equity = 100;
    let peak = 100;
    let worstDrawdown = 0;
    let pathSafe = true;
    for (const dailyReturn of sampled) {
      if (dailyReturn <= DAILY_STOP_PCT) pathSafe = false;
      equity *= 1 + dailyReturn / 100;
      peak = Math.max(peak, equity);
      worstDrawdown = Math.min(worstDrawdown, ((equity - peak) / peak) * 100);
      if (equity <= 90) pathSafe = false;
    }
    if (pathSafe) safe += 1;
    worstDrawdowns.push(worstDrawdown);

    const phase1 = runPhase(sampled.slice(0, 60), 8, 60);
    if (phase1.passed) phase1Passed += 1;
    if (!phase1.passed) continue;
    const phase2 = runPhase(sampled.slice(60, 100), 4, 40);
    if (phase2.passed) phase2Passed += 1;
    if (phase2.passed) {
      passed += 1;
      completionDays.push(phase1.days + phase2.days);
    }
  }

  worstDrawdowns.sort((left, right) => left - right);
  completionDays.sort((left, right) => left - right);
  return {
    simulations: runs,
    cpp: (passed / runs) * 100,
    phase1PassProbability: (phase1Passed / runs) * 100,
    phase2PassProbabilityConditional:
      phase1Passed > 0 ? (phase2Passed / phase1Passed) * 100 : 0,
    rulesSafetyProbability: (safe / runs) * 100,
    medianCompletionDays: completionDays.length
      ? completionDays[Math.floor(completionDays.length / 2)]
      : null,
    p90CompletionDays: completionDays.length
      ? completionDays[Math.floor(completionDays.length * 0.9)]
      : null,
    worstDrawdownP95: worstDrawdowns[Math.floor(worstDrawdowns.length * 0.05)] ?? 0,
  };
}

function monteCarloSequential(dailyReturnsPct, runs = MONTE_CARLO_RUNS) {
  const usable = dailyReturnsPct.length ? dailyReturnsPct : [0];
  const random = mulberry32(20260622);
  let passed = 0;
  let safe = 0;
  let phase1Passed = 0;
  let phase2Passed = 0;
  const completionDays = [];
  const worstDrawdowns = [];

  for (let run = 0; run < runs; run += 1) {
    const sampled = sampleBlock(usable, random, 120);
    const phase1 = runPhase(sampled.slice(0, 60), 8, 60);
    if (phase1.safe) safe += 1;
    if (!phase1.passed) continue;
    phase1Passed += 1;
    const phase2Start = phase1.days;
    const phase2 = runPhase(sampled.slice(phase2Start, phase2Start + 40), 4, 40);
    if (phase2.passed) {
      phase2Passed += 1;
      passed += 1;
      completionDays.push(phase1.days + phase2.days);
    }

    let equity = 100;
    let peak = 100;
    let worstDrawdown = 0;
    for (const dailyReturn of sampled) {
      equity *= 1 + dailyReturn / 100;
      peak = Math.max(peak, equity);
      worstDrawdown = Math.min(worstDrawdown, ((equity - peak) / peak) * 100);
    }
    worstDrawdowns.push(worstDrawdown);
  }

  completionDays.sort((left, right) => left - right);
  worstDrawdowns.sort((left, right) => left - right);
  return {
    simulations: runs,
    cpp: (passed / runs) * 100,
    phase1PassProbability: (phase1Passed / runs) * 100,
    phase2PassProbabilityConditional:
      phase1Passed > 0 ? (phase2Passed / phase1Passed) * 100 : 0,
    rulesSafetyProbability: (safe / runs) * 100,
    medianCompletionDays: completionDays.length
      ? completionDays[Math.floor(completionDays.length / 2)]
      : null,
    p90CompletionDays: completionDays.length
      ? completionDays[Math.min(completionDays.length - 1, Math.floor(completionDays.length * 0.9))]
      : null,
    worstDrawdownP95: worstDrawdowns.length
      ? worstDrawdowns[Math.floor(worstDrawdowns.length * 0.05)]
      : 0,
  };
}

function rollingCandidateScore(metrics, firstHalf, secondHalf) {
  if (
    metrics.tradeCount < 12 ||
    firstHalf.tradeCount < 4 ||
    secondHalf.tradeCount < 4 ||
    metrics.profitFactor < 1.05 ||
    metrics.maxDrawdownPct < -8 ||
    firstHalf.returnPct <= 0 ||
    secondHalf.returnPct <= 0
  ) {
    return -Infinity;
  }
  return (
    Math.min(firstHalf.returnPct, secondHalf.returnPct) * 6 +
    metrics.expectancyR * 30 +
    metrics.profitFactor * 5 +
    metrics.recoveryFactor * 4 +
    metrics.maxDrawdownPct * 1.5 -
    metrics.maxLossStreak * 0.5 +
    Math.min(80, metrics.tradeCount) * 0.05
  );
}

function monthWindows2026() {
  const windows = [];
  let start = Date.parse("2026-01-01T00:00:00Z");
  while (start < END) {
    const date = new Date(start);
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    windows.push({
      month: new Date(start).toISOString().slice(0, 7),
      start,
      end: Math.min(next, END),
    });
    start = next;
  }
  return windows;
}

function applyCostStress(trades, multiplier) {
  return trades.map((trade) => {
    const costR = trade.grossR - trade.netR;
    return { ...trade, netR: trade.grossR - costR * multiplier };
  });
}

function writeRolling2026Reports(assetCandidates) {
  const unique = new Map();
  for (const candidate of assetCandidates) {
    const key = `${candidate.symbol}|${candidate.family}|${JSON.stringify(candidate.config)}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const pool = [...unique.values()];
  const months = monthWindows2026();
  const selections = [];
  const stitchedTrades = [];

  for (const month of months) {
    const trainEnd = month.start;
    const trainStart = Math.max(IS_START, trainEnd - 180 * DAY);
    const trainMiddle = trainStart + Math.floor((trainEnd - trainStart) / 2);
    const ranked = pool
      .map((candidate) => {
        const metrics = simulatePortfolio(candidate.rawTrades, 0.5, trainStart, trainEnd);
        const firstHalf = simulatePortfolio(candidate.rawTrades, 0.5, trainStart, trainMiddle);
        const secondHalf = simulatePortfolio(candidate.rawTrades, 0.5, trainMiddle, trainEnd);
        return {
          candidate,
          metrics,
          firstHalf,
          secondHalf,
          score: rollingCandidateScore(metrics, firstHalf, secondHalf),
        };
      })
      .filter((row) => Number.isFinite(row.score))
      .sort((left, right) => right.score - left.score);

    const selected = [];
    const usedBuckets = new Set();
    const symbolCounts = new Map();
    for (const row of ranked) {
      const bucket = `${row.candidate.symbol}|${row.candidate.family}`;
      const symbolCount = symbolCounts.get(row.candidate.symbol) ?? 0;
      if (usedBuckets.has(bucket) || symbolCount >= 2) continue;
      selected.push(row);
      usedBuckets.add(bucket);
      symbolCounts.set(row.candidate.symbol, symbolCount + 1);
      if (selected.length >= 5) break;
    }

    const monthTrades = selected
      .flatMap((row) => row.candidate.rawTrades)
      .filter((trade) => trade.entryTime >= month.start && trade.entryTime < month.end);
    stitchedTrades.push(...monthTrades);
    selections.push({
      month: month.month,
      trainStart: new Date(trainStart).toISOString(),
      trainEnd: new Date(trainEnd).toISOString(),
      engines: selected.map((row) => ({
        symbol: row.candidate.symbol,
        family: row.candidate.family,
        config: row.candidate.config,
        trainingScore: row.score,
        training: compactMetrics(row.metrics),
      })),
      forwardTradeCount: monthTrades.length,
    });
  }

  const variants = RISK_LEVELS.map((riskPct) => {
    const baseline = simulatePortfolio(stitchedTrades, riskPct, OOS_START, END);
    const stress = simulatePortfolio(applyCostStress(stitchedTrades, 1.5), riskPct, OOS_START, END);
    const q1 = simulatePortfolio(
      stitchedTrades,
      riskPct,
      Date.parse("2026-01-01T00:00:00Z"),
      Date.parse("2026-04-01T00:00:00Z")
    );
    const q2 = simulatePortfolio(
      stitchedTrades,
      riskPct,
      Date.parse("2026-04-01T00:00:00Z"),
      END
    );
    const mc = monteCarloSequential(baseline.dailyReturnsPct);
    const stressMc = monteCarloSequential(stress.dailyReturnsPct);
    const passed =
      baseline.tradeCount >= 80 &&
      baseline.profitFactor >= 1.2 &&
      baseline.maxDrawdownPct >= -6 &&
      baseline.worstDayPct >= DAILY_STOP_PCT &&
      q1.returnPct > 0 &&
      q2.returnPct > 0 &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stress.profitFactor >= 1.05 &&
      stress.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      riskPct,
      baseline: compactMetrics(baseline),
      q1: compactMetrics(q1),
      q2: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stress),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  variants.sort(
    (left, right) =>
      Number(right.verdict === "APPROVED") - Number(left.verdict === "APPROVED") ||
      right.monteCarlo.cpp - left.monteCarlo.cpp ||
      right.baseline.recoveryFactor - left.baseline.recoveryFactor
  );

  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingWindowDays: 180,
      rebalanceFrequency: "monthly",
      forwardRule:
        "Each month uses only data before that month. Selected engines remain unchanged until month end.",
      maximumEngines: 5,
      maximumEnginesPerSymbol: 2,
      costStressMultiplier: 1.5,
    },
    selections,
    stitchedRawTradeCount: stitchedTrades.length,
    variants,
    selected: variants.find((variant) => variant.verdict === "APPROVED") ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "rolling_walk_forward_2026_strategy.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    variants.map((variant) => ({
      risk: variant.riskPct,
      trades: variant.baseline.tradeCount,
      ret: variant.baseline.returnPct.toFixed(2),
      pf: variant.baseline.profitFactor.toFixed(2),
      dd: variant.baseline.maxDrawdownPct.toFixed(2),
      q1: variant.q1.returnPct.toFixed(2),
      q2: variant.q2.returnPct.toFixed(2),
      cpp: variant.monteCarlo.cpp.toFixed(1),
      safety: variant.monteCarlo.rulesSafetyProbability.toFixed(1),
      stressPf: variant.costStress1_5x.profitFactor.toFixed(2),
      stressDd: variant.costStress1_5x.maxDrawdownPct.toFixed(2),
      verdict: variant.verdict,
    }))
  );
  return output;
}

function evaluateWindows(rawTrades, riskPct, windows, fullStart, fullEnd) {
  const details = windows.map(([period, start, end]) => ({
    period,
    ...compactMetrics(simulatePortfolio(rawTrades, riskPct, start, end)),
  }));
  const full = simulatePortfolio(rawTrades, riskPct, fullStart, fullEnd);
  const positiveWindows = details.filter(
    (window) => window.returnPct > 0 && window.profitFactor >= 1
  ).length;
  const worstWindowReturn = Math.min(...details.map((window) => window.returnPct));
  const score =
    positiveWindows * 100 +
    Math.min(0, worstWindowReturn) * 12 +
    full.expectancyR * 40 +
    full.recoveryFactor * 8 +
    full.profitFactor * 5 +
    full.maxDrawdownPct * 2 +
    Math.min(250, full.tradeCount) * 0.03;
  return { full, details, positiveWindows, worstWindowReturn, score };
}

function writeQ2HoldoutReports(
  strictCandidates,
  outputFile = "q2_2026_untouched_holdout_strategy.json",
  finalTestLabel = "untouchedFinalTest"
) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const rankedComponents = strictCandidates
    .filter((candidate) => candidate.scope === "single_asset" && candidate.riskPct === 0.5)
    .map((candidate) => ({
      ...candidate,
      train: evaluateWindows(
        candidate.rawTrades,
        0.5,
        trainingWindows,
        IS_START,
        trainEnd
      ),
    }))
    .filter(
      (candidate) =>
        candidate.train.positiveWindows >= 4 &&
        candidate.train.full.profitFactor >= 1.1 &&
        candidate.train.full.maxDrawdownPct >= -8
    )
    .sort((left, right) => right.train.score - left.train.score);

  const pool = [];
  const usedBuckets = new Set();
  for (const candidate of rankedComponents) {
    const bucket = `${candidate.symbol}|${candidate.family}`;
    if (usedBuckets.has(bucket)) continue;
    usedBuckets.add(bucket);
    pool.push(candidate);
    if (pool.length >= 14) break;
  }

  const systems = [];
  for (const components of fixedCombinations(pool, 2, 5)) {
    const rawTrades = components.flatMap((component) => component.rawTrades);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 100 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ components, rawTrades, riskPct, train });
    }
  }
  systems.sort((left, right) => right.train.score - left.train.score);

  const evaluated = systems.slice(0, 30).map((system, rank) => {
    const oos = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(oos.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      oos.tradeCount >= 20 &&
      oos.returnPct > 0 &&
      oos.profitFactor >= 1.2 &&
      oos.maxDrawdownPct >= -6 &&
      oos.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      components: system.components.map((component) => ({
        symbol: component.symbol,
        family: component.family,
        config: component.config,
      })),
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Oos: compactMetrics(oos),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });

  const selected = evaluated[0] ?? null;
  const selectedSystem = systems[0] ?? null;
  const detailedReport = selectedSystem
    ? (() => {
        const quarterlyWindows = [
          ...trainingWindows,
          ["2026-Q2-partial", testStart, END],
        ];
        const monthlyWindows = [];
        for (
          let cursor = new Date(Date.UTC(2025, 0, 1));
          cursor.getTime() < END;
          cursor = new Date(
            Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
          )
        ) {
          const start = cursor.getTime();
          const next = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1);
          const end = Math.min(next, END);
          monthlyWindows.push([
            `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
            start,
            end,
          ]);
        }
        const summarizeWindow = ([period, start, end]) => {
          const metrics = simulatePortfolio(
            selectedSystem.rawTrades,
            selectedSystem.riskPct,
            start,
            end
          );
          return {
            period,
            ...compactMetrics(metrics),
            ...compactTradeBreakdown(metrics),
          };
        };
        const summarizeComponent = (component, index) => {
          const training = simulatePortfolio(
            component.rawTrades,
            selectedSystem.riskPct,
            IS_START,
            trainEnd
          );
          const q2 = simulatePortfolio(
            component.rawTrades,
            selectedSystem.riskPct,
            testStart,
            END
          );
          const combined = simulatePortfolio(
            component.rawTrades,
            selectedSystem.riskPct,
            IS_START,
            END
          );
          return {
            engine: index + 1,
            symbol: component.symbol,
            family: component.family,
            config: component.config,
            training: {
              ...compactMetrics(training),
              ...compactTradeBreakdown(training),
            },
            q2Oos: {
              ...compactMetrics(q2),
              ...compactTradeBreakdown(q2),
            },
            combined: {
              ...compactMetrics(combined),
              ...compactTradeBreakdown(combined),
            },
          };
        };
        const training = simulatePortfolio(
          selectedSystem.rawTrades,
          selectedSystem.riskPct,
          IS_START,
          trainEnd
        );
        const q2 = simulatePortfolio(
          selectedSystem.rawTrades,
          selectedSystem.riskPct,
          testStart,
          END
        );
        const combined = simulatePortfolio(
          selectedSystem.rawTrades,
          selectedSystem.riskPct,
          IS_START,
          END
        );
        return {
          accountingNote:
            "Each row in period and engine tables is independently simulated from the initial 10000 balance. Combined metrics use one continuous balance for the whole requested interval.",
          training: {
            ...compactMetrics(training),
            ...compactTradeBreakdown(training),
          },
          q2Oos: {
            ...compactMetrics(q2),
            ...compactTradeBreakdown(q2),
          },
          combined: {
            ...compactMetrics(combined),
            ...compactTradeBreakdown(combined),
          },
          quarterly: quarterlyWindows.map(summarizeWindow),
          monthly: monthlyWindows.map(summarizeWindow),
          engines: selectedSystem.components.map(summarizeComponent),
        };
      })()
    : null;
  const robustness = selectedSystem
    ? (() => {
        const monthlyWindows = [
          ["2026-04", testStart, Date.parse("2026-05-01T00:00:00Z")],
          [
            "2026-05",
            Date.parse("2026-05-01T00:00:00Z"),
            Date.parse("2026-06-01T00:00:00Z"),
          ],
          ["2026-06-partial", Date.parse("2026-06-01T00:00:00Z"), END],
        ];
        const monthlyQ2 = monthlyWindows.map(([period, start, end]) => ({
          period,
          ...compactMetrics(
            simulatePortfolio(selectedSystem.rawTrades, selectedSystem.riskPct, start, end)
          ),
        }));
        const stressed2x = simulatePortfolio(
          applyCostStress(selectedSystem.rawTrades, 2),
          selectedSystem.riskPct,
          testStart,
          END
        );
        const leaveOneEngineOut = selectedSystem.components.map((removed, removedIndex) => {
          const remainingTrades = selectedSystem.components
            .filter((_, index) => index !== removedIndex)
            .flatMap((component) => component.rawTrades);
          return {
            removed: {
              symbol: removed.symbol,
              family: removed.family,
              config: removed.config,
            },
            q2Oos: compactMetrics(
              simulatePortfolio(remainingTrades, selectedSystem.riskPct, testStart, END)
            ),
          };
        });
        const withoutGer40Trades = selectedSystem.components
          .filter((component) => component.symbol !== "GER40")
          .flatMap((component) => component.rawTrades);
        const withoutGer40 = compactMetrics(
          simulatePortfolio(withoutGer40Trades, selectedSystem.riskPct, testStart, END)
        );
        return {
          monthlyQ2,
          positiveMonths: monthlyQ2.filter(
            (month) => month.returnPct > 0 && month.profitFactor >= 1
          ).length,
          costStress2x: compactMetrics(stressed2x),
          costStress2xMonteCarlo: monteCarloSequential(stressed2x.dailyReturnsPct),
          leaveOneEngineOut,
          withoutAllGer40: withoutGer40,
        };
      })()
    : null;
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      [finalTestLabel]: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "The final candidate is training rank #1. Q2 results are reported but never used to replace it with a lower-ranked system.",
      costStressMultiplier: 1.5,
    },
    componentPool: pool.map((candidate) => ({
      symbol: candidate.symbol,
      family: candidate.family,
      config: candidate.config,
      trainingScore: candidate.train.score,
      training: compactMetrics(candidate.train.full),
    })),
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected,
    detailedReport,
    robustness,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, outputFile),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 15).map((candidate) => ({
      rank: candidate.trainingRank,
      engines: candidate.components.length,
      risk: candidate.riskPct,
      trainRet: candidate.training.metrics.returnPct.toFixed(2),
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Oos.tradeCount,
      q2Ret: candidate.q2Oos.returnPct.toFixed(2),
      q2Pf: candidate.q2Oos.profitFactor.toFixed(2),
      q2Dd: candidate.q2Oos.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function confirmedPrimaryTrades(primaryTrades, confirmerTrades, confirmationWindowMs) {
  const byDirection = {
    long: confirmerTrades
      .filter((trade) => trade.direction === "long")
      .sort((left, right) => left.entryTime - right.entryTime),
    short: confirmerTrades
      .filter((trade) => trade.direction === "short")
      .sort((left, right) => left.entryTime - right.entryTime),
  };
  return primaryTrades.filter((trade) =>
    byDirection[trade.direction].some(
      (confirmation) =>
        confirmation.entryTime <= trade.entryTime &&
        confirmation.entryTime >= trade.entryTime - confirmationWindowMs
    )
  );
}

function writeConfirmedEngineReports(strictCandidates) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const ranked = strictCandidates
    .filter((candidate) => candidate.scope === "single_asset" && candidate.riskPct === 0.5)
    .map((candidate) => ({
      ...candidate,
      train: evaluateWindows(
        candidate.rawTrades,
        0.5,
        trainingWindows,
        IS_START,
        trainEnd
      ),
    }))
    .filter(
      (candidate) =>
        candidate.train.full.tradeCount >= 20 &&
        candidate.train.positiveWindows >= 4 &&
        candidate.train.full.profitFactor >= 1.1 &&
        candidate.train.full.maxDrawdownPct >= -8
    )
    .sort((left, right) => right.train.score - left.train.score);

  const pool = [];
  const bucketCounts = new Map();
  for (const candidate of ranked) {
    const bucket = `${candidate.symbol}|${candidate.family}`;
    const count = bucketCounts.get(bucket) ?? 0;
    if (count >= 3) continue;
    bucketCounts.set(bucket, count + 1);
    pool.push(candidate);
  }

  const systems = [];
  for (const primary of pool) {
    for (const confirmer of pool) {
      if (
        primary === confirmer ||
        primary.symbol !== confirmer.symbol ||
        primary.family === confirmer.family
      ) {
        continue;
      }
      for (const confirmationHours of [1, 2, 4]) {
        const rawTrades = confirmedPrimaryTrades(
          primary.rawTrades,
          confirmer.rawTrades,
          confirmationHours * HOUR
        );
        for (const riskPct of RISK_LEVELS) {
          const train = evaluateWindows(
            rawTrades,
            riskPct,
            trainingWindows,
            IS_START,
            trainEnd
          );
          if (
            train.full.tradeCount < 30 ||
            train.positiveWindows < 4 ||
            train.worstWindowReturn < -2.5 ||
            train.full.profitFactor < 1.15 ||
            train.full.maxDrawdownPct < -8
          ) {
            continue;
          }
          systems.push({
            primary,
            confirmer,
            confirmationHours,
            rawTrades,
            riskPct,
            train,
          });
        }
      }
    }
  }
  systems.sort((left, right) => right.train.score - left.train.score);

  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      symbol: system.primary.symbol,
      primary: {
        family: system.primary.family,
        config: system.primary.config,
      },
      confirmer: {
        family: system.confirmer.family,
        config: system.confirmer.config,
      },
      confirmationHours: system.confirmationHours,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Rank is fixed using training only. A primary trade is allowed only when a different strategy family on the same asset produced the same-direction entry in the preceding confirmation window.",
      costStressMultiplier: 1.5,
    },
    poolSize: pool.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "confirmed_engine_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      symbol: candidate.symbol,
      primary: candidate.primary.family,
      confirmer: candidate.confirmer.family,
      hours: candidate.confirmationHours,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function onlineAllocatorScore(longWindow, mediumWindow, shortWindow) {
  if (
    longWindow.tradeCount < 25 ||
    mediumWindow.tradeCount < 12 ||
    shortWindow.tradeCount < 5 ||
    longWindow.returnPct <= 0 ||
    mediumWindow.returnPct <= 0 ||
    shortWindow.returnPct <= 0 ||
    longWindow.profitFactor < 1.1 ||
    mediumWindow.profitFactor < 1.05 ||
    shortWindow.profitFactor < 1.02 ||
    longWindow.maxDrawdownPct < -7
  ) {
    return -Infinity;
  }
  return (
    Math.min(
      longWindow.expectancyR,
      mediumWindow.expectancyR,
      shortWindow.expectancyR
    ) *
      80 +
    Math.min(longWindow.profitFactor, mediumWindow.profitFactor, shortWindow.profitFactor) *
      10 +
    shortWindow.returnPct * 3 +
    mediumWindow.returnPct * 1.5 +
    longWindow.recoveryFactor * 3 +
    longWindow.maxDrawdownPct
  );
}

function writeRobustOnlineAllocatorReports(assetCandidates) {
  const excludedFamilies = new Set([
    "novel_opening_drive",
    "novel_session_stretch_reversion",
    "novel_compression_release",
  ]);
  const unique = new Map();
  for (const candidate of assetCandidates) {
    if (excludedFamilies.has(candidate.family)) continue;
    const key = `${candidate.symbol}|${candidate.family}|${JSON.stringify(candidate.config)}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const pool = [...unique.values()];
  const selections = [];
  const stitchedTrades = [];
  for (const month of monthWindows2026()) {
    const longStart = Math.max(IS_START, month.start - 240 * DAY);
    const mediumStart = Math.max(IS_START, month.start - 120 * DAY);
    const shortStart = Math.max(IS_START, month.start - 60 * DAY);
    const ranked = pool
      .map((candidate) => {
        const longWindow = simulatePortfolio(
          candidate.rawTrades,
          0.5,
          longStart,
          month.start
        );
        const mediumWindow = simulatePortfolio(
          candidate.rawTrades,
          0.5,
          mediumStart,
          month.start
        );
        const shortWindow = simulatePortfolio(
          candidate.rawTrades,
          0.5,
          shortStart,
          month.start
        );
        return {
          candidate,
          longWindow,
          mediumWindow,
          shortWindow,
          score: onlineAllocatorScore(longWindow, mediumWindow, shortWindow),
        };
      })
      .filter((row) => Number.isFinite(row.score))
      .sort((left, right) => right.score - left.score);

    const selected = [];
    const usedSymbols = new Set();
    const usedFamilies = new Set();
    for (const row of ranked) {
      if (
        usedSymbols.has(row.candidate.symbol) ||
        usedFamilies.has(row.candidate.family)
      ) {
        continue;
      }
      selected.push(row);
      usedSymbols.add(row.candidate.symbol);
      usedFamilies.add(row.candidate.family);
      if (selected.length >= 4) break;
    }
    const monthTrades = selected
      .flatMap((row) => row.candidate.rawTrades)
      .filter(
        (trade) => trade.entryTime >= month.start && trade.entryTime < month.end
      );
    stitchedTrades.push(...monthTrades);
    selections.push({
      month: month.month,
      engines: selected.map((row) => ({
        symbol: row.candidate.symbol,
        family: row.candidate.family,
        config: row.candidate.config,
        score: row.score,
        longWindow: compactMetrics(row.longWindow),
        mediumWindow: compactMetrics(row.mediumWindow),
        shortWindow: compactMetrics(row.shortWindow),
      })),
      forwardTradeCount: monthTrades.length,
    });
  }

  const variants = RISK_LEVELS.map((riskPct) => {
    const baseline = simulatePortfolio(stitchedTrades, riskPct, OOS_START, END);
    const stress1_5x = simulatePortfolio(
      applyCostStress(stitchedTrades, 1.5),
      riskPct,
      OOS_START,
      END
    );
    const stress2x = simulatePortfolio(
      applyCostStress(stitchedTrades, 2),
      riskPct,
      OOS_START,
      END
    );
    const q1 = simulatePortfolio(
      stitchedTrades,
      riskPct,
      Date.parse("2026-01-01T00:00:00Z"),
      Date.parse("2026-04-01T00:00:00Z")
    );
    const q2 = simulatePortfolio(
      stitchedTrades,
      riskPct,
      Date.parse("2026-04-01T00:00:00Z"),
      END
    );
    const mc = monteCarloSequential(baseline.dailyReturnsPct);
    const stressMc = monteCarloSequential(stress1_5x.dailyReturnsPct);
    const passed =
      baseline.tradeCount >= 80 &&
      baseline.returnPct > 0 &&
      baseline.profitFactor >= 1.2 &&
      baseline.maxDrawdownPct >= -6 &&
      baseline.worstDayPct >= DAILY_STOP_PCT &&
      q1.returnPct > 0 &&
      q2.returnPct > 0 &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stress1_5x.profitFactor >= 1.05 &&
      stress1_5x.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      riskPct,
      baseline: compactMetrics(baseline),
      q1: compactMetrics(q1),
      q2: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stress1_5x),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stress2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      allocation:
        "At each month start, select up to four non-correlated engines that are positive over trailing 60, 120, and 240 days. Current PropTrade engine families are excluded.",
      noLookahead:
        "Every monthly selection uses only trades with entry times before that month.",
      costStressMultipliers: [1.5, 2],
    },
    poolSize: pool.length,
    selections,
    variants,
    selected: variants.find((variant) => variant.verdict === "APPROVED") ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "robust_online_allocator_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    variants.map((variant) => ({
      risk: variant.riskPct,
      trades: variant.baseline.tradeCount,
      ret: variant.baseline.returnPct.toFixed(2),
      pf: variant.baseline.profitFactor.toFixed(2),
      dd: variant.baseline.maxDrawdownPct.toFixed(2),
      q1: variant.q1.returnPct.toFixed(2),
      q2: variant.q2.returnPct.toFixed(2),
      cpp: variant.monteCarlo.cpp.toFixed(1),
      stressPf: variant.costStress1_5x.profitFactor.toFixed(2),
      verdict: variant.verdict,
    }))
  );
  return output;
}

function blueGuardianScore(metrics, mc) {
  const cppScore = Math.min(100, mc.cpp);
  const safetyScore = Math.min(100, mc.rulesSafetyProbability);
  const drawdownScore = Math.max(0, 100 - Math.abs(metrics.maxDrawdownPct) * 10);
  const stabilityScore = Math.max(0, 100 - Math.abs(metrics.worstDayPct) * 20);
  const pfScore = Math.min(100, Math.max(0, (metrics.profitFactor - 1) * 80 + 40));
  return cppScore * 0.4 + safetyScore * 0.25 + drawdownScore * 0.15 + stabilityScore * 0.1 + pfScore * 0.1;
}

function verdict(oos, mc) {
  if (
    oos.tradeCount >= 30 &&
    oos.profitFactor >= 1.2 &&
    oos.maxDrawdownPct >= -8 &&
    oos.worstDayPct >= DAILY_STOP_PCT &&
    mc.cpp >= 60 &&
    mc.rulesSafetyProbability >= 95
  ) {
    return "APPROVED";
  }
  if (
    oos.tradeCount >= 20 &&
    oos.profitFactor >= 1 &&
    oos.maxDrawdownPct >= -10 &&
    mc.rulesSafetyProbability >= 90
  ) {
    return "REVIEW REQUIRED";
  }
  return "REJECTED";
}

function strictWindowEvaluation(rawTrades, riskPct) {
  const windows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-04-01T00:00:00Z")],
    ["2026-Q2", Date.parse("2026-04-01T00:00:00Z"), END],
  ].map(([period, start, end]) => ({
    period,
    ...compactMetrics(simulatePortfolio(rawTrades, riskPct, start, end)),
  }));
  const full = simulatePortfolio(rawTrades, riskPct, IS_START, END);
  const positiveWindows = windows.filter(
    (window) => window.returnPct > 0 && window.profitFactor >= 1
  ).length;
  const worstWindowReturn = Math.min(...windows.map((window) => window.returnPct));
  const minimumWindowTrades = Math.min(...windows.map((window) => window.tradeCount));
  const passed =
    full.tradeCount >= 120 &&
    positiveWindows >= 5 &&
    worstWindowReturn >= -2.5 &&
    minimumWindowTrades >= 8 &&
    full.profitFactor >= 1.15 &&
    full.maxDrawdownPct >= -8 &&
    full.worstDayPct >= DAILY_STOP_PCT;
  const score =
    positiveWindows * 100 +
    Math.min(0, worstWindowReturn) * 12 +
    full.expectancyR * 40 +
    full.recoveryFactor * 8 +
    full.profitFactor * 5 +
    full.maxDrawdownPct * 2 +
    Math.min(250, full.tradeCount) * 0.03;
  return { full, windows, positiveWindows, worstWindowReturn, minimumWindowTrades, passed, score };
}

function writeStrictStableReports(rows, reportPrefix) {
  const evaluated = rows
    .sort(
      (left, right) =>
        Number(right.stability.passed) - Number(left.stability.passed) ||
        right.stability.score - left.stability.score
    )
    .slice(0, 80)
    .map((candidate) => {
      const mc = monteCarlo(candidate.stability.full.dailyReturnsPct);
      const approved =
        candidate.stability.passed &&
        mc.cpp >= 60 &&
        mc.rulesSafetyProbability >= 95;
      return {
        scope: candidate.scope,
        symbol: candidate.symbol,
        family: candidate.family,
        config: candidate.config,
        riskPct: candidate.riskPct,
        stabilityPassed: candidate.stability.passed,
        positiveWindows: candidate.stability.positiveWindows,
        worstWindowReturn: candidate.stability.worstWindowReturn,
        metrics: compactMetrics(candidate.stability.full),
        windows: candidate.stability.windows,
        monteCarlo: mc,
        verdict: approved ? "APPROVED" : "REJECTED",
      };
    });
  evaluated.sort(
    (left, right) =>
      Number(right.verdict === "APPROVED") - Number(left.verdict === "APPROVED") ||
      right.monteCarlo.cpp - left.monteCarlo.cpp ||
      right.positiveWindows - left.positiveWindows ||
      right.metrics.recoveryFactor - left.metrics.recoveryFactor
  );
  const output = {
    generatedAt: new Date().toISOString(),
    objective:
      "One unchanged causal strategy and risk level across 2025-2026; no quarterly switching.",
    gates: {
      positiveQuartersRequired: 5,
      totalQuarters: 6,
      worstQuarterReturnFloorPct: -2.5,
      minimumTradesPerQuarter: 8,
      minimumTotalTrades: 120,
      minimumProfitFactor: 1.15,
      maximumDrawdownPct: 8,
      minimumCpp: 60,
      minimumRulesSafetyProbability: 95,
    },
    candidatesEvaluated: rows.length,
    finalists: evaluated,
    selected: evaluated.find((candidate) => candidate.verdict === "APPROVED") ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${reportPrefix}.json`),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  const headers = [
    "scope",
    "symbol",
    "family",
    "risk_pct",
    "positive_quarters",
    "worst_quarter_return_pct",
    "trades",
    "return_pct",
    "profit_factor",
    "max_drawdown_pct",
    "cpp",
    "safety",
    "verdict",
    "config",
  ];
  const data = evaluated.map((candidate) => [
    candidate.scope,
    candidate.symbol ?? "ALL",
    candidate.family,
    candidate.riskPct,
    candidate.positiveWindows,
    candidate.worstWindowReturn,
    candidate.metrics.tradeCount,
    candidate.metrics.returnPct,
    candidate.metrics.profitFactor,
    candidate.metrics.maxDrawdownPct,
    candidate.monteCarlo.cpp,
    candidate.monteCarlo.rulesSafetyProbability,
    candidate.verdict,
    JSON.stringify(candidate.config),
  ]);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${reportPrefix}_summary.csv`),
    [headers, ...data].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      scope: candidate.scope,
      symbol: candidate.symbol ?? "ALL",
      family: candidate.family,
      risk: candidate.riskPct,
      quarters: `${candidate.positiveWindows}/6`,
      worstQ: candidate.worstWindowReturn.toFixed(2),
      trades: candidate.metrics.tradeCount,
      ret: candidate.metrics.returnPct.toFixed(2),
      pf: candidate.metrics.profitFactor.toFixed(2),
      dd: candidate.metrics.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      safety: candidate.monteCarlo.rulesSafetyProbability.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function fixedCombinations(values, minSize, maxSize) {
  const result = [];
  function visit(start, selected) {
    if (selected.length >= minSize) result.push([...selected]);
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

function writeStrictEnsembleReports(rows) {
  const baseRisk = 0.5;
  const ranked = rows
    .filter(
      (candidate) =>
        candidate.scope === "single_asset" &&
        candidate.riskPct === baseRisk &&
        candidate.stability.positiveWindows >= 5 &&
        candidate.stability.full.profitFactor >= 1.1 &&
        candidate.stability.full.maxDrawdownPct >= -8
    )
    .sort((left, right) => right.stability.score - left.stability.score);
  const pool = [];
  const perBucket = new Map();
  for (const candidate of ranked) {
    const bucket = `${candidate.symbol}|${candidate.family}`;
    const count = perBucket.get(bucket) ?? 0;
    if (count >= 1) continue;
    perBucket.set(bucket, count + 1);
    pool.push(candidate);
    if (pool.length >= 14) break;
  }

  const systems = [];
  for (const components of fixedCombinations(pool, 2, 5)) {
    const uniqueKeys = new Set(
      components.map((component) => `${component.symbol}|${component.family}`)
    );
    if (uniqueKeys.size !== components.length) continue;
    const rawTrades = components.flatMap((component) => component.rawTrades);
    for (const riskPct of RISK_LEVELS) {
      const stability = strictWindowEvaluation(rawTrades, riskPct);
      if (
        stability.full.tradeCount < 120 ||
        stability.positiveWindows < 5 ||
        stability.worstWindowReturn < -2.5 ||
        stability.full.maxDrawdownPct < -8 ||
        stability.full.profitFactor < 1.15
      ) {
        continue;
      }
      systems.push({
        components,
        riskPct,
        rawTrades,
        stability,
      });
    }
  }

  systems.sort((left, right) => right.stability.score - left.stability.score);
  const evaluated = systems.slice(0, 120).map((system) => {
    const mc = monteCarlo(system.stability.full.dailyReturnsPct);
    const approved =
      system.stability.passed &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95;
    return {
      components: system.components.map((component) => ({
        symbol: component.symbol,
        family: component.family,
        config: component.config,
      })),
      riskPct: system.riskPct,
      positiveWindows: system.stability.positiveWindows,
      worstWindowReturn: system.stability.worstWindowReturn,
      metrics: compactMetrics(system.stability.full),
      windows: system.stability.windows,
      monteCarlo: mc,
      verdict: approved ? "APPROVED" : "REJECTED",
    };
  });
  evaluated.sort(
    (left, right) =>
      Number(right.verdict === "APPROVED") - Number(left.verdict === "APPROVED") ||
      right.monteCarlo.cpp - left.monteCarlo.cpp ||
      right.metrics.recoveryFactor - left.metrics.recoveryFactor
  );
  const selectedCandidate = evaluated.find((candidate) => candidate.verdict === "APPROVED") ?? null;
  const selectedSystem = selectedCandidate
    ? systems.find(
        (system) =>
          system.riskPct === selectedCandidate.riskPct &&
          system.components.length === selectedCandidate.components.length &&
          system.components.every((component, index) => {
            const selected = selectedCandidate.components[index];
            return (
              selected &&
              component.symbol === selected.symbol &&
              component.family === selected.family &&
              JSON.stringify(component.config) === JSON.stringify(selected.config)
            );
          })
      )
    : null;
  const robustness = selectedSystem
    ? {
        riskSensitivity: [0.75, 1].map((riskPct) => {
          const stability = strictWindowEvaluation(selectedSystem.rawTrades, riskPct);
          return {
            riskPct,
            positiveWindows: stability.positiveWindows,
            worstWindowReturn: stability.worstWindowReturn,
            metrics: compactMetrics(stability.full),
            monteCarlo: monteCarlo(stability.full.dailyReturnsPct),
          };
        }),
        leaveOneEngineOut: selectedSystem.components.map((removed, removedIndex) => {
          const remaining = selectedSystem.components.filter((_, index) => index !== removedIndex);
          const rawTrades = remaining.flatMap((component) => component.rawTrades);
          const stability = strictWindowEvaluation(rawTrades, selectedSystem.riskPct);
          return {
            removed: { symbol: removed.symbol, family: removed.family },
            positiveWindows: stability.positiveWindows,
            worstWindowReturn: stability.worstWindowReturn,
            metrics: compactMetrics(stability.full),
            monteCarlo: monteCarlo(stability.full.dailyReturnsPct),
          };
        }),
        executionStress: [
          { costMultiplier: 1, penaltyR: 0 },
          { costMultiplier: 1.5, penaltyR: 0 },
          { costMultiplier: 2, penaltyR: 0 },
          { costMultiplier: 1, penaltyR: 0.1 },
          { costMultiplier: 1, penaltyR: 0.2 },
        ].map(({ costMultiplier, penaltyR }) => {
          const stressedTrades = selectedSystem.rawTrades.map((trade) => {
            const originalCostR = trade.grossR - trade.netR;
            return {
              ...trade,
              netR: trade.grossR - originalCostR * costMultiplier - penaltyR,
            };
          });
          const stability = strictWindowEvaluation(stressedTrades, selectedSystem.riskPct);
          return {
            costMultiplier,
            penaltyR,
            positiveWindows: stability.positiveWindows,
            worstWindowReturn: stability.worstWindowReturn,
            metrics: compactMetrics(stability.full),
            monteCarlo: monteCarlo(stability.full.dailyReturnsPct),
          };
        }),
      }
    : null;
  const output = {
    generatedAt: new Date().toISOString(),
    objective:
      "One fixed multi-engine system active continuously across all quarters; no regime or calendar switching.",
    componentPool: pool.map((component) => ({
      symbol: component.symbol,
      family: component.family,
      config: component.config,
      metricsAtHalfPercent: compactMetrics(component.stability.full),
      positiveWindows: component.stability.positiveWindows,
    })),
    systemsEvaluated: systems.length,
    finalists: evaluated,
    selected: selectedCandidate,
    robustness,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "strict_fixed_ensemble_2025_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      engines: candidate.components.length,
      risk: candidate.riskPct,
      quarters: `${candidate.positiveWindows}/6`,
      worstQ: candidate.worstWindowReturn.toFixed(2),
      trades: candidate.metrics.tradeCount,
      ret: candidate.metrics.returnPct.toFixed(2),
      pf: candidate.metrics.profitFactor.toFixed(2),
      dd: candidate.metrics.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      safety: candidate.monteCarlo.rulesSafetyProbability.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownReport(result) {
  const selected = result.selected;
  if (!selected) return "# Prop Strategy Discovery\n\nNo strategy passed the in-sample gate.\n";
  const improvements = [
    "Перевірити portfolio-level volatility targeting замість фіксованого ризику.",
    "Додати news blackout як окремий execution filter без зміни ядра сигналу.",
    "Повторити OOS на незалежному брокерському bid/ask наборі даних.",
  ];
  return `# Prop Strategy Discovery 2026

## Summary

* Назва: ${selected.family}
* Актив: EURUSD, GBPUSD, USDJPY, AUDUSD
* Таймфрейм: ${selected.config.timeframeMinutes}m
* Risk per trade: ${selected.riskPct}%
* Daily stop: ${DAILY_STOP_PCT}%
* Max concurrent risk: ${MAX_CONCURRENT_RISK_PCT}%

## Performance

* Net Profit OOS: ${selected.oos.netProfit.toFixed(2)}
* Profit Factor OOS: ${selected.oos.profitFactor.toFixed(2)}
* Expectancy OOS: ${selected.oos.expectancyR.toFixed(3)}R
* Sharpe Ratio OOS: ${selected.oos.sharpe.toFixed(2)}
* Recovery Factor OOS: ${selected.oos.recoveryFactor.toFixed(2)}
* Max Drawdown OOS: ${selected.oos.maxDrawdownPct.toFixed(2)}%
* Trade Count OOS: ${selected.oos.tradeCount}

## Prop Metrics

* CPP: ${selected.monteCarlo.cpp.toFixed(2)}%
* Risk Of Ruin proxy: ${(100 - selected.monteCarlo.rulesSafetyProbability).toFixed(2)}%
* Estimated Phase 1 Days: max 60 in simulation
* Estimated Phase 2 Days: max 40 in simulation
* Median Total Challenge Days: ${selected.monteCarlo.medianCompletionDays ?? "not reached"}
* Blue Guardian Compatibility Score: ${selected.blueGuardianScore.toFixed(1)}/100

## Weaknesses

* OOS охоплює лише першу половину 2026 року.
* Minute OHLC не дає справжньої bid/ask послідовності всередині свічки.
* Monte Carlo використовує block bootstrap історичних денних результатів, а не генеративну модель режимів.

## Improvements

${improvements.map((item) => `* ${item}`).join("\n")}

## Final Verdict

**${selected.verdict}**

Причина: стратегія оцінена за OOS, walk-forward, drawdown та Monte Carlo; остаточне схвалення вимагає виконання всіх порогів, включно з CPP >= 60% і safety >= 95%.
`;
}

function writeCrossSectionalReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildCrossSectionalConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = runCrossSectionalMomentum(datasets, config);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 100 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Each signal buys the strongest and sells the weakest FX instrument by ATR-normalized momentum.",
      costStressMultiplier: 1.5,
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "cross_sectional_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      hour: candidate.config.signalHour,
      lookback: candidate.config.momentumLookback,
      spread: candidate.config.minScoreSpread,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writeMacroTrendReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildMacroTrendConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = Object.entries(datasets).flatMap(([symbol, dataset]) => {
      const rows = dataset[config.timeframeMinutes * MINUTE];
      return rows ? runMacroVolatilityTrend(symbol, rows, config) : [];
    });
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 80 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Positions use 4H ATR-normalized momentum, EMA regime confirmation, initial volatility stop, and adaptive trailing exit.",
      costStressMultiplier: 1.5,
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "macro_trend_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      hour: candidate.config.signalHour,
      lookback: candidate.config.momentumLookback,
      ema: candidate.config.emaPeriod,
      stop: candidate.config.stopAtr,
      trail: candidate.config.trailingAtr,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writePairMeanReversionReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildPairConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = runPairMeanReversion(datasets, config);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 60 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Trades are market-neutral log-spread reversions across EURUSD, GBPUSD, and AUDUSD pairs.",
      costStressMultiplier: 1.5,
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "pair_mean_reversion_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      tf: candidate.config.timeframeMinutes,
      hour: candidate.config.signalHour,
      lookback: candidate.config.lookback,
      entryZ: candidate.config.entryZ,
      stopZ: candidate.config.stopZ,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writePairPortfolioReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const base = buildPairConfigs()
    .map((config) => {
      const rawTrades = runPairMeanReversion(datasets, config);
      const train = evaluateWindows(rawTrades, 0.25, trainingWindows, IS_START, trainEnd);
      return { config, rawTrades, train };
    })
    .filter(
      (candidate) =>
        candidate.train.full.tradeCount >= 60 &&
        candidate.train.positiveWindows >= 4 &&
        candidate.train.full.profitFactor >= 1.15 &&
        candidate.train.full.maxDrawdownPct >= -8
    )
    .sort((left, right) => right.train.score - left.train.score);

  const pool = [];
  const buckets = new Set();
  for (const candidate of base) {
    const bucket = [
      candidate.config.timeframeMinutes,
      candidate.config.signalHour,
      candidate.config.lookback,
      candidate.config.entryZ,
    ].join("|");
    if (buckets.has(bucket)) continue;
    buckets.add(bucket);
    pool.push(candidate);
    if (pool.length >= 12) break;
  }

  const systems = [];
  for (const components of fixedCombinations(pool, 2, 5)) {
    const rawTrades = components.flatMap((component) => component.rawTrades);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 120 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ components, rawTrades, riskPct, train });
    }
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const stressed2x = simulatePortfolio(
      applyCostStress(system.rawTrades, 2),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      components: system.components.map((component) => component.config),
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stressed2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Portfolio combines distinct market-neutral pair-reversion horizons while preserving the 2% simultaneous risk cap.",
      costStressMultipliers: [1.5, 2],
    },
    componentPoolSize: pool.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "pair_portfolio_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      engines: candidate.components.length,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writeMultiSessionReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const monthlyWindows = [];
  for (let year = 2025, month = 0; year < 2026 || month < 6; month += 1) {
    if (month >= 12) {
      year += 1;
      month = 0;
    }
    const start = Date.UTC(year, month, 1);
    if (start >= END) break;
    monthlyWindows.push([
      `${year}-${String(month + 1).padStart(2, "0")}`,
      start,
      Math.min(Date.UTC(year, month + 1, 1), END),
    ]);
  }
  const configs = buildMultiSessionConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = Object.entries(datasets).flatMap(([symbol, dataset]) => {
      const rows = dataset[config.timeframeMinutes * MINUTE];
      return rows ? runMultiSessionStateMachine(symbol, rows, config) : [];
    });
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 100 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const stressed2x = simulatePortfolio(
      applyCostStress(system.rawTrades, 2),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const monthly = monthlyWindows.map(([period, start, end]) => ({
      period,
      ...compactMetrics(simulatePortfolio(system.rawTrades, system.riskPct, start, end)),
    }));
    const positiveMonths = monthly.filter(
      (window) => window.returnPct > 0 && window.profitFactor >= 1
    ).length;
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      monthly,
      positiveMonths,
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stressed2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. The state machine models Asian range formation, London liquidity event, higher-timeframe regime, and delayed confirmation.",
      costStressMultipliers: [1.5, 2],
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "multi_session_state_machine_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      model: candidate.config.entryModel,
      ema: candidate.config.trendEma,
      slope: candidate.config.minSlopeAtr,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      positiveMonths: candidate.positiveMonths,
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writeAdaptiveRegimeReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildAdaptiveRegimeConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = Object.entries(datasets).flatMap(([symbol, dataset]) => {
      const rows = dataset[config.timeframeMinutes * MINUTE];
      return rows ? runAdaptiveRegimeRotation(symbol, rows, config) : [];
    });
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 100 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 50 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const stressed2x = simulatePortfolio(
      applyCostStress(system.rawTrades, 2),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stressed2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Efficiency ratio selects trend-breakout, range-reversion, or no-trade state.",
      costStressMultipliers: [1.5, 2],
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "adaptive_regime_rotation_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      tf: candidate.config.timeframeMinutes,
      range: candidate.config.rangeThreshold,
      trend: candidate.config.trendThreshold,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writeCurrencyStrengthReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildCurrencyStrengthConfigs();
  const systems = [];
  let processed = 0;
  for (const config of configs) {
    const rawTrades = runCurrencyStrengthRotation(datasets, config);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 100 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ config, rawTrades, riskPct, train });
    }
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const stressed2x = simulatePortfolio(
      applyCostStress(system.rawTrades, 2),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      config: system.config,
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stressed2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Currency scores average ATR-normalized short and long momentum; only the available pair with the largest base-versus-quote strength gap is traded.",
      costStressMultipliers: [1.5, 2],
    },
    configurationsTested: configs.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "currency_strength_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      hour: candidate.config.signalHour,
      short: candidate.config.shortLookback,
      long: candidate.config.longLookback,
      weight: candidate.config.shortWeight,
      confirm: candidate.config.confirmation,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

function writeCalendarEdgeReports(datasets) {
  const trainEnd = Date.parse("2026-04-01T00:00:00Z");
  const testStart = trainEnd;
  const trainingWindows = [
    ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
    ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
    ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
    ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
    ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), trainEnd],
  ];
  const configs = buildCalendarEdgeConfigs();
  const base = [];
  let processed = 0;
  for (const config of configs) {
    for (const [symbol, dataset] of Object.entries(datasets)) {
      const rows = dataset[config.timeframeMinutes * MINUTE];
      if (!rows) continue;
      const rawTrades = runCalendarSessionEdge(symbol, rows, config);
      const train = evaluateWindows(rawTrades, 0.5, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount >= 40 &&
        train.positiveWindows >= 4 &&
        train.full.profitFactor >= 1.15 &&
        train.full.maxDrawdownPct >= -6 &&
        train.worstWindowReturn >= -1.5
      ) {
        base.push({ symbol, config, rawTrades, train });
      }
    }
    processed += 1;
    if (processed % 200 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }
  base.sort((left, right) => right.train.score - left.train.score);
  const pool = [];
  const buckets = new Set();
  for (const candidate of base) {
    const bucket = `${candidate.symbol}|${candidate.config.weekday}|${candidate.config.entryHour}`;
    if (buckets.has(bucket)) continue;
    buckets.add(bucket);
    pool.push(candidate);
    if (pool.length >= 16) break;
  }
  const systems = [];
  for (const components of fixedCombinations(pool, 3, 6)) {
    const rawTrades = components.flatMap((component) => component.rawTrades);
    for (const riskPct of RISK_LEVELS) {
      const train = evaluateWindows(rawTrades, riskPct, trainingWindows, IS_START, trainEnd);
      if (
        train.full.tradeCount < 120 ||
        train.positiveWindows < 4 ||
        train.worstWindowReturn < -2.5 ||
        train.full.profitFactor < 1.15 ||
        train.full.maxDrawdownPct < -8
      ) {
        continue;
      }
      systems.push({ components, rawTrades, riskPct, train });
    }
  }
  systems.sort((left, right) => right.train.score - left.train.score);
  const evaluated = systems.slice(0, 50).map((system, rank) => {
    const q2 = simulatePortfolio(system.rawTrades, system.riskPct, testStart, END);
    const stressed = simulatePortfolio(
      applyCostStress(system.rawTrades, 1.5),
      system.riskPct,
      testStart,
      END
    );
    const stressed2x = simulatePortfolio(
      applyCostStress(system.rawTrades, 2),
      system.riskPct,
      testStart,
      END
    );
    const mc = monteCarloSequential(q2.dailyReturnsPct);
    const stressMc = monteCarloSequential(stressed.dailyReturnsPct);
    const passed =
      q2.tradeCount >= 20 &&
      q2.returnPct > 0 &&
      q2.profitFactor >= 1.2 &&
      q2.maxDrawdownPct >= -6 &&
      q2.worstDayPct >= DAILY_STOP_PCT &&
      mc.cpp >= 60 &&
      mc.rulesSafetyProbability >= 95 &&
      stressed.profitFactor >= 1.05 &&
      stressed.maxDrawdownPct >= -8 &&
      stressMc.rulesSafetyProbability >= 95;
    return {
      trainingRank: rank + 1,
      components: system.components.map((component) => ({
        symbol: component.symbol,
        config: component.config,
      })),
      riskPct: system.riskPct,
      training: {
        positiveWindows: system.train.positiveWindows,
        worstWindowReturn: system.train.worstWindowReturn,
        metrics: compactMetrics(system.train.full),
        windows: system.train.details,
      },
      q2Confirmation: compactMetrics(q2),
      monteCarlo: mc,
      costStress1_5x: compactMetrics(stressed),
      costStressMonteCarlo: stressMc,
      costStress2x: compactMetrics(stressed2x),
      verdict: passed ? "APPROVED" : "REJECTED",
    };
  });
  const output = {
    generatedAt: new Date().toISOString(),
    methodology: {
      primaryYear: 2026,
      trainingPeriod: ["2025-01-01", "2026-03-31"],
      knownQ2ConfirmationPeriod: ["2026-04-01", "2026-06-15"],
      selectionRule:
        "Training rank is fixed before Q2 inspection. Each component is a symbol-weekday-hour edge stable in at least four of five training quarters.",
      costStressMultipliers: [1.5, 2],
    },
    configurationsTested: configs.length * Object.keys(datasets).length,
    stableBaseEdges: base.length,
    componentPoolSize: pool.length,
    systemsPassingTrainingGate: systems.length,
    evaluated,
    selected: evaluated[0] ?? null,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "calendar_edge_prop_strategy_2026.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.table(
    evaluated.slice(0, 20).map((candidate) => ({
      rank: candidate.trainingRank,
      engines: candidate.components.length,
      risk: candidate.riskPct,
      trainTrades: candidate.training.metrics.tradeCount,
      trainPf: candidate.training.metrics.profitFactor.toFixed(2),
      q2Trades: candidate.q2Confirmation.tradeCount,
      q2Ret: candidate.q2Confirmation.returnPct.toFixed(2),
      q2Pf: candidate.q2Confirmation.profitFactor.toFixed(2),
      q2Dd: candidate.q2Confirmation.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      stressPf: candidate.costStress1_5x.profitFactor.toFixed(2),
      verdict: candidate.verdict,
    }))
  );
  return output;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const novelOnly = process.env.NOVEL_ONLY === "1";
  const complexOnly = process.env.COMPLEX_ONLY === "1";
  const allAdvanced = process.env.ALL_ADVANCED === "1";
  const confirmedEngine = process.env.CONFIRMED_ENGINE === "1";
  const crossSectional = process.env.CROSS_SECTIONAL === "1";
  const macroTrend = process.env.MACRO_TREND === "1";
  const pairReversion = process.env.PAIR_REVERSION === "1";
  const pairPortfolio = process.env.PAIR_PORTFOLIO === "1";
  const multiSession = process.env.MULTI_SESSION === "1";
  const adaptiveRegime = process.env.ADAPTIVE_REGIME === "1";
  const currencyStrength = process.env.CURRENCY_STRENGTH === "1";
  const onlineAllocator = process.env.ONLINE_ALLOCATOR === "1";
  const alternativePortfolio = process.env.ALTERNATIVE_PORTFOLIO === "1";
  const calendarEdge = process.env.CALENDAR_EDGE === "1";
  const strictStable = process.env.STRICT_STABLE === "1";
  const rolling2026 = process.env.ROLLING_2026 === "1";
  const q2Holdout = process.env.Q2_HOLDOUT === "1";
  const reportPrefix = complexOnly
    ? "complex_prop_strategy_discovery_2026"
    : novelOnly
      ? "novel_prop_strategy_discovery_2026"
      : "prop_strategy_discovery_2026";
  const requiredIntervals = macroTrend
    ? [240 * MINUTE]
    : pairReversion || pairPortfolio
      ? [60 * MINUTE, 240 * MINUTE]
      : multiSession
        ? [30 * MINUTE]
        : adaptiveRegime
          ? [30 * MINUTE, 60 * MINUTE]
          : currencyStrength
            ? [60 * MINUTE]
            : calendarEdge
              ? [60 * MINUTE]
    : [15 * MINUTE, 30 * MINUTE, 60 * MINUTE];
  const datasets = {};
  for (const [symbol, fileName] of Object.entries(FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) continue;
    console.log(`Loading ${symbol}...`);
    datasets[symbol] = parseAndAggregate(filePath, requiredIntervals);
    console.log(
      `${symbol}: ${Object.entries(datasets[symbol])
        .map(([interval, rows]) => `${Number(interval) / MINUTE}m=${rows.length}`)
        .join(", ")}`
    );
  }

  if (crossSectional) {
    writeCrossSectionalReports(datasets);
    return;
  }
  if (macroTrend) {
    writeMacroTrendReports(datasets);
    return;
  }
  if (pairReversion) {
    writePairMeanReversionReports(datasets);
    return;
  }
  if (pairPortfolio) {
    writePairPortfolioReports(datasets);
    return;
  }
  if (multiSession) {
    writeMultiSessionReports(datasets);
    return;
  }
  if (adaptiveRegime) {
    writeAdaptiveRegimeReports(datasets);
    return;
  }
  if (currencyStrength) {
    writeCurrencyStrengthReports(datasets);
    return;
  }
  if (calendarEdge) {
    writeCalendarEdgeReports(datasets);
    return;
  }

  const configs = allAdvanced || onlineAllocator || alternativePortfolio
    ? [...buildConfigs(), ...buildNovelConfigs(), ...buildComplexConfigs()]
    : complexOnly
      ? buildComplexConfigs()
      : novelOnly
        ? buildNovelConfigs()
        : buildConfigs();
  console.log(`Testing ${configs.length} strategy configurations x ${RISK_LEVELS.length} risk levels...`);
  const candidates = [];
  const assetCandidates = [];
  const strictCandidates = [];
  let processed = 0;

  for (const config of configs) {
    const interval = config.timeframeMinutes * MINUTE;
    const rawTrades = [];
    const rawTradesBySymbol = {};
    for (const [symbol, dataset] of Object.entries(datasets)) {
      const rows = dataset[interval];
      if (!rows) continue;
      let symbolTrades;
      if (config.family === "volatility_expansion") {
        symbolTrades = runDonchian(symbol, rows, config);
      } else if (config.family === "trend_pullback") {
        symbolTrades = runTrendPullback(symbol, rows, config);
      } else if (config.family === "session_breakout") {
        symbolTrades = runSessionBreakout(symbol, rows, config);
      } else if (config.family === "novel_compression_release") {
        symbolTrades = runCompressionRelease(symbol, rows, config);
      } else if (config.family === "novel_failed_expansion") {
        symbolTrades = runFailedExpansion(symbol, rows, config);
      } else if (config.family === "novel_opening_drive") {
        symbolTrades = runOpeningDrivePersistence(symbol, rows, config);
      } else if (config.family === "novel_exhaustion_reversal") {
        symbolTrades = runExhaustionReversal(symbol, rows, config);
      } else if (config.family === "novel_session_stretch_reversion") {
        symbolTrades = runSessionStretchReversion(symbol, rows, config);
      } else if (config.family === "complex_liquidity_regime_reversal") {
        symbolTrades = runComplexLiquidityRegimeReversal(symbol, rows, config);
      } else if (config.family === "complex_regime_pullback") {
        symbolTrades = runComplexRegimePullback(symbol, rows, config);
      } else {
        symbolTrades = runComplexSqueezeExpansion(symbol, rows, config);
      }
      rawTradesBySymbol[symbol] = symbolTrades;
      rawTrades.push(...symbolTrades);
    }
    for (const [symbol, symbolTrades] of Object.entries(rawTradesBySymbol)) {
      for (const riskPct of RISK_LEVELS) {
        if (strictStable || q2Holdout || confirmedEngine || alternativePortfolio) {
          strictCandidates.push({
            scope: "single_asset",
            symbol,
            family: config.family,
            config,
            riskPct,
            rawTrades: symbolTrades,
            stability: strictWindowEvaluation(symbolTrades, riskPct),
          });
        }
        const full = simulatePortfolio(symbolTrades, riskPct, IS_START, OOS_START);
        const firstHalf = simulatePortfolio(symbolTrades, riskPct, IS_START, IS_MID);
        const secondHalf = simulatePortfolio(symbolTrades, riskPct, IS_MID, OOS_START);
        assetCandidates.push({
          symbol,
          family: config.family,
          config,
          riskPct,
          score: assetTrainingScore(full, firstHalf, secondHalf),
          rawTrades: symbolTrades,
          training: compactMetrics(full),
          firstHalf: compactMetrics(firstHalf),
          secondHalf: compactMetrics(secondHalf),
        });
      }
    }
    for (const riskPct of RISK_LEVELS) {
      if (strictStable || q2Holdout || confirmedEngine || alternativePortfolio) {
        strictCandidates.push({
          scope: "universal",
          symbol: null,
          family: config.family,
          config,
          riskPct,
          rawTrades,
          stability: strictWindowEvaluation(rawTrades, riskPct),
        });
      }
      const full = simulatePortfolio(rawTrades, riskPct, IS_START, OOS_START);
      const firstHalf = simulatePortfolio(rawTrades, riskPct, IS_START, IS_MID);
      const secondHalf = simulatePortfolio(rawTrades, riskPct, IS_MID, OOS_START);
      const score = trainingScore(full, firstHalf, secondHalf);
      candidates.push({
        family: config.family,
        config,
        riskPct,
        score,
        trainingGatePassed: trainingGatePassed(full, firstHalf, secondHalf),
        rawTrades,
        training: compactMetrics(full),
        firstHalf: compactMetrics(firstHalf),
        secondHalf: compactMetrics(secondHalf),
      });
    }
    processed += 1;
    if (processed % 50 === 0) console.log(`Processed ${processed}/${configs.length}`);
  }

  if (strictStable) {
    writeStrictStableReports(strictCandidates, "strict_stable_novel_strategy_2025_2026");
    writeStrictEnsembleReports(strictCandidates);
    return;
  }
  if (alternativePortfolio) {
    const excludedFamilies = new Set([
      "novel_opening_drive",
      "novel_session_stretch_reversion",
      "novel_compression_release",
    ]);
    writeQ2HoldoutReports(
      strictCandidates.filter(
        (candidate) => !excludedFamilies.has(candidate.family)
      ),
      "alternative_fixed_portfolio_2026_known_q2_confirmation.json",
      "knownQ2ConfirmationPeriod"
    );
    return;
  }
  if (confirmedEngine) {
    writeConfirmedEngineReports(strictCandidates);
    return;
  }
  if (q2Holdout) {
    writeQ2HoldoutReports(
      strictCandidates,
      complexOnly
        ? "complex_prop_strategy_2026_known_q2_confirmation.json"
        : "q2_2026_untouched_holdout_strategy.json",
      complexOnly ? "knownQ2ConfirmationPeriod" : "untouchedFinalTest"
    );
    return;
  }
  if (rolling2026) {
    writeRolling2026Reports(assetCandidates);
    return;
  }
  if (onlineAllocator) {
    writeRobustOnlineAllocatorReports(assetCandidates);
    return;
  }

  const familyFinalists = [];
  const researchFamilies = complexOnly
    ? [
        "complex_liquidity_regime_reversal",
        "complex_regime_pullback",
        "complex_squeeze_expansion",
      ]
    : novelOnly
    ? [
        "novel_compression_release",
        "novel_failed_expansion",
        "novel_opening_drive",
        "novel_exhaustion_reversal",
        "novel_session_stretch_reversion",
      ]
    : ["session_breakout", "trend_pullback", "volatility_expansion"];
  for (const family of researchFamilies) {
    const ranked = candidates
      .filter((candidate) => candidate.family === family && Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score);
    if (ranked[0]) familyFinalists.push(ranked[0]);
  }

  const diversifiedCandidates = [];
  for (const riskPct of RISK_LEVELS) {
    const selections = [];
    for (const symbol of Object.keys(datasets)) {
      const ranked = assetCandidates
        .filter(
          (candidate) =>
            candidate.symbol === symbol &&
            candidate.riskPct === riskPct &&
            Number.isFinite(candidate.score)
        )
        .sort((left, right) => right.score - left.score);
      if (ranked[0]) selections.push(ranked[0]);
    }
    if (selections.length < 2) continue;
    const rawTrades = selections.flatMap((candidate) => candidate.rawTrades);
    const full = simulatePortfolio(rawTrades, riskPct, IS_START, OOS_START);
    const firstHalf = simulatePortfolio(rawTrades, riskPct, IS_START, IS_MID);
    const secondHalf = simulatePortfolio(rawTrades, riskPct, IS_MID, OOS_START);
    diversifiedCandidates.push({
      family: "diversified_asset_specific",
      config: {
        family: "diversified_asset_specific",
        timeframeMinutes: "mixed",
        selections: selections.map((candidate) => ({
          symbol: candidate.symbol,
          family: candidate.family,
          config: candidate.config,
        })),
      },
      riskPct,
      score: trainingScore(full, firstHalf, secondHalf),
      trainingGatePassed: trainingGatePassed(full, firstHalf, secondHalf),
      rawTrades,
      training: compactMetrics(full),
      firstHalf: compactMetrics(firstHalf),
      secondHalf: compactMetrics(secondHalf),
    });
  }
  diversifiedCandidates.sort((left, right) => right.score - left.score);
  if (novelOnly) {
    familyFinalists.push(...diversifiedCandidates);
  } else if (diversifiedCandidates[0]) {
    familyFinalists.push(diversifiedCandidates[0]);
  }

  const evaluated = familyFinalists.map((candidate) => {
    const oos = simulatePortfolio(candidate.rawTrades, candidate.riskPct, OOS_START, END);
    const combined = simulatePortfolio(candidate.rawTrades, candidate.riskPct, IS_START, END);
    const monteCarloResult = monteCarlo(combined.dailyReturnsPct);
    const walkForward = [
      ["2025-Q1", Date.parse("2025-01-01T00:00:00Z"), Date.parse("2025-04-01T00:00:00Z")],
      ["2025-Q2", Date.parse("2025-04-01T00:00:00Z"), Date.parse("2025-07-01T00:00:00Z")],
      ["2025-Q3", Date.parse("2025-07-01T00:00:00Z"), Date.parse("2025-10-01T00:00:00Z")],
      ["2025-Q4", Date.parse("2025-10-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z")],
      ["2026-Q1", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-04-01T00:00:00Z")],
      ["2026-Q2", Date.parse("2026-04-01T00:00:00Z"), END],
    ].map(([period, start, end]) => ({
      period,
      ...compactMetrics(simulatePortfolio(candidate.rawTrades, candidate.riskPct, start, end)),
    }));
    const compactOos = compactMetrics(oos);
    return {
      family: candidate.family,
      config: candidate.config,
      riskPct: candidate.riskPct,
      trainingScore: candidate.score,
      trainingGatePassed: candidate.trainingGatePassed,
      training: candidate.training,
      firstHalf: candidate.firstHalf,
      secondHalf: candidate.secondHalf,
      oos: compactOos,
      combined: compactMetrics(combined),
      walkForward,
      monteCarlo: monteCarloResult,
      blueGuardianScore: blueGuardianScore(compactOos, monteCarloResult),
      verdict: verdict(compactOos, monteCarloResult),
      oosTrades: oos.trades,
    };
  });

  evaluated.sort(
    (left, right) =>
      right.monteCarlo.cpp - left.monteCarlo.cpp ||
      right.blueGuardianScore - left.blueGuardianScore ||
      right.oos.recoveryFactor - left.oos.recoveryFactor
  );
  const selected = evaluated[0] ?? null;
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      selectionWindow: ["2025-01-01", "2025-12-31"],
      untouchedOosWindow: ["2026-01-01", "2026-06-15"],
      symbols: Object.keys(datasets),
      riskLevelsPct: RISK_LEVELS,
      dailyStopPct: DAILY_STOP_PCT,
      maxConcurrentRiskPct: MAX_CONCURRENT_RISK_PCT,
      phase1TargetPct: 8,
      phase1MaxTradingDays: 60,
      phase2TargetPct: 4,
      phase2MaxTradingDays: 40,
      totalLossLimitPct: 10,
      executionCostPips: EXECUTION_COST_PIPS,
      monteCarloRuns: MONTE_CARLO_RUNS,
      monteCarloMethod: "seeded 5-day block bootstrap",
    },
    configurationsTested: configs.length,
    riskVariantsTested: configs.length * RISK_LEVELS.length,
    finalists: evaluated.map(({ oosTrades, ...candidate }) => candidate),
    selected: selected ? Object.fromEntries(Object.entries(selected).filter(([key]) => key !== "oosTrades")) : null,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${reportPrefix}.json`),
    JSON.stringify(output, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${reportPrefix}.md`),
    markdownReport(output),
    "utf8"
  );

  const summaryHeaders = [
    "family",
    "timeframe",
    "risk_pct",
    "is_trades",
    "is_return_pct",
    "is_pf",
    "is_max_dd_pct",
    "oos_trades",
    "oos_return_pct",
    "oos_pf",
    "oos_expectancy_r",
    "oos_max_dd_pct",
    "oos_worst_day_pct",
    "cpp",
    "rules_safety_probability",
    "median_completion_days",
    "blue_guardian_score",
    "verdict",
    "config",
  ];
  const summaryRows = evaluated.map((candidate) => [
    candidate.family,
    `${candidate.config.timeframeMinutes}m`,
    candidate.riskPct,
    candidate.training.tradeCount,
    candidate.training.returnPct,
    candidate.training.profitFactor,
    candidate.training.maxDrawdownPct,
    candidate.oos.tradeCount,
    candidate.oos.returnPct,
    candidate.oos.profitFactor,
    candidate.oos.expectancyR,
    candidate.oos.maxDrawdownPct,
    candidate.oos.worstDayPct,
    candidate.monteCarlo.cpp,
    candidate.monteCarlo.rulesSafetyProbability,
    candidate.monteCarlo.medianCompletionDays,
    candidate.blueGuardianScore,
    candidate.verdict,
    JSON.stringify(candidate.config),
  ]);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${reportPrefix}_summary.csv`),
    [summaryHeaders, ...summaryRows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
    "utf8"
  );

  if (selected) {
    const tradeHeaders = [
      "symbol",
      "family",
      "direction",
      "entry_time",
      "exit_time",
      "entry_price",
      "exit_price",
      "gross_r",
      "net_r",
      "profit",
      "exit_reason",
    ];
    const tradeRows = selected.oosTrades.map((trade) => [
      trade.symbol,
      trade.family,
      trade.direction,
      new Date(trade.entryTime).toISOString(),
      new Date(trade.exitTime).toISOString(),
      trade.entryPrice,
      trade.exitPrice,
      trade.grossR,
      trade.netR,
      trade.profit,
      trade.exitReason,
    ]);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${reportPrefix}_selected_oos_trades.csv`),
      [tradeHeaders, ...tradeRows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
      "utf8"
    );
  }

  console.table(
    evaluated.map((candidate) => ({
      family: candidate.family,
      tf: `${candidate.config.timeframeMinutes}m`,
      risk: `${candidate.riskPct}%`,
      isTrades: candidate.training.tradeCount,
      isReturn: candidate.training.returnPct.toFixed(2),
      oosTrades: candidate.oos.tradeCount,
      oosReturn: candidate.oos.returnPct.toFixed(2),
      oosPf: candidate.oos.profitFactor.toFixed(2),
      oosDd: candidate.oos.maxDrawdownPct.toFixed(2),
      cpp: candidate.monteCarlo.cpp.toFixed(1),
      safety: candidate.monteCarlo.rulesSafetyProbability.toFixed(1),
      verdict: candidate.verdict,
    }))
  );
  console.log(`Reports written to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
