export function exitAlertSuppressionReason({
  now,
  exitTime,
  maxExitAgeMinutes,
  originalMessageId,
}: {
  now: number;
  exitTime: number;
  maxExitAgeMinutes: number;
  originalMessageId?: number;
}) {
  const exitAgeMinutes = (now - exitTime) / 60_000;
  if (exitAgeMinutes > maxExitAgeMinutes) {
    return `stale exit (${exitAgeMinutes.toFixed(1)} min)`;
  }
  if (!originalMessageId) {
    return "missing original Telegram message id";
  }
  return null;
}

export function propPortfolioEntryBlockReason({
  profileAlreadyOpen,
  realizedPct,
  openRiskPct,
  newRiskPct,
  dailyStopPct = -3,
  maxConcurrentRiskPct = 2,
}: {
  profileAlreadyOpen: boolean;
  realizedPct: number;
  openRiskPct: number;
  newRiskPct: number;
  dailyStopPct?: number;
  maxConcurrentRiskPct?: number;
}) {
  if (profileAlreadyOpen) return "profile already has an open position";
  if (realizedPct <= dailyStopPct) {
    return `daily stop reached (${realizedPct.toFixed(2)}%)`;
  }
  if (openRiskPct + newRiskPct > maxConcurrentRiskPct + 1e-9) {
    return `concurrent risk cap reached (${openRiskPct.toFixed(2)}% open)`;
  }
  return null;
}

export function aggregateSignalStatistics(
  trades: Array<{
    outcome: "win" | "stop_loss" | "break_even";
    realizedR?: number;
    riskPct?: number;
  }>
) {
  const wins = trades.filter((trade) => trade.outcome === "win").length;
  const stopLosses = trades.filter((trade) => trade.outcome === "stop_loss").length;
  const breakEvens = trades.filter((trade) => trade.outcome === "break_even").length;
  const decisiveTrades = wins + stopLosses;
  const tradesWithResult = trades.filter(
    (trade) => trade.realizedR != null && Number.isFinite(trade.realizedR)
  );
  const totalR = tradesWithResult.reduce((sum, trade) => sum + (trade.realizedR ?? 0), 0);
  const grossProfitR = tradesWithResult.reduce(
    (sum, trade) => sum + Math.max(0, trade.realizedR ?? 0),
    0
  );
  const grossLossR = tradesWithResult.reduce(
    (sum, trade) => sum + Math.max(0, -(trade.realizedR ?? 0)),
    0
  );
  const totalModelPct = tradesWithResult.reduce(
    (sum, trade) => sum + (trade.realizedR ?? 0) * (trade.riskPct ?? 0),
    0
  );
  const tradesWithRisk = tradesWithResult.filter(
    (trade) => trade.riskPct != null && Number.isFinite(trade.riskPct)
  ).length;
  return {
    trades: trades.length,
    wins,
    stopLosses,
    breakEvens,
    winRatePct: decisiveTrades > 0 ? (wins / decisiveTrades) * 100 : null,
    totalR,
    averageR: tradesWithResult.length ? totalR / tradesWithResult.length : null,
    profitFactor:
      grossLossR > 0 ? grossProfitR / grossLossR : grossProfitR > 0 ? Infinity : null,
    totalModelPct,
    tradesWithResult: tradesWithResult.length,
    tradesWithRisk,
  };
}
