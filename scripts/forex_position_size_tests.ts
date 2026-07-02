import assert from "node:assert/strict";
import {
  calculateForexPositionSize,
  forexPairCurrencies,
} from "../src/lib/trading/forex-position-size";
import { calculateContractPositionSize } from "../src/lib/trading/contract-position-size";

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

const contractCases = [
  {
    symbol: "GER40",
    entryPrice: 25_632.1,
    stopLoss: 25_567.1,
    contractSize: 1,
    profitToUsdRate: 1.17,
    expectedLot: 0.65,
    expectedLoss: 49.4325,
  },
  {
    symbol: "US30",
    entryPrice: 44_000,
    stopLoss: 43_900,
    contractSize: 1,
    profitToUsdRate: 1,
    expectedLot: 0.5,
    expectedLoss: 50,
  },
  {
    symbol: "SPX500",
    entryPrice: 6_200,
    stopLoss: 6_190,
    contractSize: 10,
    profitToUsdRate: 1,
    expectedLot: 0.5,
    expectedLoss: 50,
  },
  {
    symbol: "NAS100",
    entryPrice: 22_500,
    stopLoss: 22_490,
    contractSize: 10,
    profitToUsdRate: 1,
    expectedLot: 0.5,
    expectedLoss: 50,
  },
  {
    symbol: "XAUUSD",
    entryPrice: 3_300,
    stopLoss: 3_295,
    contractSize: 100,
    profitToUsdRate: 1,
    expectedLot: 0.1,
    expectedLoss: 50,
  },
] as const;

for (const testCase of contractCases) {
  const sizing = calculateContractPositionSize({
    ...testCase,
    accountBalanceUsd: 5_000,
    riskPercent: 1,
    minLot: 0.01,
    maxLot: 50,
    lotStep: 0.01,
  });
  assert.equal(sizing.lotSize, testCase.expectedLot, `${testCase.symbol} lot`);
  closeTo(sizing.estimatedLossUsd, testCase.expectedLoss);
}

console.log("Forex and CFD position-size tests passed.");
