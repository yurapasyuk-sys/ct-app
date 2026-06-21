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
