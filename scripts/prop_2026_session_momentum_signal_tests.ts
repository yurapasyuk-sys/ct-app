import assert from "node:assert/strict";
import type { Kline } from "../src/lib/binance";
import {
  detectAllProp2026SessionMomentumSignals,
  detectLatestProp2026SessionMomentumSignal,
  detectProp2026SessionMomentumExit,
  type Prop2026SessionMomentumConfig,
} from "../src/lib/data-handlers/prop-2026-session-momentum-strategy";
import { SIGNAL_PROFILES } from "./live_signal_monitor";

const HOUR = 3_600_000;

const config: Prop2026SessionMomentumConfig = {
  signalHourUtc: 13,
  momentumBars: 12,
  atrPeriod: 14,
  fastEmaPeriod: 20,
  slowEmaPeriod: 100,
  minMoveAtr: 0.5,
  stopAtr: 0.75,
  rewardR: 3,
  maxHoldBars: 16,
  maxGapAtr: 0.25,
  maxSpreadR: 0.15,
  fridayLastEntryHourUtc: 16,
  fridayExitHourUtc: 20,
};

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

function trendingRows(signalTime: number, direction: "long" | "short") {
  const start = signalTime - 120 * HOUR;
  const step = direction === "long" ? 0.02 : -0.02;
  const bid: Kline[] = [];
  for (let index = 0; index < 123; index += 1) {
    const open = 100 + step * index;
    const close = open + step * 0.8;
    bid.push(bar(start + index * HOUR, open, Math.max(open, close) + 0.04, Math.min(open, close) - 0.04, close));
  }
  const ask = bid.map((row) => ({
    ...row,
    open: row.open + 0.01,
    high: row.high + 0.01,
    low: row.low + 0.01,
    close: row.close + 0.01,
  }));
  return { bid, ask };
}

function testLongUsesAskAndFridayExit() {
  const signalTime = Date.UTC(2026, 5, 5, 13);
  const { bid, ask } = trendingRows(signalTime, "long");
  const setup = detectLatestProp2026SessionMomentumSignal(config, bid, ask, signalTime + 3 * HOUR);
  assert.equal(setup?.signalTime, signalTime);
  assert.equal(setup?.direction, "long");
  assert.equal(setup?.entryPrice, ask[121].open);
  assert.equal(setup?.entryTime, signalTime + HOUR);
  assert.equal(setup?.exitAtTime, Date.UTC(2026, 5, 5, 20));
  assert.equal(setup != null && setup.takeProfit > setup.entryPrice, true);
}

function testShortUsesBidAndAskStop() {
  const signalTime = Date.UTC(2026, 5, 3, 13);
  const { bid, ask } = trendingRows(signalTime, "short");
  const setup = detectLatestProp2026SessionMomentumSignal(config, bid, ask, signalTime + 3 * HOUR);
  assert.equal(setup?.direction, "short");
  assert.equal(setup?.entryPrice, bid[121].open);
  assert.ok(setup);

  const exitBid = [bar(setup.entryTime, setup.entryPrice, setup.stopLoss - 0.001, setup.entryPrice - 0.05, setup.entryPrice)];
  const exitAsk = [bar(setup.entryTime, setup.entryPrice + 0.01, setup.stopLoss + 0.001, setup.entryPrice - 0.04, setup.entryPrice + 0.01)];
  const exit = detectProp2026SessionMomentumExit({
    direction: "short",
    entryTime: setup.entryTime,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    maxHoldBars: config.maxHoldBars,
    timeframeHours: 1,
  }, exitBid, exitAsk);
  assert.equal(exit?.result, "stop_loss");
  assert.equal(exit?.exitPrice, setup.stopLoss);
}

function testGapFilterRejectsSignal() {
  const signalTime = Date.UTC(2026, 5, 3, 13);
  const { bid, ask } = trendingRows(signalTime, "long");
  bid[121] = { ...bid[121], open: bid[120].close + 1 };
  ask[121] = { ...ask[121], open: bid[121].open + 0.01 };
  const setups = detectAllProp2026SessionMomentumSignals(config, bid, ask, signalTime + 3 * HOUR);
  assert.equal(setups.some((setup) => setup.signalTime === signalTime), false);
}

function testPortfolioRegistration() {
  const profiles = SIGNAL_PROFILES.filter(
    (profile) => profile.kind === "prop_2026_session_momentum"
  );
  assert.equal(profiles.length, 9);
  assert.deepEqual(
    profiles.map((profile) => profile.symbol),
    ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "USDCAD", "US30", "SPX500", "NAS100"]
  );
  assert.equal(profiles.every((profile) => profile.strategyCategory === "proptrade"), true);
  assert.equal(profiles.every((profile) => profile.riskPct === 1), true);
  assert.equal(new Set(profiles.map((profile) => profile.portfolioId)).size, 1);
}

testLongUsesAskAndFridayExit();
testShortUsesBidAndAskStop();
testGapFilterRejectsSignal();
testPortfolioRegistration();
console.log("Prop 2026 session momentum signal tests passed.");
