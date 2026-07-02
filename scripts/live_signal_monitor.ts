import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { lookup } from "node:dns";
import { get as httpsGet } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kline } from "../src/lib/binance";
import { fetchKlinesMultiBatch } from "../src/lib/binance";
import {
  detectLatestQ2PropSignal,
  type Q2PropStrategyConfig,
  type Q2PropStrategyKind,
} from "../src/lib/data-handlers/q2-prop-signal-strategy";
import {
  detectApprovedPropPositionExit,
  detectLatestApprovedPropSignal,
  type ApprovedPropStrategyConfig,
} from "../src/lib/data-handlers/approved-prop-portfolio-strategy";
import { fetchDukascopyJettaBidAsk } from "../src/lib/data-handlers/dukascopy-jetta";
import {
  detectLatestProp2026SessionMomentumSignal,
  detectProp2026SessionMomentumExit,
  type Prop2026SessionMomentumConfig,
} from "../src/lib/data-handlers/prop-2026-session-momentum-strategy";
import {
  aggregateSignalStatistics,
  exitAlertSuppressionReason,
  propPortfolioEntryBlockReason,
} from "../src/lib/data-handlers/signal-monitor-policy";
import {
  calculateForexPositionSize,
  forexPairCurrencies,
} from "../src/lib/trading/forex-position-size";
import { calculateContractPositionSize } from "../src/lib/trading/contract-position-size";
import type { PositionSizeResult } from "../src/lib/trading/position-size-core";

type Direction = "long" | "short";
export type StrategyKind =
  | "donchian"
  | "bb_atr"
  | "htf_breakout"
  | "range_expansion_breakout"
  | "prop_2026_session_momentum"
  | "approved_prop"
  | Q2PropStrategyKind;
export type SignalTimeframe = "30m" | "1h" | "4h";
export type StrategyCategory =
  | "research"
  | "asset_specific"
  | "universal"
  | "prop"
  | "proptrade"
  | "crypto";
type PositionExitResult = "take_profit" | "stop_loss" | "strategy_exit";
type TradeOutcome = "win" | "stop_loss" | "break_even";

interface Signal {
  key: string;
  symbol: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  direction: Direction;
  signalTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  exitRule: string;
  riskDistance: number;
  riskDistancePips: number;
  source: string;
  reason: string;
  portfolioId?: string;
  riskPct?: number;
  exitAtTime?: number;
}

interface OpenPositionState {
  key: string;
  profileId: string;
  symbol: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  direction: Direction;
  timeframe: SignalTimeframe;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  exitRule: string;
  riskDistance?: number;
  maxHoldBars?: number;
  portfolioId?: string;
  riskPct?: number;
  signalMessageId?: number;
  exitAtTime?: number;
}

interface PositionExit {
  exitTime: number;
  exitPrice: number;
  result: PositionExitResult;
}

interface ClosedTradeState {
  key: string;
  profileId: string;
  symbol: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  exitResult: PositionExitResult;
  outcome: TradeOutcome;
  portfolioId?: string;
  riskPct?: number;
  realizedR?: number;
}

interface MonitorState {
  sentKeys: string[];
  openPositions: OpenPositionState[];
  closedTrades: ClosedTradeState[];
}

interface TelegramMenuState {
  updateOffset: number;
}

interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number };
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface SymbolConfig {
  profileId: string;
  symbol: string;
  yahooSymbol: string;
  timeframe: SignalTimeframe;
  kind: StrategyKind;
  strategyName: string;
  strategyCategory: StrategyCategory;
  strategyVersion: string;
  entryLookback?: number;
  exitLookback?: number;
  lookback?: number;
  bbPeriod?: number;
  bandDeviation?: number;
  atrPeriod: number;
  atrMultiplier: number;
  rangeAtrMultiplier?: number;
  closeLocationMin?: number;
  rewardR?: number;
  maxHoldBars?: number;
  directionMode: "all" | "long_only" | "short_only";
  emaPeriod?: number;
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  emaFilter?: "none" | "trend" | "countertrend";
  exitTarget?: "mean" | "opposite_band";
  includePrePost?: boolean;
  portfolioId?: string;
  riskPct?: number;
  q2Prop?: Q2PropStrategyConfig;
  approvedProp?: ApprovedPropStrategyConfig;
  sessionMomentum2026?: Prop2026SessionMomentumConfig;
  dataProvider?: "yahoo" | "dukascopy_jetta" | "okx_swap";
  dukascopyCode?: string;
}

interface MarketRows {
  bid: Kline[];
  ask: Kline[];
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const PROCESS_STARTED_AT = Date.now();
const PROP_DAILY_STOP_PCT = -3;
const PROP_MAX_CONCURRENT_RISK_PCT = 2;
const APPROVED_PROP_PROFILE_IDS = new Set([
  "approved_prop_usdchf_breakout_1h",
  "approved_prop_xauusd_orb_1h",
  "approved_prop_us30_orb_1h",
  "approved_prop_spx500_breakout_4h",
]);
const APPROVED_PROP_SYMBOLS = ["USDCHF", "XAUUSD", "US30", "SPX500"];
let initialScanCompleted = false;
const STRATEGY_CATEGORY_LABELS: Record<StrategyCategory, string> = {
  research: "Резервна стратегія",
  asset_specific: "Індивідуальна стратегія",
  universal: "Універсальна стратегія",
  prop: "Пропстратегія",
  proptrade: "Проптрейд",
  crypto: "Криптостратегія",
};
const FX_QUOTE_TO_USD_PAIRS: Record<
  string,
  { symbol: string; mode: "direct" | "inverse" }
> = {
  AUD: { symbol: "AUDUSD", mode: "direct" },
  CAD: { symbol: "USDCAD", mode: "inverse" },
  CHF: { symbol: "USDCHF", mode: "inverse" },
  EUR: { symbol: "EURUSD", mode: "direct" },
  GBP: { symbol: "GBPUSD", mode: "direct" },
  JPY: { symbol: "USDJPY", mode: "inverse" },
  NZD: { symbol: "NZDUSD", mode: "direct" },
};
const MT5_CONTRACT_SPECS: Record<
  string,
  {
    contractSize: number;
    profitCurrency: "EUR" | "USD";
    minLot: number;
    maxLot: number;
    lotStep: number;
  }
> = {
  GER40: { contractSize: 1, profitCurrency: "EUR", minLot: 0.01, maxLot: 50, lotStep: 0.01 },
  US30: { contractSize: 1, profitCurrency: "USD", minLot: 0.01, maxLot: 50, lotStep: 0.01 },
  SPX500: { contractSize: 10, profitCurrency: "USD", minLot: 0.01, maxLot: 50, lotStep: 0.01 },
  NAS100: { contractSize: 10, profitCurrency: "USD", minLot: 0.01, maxLot: 50, lotStep: 0.01 },
  XAUUSD: { contractSize: 100, profitCurrency: "USD", minLot: 0.01, maxLot: 50, lotStep: 0.01 },
};

const PROP_2026_SESSION_MOMENTUM_CONFIG: Prop2026SessionMomentumConfig = {
  signalHourUtc: 13,
  momentumBars: 12,
  atrPeriod: 14,
  fastEmaPeriod: 20,
  slowEmaPeriod: 100,
  minMoveAtr: 0.5,
  stopAtr: 0.75,
  rewardR: 3,
  maxHoldBars: 16,
  maxGapAtr: 0.25,
  maxSpreadR: 0.15,
  fridayLastEntryHourUtc: 16,
  fridayExitHourUtc: 20,
};

const PROP_2026_SESSION_MOMENTUM_PROFILES: SymbolConfig[] = [
  ["EURUSD", "EURUSD=X", "EUR-USD"],
  ["GBPUSD", "GBPUSD=X", "GBP-USD"],
  ["USDJPY", "USDJPY=X", "USD-JPY"],
  ["AUDUSD", "AUDUSD=X", "AUD-USD"],
  ["USDCHF", "USDCHF=X", "USD-CHF"],
  ["USDCAD", "USDCAD=X", "USD-CAD"],
  ["US30", "YM=F", "USA30.IDX-USD"],
  ["SPX500", "ES=F", "USA500.IDX-USD"],
  ["NAS100", "NQ=F", "USATECH.IDX-USD"],
].map(([symbol, yahooSymbol, dukascopyCode]) => ({
  profileId: `prop_2026_session_momentum_${symbol.toLowerCase()}_1h`,
  symbol,
  yahooSymbol,
  dukascopyCode,
  dataProvider: "dukascopy_jetta",
  timeframe: "1h",
  kind: "prop_2026_session_momentum",
  strategyName: `PropTrade 2026 Session Momentum · ${symbol}`,
  strategyCategory: "proptrade",
  strategyVersion: "research.2026-regime.session13-momentum12-ema20-100-min0_5-atr0_75-3r-hold16.1",
  atrPeriod: 14,
  atrMultiplier: 0.75,
  rewardR: 3,
  maxHoldBars: 16,
  directionMode: "all",
  portfolioId: "prop_2026_session_momentum_portfolio",
  riskPct: 1,
  sessionMomentum2026: PROP_2026_SESSION_MOMENTUM_CONFIG,
}));

export const SIGNAL_PROFILES: SymbolConfig[] = [
  ...PROP_2026_SESSION_MOMENTUM_PROFILES,
  {
    profileId: "approved_prop_usdchf_breakout_1h",
    symbol: "USDCHF",
    yahooSymbol: "USDCHF=X",
    dukascopyCode: "USD-CHF",
    dataProvider: "dukascopy_jetta",
    timeframe: "1h",
    kind: "approved_prop",
    strategyName: "PropTrade Approved Portfolio · USDCHF Breakout",
    strategyCategory: "proptrade",
    strategyVersion: "approved.2026.dukascopy.usdchf-1h-breakout80-ema100-short-atr0_75-2_5r.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2.5,
    maxHoldBars: 24,
    directionMode: "short_only",
    portfolioId: "approved_cross_asset_prop_portfolio_2026",
    riskPct: 0.5,
    approvedProp: {
      kind: "htf_breakout",
      timeframeHours: 1,
      lookback: 80,
      atrPeriod: 14,
      emaPeriod: 100,
      stopAtr: 0.75,
      rewardR: 2.5,
      maxHoldBars: 24,
      direction: "short",
    },
  },
  {
    profileId: "approved_prop_xauusd_orb_1h",
    symbol: "XAUUSD",
    yahooSymbol: "GC=F",
    dukascopyCode: "XAU-USD",
    dataProvider: "dukascopy_jetta",
    timeframe: "1h",
    kind: "approved_prop",
    strategyName: "PropTrade Approved Portfolio · XAUUSD Opening Range",
    strategyCategory: "proptrade",
    strategyVersion: "approved.2026.dukascopy.xauusd-orb1-short-atr0_75-2_5r.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2.5,
    directionMode: "short_only",
    portfolioId: "approved_cross_asset_prop_portfolio_2026",
    riskPct: 0.5,
    approvedProp: {
      kind: "opening_range_breakout",
      timeframeHours: 1,
      openingBars: 1,
      atrPeriod: 14,
      emaPeriod: 100,
      stopAtr: 0.75,
      rewardR: 2.5,
      minRangeAtr: 0.15,
      maxRangeAtr: 2.5,
      maxRiskAtr: 1.5,
      direction: "short",
    },
  },
  {
    profileId: "approved_prop_us30_orb_1h",
    symbol: "US30",
    yahooSymbol: "YM=F",
    dukascopyCode: "USA30.IDX-USD",
    dataProvider: "dukascopy_jetta",
    timeframe: "1h",
    kind: "approved_prop",
    strategyName: "PropTrade Approved Portfolio · US30 Opening Range",
    strategyCategory: "proptrade",
    strategyVersion: "approved.2026.dukascopy.us30-orb1-long-atr0_75-2r.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2,
    directionMode: "long_only",
    portfolioId: "approved_cross_asset_prop_portfolio_2026",
    riskPct: 0.5,
    approvedProp: {
      kind: "opening_range_breakout",
      timeframeHours: 1,
      openingBars: 1,
      atrPeriod: 14,
      emaPeriod: 100,
      stopAtr: 0.75,
      rewardR: 2,
      minRangeAtr: 0.3,
      maxRangeAtr: 1.5,
      maxRiskAtr: 1.5,
      direction: "long",
    },
  },
  {
    profileId: "approved_prop_spx500_breakout_4h",
    symbol: "SPX500",
    yahooSymbol: "ES=F",
    dukascopyCode: "USA500.IDX-USD",
    dataProvider: "dukascopy_jetta",
    timeframe: "4h",
    kind: "approved_prop",
    strategyName: "PropTrade Approved Portfolio · SPX500 Breakout",
    strategyCategory: "proptrade",
    strategyVersion: "approved.2026.dukascopy.spx500-4h-breakout40-ema100-long-atr0_75-2_5r.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2.5,
    maxHoldBars: 12,
    directionMode: "long_only",
    portfolioId: "approved_cross_asset_prop_portfolio_2026",
    riskPct: 0.5,
    approvedProp: {
      kind: "htf_breakout",
      timeframeHours: 4,
      lookback: 40,
      atrPeriod: 14,
      emaPeriod: 100,
      stopAtr: 0.75,
      rewardR: 2.5,
      maxHoldBars: 12,
      direction: "long",
    },
  },
  {
    profileId: "q2_prop_ger40_opening_drive_30m",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "30m",
    kind: "q2_opening_drive",
    strategyName: "Q2 Prop Portfolio · GER40 Opening Drive",
    strategyCategory: "proptrade",
    strategyVersion: "q2-prop-2026.ger40-opening-drive-30m.1",
    atrPeriod: 14,
    atrMultiplier: 1,
    rewardR: 2.5,
    maxHoldBars: 16,
    directionMode: "all",
    portfolioId: "q2_prop_portfolio_2026",
    riskPct: 1,
    q2Prop: {
      kind: "q2_opening_drive",
      timeframeMinutes: 30,
      atrPeriod: 14,
      sessionStart: 13,
      driveHours: 2,
      efficiencyPeriod: 8,
      minEfficiency: 0.3,
      minDriveAtr: 0.8,
      minDirectionalShare: 0.6,
      stopAtr: 1,
      rewardR: 2.5,
      maxHoldBars: 16,
    },
  },
  {
    profileId: "q2_prop_ger40_session_stretch_1h",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "1h",
    kind: "q2_session_stretch",
    strategyName: "Q2 Prop Portfolio · GER40 Session Stretch",
    strategyCategory: "proptrade",
    strategyVersion: "q2-prop-2026.ger40-session-stretch-1h.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2,
    maxHoldBars: 10,
    directionMode: "all",
    portfolioId: "q2_prop_portfolio_2026",
    riskPct: 1,
    q2Prop: {
      kind: "q2_session_stretch",
      timeframeMinutes: 60,
      atrPeriod: 14,
      dayOpenHour: 0,
      signalHour: 13,
      minStretchAtr: 1.5,
      stopAtr: 0.75,
      rewardR: 2,
      maxHoldBars: 10,
    },
  },
  {
    profileId: "q2_prop_gbpusd_session_stretch_30m",
    symbol: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    timeframe: "30m",
    kind: "q2_session_stretch",
    strategyName: "Q2 Prop Portfolio · GBPUSD Session Stretch",
    strategyCategory: "proptrade",
    strategyVersion: "q2-prop-2026.gbpusd-session-stretch-30m.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2,
    maxHoldBars: 16,
    directionMode: "all",
    portfolioId: "q2_prop_portfolio_2026",
    riskPct: 1,
    q2Prop: {
      kind: "q2_session_stretch",
      timeframeMinutes: 30,
      atrPeriod: 14,
      dayOpenHour: 0,
      signalHour: 11,
      minStretchAtr: 2.5,
      stopAtr: 0.75,
      rewardR: 2,
      maxHoldBars: 16,
    },
  },
  {
    profileId: "q2_prop_audusd_compression_release_30m",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "30m",
    kind: "q2_compression_release",
    strategyName: "Q2 Prop Portfolio · AUDUSD Compression Release",
    strategyCategory: "proptrade",
    strategyVersion: "q2-prop-2026.audusd-compression-release-30m.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2.5,
    maxHoldBars: 24,
    directionMode: "all",
    portfolioId: "q2_prop_portfolio_2026",
    riskPct: 1,
    q2Prop: {
      kind: "q2_compression_release",
      timeframeMinutes: 30,
      atrPeriod: 14,
      compressionLookback: 40,
      breakoutLookback: 12,
      efficiencyPeriod: 10,
      maxAtrRatio: 0.8,
      minBodyAtr: 0.8,
      minEfficiency: 0.4,
      stopAtr: 0.75,
      rewardR: 2.5,
      session: "active",
      maxHoldBars: 24,
    },
  },
  {
    profileId: "q2_prop_usdjpy_compression_release_1h",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "1h",
    kind: "q2_compression_release",
    strategyName: "Q2 Prop Portfolio · USDJPY Compression Release",
    strategyCategory: "proptrade",
    strategyVersion: "q2-prop-2026.usdjpy-compression-release-1h.1",
    atrPeriod: 14,
    atrMultiplier: 0.75,
    rewardR: 2.5,
    maxHoldBars: 16,
    directionMode: "all",
    portfolioId: "q2_prop_portfolio_2026",
    riskPct: 1,
    q2Prop: {
      kind: "q2_compression_release",
      timeframeMinutes: 60,
      atrPeriod: 14,
      compressionLookback: 40,
      breakoutLookback: 12,
      efficiencyPeriod: 10,
      maxAtrRatio: 0.8,
      minBodyAtr: 0.8,
      minEfficiency: 0.25,
      stopAtr: 0.75,
      rewardR: 2.5,
      session: "active",
      maxHoldBars: 16,
    },
  },
  {
    profileId: "research_pack_audusd_bb_atr_4h",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "Research 2026 AUDUSD BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.audusd-bb20-dev2-long-opposite-4h.1",
    bbPeriod: 20,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 2,
    maxHoldBars: 6,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "audusd_bb_atr_long_reversion_2026",
    symbol: "AUDUSD",
    yahooSymbol: "AUDUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "AUDUSD BB/ATR Long Reversion 2026",
    strategyCategory: "asset_specific",
    strategyVersion: "research.2026-ytd.audusd-bb100-dev1_75-atr0_75-hold24-long-countertrend-opposite-1h.1",
    bbPeriod: 100,
    bandDeviation: 1.75,
    atrPeriod: 14,
    atrMultiplier: 0.75,
    maxHoldBars: 24,
    directionMode: "long_only",
    emaPeriod: 200,
    emaFilter: "countertrend",
    exitTarget: "opposite_band",
  },
  {
    profileId: "research_pack_eurusd_donchian_1h",
    symbol: "EURUSD",
    yahooSymbol: "EURUSD=X",
    timeframe: "1h",
    kind: "donchian",
    strategyName: "Research 2026 EURUSD Donchian 1H 80/10",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.eurusd-donchian-1h-80-10-atr1.1",
    entryLookback: 80,
    exitLookback: 10,
    atrPeriod: 14,
    atrMultiplier: 1,
    directionMode: "all",
  },
  {
    profileId: "research_pack_gbpusd_bb_atr_1h",
    symbol: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 GBPUSD BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.gbpusd-bb80-dev1_5-short-mean.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "short_only",
    exitTarget: "mean",
  },
  {
    profileId: "research_pack_usdjpy_bb_atr_1h",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 USDJPY BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.usdjpy-bb40-dev2-long-opposite.1",
    bbPeriod: 40,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "long_only",
    exitTarget: "opposite_band",
  },
  {
    profileId: "research_pack_ger40_bb_atr_1h",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Research 2026 GER40 BB/ATR Adaptive",
    strategyCategory: "research",
    strategyVersion: "research.2026-ytd.in-sample.ger40-bb80-dev2-short-opposite.1",
    bbPeriod: 80,
    bandDeviation: 2,
    atrPeriod: 14,
    atrMultiplier: 1,
    maxHoldBars: 96,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "ger40_bb_atr_short_reversion_2026",
    symbol: "GER40",
    yahooSymbol: "^GDAXI",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "GER40 BB/ATR Short Reversion 2026",
    strategyCategory: "asset_specific",
    strategyVersion: "research.2026-ytd.ger40-bb80-dev2_25-atr1_25-hold72-short-opposite-1h.1",
    bbPeriod: 80,
    bandDeviation: 2.25,
    atrPeriod: 14,
    atrMultiplier: 1.25,
    maxHoldBars: 72,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_eurjpy",
    symbol: "EURJPY",
    yahooSymbol: "EURJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_chfjpy",
    symbol: "CHFJPY",
    yahooSymbol: "CHFJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_usdjpy",
    symbol: "USDJPY",
    yahooSymbol: "USDJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_universal_long_bb_atr_2026_gbpjpy",
    symbol: "GBPJPY",
    yahooSymbol: "GBPJPY=X",
    timeframe: "4h",
    kind: "bb_atr",
    strategyName: "FX Universal Long BB/ATR 2026",
    strategyCategory: "universal",
    strategyVersion: "research.2026-ytd.fx-4h-bb80-dev1_5-long-atr0_5-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.5,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "long_only",
    emaFilter: "none",
    exitTarget: "opposite_band",
  },
  {
    profileId: "fx_prop_nzdusd_bb_atr_2026",
    symbol: "NZDUSD",
    yahooSymbol: "NZDUSD=X",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "FX Prop NZDUSD BB/ATR 2026",
    strategyCategory: "prop",
    strategyVersion: "research.2026-ytd.prop-nzdusd-1h-bb80-dev1_75-ema200-trend-atr0_5-hold24-opposite.1",
    bbPeriod: 80,
    bandDeviation: 1.75,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 24,
    directionMode: "all",
    emaPeriod: 200,
    emaFilter: "trend",
    exitTarget: "opposite_band",
  },
  {
    profileId: "prop_usdchf_htf_breakout_2026",
    symbol: "USDCHF",
    yahooSymbol: "USDCHF=X",
    timeframe: "1h",
    kind: "htf_breakout",
    strategyName: "USDCHF Prop HTF Breakout 2026",
    strategyCategory: "prop",
    strategyVersion: "research.2026-ytd.usdchf-1h-breakout80-ema100-short-atr1-3r-hold24.1",
    lookback: 80,
    atrPeriod: 14,
    atrMultiplier: 1,
    rewardR: 3,
    maxHoldBars: 24,
    directionMode: "short_only",
    emaPeriod: 100,
    includePrePost: true,
  },
  {
    profileId: "prop_xauusd_htf_breakout_2026",
    symbol: "XAUUSD",
    yahooSymbol: "GC=F",
    timeframe: "4h",
    kind: "htf_breakout",
    strategyName: "XAUUSD Prop HTF Breakout 2026",
    strategyCategory: "prop",
    strategyVersion: "research.2026-ytd.xauusd-4h-breakout80-ema100-all-atr1-3r-hold12.1",
    lookback: 80,
    atrPeriod: 14,
    atrMultiplier: 1,
    rewardR: 3,
    maxHoldBars: 12,
    directionMode: "all",
    emaPeriod: 100,
    includePrePost: false,
  },
  {
    profileId: "crypto_doge_bb_atr_short_reversion_2026",
    symbol: "DOGEUSDT",
    yahooSymbol: "DOGE-USD",
    timeframe: "1h",
    kind: "bb_atr",
    strategyName: "Crypto DOGE BB/ATR Short Reversion 2026",
    strategyCategory: "crypto",
    strategyVersion: "research.2026-ytd.dogeusdt-1h-bb120-dev2_25-short-atr0_5-mean-hold48.1",
    bbPeriod: 120,
    bandDeviation: 2.25,
    atrPeriod: 14,
    atrMultiplier: 0.5,
    maxHoldBars: 48,
    directionMode: "short_only",
    emaFilter: "none",
    exitTarget: "mean",
  },
  {
    profileId: "crypto_pepe_range_expansion_breakout_2026",
    symbol: "PEPEUSDT",
    yahooSymbol: "PEPEUSDT",
    dataProvider: "okx_swap",
    timeframe: "1h",
    kind: "range_expansion_breakout",
    strategyName: "Crypto PEPE Range Expansion Breakout 2026",
    strategyCategory: "crypto",
    strategyVersion: "research.2026-ytd.pepeusdt-1h-range-expansion-ch20-ema34-144-atr0_7-3r-hold8-long.1",
    lookback: 20,
    atrPeriod: 14,
    atrMultiplier: 0.7,
    rangeAtrMultiplier: 1.1,
    closeLocationMin: 0.7,
    rewardR: 3,
    maxHoldBars: 8,
    directionMode: "long_only",
    emaFastPeriod: 34,
    emaSlowPeriod: 144,
  },
];

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

function iso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function utcDayStart(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function kyivTime(timestamp: number) {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function kyivClockTime(timestamp: number) {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function dataPaths() {
  const outDir = process.env.SIGNAL_DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "logs";
  return {
    outDir,
    statePath: `${outDir}/signal-monitor-state.json`,
    journalPath: `${outDir}/signal-journal.csv`,
    telegramMenuStatePath: `${outDir}/telegram-menu-state.json`,
  };
}

function ensureJournal() {
  const { outDir, journalPath } = dataPaths();
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(journalPath)) {
    appendFileSync(
      journalPath,
      [
        "logged_at",
        "status",
        "symbol",
        "strategy",
        "direction",
        "signal_time",
        "entry_time",
        "entry_price",
        "stop_loss",
        "take_profit",
        "exit_rule",
        "risk_distance_pips",
        "reason",
      ].join(",") + "\n",
      "utf8"
    );
  }
}

function appendJournal(status: string, signal: Signal) {
  const { journalPath } = dataPaths();
  ensureJournal();
  appendFileSync(
    journalPath,
    [
      iso(Date.now()),
      status,
      signal.symbol,
      signal.strategyName,
      signal.direction,
      iso(signal.signalTime),
      iso(signal.entryTime),
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit ?? "",
      signal.exitRule,
      signal.riskDistancePips,
      signal.reason,
    ]
      .map(csvEscape)
      .join(",") + "\n",
    "utf8"
  );
}

function loadState(): MonitorState {
  const { statePath } = dataPaths();
  if (!existsSync(statePath)) return { sentKeys: [], openPositions: [], closedTrades: [] };
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<MonitorState>;
    return {
      sentKeys: Array.isArray(parsed.sentKeys) ? parsed.sentKeys : [],
      openPositions: Array.isArray(parsed.openPositions) ? parsed.openPositions : [],
      closedTrades: Array.isArray(parsed.closedTrades) ? parsed.closedTrades : [],
    };
  } catch {
    return { sentKeys: [], openPositions: [], closedTrades: [] };
  }
}

function isDryRun() {
  return process.env.SIGNAL_DRY_RUN === "1" || process.env.SIGNAL_DRY_RUN === "true";
}

function saveState(state: MonitorState) {
  if (isDryRun()) return;
  const { outDir, statePath } = dataPaths();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        sentKeys: state.sentKeys.slice(-1_000),
        openPositions: state.openPositions.slice(-100),
        closedTrades: state.closedTrades.slice(-5_000),
      },
      null,
      2
    ),
    "utf8"
  );
}

function loadTelegramMenuState(): TelegramMenuState {
  const { telegramMenuStatePath } = dataPaths();
  if (!existsSync(telegramMenuStatePath)) return { updateOffset: 0 };
  try {
    const parsed = JSON.parse(readFileSync(telegramMenuStatePath, "utf8")) as Partial<TelegramMenuState>;
    return {
      updateOffset: Number.isFinite(parsed.updateOffset) ? Number(parsed.updateOffset) : 0,
    };
  } catch {
    return { updateOffset: 0 };
  }
}

function saveTelegramMenuState(state: TelegramMenuState) {
  const { outDir, telegramMenuStatePath } = dataPaths();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(telegramMenuStatePath, JSON.stringify(state, null, 2), "utf8");
}

function timeframeMs(timeframe: SignalTimeframe) {
  if (timeframe === "4h") return FOUR_HOURS_MS;
  if (timeframe === "30m") return THIRTY_MINUTES_MS;
  return ONE_HOUR_MS;
}

function yahooInterval(timeframe: SignalTimeframe) {
  if (timeframe === "4h") return "4h";
  if (timeframe === "30m") return "30m";
  return "60m";
}

function pipSize(symbol: string) {
  if (symbol.endsWith("USDT")) return 0.000001;
  if (symbol.includes("JPY")) return 0.01;
  if (symbol === "GER40" || symbol === "US30" || symbol === "SPX500" || symbol === "NAS100") return 1;
  if (symbol === "XAUUSD" || symbol === "XAGUSD") return 0.1;
  return 0.0001;
}

function formatPrice(symbol: string, value: number | null) {
  if (value == null || !Number.isFinite(value)) return "dynamic";
  if (symbol.endsWith("USDT")) {
    if (value < 0.01) return value.toFixed(8);
    if (value < 1) return value.toFixed(6);
    return value.toFixed(4);
  }
  if (symbol === "GER40" || symbol === "US30" || symbol === "SPX500" || symbol === "NAS100") return value.toFixed(1);
  if (symbol === "XAUUSD" || symbol === "XAGUSD") return value.toFixed(2);
  return value.toFixed(symbol.includes("JPY") ? 3 : 5);
}

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function manualRiskConfig() {
  return {
    accountBalanceUsd: positiveEnvNumber("SIGNAL_ACCOUNT_BALANCE_USD", 5_000),
    riskPercent: positiveEnvNumber("SIGNAL_RISK_PER_TRADE_PCT", 1),
  };
}

function forexSizingConfig() {
  return {
    ...manualRiskConfig(),
    contractSize: positiveEnvNumber("SIGNAL_FX_CONTRACT_SIZE", 100_000),
    lotStep: positiveEnvNumber("SIGNAL_FX_LOT_STEP", 0.01),
    minLot: positiveEnvNumber("SIGNAL_FX_MIN_LOT", 0.01),
    maxLot: positiveEnvNumber("SIGNAL_FX_MAX_LOT", 100),
  };
}

function lotDecimals(step: number) {
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function positionSizeLines(signal: Signal, sizing?: PositionSizeResult | null) {
  if (!forexPairCurrencies(signal.symbol) && !MT5_CONTRACT_SPECS[signal.symbol]) return [];
  if (!sizing) {
    return ["MT5 lot: <b>not calculated</b> (USD conversion rate unavailable)"];
  }

  const riskLine = `Manual risk: <b>$${sizing.riskAmountUsd.toFixed(2)}</b> (${sizing.riskPercent.toFixed(2)}% of $${sizing.accountBalanceUsd.toLocaleString("en-US")})`;
  if (sizing.lotSize == null) {
    return [
      riskLine,
      `MT5 lot: <b>below ${sizing.minLot.toFixed(lotDecimals(sizing.lotStep))}</b>; the broker minimum would exceed the risk target`,
    ];
  }

  return [
    `MT5 lot: <b>${sizing.lotSize.toFixed(lotDecimals(sizing.lotStep))}</b>`,
    riskLine,
    `Estimated SL loss: $${sizing.estimatedLossUsd?.toFixed(2)} after rounding down`,
  ];
}

function strategyCategoryLabel(category: StrategyCategory) {
  return STRATEGY_CATEGORY_LABELS[category] ?? category;
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function trueRange(current: Kline, previous: Kline) {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close)
  );
}

function atrAt(rows: Kline[], index: number, period: number) {
  if (index - period < 0) return null;
  let sum = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
    sum += trueRange(rows[cursor], rows[cursor - 1]);
  }
  return sum / period;
}

function bandsAt(rows: Kline[], index: number, period: number, deviation: number) {
  if (index - period + 1 < 0) return null;
  const window = rows.slice(index - period + 1, index + 1);
  const mean = window.reduce((sum, row) => sum + row.close, 0) / period;
  const variance = window.reduce((sum, row) => sum + (row.close - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mean, upper: mean + deviation * sd, lower: mean - deviation * sd };
}

function emaAt(rows: Kline[], index: number, period: number) {
  if (period <= 0 || index - period + 1 < 0) return null;

  const multiplier = 2 / (period + 1);
  let ema = rows.slice(0, period).reduce((sum, row) => sum + row.close, 0) / period;
  for (let cursor = period; cursor <= index; cursor += 1) {
    ema = (rows[cursor].close - ema) * multiplier + ema;
  }

  return ema;
}

function highest(rows: Kline[], start: number, end: number) {
  let value = -Infinity;
  for (let index = start; index < end; index += 1) value = Math.max(value, rows[index].high);
  return value;
}

function lowest(rows: Kline[], start: number, end: number) {
  let value = Infinity;
  for (let index = start; index < end; index += 1) value = Math.min(value, rows[index].low);
  return value;
}

function closeLocation(row: Kline) {
  const range = row.high - row.low;
  return range > 0 ? (row.close - row.low) / range : 0.5;
}

function directionAllowed(config: SymbolConfig, direction: Direction) {
  if (config.directionMode === "long_only") return direction === "long";
  if (config.directionMode === "short_only") return direction === "short";
  return true;
}

function emaFilterAllowed(config: SymbolConfig, direction: Direction, signalClose: number, ema: number | null) {
  const filter = config.emaFilter ?? "none";
  if (filter === "none") return true;
  if (ema == null) return false;

  if (filter === "trend") {
    return direction === "long" ? signalClose > ema : signalClose < ema;
  }

  return direction === "long" ? signalClose < ema : signalClose > ema;
}

function parseYahooChart(payload: unknown, timeframe: SignalTimeframe): Kline[] {
  const root = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
      error?: { code?: string; description?: string } | null;
    };
  };
  const error = root.chart?.error;
  if (error) throw new Error(error.description || error.code || "Yahoo chart error");
  const result = root.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];

  return timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      if (open == null || high == null || low == null || close == null) return null;
      const openTime = timestamp * 1000;
      const barMs = timeframeMs(timeframe);
      return {
        openTime,
        open,
        high,
        low,
        close,
        volume: quote.volume?.[index] ?? 0,
        closeTime: openTime + barMs - 1,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      } satisfies Kline;
    })
    .filter((row): row is Kline => row != null)
    .sort((a, b) => a.openTime - b.openTime);
}

function getJsonWithIpv4(url: URL, timeoutMs = 20_000) {
  return new Promise<unknown>((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        headers: {
          "accept": "application/json,text/plain,*/*",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        },
        lookup: (hostname, options, callback) => {
          lookup(hostname, { ...options, family: 4 }, callback);
        },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Yahoo chart error ${response.statusCode ?? "unknown"} ${response.statusMessage ?? ""}${
                  body ? `: ${body.slice(0, 180)}` : ""
                }`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Yahoo request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

async function fetchYahooKlines(config: SymbolConfig) {
  const endTime = Date.now() + 5 * 60 * 1000;
  const warmupBars = Math.max(
    config.entryLookback ?? 0,
    config.lookback ?? 0,
    config.bbPeriod ?? 0,
    config.emaPeriod ?? 0,
    (config.q2Prop?.compressionLookback ?? 0) + config.atrPeriod,
    120
  );
  const barsPerDay = config.timeframe === "4h" ? 6 : config.timeframe === "30m" ? 48 : 24;
  const lookbackDays = Math.max(30, Math.ceil((warmupBars + 48) / barsPerDay));
  const startTime = endTime - lookbackDays * 24 * ONE_HOUR_MS;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const host = YAHOO_HOSTS[attempt % YAHOO_HOSTS.length];
    const url = new URL(
      `https://${host}/v8/finance/chart/${encodeURIComponent(config.yahooSymbol)}`
    );
    url.searchParams.set("interval", yahooInterval(config.timeframe));
    url.searchParams.set("period1", Math.floor(startTime / 1000).toString());
    url.searchParams.set("period2", Math.floor(endTime / 1000).toString());
    url.searchParams.set("includePrePost", config.includePrePost === false ? "false" : "true");

    try {
      const rows = parseYahooChart(await getJsonWithIpv4(url), config.timeframe);
      if (!rows.length) {
        throw new Error("Yahoo chart returned no OHLC rows");
      }

      return rows;
    } catch (error) {
      const cause =
        error instanceof Error && "cause" in error && error.cause
          ? ` cause=${String(error.cause)}`
          : "";
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `${iso(Date.now())} ${config.symbol}: Yahoo fetch attempt ${attempt + 1}/4 via ${host} failed: ${
          lastError.message
        }${cause}`
      );
      await sleep(1_000 * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`Yahoo chart fetch failed for ${config.symbol}`);
}

async function fetchMarketRows(config: SymbolConfig): Promise<MarketRows> {
  if (config.dataProvider === "dukascopy_jetta") {
    if (!config.dukascopyCode) throw new Error("Dukascopy profile is missing instrument code");
    const timeframeHours = config.approvedProp?.timeframeHours ??
      (config.sessionMomentum2026 ? 1 : null);
    if (!timeframeHours) throw new Error("Dukascopy profile is missing a supported strategy config");
    return fetchDukascopyJettaBidAsk({
      code: config.dukascopyCode,
      timeframeHours,
      lookbackDays: 45,
    });
  }
  if (config.dataProvider === "okx_swap") {
    const warmupBars = Math.max(
      config.lookback ?? 0,
      config.emaFastPeriod ?? 0,
      config.emaSlowPeriod ?? 0,
      config.atrPeriod,
      220
    );
    const rows = await fetchKlinesMultiBatch(
      {
        symbol: config.symbol,
        interval: config.timeframe === "4h" ? "4h" : "1h",
        endTime: Date.now() + 5 * 60 * 1000,
        limit: 300,
        dataSource: "okx-swap",
      },
      warmupBars + 72
    );
    return { bid: rows, ask: rows };
  }
  const rows = await fetchYahooKlines(config);
  return { bid: rows, ask: rows };
}

async function quoteToUsdRate(
  quoteCurrency: string,
  cache: Map<string, number>
) {
  const cached = cache.get(quoteCurrency);
  if (cached) return cached;

  const conversion = FX_QUOTE_TO_USD_PAIRS[quoteCurrency];
  if (!conversion) throw new Error(`No ${quoteCurrency}-to-USD conversion pair is configured`);

  const profile = SIGNAL_PROFILES.find((candidate) => candidate.symbol === conversion.symbol);
  if (!profile) throw new Error(`No market profile is available for ${conversion.symbol}`);

  const rows = await fetchYahooKlines(profile);
  const marketPrice = rows.at(-1)?.close;
  if (!marketPrice || !Number.isFinite(marketPrice)) {
    throw new Error(`${conversion.symbol} returned no conversion price`);
  }

  const rate = conversion.mode === "direct" ? marketPrice : 1 / marketPrice;
  cache.set(quoteCurrency, rate);
  return rate;
}

async function positionSizeForSignal(
  signal: Signal,
  conversionRateCache: Map<string, number>
) {
  const contractSpec = MT5_CONTRACT_SPECS[signal.symbol];
  if (contractSpec) {
    const profitToUsdRate =
      contractSpec.profitCurrency === "USD"
        ? 1
        : await quoteToUsdRate(contractSpec.profitCurrency, conversionRateCache);
    return calculateContractPositionSize({
      symbol: signal.symbol,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      contractSize: contractSpec.contractSize,
      profitToUsdRate,
      minLot: contractSpec.minLot,
      maxLot: contractSpec.maxLot,
      lotStep: contractSpec.lotStep,
      ...manualRiskConfig(),
    });
  }

  const currencies = forexPairCurrencies(signal.symbol);
  if (!currencies) return null;

  const quoteToUsd =
    currencies.base !== "USD" && currencies.quote !== "USD"
      ? await quoteToUsdRate(currencies.quote, conversionRateCache)
      : undefined;

  return calculateForexPositionSize({
    symbol: signal.symbol,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    quoteToUsdRate: quoteToUsd,
    ...forexSizingConfig(),
  });
}

function selectSignalAndEntryBars(rows: Kline[], timeframe: SignalTimeframe) {
  const now = Date.now();
  const barMs = timeframeMs(timeframe);
  const closedRows = rows.filter((row) => row.openTime + barMs <= now - 30_000);
  const signal = closedRows[closedRows.length - 1];
  if (!signal) return null;
  const signalIndex = rows.findIndex((row) => row.openTime === signal.openTime);
  const next = rows[signalIndex + 1];
  if (next && next.openTime > signal.openTime) {
    return { signalIndex, entryIndex: signalIndex + 1 };
  }
  return null;
}

function selectLatestClosedSignalBar(rows: Kline[], timeframe: SignalTimeframe) {
  const now = Date.now();
  const barMs = timeframeMs(timeframe);
  const closedRows = rows.filter((row) => row.openTime + barMs <= now - 30_000);
  const signal = closedRows[closedRows.length - 1];
  if (!signal) return null;
  const signalIndex = rows.findIndex((row) => row.openTime === signal.openTime);
  return signalIndex >= 0 ? { signalIndex } : null;
}

function canonicalEntryTime(signalTime: number, timeframe: SignalTimeframe) {
  return signalTime + timeframeMs(timeframe);
}

function signalKey(config: SymbolConfig, direction: Direction, signalTime: number) {
  return [config.symbol, config.profileId, config.strategyVersion, direction, signalTime].join("|");
}

function detectDonchianSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectSignalAndEntryBars(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex, entryIndex } = selected;
  const entryLookback = config.entryLookback ?? 80;
  const exitLookback = config.exitLookback ?? 10;
  if (signalIndex - entryLookback < 0) return null;

  const signal = rows[signalIndex];
  const entryBar = rows[entryIndex];
  const channelHigh = highest(rows, signalIndex - entryLookback, signalIndex);
  const channelLow = lowest(rows, signalIndex - entryLookback, signalIndex);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  if (atr == null || atr <= 0) return null;

  const direction: Direction | null =
    signal.close > channelHigh ? "long" : signal.close < channelLow ? "short" : null;
  if (!direction || !directionAllowed(config, direction)) return null;

  const entryPrice = entryBar.open;
  const riskDistance = atr * config.atrMultiplier;
  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const riskDistancePips = riskDistance / pipSize(config.symbol);
  const key = signalKey(config, direction, signal.openTime);

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: canonicalEntryTime(signal.openTime, config.timeframe),
    entryPrice,
    stopLoss,
    takeProfit: null,
    exitRule: `${exitLookback}H Donchian channel exit, no fixed TP`,
    riskDistance,
    riskDistancePips,
    source: `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke above Donchian(${entryLookback}) high ${formatPrice(config.symbol, channelHigh)}`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke below Donchian(${entryLookback}) low ${formatPrice(config.symbol, channelLow)}`,
  } satisfies Signal;
}

function detectBbAtrSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectSignalAndEntryBars(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex, entryIndex } = selected;
  const bbPeriod = config.bbPeriod ?? 80;
  const deviation = config.bandDeviation ?? 2;
  const signal = rows[signalIndex];
  const entryBar = rows[entryIndex];
  const bands = bandsAt(rows, signalIndex, bbPeriod, deviation);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const ema = config.emaPeriod ? emaAt(rows, signalIndex, config.emaPeriod) : null;
  if (!bands || atr == null || atr <= 0) return null;

  const direction: Direction | null =
    signal.close < bands.lower ? "long" : signal.close > bands.upper ? "short" : null;
  if (!direction || !directionAllowed(config, direction)) return null;
  if (!emaFilterAllowed(config, direction, signal.close, ema)) return null;

  const entryPrice = entryBar.open;
  const riskDistance = atr * config.atrMultiplier;
  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const takeProfit =
    config.exitTarget === "opposite_band"
      ? direction === "long"
        ? bands.upper
        : bands.lower
      : bands.mean;
  if ((direction === "long" && takeProfit <= entryPrice) || (direction === "short" && takeProfit >= entryPrice)) {
    return null;
  }

  const key = signalKey(config, direction, signal.openTime);
  const filterText =
    config.emaFilter && config.emaFilter !== "none" && ema != null
      ? `; EMA${config.emaPeriod} ${config.emaFilter} filter passed at ${formatPrice(config.symbol, ema)}`
      : "";

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: canonicalEntryTime(signal.openTime, config.timeframe),
    entryPrice,
    stopLoss,
    takeProfit,
    exitRule: `TP at ${config.exitTarget === "opposite_band" ? "opposite Bollinger band" : "Bollinger mean"}, time stop ${config.maxHoldBars ?? 96} bars`,
    riskDistance,
    riskDistancePips: riskDistance / pipSize(config.symbol),
    source: `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} closed below BB(${bbPeriod}, ${deviation}) lower ${formatPrice(config.symbol, bands.lower)}${filterText}`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} closed above BB(${bbPeriod}, ${deviation}) upper ${formatPrice(config.symbol, bands.upper)}${filterText}`,
  } satisfies Signal;
}

function detectHtfBreakoutSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectSignalAndEntryBars(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex, entryIndex } = selected;
  const lookback = config.lookback ?? 80;
  const rewardR = config.rewardR ?? 3;
  if (signalIndex - lookback < 0) return null;

  const signal = rows[signalIndex];
  const entryBar = rows[entryIndex];
  const channelHigh = highest(rows, signalIndex - lookback, signalIndex);
  const channelLow = lowest(rows, signalIndex - lookback, signalIndex);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const ema = config.emaPeriod ? emaAt(rows, signalIndex, config.emaPeriod) : null;
  if (atr == null || atr <= 0 || ema == null) return null;

  const direction: Direction | null =
    signal.close > channelHigh && signal.close > ema
      ? "long"
      : signal.close < channelLow && signal.close < ema
        ? "short"
        : null;
  if (!direction || !directionAllowed(config, direction)) return null;

  const entryPrice = entryBar.open;
  const riskDistance = atr * config.atrMultiplier;
  if (riskDistance <= 0) return null;

  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const takeProfit = direction === "long" ? entryPrice + rewardR * riskDistance : entryPrice - rewardR * riskDistance;
  const key = signalKey(config, direction, signal.openTime);

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: canonicalEntryTime(signal.openTime, config.timeframe),
    entryPrice,
    stopLoss,
    takeProfit,
    exitRule: `Fixed TP ${rewardR}R, time stop ${config.maxHoldBars ?? 24} bars`,
    riskDistance,
    riskDistancePips: riskDistance / pipSize(config.symbol),
    source: `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke above ${lookback}-bar high ${formatPrice(config.symbol, channelHigh)} and EMA${config.emaPeriod} ${formatPrice(config.symbol, ema)}`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke below ${lookback}-bar low ${formatPrice(config.symbol, channelLow)} and EMA${config.emaPeriod} ${formatPrice(config.symbol, ema)}`,
  } satisfies Signal;
}

function detectRangeExpansionBreakoutSignal(config: SymbolConfig, rows: Kline[]) {
  const selected = selectLatestClosedSignalBar(rows, config.timeframe);
  if (!selected) return null;
  const { signalIndex } = selected;
  const lookback = config.lookback ?? 20;
  const rewardR = config.rewardR ?? 3;
  const fastPeriod = config.emaFastPeriod ?? 34;
  const slowPeriod = config.emaSlowPeriod ?? 144;
  const minRangeAtr = config.rangeAtrMultiplier ?? 1.1;
  const minCloseLocation = config.closeLocationMin ?? 0.7;
  if (signalIndex - lookback < 0) return null;

  const signal = rows[signalIndex];
  const next = rows[signalIndex + 1];
  const channelHigh = highest(rows, signalIndex - lookback, signalIndex);
  const channelLow = lowest(rows, signalIndex - lookback, signalIndex);
  const atr = atrAt(rows, signalIndex, config.atrPeriod);
  const emaFast = emaAt(rows, signalIndex, fastPeriod);
  const emaSlow = emaAt(rows, signalIndex, slowPeriod);
  if (atr == null || atr <= 0 || emaFast == null || emaSlow == null) return null;

  const location = closeLocation(signal);
  const candleRange = signal.high - signal.low;
  const direction: Direction | null =
    signal.close > channelHigh &&
    signal.close > signal.open &&
    location >= minCloseLocation &&
    candleRange >= atr * minRangeAtr &&
    emaFast > emaSlow
      ? "long"
      : signal.close < channelLow &&
          signal.close < signal.open &&
          location <= 1 - minCloseLocation &&
          candleRange >= atr * minRangeAtr &&
          emaFast < emaSlow
        ? "short"
        : null;
  if (!direction || !directionAllowed(config, direction)) return null;

  const entryPrice = next?.open ?? signal.close;
  const riskDistance = atr * config.atrMultiplier;
  if (riskDistance <= 0) return null;

  const stopLoss = direction === "long" ? entryPrice - riskDistance : entryPrice + riskDistance;
  const takeProfit = direction === "long" ? entryPrice + rewardR * riskDistance : entryPrice - rewardR * riskDistance;
  const key = signalKey(config, direction, signal.openTime);

  return {
    key,
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction,
    signalTime: signal.openTime,
    entryTime: canonicalEntryTime(signal.openTime, config.timeframe),
    entryPrice,
    stopLoss,
    takeProfit,
    exitRule: `Fixed TP ${rewardR}R, time stop ${config.maxHoldBars ?? 8} bars`,
    riskDistance,
    riskDistancePips: riskDistance / pipSize(config.symbol),
    source: `OKX ${config.symbol.replace("USDT", "-USDT-SWAP")} ${config.timeframe.toUpperCase()}`,
    reason:
      direction === "long"
        ? `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke above ${lookback}-bar high ${formatPrice(config.symbol, channelHigh)}; EMA${fastPeriod} ${formatPrice(config.symbol, emaFast)} > EMA${slowPeriod} ${formatPrice(config.symbol, emaSlow)}; range ${(candleRange / atr).toFixed(2)} ATR; close location ${(location * 100).toFixed(1)}%`
        : `${config.timeframe.toUpperCase()} close ${formatPrice(config.symbol, signal.close)} broke below ${lookback}-bar low ${formatPrice(config.symbol, channelLow)}; EMA${fastPeriod} ${formatPrice(config.symbol, emaFast)} < EMA${slowPeriod} ${formatPrice(config.symbol, emaSlow)}; range ${(candleRange / atr).toFixed(2)} ATR; close location ${(location * 100).toFixed(1)}%`,
  } satisfies Signal;
}

function detectQ2PropSignal(config: SymbolConfig, rows: Kline[]) {
  if (!config.q2Prop) return null;
  const setup = detectLatestQ2PropSignal(config.q2Prop, rows);
  if (!setup) return null;
  return {
    key: signalKey(config, setup.direction, setup.signalTime),
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction: setup.direction,
    signalTime: setup.signalTime,
    entryTime: setup.entryTime,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    exitRule: `Fixed TP ${config.q2Prop.rewardR}R, time stop ${config.q2Prop.maxHoldBars} bars`,
    riskDistance: setup.riskDistance,
    riskDistancePips: setup.riskDistance / pipSize(config.symbol),
    source:
      config.symbol === "GER40"
        ? `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()} cash-index proxy; research used Dukascopy GER40 CFD`
        : `Yahoo ${config.yahooSymbol} ${config.timeframe.toUpperCase()}`,
    reason: setup.reason,
    portfolioId: config.portfolioId,
    riskPct: config.riskPct,
  } satisfies Signal;
}

function detectApprovedPropSignal(config: SymbolConfig, rows: MarketRows) {
  if (!config.approvedProp) return null;
  const setup = detectLatestApprovedPropSignal(
    config.approvedProp,
    rows.bid,
    rows.ask
  );
  if (!setup) return null;
  return {
    key: signalKey(config, setup.direction, setup.signalTime),
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction: setup.direction,
    signalTime: setup.signalTime,
    entryTime: setup.entryTime,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    exitRule:
      config.approvedProp.kind === "opening_range_breakout"
        ? `Fixed TP ${config.approvedProp.rewardR}R, exit at UTC session end`
        : `Fixed TP ${config.approvedProp.rewardR}R, time stop ${config.approvedProp.maxHoldBars} bars`,
    riskDistance: setup.riskDistance,
    riskDistancePips: setup.riskDistance / pipSize(config.symbol),
    source: `Dukascopy ${config.dukascopyCode} BID/ASK ${config.timeframe.toUpperCase()}`,
    reason: setup.reason,
    portfolioId: config.portfolioId,
    riskPct: config.riskPct,
    exitAtTime: setup.exitAtTime,
  } satisfies Signal;
}

function detectProp2026SessionMomentumSignal(config: SymbolConfig, rows: MarketRows) {
  if (!config.sessionMomentum2026) return null;
  const setup = detectLatestProp2026SessionMomentumSignal(
    config.sessionMomentum2026,
    rows.bid,
    rows.ask
  );
  if (!setup) return null;
  return {
    key: signalKey(config, setup.direction, setup.signalTime),
    symbol: config.symbol,
    strategyName: config.strategyName,
    strategyCategory: config.strategyCategory,
    strategyVersion: config.strategyVersion,
    direction: setup.direction,
    signalTime: setup.signalTime,
    entryTime: setup.entryTime,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    exitRule: `Fixed TP ${config.sessionMomentum2026.rewardR}R, time stop ${config.sessionMomentum2026.maxHoldBars} hours, Friday 20:00 UTC close`,
    riskDistance: setup.riskDistance,
    riskDistancePips: setup.riskDistance / pipSize(config.symbol),
    source: `Dukascopy ${config.dukascopyCode} BID/ASK 1H`,
    reason: setup.reason,
    portfolioId: config.portfolioId,
    riskPct: config.riskPct,
    exitAtTime: setup.exitAtTime,
  } satisfies Signal;
}

function detectSignal(config: SymbolConfig, rows: MarketRows) {
  if (config.approvedProp) return detectApprovedPropSignal(config, rows);
  if (config.sessionMomentum2026) return detectProp2026SessionMomentumSignal(config, rows);
  const bidRows = rows.bid;
  if (config.kind === "donchian") return detectDonchianSignal(config, bidRows);
  if (config.kind === "htf_breakout") return detectHtfBreakoutSignal(config, bidRows);
  if (config.kind === "range_expansion_breakout") return detectRangeExpansionBreakoutSignal(config, bidRows);
  if (config.q2Prop) return detectQ2PropSignal(config, bidRows);
  return detectBbAtrSignal(config, bidRows);
}

function signalMessage(signal: Signal, positionSize?: PositionSizeResult | null) {
  const tp =
    signal.takeProfit == null
      ? `${signal.exitRule}; фіксованого TP немає, бот надішле EXIT ALERT при виході або SL`
      : formatPrice(signal.symbol, signal.takeProfit);
  return [
    "<b>PAPER SIGNAL</b>",
    `<b>${htmlEscape(signal.symbol)}</b> ${signal.direction.toUpperCase()}`,
    `Стратегія: ${htmlEscape(signal.strategyName)}`,
    `Класифікація: ${htmlEscape(strategyCategoryLabel(signal.strategyCategory))}`,
    `Entry time: ${kyivClockTime(signal.entryTime)} Київ`,
    `Entry: <code>${formatPrice(signal.symbol, signal.entryPrice)}</code>`,
    `SL: <code>${formatPrice(signal.symbol, signal.stopLoss)}</code>`,
    `TP / exit: <code>${htmlEscape(tp)}</code>`,
    `Risk distance: ${signal.riskDistancePips.toFixed(1)} pips/points`,
    ...positionSizeLines(signal, positionSize),
    ...(signal.riskPct ? [`Model portfolio risk: ${signal.riskPct.toFixed(2)}% of equity`] : []),
    ...(signal.portfolioId
      ? ["Portfolio guard: -3% daily stop, maximum 2% simultaneous risk"]
      : []),
    `Логіка: ${htmlEscape(signal.reason)}`,
    `Версія: ${htmlEscape(signal.strategyVersion)}`,
    `Джерело: ${htmlEscape(signal.source)}`,
    "",
    "Mode: paper signal only. No auto-trade.",
  ].join("\n");
}

function openPositionFromSignal(
  config: SymbolConfig,
  signal: Signal,
  signalMessageId?: number
): OpenPositionState {
  return {
    key: signal.key,
    profileId: config.profileId,
    symbol: signal.symbol,
    strategyName: signal.strategyName,
    strategyCategory: signal.strategyCategory,
    strategyVersion: signal.strategyVersion,
    direction: signal.direction,
    timeframe: config.timeframe,
    entryTime: signal.entryTime,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    exitRule: signal.exitRule,
    riskDistance: signal.riskDistance,
    maxHoldBars: config.maxHoldBars,
    portfolioId: signal.portfolioId,
    riskPct: signal.riskPct,
    signalMessageId,
    exitAtTime: signal.exitAtTime,
  };
}

function tradeOutcome(position: OpenPositionState, exit: PositionExit): TradeOutcome {
  const breakEvenTolerance = pipSize(position.symbol) * 0.1;
  const directionalResult =
    position.direction === "long"
      ? exit.exitPrice - position.entryPrice
      : position.entryPrice - exit.exitPrice;

  if (Math.abs(directionalResult) <= breakEvenTolerance) return "break_even";
  if (exit.result === "take_profit" || directionalResult > 0) return "win";
  return "stop_loss";
}

function closedTradeFromExit(position: OpenPositionState, exit: PositionExit): ClosedTradeState {
  const directionalMove =
    position.direction === "long"
      ? exit.exitPrice - position.entryPrice
      : position.entryPrice - exit.exitPrice;
  return {
    key: position.key,
    profileId: position.profileId,
    symbol: position.symbol,
    strategyName: position.strategyName,
    strategyCategory: position.strategyCategory,
    strategyVersion: position.strategyVersion,
    direction: position.direction,
    entryTime: position.entryTime,
    exitTime: exit.exitTime,
    entryPrice: position.entryPrice,
    exitPrice: exit.exitPrice,
    exitResult: exit.result,
    outcome: tradeOutcome(position, exit),
    portfolioId: position.portfolioId,
    riskPct: position.riskPct,
    realizedR:
      position.riskDistance && position.riskDistance > 0
        ? directionalMove / position.riskDistance
        : undefined,
  };
}

function exitMessage(position: OpenPositionState, exit: PositionExit, outcome: TradeOutcome) {
  const result =
    outcome === "break_even"
      ? "➖ BREAK-EVEN"
      : exit.result === "take_profit" || outcome === "win"
      ? "✅ TAKE PROFIT"
      : "❌ STOP LOSS";
  return [
    "<b>ПОЗИЦІЮ ЗАКРИТО</b>",
    `<b>${htmlEscape(position.symbol)}</b> ${position.direction.toUpperCase()}`,
    `Стратегія: ${htmlEscape(position.strategyName)}`,
    `Категорія: ${htmlEscape(strategyCategoryLabel(position.strategyCategory))}`,
    `Entry time: ${kyivClockTime(position.entryTime)} Київ`,
    `Результат: <b>${result}</b>`,
    `Ціна закриття: <code>${formatPrice(position.symbol, exit.exitPrice)}</code>`,
  ].join("\n");
}

function detectDonchianExit(
  config: SymbolConfig,
  position: OpenPositionState,
  rows: Kline[]
): PositionExit | null {
  const exitLookback = config.exitLookback ?? 10;
  const barMs = timeframeMs(config.timeframe);
  const now = Date.now();
  const closedRows = rows.filter((row) => row.openTime + barMs <= now - 30_000);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.openTime < position.entryTime) continue;

    const hitStop =
      position.direction === "long"
        ? row.low <= position.stopLoss
        : row.high >= position.stopLoss;
    if (hitStop) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.stopLoss,
        result: "stop_loss",
      };
    }
  }

  for (const signal of closedRows) {
    if (signal.openTime < position.entryTime) continue;
    const signalIndex = rows.findIndex((row) => row.openTime === signal.openTime);
    if (signalIndex - exitLookback < 0) continue;
    const exitHigh = highest(rows, signalIndex - exitLookback, signalIndex);
    const exitLow = lowest(rows, signalIndex - exitLookback, signalIndex);
    const shouldExit =
      position.direction === "long"
        ? signal.close < exitLow
        : signal.close > exitHigh;
    if (!shouldExit) continue;

    const next = rows[signalIndex + 1];
    return {
      exitTime: canonicalEntryTime(signal.openTime, config.timeframe),
      exitPrice: next?.open ?? signal.close,
      result: "strategy_exit",
    };
  }

  return null;
}

function detectFixedTargetExit(position: OpenPositionState, rows: Kline[]): PositionExit | null {
  if (position.takeProfit == null) return null;
  const barMs = timeframeMs(position.timeframe);
  const now = Date.now();

  for (const row of rows) {
    if (row.openTime < position.entryTime) continue;

    const hitStop =
      position.direction === "long"
        ? row.low <= position.stopLoss
        : row.high >= position.stopLoss;
    const hitTarget =
      position.direction === "long"
        ? row.high >= position.takeProfit
        : row.low <= position.takeProfit;

    // OHLC data does not reveal which level was touched first inside one candle.
    // Match the backtests and use the conservative outcome when both were hit.
    if (hitStop) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.stopLoss,
        result: "stop_loss",
      };
    }
    if (hitTarget) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.takeProfit,
        result: "take_profit",
      };
    }

    const heldBars = Math.floor((row.openTime - position.entryTime) / barMs);
    if (
      position.maxHoldBars &&
      heldBars >= position.maxHoldBars &&
      row.openTime + barMs <= now - 30_000
    ) {
      return {
        exitTime: row.closeTime,
        exitPrice: row.close,
        result: "strategy_exit",
      };
    }
  }

  return null;
}

function detectQ2PositionExit(
  position: OpenPositionState,
  rows: Kline[]
): PositionExit | null {
  if (position.takeProfit == null) return null;
  const barMs = timeframeMs(position.timeframe);
  const now = Date.now();
  for (const row of rows) {
    if (row.openTime < position.entryTime) continue;
    const hitStop =
      position.direction === "long"
        ? row.low <= position.stopLoss
        : row.high >= position.stopLoss;
    const hitTarget =
      position.direction === "long"
        ? row.high >= position.takeProfit
        : row.low <= position.takeProfit;
    if (hitStop) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.stopLoss,
        result: "stop_loss",
      };
    }
    if (hitTarget) {
      return {
        exitTime: Math.max(row.openTime, position.entryTime),
        exitPrice: position.takeProfit,
        result: "take_profit",
      };
    }

    const heldBars = Math.floor((row.openTime - position.entryTime) / barMs);
    if (
      position.maxHoldBars &&
      heldBars >= position.maxHoldBars &&
      row.openTime + barMs <= now - 30_000
    ) {
      return {
        exitTime: row.closeTime,
        exitPrice: row.close,
        result: "strategy_exit",
      };
    }
  }
  return null;
}

function detectApprovedPositionExit(
  config: SymbolConfig,
  position: OpenPositionState,
  market: MarketRows
): PositionExit | null {
  if (!config.approvedProp || position.takeProfit == null) return null;
  return detectApprovedPropPositionExit(
    {
      direction: position.direction,
      entryTime: position.entryTime,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      exitAtTime: position.exitAtTime,
      maxHoldBars: position.maxHoldBars,
      timeframeHours: config.approvedProp.timeframeHours,
    },
    market.bid,
    market.ask
  );
}

function detectProp2026SessionMomentumPositionExit(
  config: SymbolConfig,
  position: OpenPositionState,
  market: MarketRows
): PositionExit | null {
  if (!config.sessionMomentum2026 || position.takeProfit == null) return null;
  return detectProp2026SessionMomentumExit(
    {
      direction: position.direction,
      entryTime: position.entryTime,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      exitAtTime: position.exitAtTime,
      maxHoldBars: config.sessionMomentum2026.maxHoldBars,
      timeframeHours: 1,
    },
    market.bid,
    market.ask
  );
}

function detectPositionExit(config: SymbolConfig, position: OpenPositionState, market: MarketRows) {
  if (config.approvedProp) return detectApprovedPositionExit(config, position, market);
  if (config.sessionMomentum2026) {
    return detectProp2026SessionMomentumPositionExit(config, position, market);
  }
  const rows = market.bid;
  if (config.q2Prop) return detectQ2PositionExit(position, rows);
  const fixedTargetExit = detectFixedTargetExit(position, rows);
  if (fixedTargetExit) return fixedTargetExit;
  if (config.kind === "donchian") return detectDonchianExit(config, position, rows);
  return null;
}

function telegramToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  return token;
}

async function telegramApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${telegramToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { description?: string } | null;
    throw new Error(`Telegram ${method} failed: ${response.status} ${payload?.description ?? response.statusText}`);
  }

  const body = (await response.json()) as { ok: boolean; result: T; description?: string };
  if (!body.ok) throw new Error(`Telegram ${method} failed: ${body.description ?? "unknown error"}`);
  return body.result;
}

async function sendTelegramTo(
  chatId: string | number,
  message: string,
  inlineKeyboard?: TelegramInlineButton[][],
  replyToMessageId?: number
) {
  return telegramApi<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(inlineKeyboard ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
    ...(replyToMessageId
      ? {
          reply_parameters: {
            message_id: replyToMessageId,
            allow_sending_without_reply: true,
          },
        }
      : {}),
  });
}

async function sendTelegram(message: string, replyToMessageId?: number) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Missing TELEGRAM_CHAT_ID.");
  return sendTelegramTo(chatId, message, undefined, replyToMessageId);
}

function configuredSymbols() {
  const raw =
    process.env.SIGNAL_SYMBOLS ??
    "AUDUSD,EURUSD,GBPUSD,USDJPY,USDCAD,GER40,EURJPY,CHFJPY,GBPJPY,NZDUSD,USDCHF,XAUUSD,US30,SPX500,NAS100,DOGEUSDT,PEPEUSDT";
  const supportedSymbols = new Set(SIGNAL_PROFILES.map((profile) => profile.symbol));
  const configured = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((symbol, index, symbols) => supportedSymbols.has(symbol) && symbols.indexOf(symbol) === index);
  if (approvedPortfolioEnabled()) {
    for (const symbol of APPROVED_PROP_SYMBOLS) {
      if (!configured.includes(symbol)) configured.push(symbol);
    }
  }
  return configured;
}

function approvedPortfolioEnabled() {
  const value = process.env.SIGNAL_ENABLE_APPROVED_PROP_PORTFOLIO;
  return value !== "0" && value !== "false";
}

function profilesForSymbol(symbol: string) {
  const configuredIds = process.env.SIGNAL_PROFILE_IDS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedIds = configuredIds?.length ? new Set(configuredIds) : null;
  return SIGNAL_PROFILES.filter(
    (profile) =>
      profile.symbol === symbol &&
      (!allowedIds ||
        allowedIds.has(profile.profileId) ||
        (approvedPortfolioEnabled() && APPROVED_PROP_PROFILE_IDS.has(profile.profileId)))
  );
}

function profileLabel(profile: SymbolConfig) {
  return `${profile.symbol}/${profile.profileId}`;
}

function configuredProfiles() {
  const symbols = new Set(configuredSymbols());
  return SIGNAL_PROFILES.filter(
    (profile) =>
      symbols.has(profile.symbol) &&
      profilesForSymbol(profile.symbol).some(
        (configured) => configured.profileId === profile.profileId
      )
  );
}

function portfolioEntryBlockReason(
  config: SymbolConfig,
  signal: Signal,
  state: MonitorState
) {
  if (!config.portfolioId || !config.riskPct) return null;
  const entryDay = utcDayStart(signal.entryTime);
  const realizedPct = state.closedTrades
    .filter(
      (trade) =>
        trade.portfolioId === config.portfolioId &&
        utcDayStart(trade.exitTime) === entryDay
    )
    .reduce(
      (sum, trade) =>
        sum + (trade.realizedR ?? 0) * (trade.riskPct ?? config.riskPct ?? 0),
      0
    );
  const openRiskPct = state.openPositions
    .filter((position) => position.portfolioId === config.portfolioId)
    .reduce((sum, position) => sum + (position.riskPct ?? 0), 0);
  if (
    config.sessionMomentum2026 &&
    realizedPct - openRiskPct - config.riskPct <= -2
  ) {
    return `2026 session portfolio daily risk budget reached (${realizedPct.toFixed(2)}% realized, ${openRiskPct.toFixed(2)}% open)`;
  }
  if (config.sessionMomentum2026) {
    let consecutiveLosses = 0;
    const portfolioTrades = state.closedTrades
      .filter((trade) => trade.portfolioId === config.portfolioId)
      .sort((left, right) => right.exitTime - left.exitTime);
    for (const trade of portfolioTrades) {
      if (trade.outcome !== "stop_loss") break;
      consecutiveLosses += 1;
    }
    if (consecutiveLosses >= 7) {
      return `2026 session portfolio loss-streak guard reached (${consecutiveLosses})`;
    }
  }
  return propPortfolioEntryBlockReason({
    profileAlreadyOpen: state.openPositions.some(
      (position) => position.profileId === config.profileId
    ),
    realizedPct,
    openRiskPct,
    newRiskPct: config.riskPct,
    dailyStopPct: PROP_DAILY_STOP_PCT,
    maxConcurrentRiskPct: PROP_MAX_CONCURRENT_RISK_PCT,
  });
}

function mainMenuKeyboard(): TelegramInlineButton[][] {
  return [[{ text: "📊 Статистика", callback_data: "stats:categories" }]];
}

function categoryMenuKeyboard(): TelegramInlineButton[][] {
  const categories = [...new Set(configuredProfiles().map((profile) => profile.strategyCategory))];
  return [
    ...categories.map((category) => [
      {
        text: strategyCategoryLabel(category),
        callback_data: `stats:category:${category}`,
      },
    ]),
    [{ text: "⬅️ Головне меню", callback_data: "menu:main" }],
  ];
}

function strategyMenuKeyboard(category: StrategyCategory): TelegramInlineButton[][] {
  return [
    ...configuredProfiles()
      .map((profile) => ({ profile, index: SIGNAL_PROFILES.indexOf(profile) }))
      .filter(({ profile }) => profile.strategyCategory === category)
      .map(({ profile, index }) => [
        {
          text: `${profile.symbol} · ${profile.strategyName}`,
          callback_data: `stats:profile:${index}`,
        },
      ]),
    [{ text: "⬅️ Категорії", callback_data: "stats:categories" }],
  ];
}

function formatStatistic(value: number | null, digits = 2) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(digits);
}

function categoryStatistics(category: StrategyCategory) {
  const state = loadState();
  const profiles = configuredProfiles().filter(
    (profile) => profile.strategyCategory === category
  );
  const profileIds = new Set(profiles.map((profile) => profile.profileId));
  const trades = state.closedTrades.filter((trade) => profileIds.has(trade.profileId));
  const openPositions = state.openPositions.filter((position) =>
    profileIds.has(position.profileId)
  ).length;
  const statistics = aggregateSignalStatistics(trades);
  const winRate =
    statistics.winRatePct == null ? "—" : `${statistics.winRatePct.toFixed(1)}%`;
  const modelResult =
    statistics.tradesWithRisk > 0
      ? `${statistics.totalModelPct >= 0 ? "+" : ""}${statistics.totalModelPct.toFixed(2)}%`
      : "—";
  const totalR =
    statistics.tradesWithResult > 0
      ? `${statistics.totalR >= 0 ? "+" : ""}${statistics.totalR.toFixed(2)}R`
      : "—";
  const averageR =
    statistics.averageR == null ? "—" : `${statistics.averageR.toFixed(2)}R`;

  return [
    `<b>СТАТИСТИКА КАТЕГОРІЇ: ${htmlEscape(strategyCategoryLabel(category))}</b>`,
    `Стратегій у категорії: <b>${profiles.length}</b>`,
    "",
    `Закрито позицій: <b>${statistics.trades}</b>`,
    `✅ Успішні: <b>${statistics.wins}</b>`,
    `❌ Stop Loss: <b>${statistics.stopLosses}</b>`,
    `➖ Break-even: <b>${statistics.breakEvens}</b>`,
    `Успішність без BE: <b>${winRate}</b>`,
    `Відкриті зараз: <b>${openPositions}</b>`,
    "",
    `Сумарний результат: <b>${totalR}</b>`,
    `Модельний результат за ризиком: <b>${modelResult}</b>`,
    `Середній результат: <b>${averageR}</b>`,
    `Profit Factor: <b>${formatStatistic(statistics.profitFactor)}</b>`,
    "",
    "Оберіть стратегію для детальної статистики:",
  ].join("\n");
}

function strategyStatistics(profile: SymbolConfig) {
  const state = loadState();
  const trades = state.closedTrades.filter((trade) => trade.profileId === profile.profileId);
  const wins = trades.filter((trade) => trade.outcome === "win").length;
  const stopLosses = trades.filter((trade) => trade.outcome === "stop_loss").length;
  const breakEvens = trades.filter((trade) => trade.outcome === "break_even").length;
  const openPositions = state.openPositions.filter((position) => position.profileId === profile.profileId).length;
  const decisiveTrades = wins + stopLosses;
  const winRate = decisiveTrades > 0 ? `${((wins / decisiveTrades) * 100).toFixed(1)}%` : "—";

  return [
    "<b>СТАТИСТИКА СТРАТЕГІЇ</b>",
    `Стратегія: ${htmlEscape(profile.strategyName)}`,
    `Категорія: ${htmlEscape(strategyCategoryLabel(profile.strategyCategory))}`,
    `Пара: <b>${htmlEscape(profile.symbol)}</b>`,
    "",
    `Закрито позицій: <b>${trades.length}</b>`,
    `✅ Успішні: <b>${wins}</b>`,
    `❌ Stop Loss: <b>${stopLosses}</b>`,
    `➖ Break-even: <b>${breakEvens}</b>`,
    `Успішність без BE: <b>${winRate}</b>`,
    `Відкриті зараз: <b>${openPositions}</b>`,
  ].join("\n");
}

function isAllowedTelegramChat(chatId: number) {
  const configuredChatId = process.env.TELEGRAM_CHAT_ID;
  return configuredChatId != null && String(chatId) === String(configuredChatId);
}

async function editTelegramMenu(
  chatId: number,
  messageId: number,
  text: string,
  inlineKeyboard: TelegramInlineButton[][]
) {
  await telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

async function showMainMenu(chatId: number) {
  await sendTelegramTo(chatId, "<b>Меню бота</b>\nОберіть розділ:", mainMenuKeyboard());
}

async function handleTelegramCallback(callback: TelegramCallbackQuery) {
  const message = callback.message;
  if (!message || !callback.data) {
    await answerCallbackQuery(callback.id);
    return;
  }
  if (!isAllowedTelegramChat(message.chat.id)) {
    await answerCallbackQuery(callback.id, "Це меню недоступне в цьому чаті.");
    return;
  }

  if (callback.data === "menu:main") {
    await editTelegramMenu(message.chat.id, message.message_id, "<b>Меню бота</b>\nОберіть розділ:", mainMenuKeyboard());
  } else if (callback.data === "stats:categories") {
    await editTelegramMenu(
      message.chat.id,
      message.message_id,
      "<b>Статистика</b>\nОберіть категорію стратегії:",
      categoryMenuKeyboard()
    );
  } else if (callback.data.startsWith("stats:category:")) {
    const category = callback.data.slice("stats:category:".length) as StrategyCategory;
    if (!(category in STRATEGY_CATEGORY_LABELS)) {
      await answerCallbackQuery(callback.id, "Категорію не знайдено.");
      return;
    }
    await editTelegramMenu(
      message.chat.id,
      message.message_id,
      categoryStatistics(category),
      strategyMenuKeyboard(category)
    );
  } else if (callback.data.startsWith("stats:profile:")) {
    const profileIndex = Number(callback.data.slice("stats:profile:".length));
    const profile = SIGNAL_PROFILES[profileIndex];
    if (!profile || !configuredProfiles().includes(profile)) {
      await answerCallbackQuery(callback.id, "Стратегію не знайдено.");
      return;
    }
    await editTelegramMenu(
      message.chat.id,
      message.message_id,
      strategyStatistics(profile),
      [
        [{ text: "⬅️ До стратегій", callback_data: `stats:category:${profile.strategyCategory}` }],
        [{ text: "🏠 Головне меню", callback_data: "menu:main" }],
      ]
    );
  }

  await answerCallbackQuery(callback.id);
}

async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleTelegramCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message?.text || !isAllowedTelegramChat(message.chat.id)) return;
  const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  if (command === "/start" || command === "/menu") {
    await showMainMenu(message.chat.id);
  } else if (command === "/stats") {
    await sendTelegramTo(
      message.chat.id,
      "<b>Статистика</b>\nОберіть категорію стратегії:",
      categoryMenuKeyboard()
    );
  }
}

async function configureTelegramMenu() {
  await telegramApi("setMyCommands", {
    commands: [
      { command: "menu", description: "Відкрити меню бота" },
      { command: "stats", description: "Статистика стратегій" },
    ],
  });
}

async function telegramMenuLoop() {
  const menuState = loadTelegramMenuState();
  try {
    await configureTelegramMenu();
    console.log("Telegram menu is ready. Commands: /menu, /stats");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${iso(Date.now())} Telegram command setup failed: ${message}`);
  }

  for (;;) {
    try {
      const updates = await telegramApi<TelegramUpdate[]>("getUpdates", {
        offset: menuState.updateOffset,
        timeout: 20,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of updates) {
        menuState.updateOffset = update.update_id + 1;
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`${iso(Date.now())} Telegram menu update failed: ${message}`);
        }
        saveTelegramMenuState(menuState);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${iso(Date.now())} Telegram menu polling failed: ${message}`);
      await sleep(5_000);
    }
  }
}

async function scanOnce({ forceTest = false } = {}) {
  const state = loadState();
  const symbols = configuredSymbols();
  const maxAgeMinutes = Number(process.env.SIGNAL_MAX_SIGNAL_AGE_MINUTES ?? "90");
  const maxExitAgeMinutes = Number(
    process.env.SIGNAL_MAX_EXIT_AGE_MINUTES ?? "360"
  );
  const dryRun = isDryRun();
  const sendExistingOnStart =
    process.env.SIGNAL_SEND_EXISTING_ON_START === "1" ||
    process.env.SIGNAL_SEND_EXISTING_ON_START === "true";

  if (forceTest) {
    const testPositionSize = calculateForexPositionSize({
      symbol: "EURUSD",
      entryPrice: 1.1,
      stopLoss: 1.096,
      ...forexSizingConfig(),
    });
    if (!testPositionSize?.lotSize || testPositionSize.estimatedLossUsd == null) {
      throw new Error("Unable to calculate the Telegram test position size");
    }

    const message = [
      "<b>POSITION SIZE TEST</b>",
      "This is a calculation test, not a trade signal.",
      "",
      "<b>EURUSD</b> BUY",
      "Entry: <code>1.10000</code>",
      "SL: <code>1.09600</code>",
      `MT5 lot: <b>${testPositionSize.lotSize.toFixed(lotDecimals(testPositionSize.lotStep))}</b>`,
      `Risk target: <b>$${testPositionSize.riskAmountUsd.toFixed(2)}</b> (${testPositionSize.riskPercent.toFixed(2)}% of $${testPositionSize.accountBalanceUsd.toLocaleString("en-US")})`,
      `Estimated SL loss: <b>$${testPositionSize.estimatedLossUsd.toFixed(2)}</b> after rounding down`,
      "Commission and slippage excluded.",
      "",
      "Telegram delivery and MT5 sizing are configured.",
      `Time: ${iso(Date.now())}`,
      "No auto-trade.",
    ].join("\n");
    if (dryRun) {
      console.log("[dry-run] Telegram test message:");
      console.log(message.replace(/<[^>]+>/g, ""));
    } else {
      await sendTelegram(message);
      console.log("Telegram test message sent.");
    }
    return;
  }

  const rowsCache = new Map<string, MarketRows>();
  const conversionRateCache = new Map<string, number>();

  for (const symbol of symbols) {
    const profiles = profilesForSymbol(symbol);
    if (!profiles.length) {
      console.log(`${iso(Date.now())} ${symbol}: no configured signal profiles`);
      continue;
    }

    for (const config of profiles) {
      const label = profileLabel(config);
      const cacheKey = [
        config.dataProvider ?? "yahoo",
        config.dukascopyCode ?? config.yahooSymbol,
        config.timeframe,
      ].join("|");
      try {
        let market = rowsCache.get(cacheKey);
        if (!market) {
          market = await fetchMarketRows(config);
          rowsCache.set(cacheKey, market);
        }

        const profileOpenPositions = state.openPositions.filter(
          (position) => position.profileId === config.profileId
        );
        for (const position of profileOpenPositions) {
          const exit = detectPositionExit(config, position, market);
          if (!exit) continue;

          const exitKey = `exit|${position.key}|${exit.exitTime}`;
          if (state.sentKeys.includes(exitKey)) continue;

          const closedTrade = closedTradeFromExit(position, exit);
          const message = exitMessage(position, exit, closedTrade.outcome);
          if (dryRun) {
            console.log("[dry-run] Exit detected:");
            console.log(message.replace(/<[^>]+>/g, ""));
            continue;
          }

          const suppressionReason = exitAlertSuppressionReason({
            now: Date.now(),
            exitTime: exit.exitTime,
            maxExitAgeMinutes,
            originalMessageId: position.signalMessageId,
          });
          if (suppressionReason) {
            console.log(
              `${iso(Date.now())} ${label}: Telegram exit alert suppressed: ${suppressionReason}`
            );
          } else {
            await sendTelegram(message, position.signalMessageId);
            console.log(`${iso(Date.now())} ${label}: Telegram exit alert sent`);
          }

          state.sentKeys.push(exitKey);
          state.openPositions = state.openPositions.filter((item) => item.key !== position.key);
          state.closedTrades = state.closedTrades.filter((trade) => trade.key !== position.key);
          state.closedTrades.push(closedTrade);
          saveState(state);
        }

        const signal = detectSignal(config, market);
        if (!signal) {
          console.log(`${iso(Date.now())} ${label}: no signal`);
          continue;
        }

        if (state.sentKeys.includes(signal.key)) {
          const exitKeyPrefix = `exit|${signal.key}|`;
          const isAlreadyClosed = state.sentKeys.some((key) => key.startsWith(exitKeyPrefix));
          if (!isAlreadyClosed && !state.openPositions.some((position) => position.key === signal.key)) {
            state.openPositions.push(openPositionFromSignal(config, signal));
            saveState(state);
            console.log(`${iso(Date.now())} ${label}: restored position tracking for existing signal`);
          }
          console.log(`${iso(Date.now())} ${label}: duplicate signal already handled`);
          continue;
        }

        const ageMinutes = (Date.now() - signal.entryTime) / 60_000;
        if (ageMinutes > maxAgeMinutes) {
          console.log(`${iso(Date.now())} ${label}: signal skipped as stale (${ageMinutes.toFixed(1)} min)`);
          continue;
        }

        let positionSize: PositionSizeResult | null | undefined;
        try {
          positionSize = await positionSizeForSignal(signal, conversionRateCache);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`${iso(Date.now())} ${label}: MT5 lot calculation failed: ${message}`);
        }

        if (dryRun) {
          const message = signalMessage(signal, positionSize);
          console.log("[dry-run] Signal detected:");
          console.log(message.replace(/<[^>]+>/g, ""));
          appendJournal("dry_run", signal);
          continue;
        }

        const portfolioBlock = portfolioEntryBlockReason(config, signal, state);
        if (portfolioBlock) {
          console.log(`${iso(Date.now())} ${label}: signal blocked by portfolio rule (${portfolioBlock})`);
          appendJournal(`blocked: ${portfolioBlock}`, signal);
          state.sentKeys.push(signal.key);
          saveState(state);
          continue;
        }

        if (!initialScanCompleted && !sendExistingOnStart && signal.entryTime < PROCESS_STARTED_AT - 30_000) {
          console.log(`${iso(Date.now())} ${label}: pre-start signal skipped (${kyivTime(signal.entryTime)} Kyiv)`);
          state.sentKeys.push(signal.key);
          if (!state.openPositions.some((position) => position.key === signal.key)) {
            state.openPositions.push(openPositionFromSignal(config, signal));
          }
          saveState(state);
          continue;
        }

        const message = signalMessage(signal, positionSize);
        const sentMessage = await sendTelegram(message);
        const signalMessageId = sentMessage.message_id;
        appendJournal("sent", signal);
        console.log(`${iso(Date.now())} ${label}: Telegram signal sent`);

        state.sentKeys.push(signal.key);
        state.openPositions = state.openPositions.filter((position) => position.key !== signal.key);
        state.openPositions.push(openPositionFromSignal(config, signal, signalMessageId));
        saveState(state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`${iso(Date.now())} ${label}: ${message}`);
      }
    }
  }

  initialScanCompleted = true;
}

async function main() {
  loadEnv();
  ensureJournal();

  const args = new Set(process.argv.slice(2));
  if (args.has("--test-telegram")) {
    await scanOnce({ forceTest: true });
    return;
  }

  if (args.has("--once")) {
    await scanOnce();
    return;
  }

  const pollMs = Math.max(60_000, Number(process.env.SIGNAL_POLL_MS ?? "300000"));
  const profileCount = configuredSymbols().reduce((sum, symbol) => sum + profilesForSymbol(symbol).length, 0);
  console.log(
    `Starting live signal monitor. Poll: ${pollMs}ms. Symbols: ${configuredSymbols().join(", ")}. Profiles: ${profileCount}`
  );

  const signalMonitorLoop = async () => {
    for (;;) {
      await scanOnce();
      await sleep(pollMs);
    }
  };

  await Promise.all([signalMonitorLoop(), telegramMenuLoop()]);
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
