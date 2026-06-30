import assert from "node:assert/strict";
import {
  calculateForexPositionSize,
  forexPairCurrencies,
} from "../src/lib/trading/forex-position-size";

function closeTo(actual: number | null, expected: number, tolerance = 1e-8) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${actual} != ${expected}`);
}

assert.deepEqual(forexPairCurrencies("EURUSD"), { base: "EUR", quote: "USD" });
assert.deepEqual(forexPairCurrencies("usdjpy"), { base: "USD", quote: "JPY" });
for (const symbol of [
  "AUDUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCAD",
  "EURJPY",
  "CHFJPY",
  "GBPJPY",
  "NZDUSD",
  "USDCHF",
]) {
  assert.notEqual(forexPairCurrencies(symbol), null, `${symbol} must be supported`);
}
assert.equal(forexPairCurrencies("XAUUSD"), null);
assert.equal(forexPairCurrencies("GER40"), null);

const eurusd = calculateForexPositionSize({
  symbol: "EURUSD",
  entryPrice: 1.1,
  stopLoss: 1.096,
  accountBalanceUsd: 5_000,
  riskPercent: 1,
});
assert.equal(eurusd?.riskAmountUsd, 50);
assert.equal(eurusd?.lotSize, 0.12);
closeTo(eurusd?.estimatedLossUsd ?? null, 48);

const usdjpy = calculateForexPositionSize({
  symbol: "USDJPY",
  entryPrice: 160,
  stopLoss: 159.5,
  accountBalanceUsd: 5_000,
  riskPercent: 1,
});
assert.equal(usdjpy?.lotSize, 0.15);
closeTo(usdjpy?.estimatedLossUsd ?? null, 47.02194357366771);

const gbpjpy = calculateForexPositionSize({
  symbol: "GBPJPY",
  entryPrice: 205,
  stopLoss: 204.5,
  accountBalanceUsd: 5_000,
  riskPercent: 1,
  quoteToUsdRate: 1 / 159.5,
});
assert.equal(gbpjpy?.lotSize, 0.15);
closeTo(gbpjpy?.estimatedLossUsd ?? null, 47.02194357366771);

const usdchf = calculateForexPositionSize({
  symbol: "USDCHF",
  entryPrice: 0.9,
  stopLoss: 0.895,
  accountBalanceUsd: 5_000,
  riskPercent: 1,
});
assert.equal(usdchf?.lotSize, 0.08);
assert.ok((usdchf?.estimatedLossUsd ?? Infinity) < 50);

const belowMinimum = calculateForexPositionSize({
  symbol: "EURUSD",
  entryPrice: 1.2,
  stopLoss: 1.1,
  accountBalanceUsd: 5_000,
  riskPercent: 1,
});
assert.equal(belowMinimum?.lotSize, null);
assert.equal(belowMinimum?.reason, "below_minimum_lot");

assert.throws(
  () =>
    calculateForexPositionSize({
      symbol: "EURJPY",
      entryPrice: 170,
      stopLoss: 169.5,
      accountBalanceUsd: 5_000,
      riskPercent: 1,
    }),
  /JPY-to-USD conversion rate/
);

console.log("Forex position-size tests passed.");
