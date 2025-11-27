/**
 * useScreenerData Hook
 * Fetches and processes data from the custom Rust backend
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScreenerRow } from '@/lib/screener/types';
import { fetchScreenerData, WS_URL } from '@/lib/screener/api';

// ============================================
// TYPES
// ============================================

interface UseScreenerDataResult {
  data: ScreenerRow[];
  loading: boolean;
  error: string | null;
  lastUpdate: number;
  refresh: () => void;
}

interface WebSocketMessage {
  type: 'update' | 'snapshot';
  timestamp: number;
  data: Partial<ScreenerRow>[];
}

// ============================================
// CONSTANTS
// ============================================

const REFRESH_INTERVAL = 60000; // Fallback refresh every 60s if WS fails

// ============================================
// HOOK IMPLEMENTATION
// ============================================

interface UseScreenerDataOptions {
  enabled?: boolean;
}

export function useScreenerData(options: UseScreenerDataOptions = {}): UseScreenerDataResult {
  const { enabled = true } = options;
  const [data, setData] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<Map<string, ScreenerRow>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Update local state from map
  const updateStateFromMap = useCallback(() => {
    const rows = Array.from(dataRef.current.values());
    // Sort by symbol alphabetically
    rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
    setData(rows);
    setLastUpdate(Date.now());
  }, []);

  // Main data fetching function (Snapshot)
  const fetchData = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      if (data.length === 0) setLoading(true);
      setError(null);
      
      console.log('[Screener] Fetching snapshot from backend...');
      const response = await fetchScreenerData(signal);
      
      console.log(`[Screener] Received ${response.count} symbols`);
      
      // Update map
      response.data.forEach(row => {
        dataRef.current.set(row.symbol, row);
      });
      
      updateStateFromMap();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('[Screener] ❌ Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [data.length, updateStateFromMap]);
  
  // WebSocket connection
  useEffect(() => {
    if (!enabled) return;

    let reconnectTimer: NodeJS.Timeout;
    let isUnmounted = false;

    const connectWebSocket = () => {
      if (isUnmounted) return;

      console.log('[Screener] Connecting to WebSocket:', WS_URL);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Screener] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'update' || message.type === 'snapshot') {
            let hasChanges = false;
            
            message.data.forEach(update => {
              if (!update.symbol) return;
              
              const existing = dataRef.current.get(update.symbol);
              if (existing) {
                // Merge updates
                dataRef.current.set(update.symbol, { ...existing, ...update });
                hasChanges = true;
              } else if (message.type === 'snapshot' && update.symbol) {
                // New symbol from snapshot
                dataRef.current.set(update.symbol, update as ScreenerRow);
                hasChanges = true;
              }
            });
            
            if (hasChanges) {
              updateStateFromMap();
            }
          }
        } catch (err) {
          console.error('[Screener] WebSocket message parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[Screener] WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log('[Screener] WebSocket disconnected');
        if (!isUnmounted) {
          // Try to reconnect after 3 seconds
          reconnectTimer = setTimeout(connectWebSocket, 3000);
        }
      };
    };

    // Initial fetch
    fetchData();
    
    // Connect WS
    connectWebSocket();
    
    // Fallback polling
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    
    return () => {
      isUnmounted = true;
      clearInterval(interval);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, updateStateFromMap, enabled]);
  
  return {
    data,
    loading,
    error,
    lastUpdate,
    refresh: fetchData,
  };
}
