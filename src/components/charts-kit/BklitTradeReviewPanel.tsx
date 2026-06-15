import { useMemo } from "react";

import { Candlestick } from "@/components/charts/candlestick";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { useChartStable } from "@/components/charts/chart-context";
import { compactPrice, toMarketOhlcSeries, type MarketOhlcPoint } from "@/lib/data-handlers";
import type { NativeBacktestTrade } from "@/lib/data-handlers";
import type { Kline } from "@/lib/binance";
import { cn } from "@/lib/utils";

interface BklitTradeReviewPanelProps {
  klines1h: Kline[];
  klines5m: Kline[];
  trade: NativeBacktestTrade | null;
  formatPrice?: (value: number) => string;
  className?: string;
}

interface Marker {
  timestamp: number;
  label: string;
  color: string;
}

interface Level {
  price: number;
  label: string;
  color: string;
}

interface Zone {
  startTime: number;
  endTime: number;
  low: number;
  high: number;
  label: string;
  color: string;
}

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function getWindow(
  data: MarketOhlcPoint[],
  startTime: number,
  endTime: number,
  fallbackSize: number
) {
  const window = data.filter((point) => point.timestamp >= startTime && point.timestamp <= endTime);

  return window.length >= 4 ? window : data.slice(-fallbackSize);
}

function getOneHourReviewWindow(data: MarketOhlcPoint[], trade: NativeBacktestTrade | null) {
  if (!trade) return data.slice(-72);

  return getWindow(data, trade.setup_time - 12 * HOUR_MS, trade.setup_time + 12 * HOUR_MS, 72);
}

function getFiveMinuteReviewWindow(data: MarketOhlcPoint[], trade: NativeBacktestTrade | null) {
  if (!trade) return data.slice(-120);

  const fvgStartTime = trade.fvg_candle_1_time ?? trade.fvg_formed_time;
  const start = Math.min(fvgStartTime, trade.fvg_test_time, trade.entry_time) - 30 * 60 * 1000;
  const end = Math.max(trade.entry_time, trade.exit_time) + 30 * 60 * 1000;

  return getWindow(data, start, end, 120);
}

function previousPoint(data: MarketOhlcPoint[], timestamp: number) {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    if (data[index].timestamp < timestamp) return data[index];
  }

  return null;
}

function TradeReviewOverlay({
  levels,
  markers,
  zones = [],
  formatPrice,
}: {
  levels: Level[];
  markers: Marker[];
  zones?: Zone[];
  formatPrice: (value: number) => string;
}) {
  const { xScale, yScale, innerWidth, innerHeight } = useChartStable();

  return (
    <g className="trade-review-overlay">
      {zones.map((zone) => {
        const x1 = xScale(new Date(zone.startTime));
        const x2 = xScale(new Date(zone.endTime));
        const yHigh = yScale(zone.high);
        const yLow = yScale(zone.low);
        if (x1 == null || x2 == null || yHigh == null || yLow == null) return null;

        const x = Math.max(0, Math.min(x1, x2));
        const width = Math.min(innerWidth, Math.max(x1, x2)) - x;
        const y = Math.max(0, Math.min(yHigh, yLow));
        const height = Math.min(innerHeight, Math.max(yHigh, yLow)) - y;
        if (width <= 0 || height <= 0) return null;

        return (
          <g key={`${zone.label}-${zone.startTime}`}>
            <rect
              fill={zone.color}
              fillOpacity={0.14}
              height={height}
              rx={4}
              stroke={zone.color}
              strokeDasharray="4 4"
              strokeOpacity={0.72}
              strokeWidth={1}
              width={width}
              x={x}
              y={y}
            />
            <text
              fill={zone.color}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={10}
              fontWeight={700}
              x={x + 8}
              y={Math.max(12, y - 6)}
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {levels.map((level) => {
        const y = yScale(level.price);
        if (y == null || y < -24 || y > innerHeight + 24) return null;

        return (
          <g key={`${level.label}-${level.price}`}>
            <line
              stroke={level.color}
              strokeDasharray="6 5"
              strokeWidth={1.5}
              x1={0}
              x2={innerWidth}
              y1={y}
              y2={y}
            />
            <rect
              fill="var(--background)"
              height={22}
              rx={4}
              stroke={level.color}
              strokeWidth={1}
              width={104}
              x={8}
              y={Math.max(0, y - 28)}
            />
            <text
              fill={level.color}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={11}
              fontWeight={700}
              x={16}
              y={Math.max(15, y - 13)}
            >
              {level.label} {formatPrice(level.price)}
            </text>
          </g>
        );
      })}

      {markers.map((marker, index) => {
        const x = xScale(new Date(marker.timestamp));
        if (x == null || x < -20 || x > innerWidth + 20) return null;
        const labelY = 18 + (index % 3) * 20;

        return (
          <g key={`${marker.label}-${marker.timestamp}`}>
            <line
              stroke={marker.color}
              strokeDasharray="3 5"
              strokeOpacity={0.82}
              strokeWidth={1.25}
              x1={x}
              x2={x}
              y1={0}
              y2={innerHeight}
            />
            <circle cx={x} cy={labelY - 4} fill={marker.color} r={3.5} />
            <text
              fill={marker.color}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={10}
              fontWeight={700}
              textAnchor="middle"
              x={x}
              y={labelY + 10}
            >
              {marker.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ReviewChart({
  data,
  emptyLabel,
  levels,
  markers,
  zones,
  formatPrice,
}: {
  data: MarketOhlcPoint[];
  emptyLabel: string;
  levels: Level[];
  markers: Marker[];
  zones?: Zone[];
  formatPrice: (value: number) => string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-background text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="min-h-[360px] w-full overflow-hidden rounded-lg bg-background">
      <CandlestickChart
        animationDuration={0}
        aspectRatio={undefined}
        className="h-full min-h-[360px]"
        data={data}
        margin={{ top: 34, right: 72, bottom: 36, left: 16 }}
        style={{ height: "100%" }}
      >
        <Grid fadeHorizontal horizontal numTicksRows={6} strokeOpacity={0.42} />
        <Candlestick
          animate={false}
          negativeFill="var(--chart-5)"
          positiveFill="var(--chart-1)"
          showHoverFade={false}
        />
        <TradeReviewOverlay
          formatPrice={formatPrice}
          levels={levels}
          markers={markers}
          zones={zones}
        />
        <YAxis formatValue={formatPrice} orientation="right" />
        <XAxis numTicks={6} />
        <ChartTooltip
          indicatorColor={(point) =>
            Number(point.close) >= Number(point.open) ? "var(--chart-1)" : "var(--chart-5)"
          }
          rows={(point) => [
            { color: "var(--chart-1)", label: "Open", value: Number(point.open) },
            { color: "var(--chart-1)", label: "High", value: Number(point.high) },
            { color: "var(--chart-5)", label: "Low", value: Number(point.low) },
            { color: "var(--chart-line-primary)", label: "Close", value: Number(point.close) },
          ]}
          showDots={false}
        />
      </CandlestickChart>
    </div>
  );
}

export function BklitTradeReviewPanel({
  klines1h,
  klines5m,
  trade,
  formatPrice = compactPrice,
  className,
}: BklitTradeReviewPanelProps) {
  const oneHourSeries = useMemo(() => toMarketOhlcSeries(klines1h), [klines1h]);
  const fiveMinuteSeries = useMemo(() => toMarketOhlcSeries(klines5m), [klines5m]);

  const oneHourData = useMemo(() => {
    return getOneHourReviewWindow(oneHourSeries, trade);
  }, [oneHourSeries, trade]);

  const fiveMinuteData = useMemo(() => {
    return getFiveMinuteReviewWindow(fiveMinuteSeries, trade);
  }, [fiveMinuteSeries, trade]);

  const oneHourLevels = useMemo<Level[]>(() => {
    if (!trade) return [];

    const previous = previousPoint(oneHourSeries, trade.setup_time);
    if (!previous) return [];

    const sweepLevel =
      trade.direction === "long"
        ? { price: previous.low, label: "Sweep low", color: "var(--chart-5)" }
        : { price: previous.high, label: "Sweep high", color: "var(--chart-5)" };
    const oppositeLevel =
      trade.direction === "long"
        ? { price: previous.high, label: "Prev high", color: "var(--chart-3)" }
        : { price: previous.low, label: "Prev low", color: "var(--chart-3)" };

    return [sweepLevel, oppositeLevel];
  }, [oneHourSeries, trade]);

  const oneHourMarkers = useMemo<Marker[]>(() => {
    if (!trade) return [];

    const previous = previousPoint(oneHourSeries, trade.setup_time);
    return [
      ...(previous ? [{ timestamp: previous.timestamp, label: "Prev 1H", color: "var(--chart-3)" }] : []),
      { timestamp: trade.setup_time, label: "Setup 1H", color: "var(--chart-4)" },
    ];
  }, [oneHourSeries, trade]);

  const fiveMinuteLevels = useMemo<Level[]>(() => {
    if (!trade) return [];

    return [
      { price: trade.entry_price, label: "Entry", color: "var(--chart-2)" },
      { price: trade.stop_loss, label: "SL", color: "var(--chart-5)" },
      { price: trade.take_profit, label: "TP", color: "var(--chart-1)" },
    ];
  }, [trade]);

  const fiveMinuteMarkers = useMemo<Marker[]>(() => {
    if (!trade) return [];
    const isOrderFlowProxy = trade.setup_variant.startsWith("order_flow_proxy");

    return [
      ...(trade.fvg_candle_1_time
        ? [
            {
              timestamp: trade.fvg_candle_1_time,
              label: isOrderFlowProxy ? "Sweep" : "5M FVG C1",
              color: "var(--chart-2)",
            },
          ]
        : []),
      ...(trade.fvg_candle_2_time
        ? [
            {
              timestamp: trade.fvg_candle_2_time,
              label: isOrderFlowProxy ? "Reject" : "5M FVG C2",
              color: "var(--chart-2)",
            },
          ]
        : []),
      ...(trade.fvg_candle_3_time
        ? [
            {
              timestamp: trade.fvg_candle_3_time,
              label: isOrderFlowProxy ? "Displace" : "5M FVG C3",
              color: "var(--chart-2)",
            },
          ]
        : [{ timestamp: trade.fvg_formed_time, label: isOrderFlowProxy ? "Proxy" : "5M FVG", color: "var(--chart-2)" }]),
      { timestamp: trade.fvg_test_time, label: isOrderFlowProxy ? "Reject" : "Test", color: "var(--chart-3)" },
      { timestamp: trade.engulfing_time, label: isOrderFlowProxy ? "Confirm" : "Eng", color: "var(--chart-4)" },
      { timestamp: trade.entry_time, label: "Entry", color: "var(--chart-2)" },
      { timestamp: trade.exit_time, label: "Exit", color: "var(--chart-5)" },
    ];
  }, [trade]);

  const fiveMinuteZones = useMemo<Zone[]>(() => {
    if (!trade) return [];
    const isOrderFlowProxy = trade.setup_variant.startsWith("order_flow_proxy");

    return [
      {
        startTime: trade.fvg_candle_1_time ?? trade.fvg_formed_time,
        endTime: Math.max(trade.entry_time, trade.fvg_test_time) + FIVE_MINUTES_MS,
        low: trade.fvg_low,
        high: trade.fvg_high,
        label: isOrderFlowProxy ? "Sweep/rejection zone" : "5M FVG zone",
        color: "var(--chart-4)",
      },
    ];
  }, [trade]);

  return (
    <div className={cn("grid gap-4 xl:grid-cols-2", className)}>
      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">1H model</h3>
          {trade ? (
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {trade.setup_variant}
            </span>
          ) : null}
        </div>
        <ReviewChart
          data={oneHourData}
          emptyLabel="No 1H candle data"
          levels={oneHourLevels}
          markers={oneHourMarkers}
          formatPrice={formatPrice}
        />
      </section>

      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            {trade?.setup_variant.startsWith("order_flow_proxy")
              ? "Order flow proxy / entry / TP / SL"
              : "5M FVG / entry / TP / SL"}
          </h3>
          {trade ? (
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {trade.result_status}
            </span>
          ) : null}
        </div>
        <ReviewChart
          data={fiveMinuteData}
          emptyLabel="No 5M candle data"
          levels={fiveMinuteLevels}
          markers={fiveMinuteMarkers}
          zones={fiveMinuteZones}
          formatPrice={formatPrice}
        />
      </section>
    </div>
  );
}
