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

interface ResearchTradeReviewPanelProps {
  klines: Kline[];
  symbol: string;
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
const FOUR_HOURS_MS = 4 * HOUR_MS;

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

function formatReviewTime(timestamp: number | null | undefined) {
  if (!timestamp) return "-";

  return new Intl.DateTimeFormat("uk-UA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function finiteLevel(price: number | null | undefined) {
  return typeof price === "number" && Number.isFinite(price);
}

function researchPipSize(symbol: string) {
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40") return 1;

  return 0.0001;
}

function formatRiskDistance(symbol: string, trade: NativeBacktestTrade) {
  const distance = Math.abs(trade.entry_price - trade.stop_loss) / researchPipSize(symbol);
  const unit = symbol === "GER40" ? "пунктів" : "піпсів";

  return `${distance.toFixed(symbol === "GER40" ? 1 : 1)} ${unit}`;
}

function formatDirection(direction: NativeBacktestTrade["direction"]) {
  return direction === "long" ? "лонг" : "шорт";
}

function researchProfileDescription(symbol: string, trade: NativeBacktestTrade) {
  if (trade.setup_variant === "research_2026_donchian_1h_80_10") {
    return "Пробійна модель Donchian: вхід після закритої 1H свічки, яка пробила канал останніх 80 закритих 1H свічок. Вихід без фіксованого TP: позиція тримається, доки не з'явиться протилежний сигнал по 10-свічковому каналу або не спрацює стоп-лос.";
  }
  if (trade.setup_variant === "universal_forex_bb_atr_mean_reversion_2026") {
    return "Універсальна Forex BB/ATR Mean Reversion 2026: однакові правила для AUDUSD, EURUSD, GBPUSD і USDJPY. Таймфрейм 4H, Bollinger 20 з відхиленням 1.25, вхід у mean reversion після закриття свічки за межами смуги. Якщо close нижче нижньої смуги - long на відкритті наступної 4H свічки; якщо close вище верхньої смуги - short. Stop Loss = 0.75 * ATR(14) від entry. Ціль - середня лінія Bollinger на момент сигналу. Максимальне утримання - 48 свічок. Ризик на сетап - 1% equity.";
  }
  if (trade.setup_variant === "audusd_bb_atr_long_reversion_2026") {
    return "Модель AUDUSD BB/ATR Long Reversion 2026: 1H, Bollinger 100 з відхиленням 1.75, тільки long. Логіка така: якщо AUDUSD закрив 1H свічку нижче нижньої смуги Bollinger і при цьому знаходиться нижче EMA200, ринок вважається перепроданим у контртрендовій зоні. Вхід у long виконується на відкритті наступної 1H свічки. Stop Loss ставиться на 0.75 * ATR(14) нижче entry, ціль - верхня смуга Bollinger з моменту сигналу, максимум утримання - 24 години. Це mean reversion модель: вона шукає повернення ціни від нижнього екстремуму, а не пробій за трендом.";
  }
  if (trade.setup_variant === "ger40_bb_atr_short_reversion_2026") {
    return "Модель GER40 BB/ATR Short Reversion 2026: 1H, Bollinger 80 з відхиленням 2.25, тільки short. Логіка така: якщо GER40 закрив 1H свічку вище верхньої смуги Bollinger, ринок вважається перегрітим після різкого імпульсу вгору. Вхід у short виконується на відкритті наступної 1H свічки. Stop Loss ставиться на 1.25 * ATR(14) вище entry, ціль - нижня смуга Bollinger з моменту сигналу, максимум утримання - 72 години. Це mean reversion модель, тобто вона заробляє не на продовженні тренду, а на поверненні ціни з екстремуму.";
  }
  if (trade.setup_variant === "fx_short_pullback_bb_atr_2026") {
    return "FX Short Pullback BB/ATR 2026: універсальна short-only модель для forex-пар. Таймфрейм 1H, Bollinger 80 з відхиленням 1.25, EMA200 як фільтр тренду. Сетап виникає тоді, коли 1H свічка закрилась вище верхньої смуги Bollinger, але все ще нижче EMA200. Це означає не купівлю пробою, а пошук шорту після різкого відкату в межах ведмежого режиму. Entry виконується на відкритті наступної 1H свічки. Stop Loss = 0.75 * ATR(14) вище entry, target - нижня смуга Bollinger з моменту сигналу, максимум утримання - 24 години. Ризик на угоду - 1% equity.";
  }
  if (trade.setup_variant === "fx_universal_long_bb_atr_2026") {
    return "FX Universal Long BB/ATR 2026: універсальна long-only mean reversion модель для forex-пар. Таймфрейм 4H, Bollinger 80 з відхиленням 1.5. Сетап виникає тоді, коли 4H свічка закрилась нижче нижньої смуги Bollinger, тобто ринок зробив сильний рух вниз і став перепроданим відносно останньої 4H структури. Entry виконується на відкритті наступної 4H свічки. Stop Loss = 0.5 * ATR(14) нижче entry, target - верхня смуга Bollinger з моменту сигналу, максимум утримання - 48 свічок. Ризик на угоду - 1% equity. У 2026 YTD ця модель найкраще проявилась на JPY-кросах, але тестувалась однаковими правилами на широкому FX-кошику.";
  }
  if (trade.setup_variant === "fx_prop_nzdusd_bb_atr_2026") {
    return "FX Prop NZDUSD BB/ATR 2026: prop-safe mean reversion модель для NZDUSD. Таймфрейм 1H, Bollinger 80 з відхиленням 1.75, EMA200 як фільтр режиму. Long дозволений тільки вище EMA200 після закриття нижче нижньої Bollinger band, short дозволений тільки нижче EMA200 після закриття вище верхньої Bollinger band. Entry виконується на відкритті наступної 1H свічки, без look-ahead. Stop Loss = 0.5 * ATR(14) від entry, target - протилежна Bollinger band з моменту сигналу, максимум утримання - 24 години. Ризик на угоду - 1% equity. Модель відібрана не за максимальним прибутком, а за prop-критеріями: drawdown до 8%, коротка серія стопів і здатність дати 20%+ на сильному 60-90 денному відрізку.";
  }

  const profiles: Record<string, string> = {
    AUDUSD:
      "BB/ATR модель для AUDUSD: 4H, Bollinger 20 з відхиленням 2, тільки лонг, стоп-лос = 2 * ATR(14), планова ціль - протилежна смуга Bollinger, максимум утримання 6 свічок.",
    GBPUSD:
      "BB/ATR модель для GBPUSD: 1H, Bollinger 80 з відхиленням 1.5, тільки шорт, стоп-лос = 1 * ATR(14), планова ціль - середня лінія Bollinger, максимум утримання 96 свічок.",
    USDJPY:
      "BB/ATR модель для USDJPY: 1H, Bollinger 40 з відхиленням 2, тільки лонг, стоп-лос = 1 * ATR(14), планова ціль - протилежна смуга Bollinger, максимум утримання 96 свічок.",
    GER40:
      "BB/ATR модель для GER40: 1H, Bollinger 80 з відхиленням 2, тільки шорт, стоп-лос = 1 * ATR(14), планова ціль - протилежна смуга Bollinger, максимум утримання 96 свічок.",
  };

  return profiles[symbol] ?? "BB/ATR модель: вхід після закритої свічки за межами смуги Bollinger, стоп-лос рахується через ATR(14), вихід по цілі, стопу або правилу максимального утримання.";
}

function resultStatusUk(status: NativeBacktestTrade["result_status"]) {
  if (status === "take_profit") return "ціль досягнута";
  if (status === "stop_loss") return "стоп-лос";
  if (status === "breakeven") return "беззбиток";
  if (status === "open_at_end") return "закрито в кінці тесту";
  if (status === "channel_exit") return "вихід за правилом каналу/часу";

  return status;
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

function getResearchReviewWindow(data: MarketOhlcPoint[], trade: NativeBacktestTrade | null, symbol: string) {
  if (!trade) return data.slice(-140);

  const barMs = researchTimeframe(symbol, trade) === "4H" ? FOUR_HOURS_MS : HOUR_MS;
  return getWindow(data, trade.entry_time - 28 * barMs, trade.exit_time + 10 * barMs, 160);
}

function researchSetupKind(trade: NativeBacktestTrade | null) {
  if (!trade) return "Research";
  if (trade.setup_variant === "research_2026_donchian_1h_80_10") return "Пробій Donchian";
  if (trade.setup_variant === "universal_forex_bb_atr_mean_reversion_2026") return "Universal Forex BB/ATR реверсія";
  if (trade.setup_variant === "audusd_bb_atr_long_reversion_2026") return "AUDUSD BB/ATR лонг-реверсія";
  if (trade.setup_variant === "ger40_bb_atr_short_reversion_2026") return "GER40 BB/ATR шорт-реверсія";
  if (trade.setup_variant === "fx_short_pullback_bb_atr_2026") return "FX BB/ATR шорт-пулбек";
  if (trade.setup_variant === "fx_universal_long_bb_atr_2026") return "FX BB/ATR лонг-реверсія";
  if (trade.setup_variant === "fx_prop_nzdusd_bb_atr_2026") return "FX Prop NZDUSD BB/ATR";

  return "Адаптивна BB/ATR модель";
}

function researchTimeframe(symbol: string, trade: NativeBacktestTrade | null) {
  if (trade?.setup_variant === "research_2026_donchian_1h_80_10") return "1H";
  if (trade?.setup_variant === "universal_forex_bb_atr_mean_reversion_2026") return "4H";
  if (trade?.setup_variant === "audusd_bb_atr_long_reversion_2026") return "1H";
  if (trade?.setup_variant === "fx_short_pullback_bb_atr_2026") return "1H";
  if (trade?.setup_variant === "fx_universal_long_bb_atr_2026") return "4H";
  if (trade?.setup_variant === "fx_prop_nzdusd_bb_atr_2026") return "1H";
  if (symbol === "AUDUSD") return "4H";

  return "1H";
}

function researchLogicRows({
  signal,
  symbol,
  trade,
  formatPrice,
}: {
  signal: MarketOhlcPoint | null;
  symbol: string;
  trade: NativeBacktestTrade | null;
  formatPrice: (value: number) => string;
}) {
  if (!trade) return [];

  const timeframe = researchTimeframe(symbol, trade);
  const direction = formatDirection(trade.direction);
  const signalClose = signal ? formatPrice(Number(signal.close)) : "-";
  const signalOpen = signal ? formatPrice(Number(signal.open)) : "-";
  const signalHigh = signal ? formatPrice(Number(signal.high)) : "-";
  const signalLow = signal ? formatPrice(Number(signal.low)) : "-";
  const entryChannelHigh = finiteLevel(trade.entry_channel_high)
    ? formatPrice(trade.entry_channel_high)
    : "-";
  const entryChannelLow = finiteLevel(trade.entry_channel_low)
    ? formatPrice(trade.entry_channel_low)
    : "-";
  const atr = finiteLevel(trade.atr_value) ? formatPrice(trade.atr_value) : "-";
  const target = finiteLevel(trade.take_profit) ? formatPrice(trade.take_profit) : "фіксованої цілі немає";
  const exitHigh = finiteLevel(trade.exit_channel_high) ? formatPrice(trade.exit_channel_high) : "-";
  const exitLow = finiteLevel(trade.exit_channel_low) ? formatPrice(trade.exit_channel_low) : "-";
  const riskDistance = formatRiskDistance(symbol, trade);
  const signalTime = formatReviewTime(signal?.timestamp);
  const entryTime = formatReviewTime(trade.entry_time);
  const exitTime = formatReviewTime(trade.exit_time);
  const result = `${resultStatusUk(trade.result_status)}: вихід ${formatPrice(trade.exit_price)} (${exitTime}), результат ${trade.r_multiple.toFixed(2)}R`;

  if (trade.setup_variant === "research_2026_donchian_1h_80_10") {
    const trigger =
      trade.direction === "long"
      ? `закрита ${timeframe} свічка має ціну закриття ${signalClose}, тобто закрилась вище верхньої межі Donchian ${entryChannelHigh}`
      : `закрита ${timeframe} свічка має ціну закриття ${signalClose}, тобто закрилась нижче нижньої межі Donchian ${entryChannelLow}`;
    const exitRule =
      trade.direction === "long"
        ? `для лонгу вихід по трендовому правилу виникає, якщо закрита свічка опускається нижче нижньої межі виходу ${exitLow}; також позиція закривається, якщо ціна торкається стоп-лосу`
        : `для шорту вихід по трендовому правилу виникає, якщо закрита свічка піднімається вище верхньої межі виходу ${exitHigh}; також позиція закривається, якщо ціна торкається стоп-лосу`;

    return [
      ["Модель", researchProfileDescription(symbol, trade)],
      ["Напрям", `Угода дозволена в напрямку: ${direction}. Сигнал сформувався на закритій ${timeframe} свічці ${signalTime}.`],
      ["Сигнальна свічка", `Параметри свічки: відкриття ${signalOpen}, максимум ${signalHigh}, мінімум ${signalLow}, закриття ${signalClose}. ${trigger}.`],
      ["Канал входу", `Верхня межа каналу: ${entryChannelHigh}. Нижня межа каналу: ${entryChannelLow}. Канал рахується тільки по повністю закритих попередніх свічках, без підглядання в майбутні дані.`],
      ["Вхід", `Вхід не на закритті сигнальної свічки, а на відкритті наступної ${timeframe} свічки: ${formatPrice(trade.entry_price)} (${entryTime}). Це прибирає підглядання в майбутні дані.`],
      ["Стоп-лос", `Стоп-лос поставлений через ATR: ${formatPrice(trade.stop_loss)}. ATR(14) на момент сигналу: ${atr}. Дистанція ризику: ${riskDistance}.`],
      ["Take Profit", "Фіксованого TP немає. Це trend-following угода: прибуток не обмежується наперед, позиція тримається до exit-сигналу або SL."],
      ["Логіка виходу", exitRule],
      ["Результат", result],
    ];
  }

  const trigger =
    trade.direction === "long"
      ? `закрита ${timeframe} свічка має ціну закриття ${signalClose}, тобто закрилась нижче нижньої смуги Bollinger ${entryChannelLow}`
      : `закрита ${timeframe} свічка має ціну закриття ${signalClose}, тобто закрилась вище верхньої смуги Bollinger ${entryChannelHigh}`;
  const targetRule =
    trade.direction === "long"
      ? `для лонгу планова ціль зверху: ${target}`
      : `для шорту планова ціль знизу: ${target}`;

  return [
    ["Модель", researchProfileDescription(symbol, trade)],
    ["Напрям", `Угода дозволена в напрямку: ${direction}. Сигнал сформувався на закритій ${timeframe} свічці ${signalTime}.`],
    ["Сигнальна свічка", `Параметри свічки: відкриття ${signalOpen}, максимум ${signalHigh}, мінімум ${signalLow}, закриття ${signalClose}. ${trigger}.`],
    ["Зона сетапу", `Верхня смуга Bollinger: ${entryChannelHigh}. Нижня смуга Bollinger: ${entryChannelLow}. Сигнал рахується тільки після закриття свічки, тому майбутні дані не використовуються.`],
    ["Вхід", `Вхід виконаний на відкритті наступної ${timeframe} свічки: ${formatPrice(trade.entry_price)} (${entryTime}). Це не вхід заднім числом на сигнальному закритті.`],
    ["Стоп-лос", `Стоп-лос = ціна входу +/- ATR-множник: ${formatPrice(trade.stop_loss)}. ATR(14) на момент сигналу: ${atr}. Дистанція ризику: ${riskDistance}.`],
    ["Ціль", `${targetRule}. Якщо ціль не досягнута, угода може вийти по стоп-лосу або правилу максимального утримання.`],
    ["Логіка виходу", "Позиція закривається при торканні стоп-лосу, при досягненні планової цілі або при завершенні максимального часу утримання для цього профілю."],
    ["Результат", result],
  ];
}

export function ResearchTradeReviewPanel({
  klines,
  symbol,
  trade,
  formatPrice = compactPrice,
  className,
}: ResearchTradeReviewPanelProps) {
  const series = useMemo(() => toMarketOhlcSeries(klines), [klines]);
  const data = useMemo(() => getResearchReviewWindow(series, trade, symbol), [series, symbol, trade]);
  const signal = useMemo(() => (trade ? previousPoint(series, trade.entry_time) : null), [series, trade]);
  const timeframe = researchTimeframe(symbol, trade);

  const levels = useMemo<Level[]>(() => {
    if (!trade) return [];
    const nextLevels: Level[] = [
      { price: trade.entry_price, label: "Вхід", color: "var(--chart-2)" },
      { price: trade.stop_loss, label: "Стоп", color: "var(--chart-5)" },
    ];

    if (finiteLevel(trade.take_profit)) {
      nextLevels.push({ price: trade.take_profit, label: "Ціль", color: "var(--chart-1)" });
    }
    if (finiteLevel(trade.entry_channel_high)) {
      nextLevels.push({ price: trade.entry_channel_high, label: "Верх", color: "var(--chart-4)" });
    }
    if (finiteLevel(trade.entry_channel_low)) {
      nextLevels.push({ price: trade.entry_channel_low, label: "Низ", color: "var(--chart-4)" });
    }
    if (
      finiteLevel(trade.exit_channel_high) &&
      Math.abs((trade.exit_channel_high ?? 0) - (trade.entry_channel_high ?? Number.NaN)) > 1e-12
    ) {
      nextLevels.push({ price: trade.exit_channel_high, label: "Вихід верх", color: "var(--chart-3)" });
    }
    if (
      finiteLevel(trade.exit_channel_low) &&
      Math.abs((trade.exit_channel_low ?? 0) - (trade.entry_channel_low ?? Number.NaN)) > 1e-12
    ) {
      nextLevels.push({ price: trade.exit_channel_low, label: "Вихід низ", color: "var(--chart-3)" });
    }

    return nextLevels;
  }, [trade]);

  const markers = useMemo<Marker[]>(() => {
    if (!trade) return [];

    return [
      ...(signal ? [{ timestamp: signal.timestamp, label: "Сигнал закриття", color: "var(--chart-4)" }] : []),
      { timestamp: trade.entry_time, label: "Вхід відкриття", color: "var(--chart-2)" },
      { timestamp: trade.exit_time, label: "Вихід", color: "var(--chart-5)" },
    ];
  }, [signal, trade]);

  const zones = useMemo<Zone[]>(() => {
    if (!trade || !finiteLevel(trade.entry_channel_high) || !finiteLevel(trade.entry_channel_low)) return [];

    return [
      {
        startTime: signal?.timestamp ?? trade.entry_time,
        endTime: Math.max(trade.exit_time, trade.entry_time),
        low: trade.entry_channel_low ?? trade.entry_price,
        high: trade.entry_channel_high ?? trade.entry_price,
        label: trade.setup_variant === "research_2026_donchian_1h_80_10" ? "Канал входу" : "Зона Bollinger",
        color: "var(--chart-4)",
      },
    ];
  }, [signal, trade]);

  const logicRows = useMemo(
    () => researchLogicRows({ signal, symbol, trade, formatPrice }),
    [formatPrice, signal, symbol, trade]
  );

  return (
    <div className={cn("grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]", className)}>
      <section className="min-w-0 rounded-lg border border-border/60 bg-background p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{researchSetupKind(trade)}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {symbol} / {timeframe} / пояснення конкретної угоди
            </p>
          </div>
          {trade ? (
            <span className="rounded-md border border-border px-2 py-1 text-xs uppercase text-muted-foreground">
              {formatDirection(trade.direction)}
            </span>
          ) : null}
        </div>

        {logicRows.length ? (
          <dl className="space-y-3">
            {logicRows.map(([label, value]) => (
              <div key={label} className="grid gap-1">
                <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
                <dd className="text-sm leading-relaxed">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            Обери угоду для перегляду.
          </div>
        )}
      </section>

      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{timeframe} сетап / вхід / стоп / ціль</h3>
          {trade ? (
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {formatReviewTime(trade.entry_time)}
            </span>
          ) : null}
        </div>
        <ReviewChart
          data={data}
          emptyLabel={`Немає ${timeframe} свічок`}
          levels={levels}
          markers={markers}
          zones={zones}
          formatPrice={formatPrice}
        />
      </section>
    </div>
  );
}
