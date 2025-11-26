/**
 * Backend API Service
 * Handles all API calls to the custom Rust backend
 */

import {
  ScreenerRow,
  KlineData,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const BACKEND_BASE_URL = 'http://91.107.193.27:8080/api/v1';
export const WS_URL = 'ws://91.107.193.27:8080/api/v1/screener/ws';

// ============================================
// TYPES
// ============================================

export interface ScreenerResponse {
  success: boolean;
  timestamp: number;
  count: number;
  data: ScreenerRow[];
}

export interface HealthResponse {
  status: string;
  uptime: number;
  symbols_count: number;
  last_binance_update: number;
  websocket_connected: boolean;
  db_connected: boolean;
}

export interface KlinesResponse {
  symbol: string;
  interval: string;
  klines: KlineData[];
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch health status of the backend
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${BACKEND_BASE_URL}/health`, { signal });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch health: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch full screener snapshot
 */
export async function fetchScreenerData(signal?: AbortSignal): Promise<ScreenerResponse> {
  const response = await fetch(`${BACKEND_BASE_URL}/screener`, { signal });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch screener data: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Fetch klines for a symbol (for mini-charts)
 */
export async function fetchKlines(
  symbol: string,
  interval: string = '1m',
  limit: number = 60,
  signal?: AbortSignal
): Promise<KlineData[]> {
  const url = `${BACKEND_BASE_URL}/klines/${symbol}?interval=${interval}&limit=${limit}`;
  const response = await fetch(url, { signal });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch klines for ${symbol}: ${response.status}`);
  }
  
  const data: KlinesResponse = await response.json();
  return data.klines;
}
