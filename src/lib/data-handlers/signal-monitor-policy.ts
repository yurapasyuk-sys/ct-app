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
