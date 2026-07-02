import {
  calculatePositionSizeFromLossPerLot,
  requirePositive,
  type PositionSizeResult,
} from "./position-size-core";

export interface ContractPositionSizeInput {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  accountBalanceUsd: number;
  riskPercent: number;
  contractSize: number;
  profitToUsdRate: number;
  lotStep: number;
  minLot: number;
  maxLot: number;
}

export interface ContractPositionSizeResult extends PositionSizeResult {
  priceDistance: number;
  contractSize: number;
  profitToUsdRate: number;
}

export function calculateContractPositionSize(
  input: ContractPositionSizeInput
): ContractPositionSizeResult {
  requirePositive("entryPrice", input.entryPrice);
  requirePositive("stopLoss", input.stopLoss);
  requirePositive("contractSize", input.contractSize);
  requirePositive("profitToUsdRate", input.profitToUsdRate);

  const priceDistance = Math.abs(input.entryPrice - input.stopLoss);
  requirePositive("entry-to-stop distance", priceDistance);
  const lossPerLotUsd = priceDistance * input.contractSize * input.profitToUsdRate;

  return {
    ...calculatePositionSizeFromLossPerLot({
      symbol: input.symbol,
      accountBalanceUsd: input.accountBalanceUsd,
      riskPercent: input.riskPercent,
      lossPerLotUsd,
      lotStep: input.lotStep,
      minLot: input.minLot,
      maxLot: input.maxLot,
    }),
    priceDistance,
    contractSize: input.contractSize,
    profitToUsdRate: input.profitToUsdRate,
  };
}
