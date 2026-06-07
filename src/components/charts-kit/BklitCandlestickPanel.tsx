import { useEffect, useMemo, useRef } from "react";
import { Candlestick } from "@/components/charts/candlestick";
import { CandlestickChart } from "@/components/charts/candlestick-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { compactPrice, type MarketOhlcPoint } from "@/lib/data-handlers";
import { cn } from "@/lib/utils";

interface BklitCandlestickPanelProps {
  data: MarketOhlcPoint[];
  className?: string;
  loading?: boolean;
}

export function BklitCandlestickPanel({
  data,
  className,
  loading = false,
}: BklitCandlestickPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollSignatureRef = useRef<string | null>(null);
  const dense = data.length > 300;
  const chartWidth = useMemo(() => {
    const pixelsPerCandle = dense ? 5.5 : 8;
    return Math.max(960, Math.ceil(data.length * pixelsPerCandle));
  }, [data.length, dense]);
  const scrollSignature = `${data[0]?.timestamp ?? 0}:${data.length}`;

  useEffect(() => {
    const scrollNode = scrollRef.current;
    if (!scrollNode || data.length === 0) return;
    if (lastScrollSignatureRef.current === scrollSignature) return;

    lastScrollSignatureRef.current = scrollSignature;
    scrollNode.scrollLeft = scrollNode.scrollWidth;
  }, [data.length, scrollSignature]);

  if (!loading && data.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        No candle data
      </div>
    );
  }

  return (
    <div
      className={cn("chart-scroll h-full w-full overflow-x-auto overflow-y-hidden bg-background", className)}
      ref={scrollRef}
    >
      <div className="h-full min-w-full" style={{ width: chartWidth }}>
        <CandlestickChart
          animationDuration={dense ? 0 : 500}
          aspectRatio={undefined}
          className="h-full min-h-[260px]"
          data={data}
          margin={{ top: 24, right: 64, bottom: 34, left: 16 }}
          style={{ height: "100%" }}
        >
          <Grid fadeHorizontal horizontal numTicksRows={6} strokeOpacity={0.42} />
          <Candlestick
            animate={!dense}
            negativeFill="var(--chart-5)"
            positiveFill="var(--chart-1)"
            showHoverFade={!dense}
          />
          <YAxis formatValue={compactPrice} orientation="right" />
          <XAxis numTicks={5} />
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
    </div>
  );
}
