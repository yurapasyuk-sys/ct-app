import { Grid } from "@/components/charts/grid";
import { Line, LineChart } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { compactMetric, type NamedTimeValuePoint } from "@/lib/data-handlers";
import { cn } from "@/lib/utils";

interface LineSeriesConfig {
  key: string;
  label: string;
  color: string;
  width?: number;
}

interface BklitLinePanelProps {
  data: NamedTimeValuePoint[];
  series: LineSeriesConfig[];
  className?: string;
  loading?: boolean;
  yFormatter?: (value: number) => string;
  loadingLabel?: string;
  compact?: boolean;
}

export function BklitLinePanel({
  data,
  series,
  className,
  loading = false,
  yFormatter = compactMetric,
  loadingLabel = "Loading chart",
  compact = false,
}: BklitLinePanelProps) {
  if (!loading && data.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center text-sm text-muted-foreground", className)}>
        No series data
      </div>
    );
  }

  return (
    <LineChart
      aspectRatio={undefined}
      className={cn(compact ? "h-full min-h-0" : "h-full min-h-[120px]", className)}
      data={data}
      loadingLabel={loadingLabel}
      margin={
        compact
          ? { top: 8, right: 8, bottom: 8, left: 8 }
          : { top: 24, right: 56, bottom: 34, left: 16 }
      }
      status={loading ? "loading" : "ready"}
      style={{ height: "100%" }}
    >
      <Grid
        fadeHorizontal={!compact}
        horizontal={!compact}
        numTicksRows={compact ? 2 : 5}
        strokeOpacity={0.38}
        vertical={false}
      />
      {series.map((item) => (
        <Line
          dataKey={item.key}
          fadeEdges={false}
          key={item.key}
          showHighlight={!compact}
          stroke={item.color}
          strokeWidth={item.width ?? (compact ? 1.8 : 2.4)}
        />
      ))}
      {!compact ? <YAxis formatValue={yFormatter} orientation="right" /> : null}
      {!compact ? <XAxis numTicks={5} /> : null}
      {!compact ? (
        <ChartTooltip
          rows={(point) =>
            series.map((item) => ({
              color: item.color,
              label: item.label,
              value: Number(point[item.key]),
            }))
          }
        />
      ) : null}
    </LineChart>
  );
}
