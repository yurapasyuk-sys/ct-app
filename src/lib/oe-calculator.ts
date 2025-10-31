/**
 * OE-BTC Calculator
 * Calculates macro risk-on, ETF flow component, BTC momentum, and final OE-BTC
 */

interface PriceData {
  price: number;
  sma: number;
}

interface MacroData {
  spy: PriceData;
  jnk: PriceData;
  eem: PriceData;
  gld: PriceData;
  dxy: PriceData;
}

interface BTCData {
  price: number;
  sma15: number;
}

interface ETFFlowData {
  dailyFlow: number;
  ma5Flow: number;
}

interface OEComponents {
  spy_above_sma: boolean;
  jnk_above_sma: boolean;
  eem_above_sma: boolean;
  gld_above_sma: boolean; // Inverted: below = risk-on
  dxy_above_sma: boolean; // Inverted: below = risk-on
  etf_flow_usd: number;
  btc_price: number;
  btc_sma15: number;
}

/**
 * Calculate macro risk-on component
 * Counts assets above SMA200, with GLD & DXY inverted
 * Formula: (n_above - 2.5) / 5, clamped to [-1, 1]
 */
export function calculateMacroRiskOn(macroData: MacroData): {
  value: number;
  components: Omit<OEComponents, 'etf_flow_usd' | 'btc_price' | 'btc_sma15'>;
} {
  const spy = macroData.spy.price > macroData.spy.sma;
  const jnk = macroData.jnk.price > macroData.jnk.sma;
  const eem = macroData.eem.price > macroData.eem.sma;
  const gld = macroData.gld.price < macroData.gld.sma; // Inverted
  const dxy = macroData.dxy.price < macroData.dxy.sma; // Inverted

  const count = [spy, jnk, eem, gld, dxy].filter(Boolean).length;
  const value = Math.max(-1, Math.min(1, (count - 2.5) / 5));

  console.log('[OE-BTC-Calc] Macro Risk-On:', {
    count,
    value,
    spy,
    jnk,
    eem,
    gld,
    dxy,
  });

  return {
    value,
    components: {
      spy_above_sma: spy,
      jnk_above_sma: jnk,
      eem_above_sma: eem,
      gld_above_sma: gld,
      dxy_above_sma: dxy,
    },
  };
}

/**
 * Calculate ETF flow component
 * Formula: tanh((daily_flow - ma5_flow) / 100M), clamped to [-1, 1]
 */
export function calculateETFFlow(etfData: ETFFlowData): {
  value: number;
  dailyFlow: number;
} {
  const normalized = (etfData.dailyFlow - etfData.ma5Flow) / 100000000;
  const value = Math.tanh(normalized);
  const clamped = Math.max(-1, Math.min(1, value));

  console.log('[OE-BTC-Calc] ETF Flow:', {
    dailyFlow: etfData.dailyFlow,
    ma5Flow: etfData.ma5Flow,
    normalized,
    value: clamped,
  });

  return { value: clamped, dailyFlow: etfData.dailyFlow };
}

/**
 * Calculate BTC momentum component
 * Formula: 1 if BTC > SMA15, else -1
 */
export function calculateBTCMomentum(btcData: BTCData): {
  value: number;
  price: number;
  sma15: number;
} {
  const value = btcData.price > btcData.sma15 ? 1 : -1;

  console.log('[OE-BTC-Calc] BTC Momentum:', {
    price: btcData.price,
    sma15: btcData.sma15,
    value,
  });

  return { value, price: btcData.price, sma15: btcData.sma15 };
}

/**
 * Calculate final OE-BTC
 * Formula: 0.4 * macro_ro + 0.35 * etf_flow + 0.25 * btc_momentum
 */
export function calculateOEBTC(
  macroRO: number,
  etfFlow: number,
  btcMomentum: number
): number {
  const oe = 0.4 * macroRO + 0.35 * etfFlow + 0.25 * btcMomentum;
  const clamped = Math.max(-1, Math.min(1, oe));

  console.log('[OE-BTC-Calc] Final OE-BTC:', {
    macro: macroRO,
    etf: etfFlow,
    btc: btcMomentum,
    oe,
    clamped,
  });

  return clamped;
}

/**
 * Orchestrate all calculations
 */
export function calculateOEBTCFull(
  macroData: MacroData,
  btcData: BTCData,
  etfFlows: ETFFlowData
) {
  const macroResult = calculateMacroRiskOn(macroData);
  const etfResult = calculateETFFlow(etfFlows);
  const btcResult = calculateBTCMomentum(btcData);

  const oeBTC = calculateOEBTC(macroResult.value, etfResult.value, btcResult.value);

  return {
    oe_btc: oeBTC,
    ro_macro: macroResult.value,
    etf_flow: etfResult.value,
    btc_momentum: btcResult.value,
    components: {
      ...macroResult.components,
      etf_flow_usd: etfResult.dailyFlow,
      btc_price: btcResult.price,
      btc_sma15: btcResult.sma15,
    },
  };
}
