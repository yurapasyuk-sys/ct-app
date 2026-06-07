import type { Kline } from "@/lib/binance";
import { toLineSeries, type TimeValuePoint } from "./chart-data";

export type BacktestSide = "long" | "short" | "flat";
export type BacktestAction = "enterLong" | "enterShort" | "exit" | "hold";

export interface BacktestSignal {
  timestamp: number;
  action: BacktestAction;
  reason?: string;
}

export interface BacktestTrade {
  side: Exclude<BacktestSide, "flat">;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  returnPct: number;
  entryReason?: string;
  exitReason?: string;
}

export interface BacktestEquityPoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
  close: number;
  side: BacktestSide;
}

export interface BacktestReport {
  strategyName: string;
  symbol: string;
  interval: string;
  assumptions: string[];
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
  equity: BacktestEquityPoint[];
  equitySeries: TimeValuePoint[];
  drawdownSeries: TimeValuePoint[];
}

export interface SignalBacktestParams {
  strategyName: string;
  symbol: string;
  interval: string;
  initialCapital?: number;
  feeRate?: number;
  slippageRate?: number;
  assumptions?: string[];
}

interface Position {
  side: Exclude<BacktestSide, "flat">;
  quantity: number;
  entryTime: number;
  entryPrice: number;
  entryReason?: string;
}

function entryExecutionPrice(close: number, side: BacktestAction, slippageRate: number) {
  if (side === "enterLong") {
    return close * (1 + slippageRate);
  }

  if (side === "enterShort") {
    return close * (1 - slippageRate);
  }

  return close;
}

function exitExecutionPrice(close: number, side: Exclude<BacktestSide, "flat">, slippageRate: number) {
  return side === "long" ? close * (1 - slippageRate) : close * (1 + slippageRate);
}

export function runSignalBacktest(
  klines: Kline[],
  signals: BacktestSignal[],
  params: SignalBacktestParams
): BacktestReport {
  const {
    strategyName,
    symbol,
    interval,
    initialCapital = 10_000,
    feeRate = 0.0004,
    slippageRate = 0,
    assumptions = [],
  } = params;

  const signalByTimestamp = new Map(signals.map((signal) => [signal.timestamp, signal]));
  const trades: BacktestTrade[] = [];
  const equity: BacktestEquityPoint[] = [];

  let cash = initialCapital;
  let position: Position | null = null;
  let peakEquity = initialCapital;

  for (const kline of klines) {
    const signal = signalByTimestamp.get(kline.openTime);
    const close = kline.close;

    if (signal?.action === "exit" && position) {
      const price = exitExecutionPrice(close, position.side, slippageRate);
      const gross = position.quantity * price;
      const fee = gross * feeRate;
      const pnl =
        position.side === "long"
          ? gross - fee - position.quantity * position.entryPrice
          : position.quantity * position.entryPrice - gross - fee;

      cash += position.quantity * position.entryPrice + pnl;
      trades.push({
        side: position.side,
        entryTime: position.entryTime,
        exitTime: kline.openTime,
        entryPrice: position.entryPrice,
        exitPrice: price,
        quantity: position.quantity,
        pnl,
        returnPct:
          position.entryPrice > 0
            ? ((price - position.entryPrice) / position.entryPrice) *
              100 *
              (position.side === "long" ? 1 : -1)
            : 0,
        entryReason: position.entryReason,
        exitReason: signal.reason,
      });
      position = null;
    }

    if (!position && (signal?.action === "enterLong" || signal?.action === "enterShort")) {
      const price = entryExecutionPrice(close, signal.action, slippageRate);
      const entryFee = cash * feeRate;
      const side = signal.action === "enterLong" ? "long" : "short";
      position = {
        side,
        quantity: (cash - entryFee) / price,
        entryTime: kline.openTime,
        entryPrice: price,
        entryReason: signal.reason,
      };
      cash = 0;
    }

    const positionValue = position
      ? position.side === "long"
        ? position.quantity * close
        : position.quantity * (2 * position.entryPrice - close)
      : 0;
    const markToMarketEquity = cash + positionValue;
    peakEquity = Math.max(peakEquity, markToMarketEquity);
    const drawdownPct =
      peakEquity > 0 ? ((markToMarketEquity - peakEquity) / peakEquity) * 100 : 0;

    equity.push({
      timestamp: kline.openTime,
      equity: markToMarketEquity,
      drawdownPct,
      close,
      side: position?.side ?? "flat",
    });
  }

  const finalEquity = equity[equity.length - 1]?.equity ?? initialCapital;
  const maxDrawdownPct = Math.min(0, ...equity.map((point) => point.drawdownPct));

  return {
    strategyName,
    symbol,
    interval,
    assumptions,
    initialCapital,
    finalEquity,
    totalReturnPct: ((finalEquity - initialCapital) / initialCapital) * 100,
    maxDrawdownPct,
    trades,
    equity,
    equitySeries: toLineSeries(equity, (point) => point.timestamp, (point) => point.equity),
    drawdownSeries: toLineSeries(
      equity,
      (point) => point.timestamp,
      (point) => point.drawdownPct
    ),
  };
}
