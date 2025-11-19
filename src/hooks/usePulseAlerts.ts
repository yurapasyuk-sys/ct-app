import { useState, useEffect, useMemo } from 'react';
import { useKlines } from './useKlines';
import { getRecommendedThreshold } from '@/lib/tension';

export interface PulseAlert {
  id: string;
  symbol: string;
  interval: string;
  timestamp: number;
  price: number;
  pulseValue: number;
  threshold: number;
  type: 'cross-up' | 'cross-down';
}

export const usePulseAlerts = (symbol: string = 'BTCUSDT') => {
  // We monitor 15m, 1h, 4h
  const { tensionData: tension15m, klines: klines15m, isLoading: loading15m } = useKlines({
    symbol,
    interval: '15m',
    lookbackDays: 14,
    dataSource: 'futures',
  });

  const { tensionData: tension1h, klines: klines1h, isLoading: loading1h } = useKlines({
    symbol,
    interval: '1h',
    lookbackDays: 14,
    dataSource: 'futures',
  });

  const { tensionData: tension4h, klines: klines4h, isLoading: loading4h } = useKlines({
    symbol,
    interval: '4h',
    lookbackDays: 14,
    dataSource: 'futures',
  });

  const alerts = useMemo(() => {
    const allAlerts: PulseAlert[] = [];

    const processTimeframe = (tension: any[], klines: any[], interval: string) => {
      const threshold = getRecommendedThreshold(interval);
      if (!tension.length || !klines.length) return;

      // Create a map for quick price lookup
      const priceMap = new Map(klines.map(k => [k.openTime, k.close]));

      for (let i = 1; i < tension.length; i++) {
        const prev = tension[i - 1];
        const curr = tension[i];
        
        // Check for threshold crossing
        // We are interested when it goes ABOVE the threshold (high tension)
        // Or maybe when it crosses back down? Usually "Pulse" implies high activity.
        // Let's track crossing UP into the danger zone.
        
        const prevVal = Math.abs(prev.tensionIndex);
        const currVal = Math.abs(curr.tensionIndex);

        if (prevVal < threshold && currVal >= threshold) {
          allAlerts.push({
            id: `${interval}-${curr.timestamp}-up`,
            symbol,
            interval,
            timestamp: curr.timestamp,
            price: priceMap.get(curr.timestamp) || 0,
            pulseValue: curr.tensionIndex,
            threshold,
            type: 'cross-up',
          });
        }
      }
    };

    processTimeframe(tension15m, klines15m, '15m');
    processTimeframe(tension1h, klines1h, '1h');
    processTimeframe(tension4h, klines4h, '4h');

    // Sort by time descending (newest first)
    return allAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }, [tension15m, tension1h, tension4h, klines15m, klines1h, klines4h, symbol]);

  return {
    alerts,
    isLoading: loading15m || loading1h || loading4h,
  };
};