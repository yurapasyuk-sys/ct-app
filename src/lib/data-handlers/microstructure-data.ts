export interface DukascopyBidAskMinute {
  time: number;
  bidOpen: number;
  bidHigh: number;
  bidLow: number;
  bidClose: number;
  askOpen: number;
  askHigh: number;
  askLow: number;
  askClose: number;
  bidVolume: number;
  askVolume: number;
  spreadOpen: number;
  spreadHigh: number;
  spreadLow: number;
  spreadClose: number;
  spreadMean: number;
  ticks: number;
}

export interface TrueOrderFlowTrade {
  timestamp: number;
  price: number;
  size: number;
  aggressor: "buy" | "sell" | "unknown";
  bidPrice?: number;
  askPrice?: number;
  bidSize?: number;
  askSize?: number;
}

export interface VolumeProfileLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  delta: number;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

function rowsFromCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampValue(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e17) return Math.floor(numeric / 1e6);
    if (numeric > 1e14) return Math.floor(numeric / 1e3);
    if (numeric > 1e11) return numeric;
    return numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(row: Record<string, string>, names: string[]) {
  for (const name of names) {
    if (row[name] != null && row[name] !== "") return row[name];
  }
  return undefined;
}

export function parseDukascopyBidAskCsv(csv: string): DukascopyBidAskMinute[] {
  return rowsFromCsv(csv)
    .map((row) => {
      const time = timestampValue(row.time);
      const values = [
        "bid_open",
        "bid_high",
        "bid_low",
        "bid_close",
        "ask_open",
        "ask_high",
        "ask_low",
        "ask_close",
        "bid_volume",
        "ask_volume",
        "spread_open",
        "spread_high",
        "spread_low",
        "spread_close",
        "spread_mean",
        "ticks",
      ].map((name) => numberValue(row[name]));
      if (time == null || values.some((value) => value == null)) return null;
      return {
        time,
        bidOpen: values[0]!,
        bidHigh: values[1]!,
        bidLow: values[2]!,
        bidClose: values[3]!,
        askOpen: values[4]!,
        askHigh: values[5]!,
        askLow: values[6]!,
        askClose: values[7]!,
        bidVolume: values[8]!,
        askVolume: values[9]!,
        spreadOpen: values[10]!,
        spreadHigh: values[11]!,
        spreadLow: values[12]!,
        spreadClose: values[13]!,
        spreadMean: values[14]!,
        ticks: values[15]!,
      } satisfies DukascopyBidAskMinute;
    })
    .filter((row): row is DukascopyBidAskMinute => row != null)
    .sort((left, right) => left.time - right.time);
}

export function parseDatabentoOrderFlowCsv(
  csv: string,
  options: { buySide?: string; sellSide?: string } = {}
): TrueOrderFlowTrade[] {
  const buySide = (options.buySide ?? "B").toUpperCase();
  const sellSide = (options.sellSide ?? "A").toUpperCase();
  return rowsFromCsv(csv)
    .map((row) => {
      const timestamp = timestampValue(pick(row, ["ts_event", "timestamp", "time", "ts_recv"]));
      const price = numberValue(pick(row, ["price", "trade_price", "last_px"]));
      const size = numberValue(pick(row, ["size", "quantity", "qty", "trade_size"]));
      const rawSide = (pick(row, ["side", "aggressor_side"]) ?? "N").toUpperCase();
      if (timestamp == null || price == null || size == null || size <= 0) return null;
      return {
        timestamp,
        price,
        size,
        aggressor: rawSide === buySide ? "buy" : rawSide === sellSide ? "sell" : "unknown",
        bidPrice: numberValue(pick(row, ["bid_px_00", "bid_price", "bid_px"])) ?? undefined,
        askPrice: numberValue(pick(row, ["ask_px_00", "ask_price", "ask_px"])) ?? undefined,
        bidSize: numberValue(pick(row, ["bid_sz_00", "bid_size", "bid_sz"])) ?? undefined,
        askSize: numberValue(pick(row, ["ask_sz_00", "ask_size", "ask_sz"])) ?? undefined,
      } satisfies TrueOrderFlowTrade;
    })
    .filter((row): row is TrueOrderFlowTrade => row != null)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

export function calculateDukascopyQuoteSummary(rows: DukascopyBidAskMinute[], pipSize: number) {
  const spreads = rows.map((row) => row.spreadMean / pipSize);
  const quoteDelta = rows.map((row) => row.askVolume - row.bidVolume);
  const totalAskVolume = rows.reduce((sum, row) => sum + row.askVolume, 0);
  const totalBidVolume = rows.reduce((sum, row) => sum + row.bidVolume, 0);
  return {
    classification: "quote_microstructure_proxy" as const,
    minutes: rows.length,
    firstTime: rows[0]?.time ?? null,
    lastTime: rows.at(-1)?.time ?? null,
    spreadPips: {
      mean: spreads.reduce((sum, value) => sum + value, 0) / Math.max(1, spreads.length),
      median: percentile(spreads, 0.5),
      p90: percentile(spreads, 0.9),
      p95: percentile(spreads, 0.95),
      maximum: rows.reduce(
        (maximum, row) => Math.max(maximum, row.spreadHigh / pipSize),
        0
      ),
    },
    ticks: rows.reduce((sum, row) => sum + row.ticks, 0),
    quoteVolume: {
      bid: totalBidVolume,
      ask: totalAskVolume,
      imbalance:
        totalAskVolume + totalBidVolume > 0
          ? (totalAskVolume - totalBidVolume) / (totalAskVolume + totalBidVolume)
          : 0,
      delta: quoteDelta.reduce((sum, value) => sum + value, 0),
    },
    warning:
      "Dukascopy bid/ask volume is quote-side liquidity from one venue, not executed aggressor volume.",
  };
}

export function buildVolumeProfile(
  trades: TrueOrderFlowTrade[],
  tickSize: number,
  valueAreaRatio = 0.7
) {
  const levels = new Map<number, VolumeProfileLevel>();
  for (const trade of trades) {
    const price = Math.round(trade.price / tickSize) * tickSize;
    const level = levels.get(price) ?? {
      price,
      buyVolume: 0,
      sellVolume: 0,
      totalVolume: 0,
      delta: 0,
    };
    if (trade.aggressor === "buy") level.buyVolume += trade.size;
    if (trade.aggressor === "sell") level.sellVolume += trade.size;
    level.totalVolume += trade.size;
    level.delta = level.buyVolume - level.sellVolume;
    levels.set(price, level);
  }
  const sorted = [...levels.values()].sort((left, right) => left.price - right.price);
  if (!sorted.length) return { levels: sorted, poc: null, vah: null, val: null };
  const pocIndex = sorted.reduce(
    (best, level, index) => (level.totalVolume > sorted[best].totalVolume ? index : best),
    0
  );
  const target = sorted.reduce((sum, level) => sum + level.totalVolume, 0) * valueAreaRatio;
  let accumulated = sorted[pocIndex].totalVolume;
  let lowIndex = pocIndex;
  let highIndex = pocIndex;
  while (accumulated < target && (lowIndex > 0 || highIndex < sorted.length - 1)) {
    const lower = lowIndex > 0 ? sorted[lowIndex - 1].totalVolume : -1;
    const upper = highIndex < sorted.length - 1 ? sorted[highIndex + 1].totalVolume : -1;
    if (upper >= lower) {
      highIndex += 1;
      accumulated += sorted[highIndex].totalVolume;
    } else {
      lowIndex -= 1;
      accumulated += sorted[lowIndex].totalVolume;
    }
  }
  return {
    levels: sorted,
    poc: sorted[pocIndex].price,
    vah: sorted[highIndex].price,
    val: sorted[lowIndex].price,
  };
}

export function calculateTrueOrderFlowSummary(trades: TrueOrderFlowTrade[], tickSize: number) {
  let buyVolume = 0;
  let sellVolume = 0;
  let unknownVolume = 0;
  let cvd = 0;
  let maxCvd = 0;
  let minCvd = 0;
  let bookImbalanceSum = 0;
  let bookSamples = 0;
  for (const trade of trades) {
    if (trade.aggressor === "buy") {
      buyVolume += trade.size;
      cvd += trade.size;
    } else if (trade.aggressor === "sell") {
      sellVolume += trade.size;
      cvd -= trade.size;
    } else {
      unknownVolume += trade.size;
    }
    maxCvd = Math.max(maxCvd, cvd);
    minCvd = Math.min(minCvd, cvd);
    if (trade.bidSize != null && trade.askSize != null && trade.bidSize + trade.askSize > 0) {
      bookImbalanceSum += (trade.bidSize - trade.askSize) / (trade.bidSize + trade.askSize);
      bookSamples += 1;
    }
  }
  const profile = buildVolumeProfile(trades, tickSize);
  return {
    classification: "true_order_flow" as const,
    trades: trades.length,
    firstTime: trades[0]?.timestamp ?? null,
    lastTime: trades.at(-1)?.timestamp ?? null,
    buyVolume,
    sellVolume,
    unknownVolume,
    delta: buyVolume - sellVolume,
    cvd,
    maxCvd,
    minCvd,
    averageTopBookImbalance: bookSamples ? bookImbalanceSum / bookSamples : null,
    bookSamples,
    poc: profile.poc,
    vah: profile.vah,
    val: profile.val,
    footprintLevels: profile.levels,
  };
}
