export interface PositionSizeCoreInput {
  symbol: string;
  accountBalanceUsd: number;
  riskPercent: number;
  lossPerLotUsd: number;
  lotStep: number;
  minLot: number;
  maxLot: number;
}

export interface PositionSizeResult {
  symbol: string;
  accountBalanceUsd: number;
  riskPercent: number;
  riskAmountUsd: number;
  rawLots: number;
  lotSize: number | null;
  estimatedLossUsd: number | null;
  lotStep: number;
  minLot: number;
  maxLot: number;
  reason?: "below_minimum_lot";
}

export function requirePositive(name: string, value: number) {
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

export function calculatePositionSizeFromLossPerLot(
  input: PositionSizeCoreInput
): PositionSizeResult {
  requirePositive("accountBalanceUsd", input.accountBalanceUsd);
  requirePositive("riskPercent", input.riskPercent);
  requirePositive("lossPerLotUsd", input.lossPerLotUsd);
  requirePositive("lotStep", input.lotStep);
  requirePositive("minLot", input.minLot);
  requirePositive("maxLot", input.maxLot);
  if (input.maxLot < input.minLot) {
    throw new Error("maxLot must be greater than or equal to minLot");
  }

  const riskAmountUsd = input.accountBalanceUsd * (input.riskPercent / 100);
  const rawLots = riskAmountUsd / input.lossPerLotUsd;
  const cappedLots = Math.min(rawLots, input.maxLot);
  const roundedLots = roundDownToStep(cappedLots, input.lotStep);
  const lotSize = roundedLots >= input.minLot ? roundedLots : null;

  return {
    symbol: input.symbol.trim().toUpperCase(),
    accountBalanceUsd: input.accountBalanceUsd,
    riskPercent: input.riskPercent,
    riskAmountUsd,
    rawLots,
    lotSize,
    estimatedLossUsd: lotSize == null ? null : lotSize * input.lossPerLotUsd,
    lotStep: input.lotStep,
    minLot: input.minLot,
    maxLot: input.maxLot,
    ...(lotSize == null ? { reason: "below_minimum_lot" as const } : {}),
  };
}
