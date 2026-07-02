import {
  calculatePositionSizeFromLossPerLot,
  requirePositive,
  type PositionSizeResult,
} from "./position-size-core";

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

export interface ForexPositionSizeResult extends PositionSizeResult {
  priceDistance: number;
  quoteToUsdRate: number;
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
  requirePositive("contractSize", contractSize);

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

  const lossPerLotUsd = priceDistance * contractSize * quoteToUsdRate;

  return {
    ...calculatePositionSizeFromLossPerLot({
      symbol: input.symbol,
      accountBalanceUsd: input.accountBalanceUsd,
      riskPercent: input.riskPercent,
      lossPerLotUsd,
      lotStep,
      minLot,
      maxLot,
    }),
    priceDistance,
    quoteToUsdRate,
  };
}
