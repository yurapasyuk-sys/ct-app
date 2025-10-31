import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import helper functions from src/lib
// Note: In Vercel serverless, we need to inline the logic or use proper path
import { fetchAllData } from '../src/lib/oe-data-fetchers';
import { calculateOEBTCFull } from '../src/lib/oe-calculator';

/**
 * OE-BTC Indicator API
 * Calculates Order Execution Risk-On/Risk-Off signal
 * Endpoint: GET /api/oe-btc
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[OE-BTC-API] Request received');

    // Fetch all data in parallel
    const { macroData, btcData, etfFlows } = await fetchAllData();

    // Calculate OE-BTC
    const result = calculateOEBTCFull(macroData, btcData, etfFlows);

    const response = {
      oe_btc: result.oe_btc,
      ro_macro: result.ro_macro,
      etf_flow: result.etf_flow,
      btc_momentum: result.btc_momentum,
      timestamp: new Date().toISOString(),
      components: result.components,
    };

    console.log('[OE-BTC-API] ✅ Response ready:', response);

    // Set caching headers
    // Main endpoint: cache for 5 minutes, with 30s stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=30');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(response);
  } catch (error) {
    console.error('[OE-BTC-API] Error:', error);

    return res.status(500).json({
      error: 'Failed to calculate OE-BTC',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
