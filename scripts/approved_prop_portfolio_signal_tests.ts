import assert from "node:assert/strict";
import type { Kline } from "../src/lib/binance";
import {
  detectApprovedPropPositionExit,
  detectLatestApprovedPropSignal,
  type ApprovedPropStrategyConfig,
} from "../src/lib/data-handlers/approved-prop-portfolio-strategy";
import {
  aggregateJettaHours,
  decodeJettaCandles,
} from "../src/lib/data-handlers/dukascopy-jetta";
import {
  aggregateSignalStatistics,
  propPortfolioEntryBlockReason,
} from "../src/lib/data-handlers/signal-monitor-policy";

const HOUR = 60 * 60 * 1000;

function bar(openTime: number, open: number, high: number, low: number, close: number): Kline {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume: 1,
    closeTime: openTime + HOUR - 1,
    quoteVolume: 0,
    trades: 0,
    takerBuyBaseVolume: 0,
    takerBuyQuoteVolume: 0,
  };
}

function testShortBreakoutUsesBidEntry() {
  const start = Date.UTC(2026, 5, 1);
  const bid: Kline[] = [];
  for (let index = 0; index < 12; index += 1) {
    const price = 100 - index * 0.1;
    bid.push(bar(start + index * HOUR, price, price + 0.2, price - 0.2, price - 0.05));
  }
  bid.push(bar(start + 12 * HOUR, 98.8, 98.9, 97.8, 97.9));
  bid.push(bar(start + 13 * HOUR, 97.7, 97.9, 97.5, 97.8));
  const ask = bid.map((row) => ({
    ...row,
    open: row.open + 0.1,
    high: row.high + 0.1,
    low: row.low + 0.1,
    close: row.close + 0.1,
  }));
  const config: ApprovedPropStrategyConfig = {
    kind: "htf_breakout",
    timeframeHours: 1,
    lookback: 5,
    atrPeriod: 3,
    emaPeriod: 5,
    stopAtr: 0.75,
    rewardR: 2.5,
    maxHoldBars: 24,
    direction: "short",
  };
  const setup = detectLatestApprovedPropSignal(config, bid, ask, start + 15 * HOUR);
  assert.equal(setup?.direction, "short");
  assert.equal(setup?.entryPrice, bid[13].open);
  assert.equal(setup?.takeProfit != null && setup.takeProfit < setup.entryPrice, true);
}

function testOpeningRangeLongUsesAskAndSessionExit() {
  const prior = Date.UTC(2026, 5, 1, 14);
  const currentDay = Date.UTC(2026, 5, 2);
  const bid: Kline[] = [];
  for (let index = 0; index < 10; index += 1) {
    const price = 99 + index * 0.1;
    bid.push(bar(prior + index * HOUR, price, price + 0.2, price - 0.1, price + 0.1));
  }
  bid.push(bar(currentDay, 100, 100.5, 99.8, 100.4));
  bid.push(bar(currentDay + HOUR, 100.4, 101.2, 100.3, 101));
  bid.push(bar(currentDay + 2 * HOUR, 101.1, 101.4, 101, 101.2));
  const ask = bid.map((row) => ({
    ...row,
    open: row.open + 0.2,
    high: row.high + 0.2,
    low: row.low + 0.2,
    close: row.close + 0.2,
  }));
  const config: ApprovedPropStrategyConfig = {
    kind: "opening_range_breakout",
    timeframeHours: 1,
    openingBars: 1,
    atrPeriod: 3,
    emaPeriod: 3,
    stopAtr: 0.75,
    rewardR: 2,
    minRangeAtr: 0.1,
    maxRangeAtr: 3,
    maxRiskAtr: 2,
    direction: "long",
  };
  const setup = detectLatestApprovedPropSignal(config, bid, ask, currentDay + 4 * HOUR);
  assert.equal(setup?.direction, "long");
  assert.equal(setup?.entryPrice, ask[12].open);
  assert.equal(setup?.exitAtTime, currentDay + 24 * HOUR);
}

function testJettaDecodeAndAggregation() {
  const rows = decodeJettaCandles({
    timestamp: Date.UTC(2026, 5, 1),
    multiplier: 0.1,
    shift: 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    times: [0, 60, 60, 60],
    opens: [0, 1, 1, 1],
    highs: [0, 1, 1, 1],
    lows: [0, 1, 1, 1],
    closes: [0, 1, 1, 1],
    volumes: [1, 1, 1, 1],
  });
  assert.equal(rows.length, 4);
  assert.equal(rows[1].openTime - rows[0].openTime, HOUR);
  const fourHour = aggregateJettaHours(rows, 4);
  assert.equal(fourHour.length, 1);
  assert.equal(fourHour[0].close, rows[3].close);
}

function testShortExitUsesAskAndStopWinsTie() {
  const start = Date.UTC(2026, 5, 3);
  const bid = [bar(start, 100, 101.5, 98.5, 100)];
  const ask = [bar(start, 100.2, 102.2, 98.7, 100.2)];
  const exit = detectApprovedPropPositionExit(
    {
      direction: "short",
      entryTime: start,
      stopLoss: 102,
      takeProfit: 99,
      timeframeHours: 1,
      maxHoldBars: 24,
    },
    bid,
    ask
  );
  assert.equal(exit?.result, "stop_loss");
  assert.equal(exit?.exitPrice, 102);
}

function testPortfolioRiskRules() {
  assert.match(
    propPortfolioEntryBlockReason({
      profileAlreadyOpen: false,
      realizedPct: 0,
      openRiskPct: 2,
      newRiskPct: 0.5,
    }) ?? "",
    /^concurrent risk cap/
  );
  assert.match(
    propPortfolioEntryBlockReason({
      profileAlreadyOpen: false,
      realizedPct: -3,
      openRiskPct: 0,
      newRiskPct: 0.5,
    }) ?? "",
    /^daily stop reached/
  );
  assert.equal(
    propPortfolioEntryBlockReason({
      profileAlreadyOpen: false,
      realizedPct: -1,
      openRiskPct: 1.5,
      newRiskPct: 0.5,
    }),
    null
  );
}

function testCategoryStatisticsAggregation() {
  const statistics = aggregateSignalStatistics([
    { outcome: "win", realizedR: 2, riskPct: 0.5 },
    { outcome: "stop_loss", realizedR: -1, riskPct: 0.5 },
    { outcome: "break_even", realizedR: 0, riskPct: 0.5 },
  ]);
  assert.equal(statistics.trades, 3);
  assert.equal(statistics.wins, 1);
  assert.equal(statistics.stopLosses, 1);
  assert.equal(statistics.breakEvens, 1);
  assert.equal(statistics.winRatePct, 50);
  assert.equal(statistics.totalR, 1);
  assert.equal(statistics.totalModelPct, 0.5);
  assert.equal(statistics.averageR, 1 / 3);
  assert.equal(statistics.profitFactor, 2);
  assert.equal(statistics.tradesWithRisk, 3);
}

testShortBreakoutUsesBidEntry();
testOpeningRangeLongUsesAskAndSessionExit();
testJettaDecodeAndAggregation();
testShortExitUsesAskAndStopWinsTie();
testPortfolioRiskRules();
testCategoryStatisticsAggregation();
console.log("Approved PropTrade portfolio signal tests passed.");
