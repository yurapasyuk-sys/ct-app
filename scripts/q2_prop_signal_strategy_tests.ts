import assert from "node:assert/strict";
import type { Kline } from "../src/lib/binance";
import {
  detectLatestQ2PropSignal,
  type Q2PropStrategyConfig,
} from "../src/lib/data-handlers/q2-prop-signal-strategy";

const MINUTE = 60_000;

function bar(openTime: number, open: number, high: number, low: number, close: number): Kline {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume: 1,
    closeTime: openTime + 30 * MINUTE - 1,
    quoteVolume: 0,
    trades: 1,
    takerBuyBaseVolume: 0,
    takerBuyQuoteVolume: 0,
  };
}

function testOpeningDrive() {
  const start = Date.UTC(2026, 5, 1, 0, 0);
  const rows: Kline[] = [];
  let price = 100;
  for (let index = 0; index < 26; index += 1) {
    const openTime = start + index * 30 * MINUTE;
    rows.push(bar(openTime, price, price + 0.4, price - 0.2, price + 0.2));
    price += 0.2;
  }
  for (let index = 26; index < 30; index += 1) {
    const openTime = start + index * 30 * MINUTE;
    rows.push(bar(openTime, price, price + 1.2, price - 0.1, price + 1));
    price += 1;
  }
  rows.push(bar(start + 30 * 30 * MINUTE, price, price + 0.2, price - 0.2, price));

  const config: Q2PropStrategyConfig = {
    kind: "q2_opening_drive",
    timeframeMinutes: 30,
    atrPeriod: 14,
    sessionStart: 13,
    driveHours: 2,
    efficiencyPeriod: 8,
    minEfficiency: 0.3,
    minDriveAtr: 0.8,
    minDirectionalShare: 0.6,
    stopAtr: 1,
    rewardR: 2.5,
    maxHoldBars: 16,
  };
  const signal = detectLatestQ2PropSignal(config, rows, start + 16 * 60 * MINUTE);
  assert.equal(signal?.direction, "long");
  assert.equal(signal?.entryTime, start + 15 * 60 * MINUTE);
}

function testSessionStretch() {
  const priorStart = Date.UTC(2026, 5, 1, 0, 0);
  const start = Date.UTC(2026, 5, 2, 0, 0);
  const rows: Kline[] = [];
  let price = 100;
  for (let hour = 0; hour < 24; hour += 1) {
    rows.push({
      ...bar(priorStart + hour * 60 * MINUTE, price, price + 0.6, price - 0.1, price + 0.5),
      closeTime: priorStart + (hour + 1) * 60 * MINUTE - 1,
    });
    price += 0.5;
  }
  for (let hour = 0; hour < 13; hour += 1) {
    rows.push({
      ...bar(start + hour * 60 * MINUTE, price, price + 1.1, price - 0.1, price + 1),
      closeTime: start + (hour + 1) * 60 * MINUTE - 1,
    });
    price += 1;
  }
  rows.push({
    ...bar(start + 13 * 60 * MINUTE, price + 1, price + 1.2, price - 0.2, price),
    closeTime: start + 14 * 60 * MINUTE - 1,
  });
  rows.push({
    ...bar(start + 14 * 60 * MINUTE, price, price + 0.2, price - 0.2, price),
    closeTime: start + 15 * 60 * MINUTE - 1,
  });

  const config: Q2PropStrategyConfig = {
    kind: "q2_session_stretch",
    timeframeMinutes: 60,
    atrPeriod: 14,
    dayOpenHour: 0,
    signalHour: 13,
    minStretchAtr: 1.5,
    stopAtr: 0.75,
    rewardR: 2,
    maxHoldBars: 10,
  };
  const signal = detectLatestQ2PropSignal(config, rows, start + 15 * 60 * MINUTE);
  assert.equal(signal?.direction, "short");
  assert.equal(signal?.entryTime, start + 14 * 60 * MINUTE);
}

function testCompressionRelease() {
  const start = Date.UTC(2026, 5, 3, 6, 0);
  const rows: Kline[] = [];
  let price = 100;
  for (let index = 0; index < 46; index += 1) {
    const openTime = start + index * 30 * MINUTE;
    const direction = index % 2 === 0 ? 1 : -1;
    rows.push(bar(openTime, price, price + 1.2, price - 1.2, price + direction * 0.2));
    price += direction * 0.2;
  }
  for (let index = 46; index < 59; index += 1) {
    const openTime = start + index * 30 * MINUTE;
    rows.push(bar(openTime, price, price + 0.15, price - 0.15, price + 0.05));
    price += 0.05;
  }
  const signalOpen = price;
  rows.push(
    bar(
      start + 59 * 30 * MINUTE,
      signalOpen,
      signalOpen + 1.1,
      signalOpen - 0.05,
      signalOpen + 1
    )
  );
  rows.push(
    bar(
      start + 60 * 30 * MINUTE,
      signalOpen + 1,
      signalOpen + 1.1,
      signalOpen + 0.9,
      signalOpen + 1
    )
  );

  const config: Q2PropStrategyConfig = {
    kind: "q2_compression_release",
    timeframeMinutes: 30,
    atrPeriod: 14,
    compressionLookback: 40,
    breakoutLookback: 12,
    efficiencyPeriod: 10,
    maxAtrRatio: 0.8,
    minBodyAtr: 0.8,
    minEfficiency: 0.4,
    stopAtr: 0.75,
    rewardR: 2.5,
    session: "active",
    maxHoldBars: 24,
  };
  const signal = detectLatestQ2PropSignal(config, rows, start + 31 * 60 * MINUTE);
  assert.equal(signal?.direction, "long");
  assert.equal(signal?.entryTime, start + 30 * 60 * MINUTE);
}

testOpeningDrive();
testSessionStretch();
testCompressionRelease();
console.log("Q2 prop signal strategy tests passed.");
