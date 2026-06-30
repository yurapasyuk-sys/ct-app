const FOREX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);

export interface ForexPairCurrencies {
  base: string;
  quote: string;
}

export interface ForexPositionSizeInput {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  accountBalanceUsd: number;
  riskPercent: number;
  quoteToUsdRate?: number;
  contractSize?: number;
  lotStep?: number;
  minLot?: number;
  maxLot?: number;
}

export interface ForexPositionSizeResult {
  symbol: string;
  accountBalanceUsd: number;
  riskPercent: number;
  riskAmountUsd: number;
  priceDistance: number;
  quoteToUsdRate: number;
  rawLots: number;
  lotSize: number | null;
  estimatedLossUsd: number | null;
  lotStep: number;
  minLot: number;
  maxLot: number;
  reason?: "below_minimum_lot";
}

export function forexPairCurrencies(symbol: string): ForexPairCurrencies | null {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(normalized)) return null;

  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3);
  if (!FOREX_CURRENCIES.has(base) || !FOREX_CURRENCIES.has(quote) || base === quote) {
    return null;
  }

  return { base, quote };
}

function requirePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function decimalPlaces(value: number) {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function roundDownToStep(value: number, step: number) {
  const decimals = decimalPlaces(step);
  const steps = Math.floor((value + Number.EPSILON * Math.max(1, value)) / step);
  return Number((steps * step).toFixed(decimals));
}

export function calculateForexPositionSize(
  input: ForexPositionSizeInput
): ForexPositionSizeResult | null {
  const currencies = forexPairCurrencies(input.symbol);
  if (!currencies) return null;

  const contractSize = input.contractSize ?? 100_000;
  const lotStep = input.lotStep ?? 0.01;
  const minLot = input.minLot ?? 0.01;
  const maxLot = input.maxLot ?? 100;

  requirePositive("entryPrice", input.entryPrice);
  requirePositive("stopLoss", input.stopLoss);
  requirePositive("accountBalanceUsd", input.accountBalanceUsd);
  requirePositive("riskPercent", input.riskPercent);
  requirePositive("contractSize", contractSize);
  requirePositive("lotStep", lotStep);
  requirePositive("minLot", minLot);
  requirePositive("maxLot", maxLot);
  if (maxLot < minLot) throw new Error("maxLot must be greater than or equal to minLot");

  const priceDistance = Math.abs(input.entryPrice - input.stopLoss);
  requirePositive("entry-to-stop distance", priceDistance);

  let quoteToUsdRate: number;
  if (currencies.quote === "USD") {
    quoteToUsdRate = 1;
  } else if (currencies.base === "USD") {
    // At the stop, one quote-currency unit is worth 1 / stopLoss USD.
    quoteToUsdRate = 1 / input.stopLoss;
  } else {
    quoteToUsdRate = input.quoteToUsdRate ?? Number.NaN;
    requirePositive(`${currencies.quote}-to-USD conversion rate`, quoteToUsdRate);
  }

  const riskAmountUsd = input.accountBalanceUsd * (input.riskPercent / 100);
  const lossPerLotUsd = priceDistance * contractSize * quoteToUsdRate;
  requirePositive("loss per lot", lossPerLotUsd);

  const rawLots = riskAmountUsd / lossPerLotUsd;
  const cappedLots = Math.min(rawLots, maxLot);
  const roundedLots = roundDownToStep(cappedLots, lotStep);
  const lotSize = roundedLots >= minLot ? roundedLots : null;

  return {
    symbol: input.symbol.trim().toUpperCase(),
    accountBalanceUsd: input.accountBalanceUsd,
    riskPercent: input.riskPercent,
    riskAmountUsd,
    priceDistance,
    quoteToUsdRate,
    rawLots,
    lotSize,
    estimatedLossUsd: lotSize == null ? null : lotSize * lossPerLotUsd,
    lotStep,
    minLot,
    maxLot,
    ...(lotSize == null ? { reason: "below_minimum_lot" as const } : {}),
  };
}
