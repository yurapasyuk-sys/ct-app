/**
 * OE-BTC Custom Weight Configurator
 * Allow users to adjust weights of indicator components
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Sliders, RotateCcw, Save } from 'lucide-react';

interface WeightConfig {
  macro: number;
  etf: number;
  btc: number;
}

interface OEBTCWeightConfiguratorProps {
  roMacro: number;
  etfFlow: number;
  btcMomentum: number;
  defaultWeights?: WeightConfig;
  onWeightsChange?: (weights: WeightConfig) => void;
}

const DEFAULT_WEIGHTS: WeightConfig = {
  macro: 0.40,
  etf: 0.35,
  btc: 0.25,
};

const STORAGE_KEY = 'oe_btc_custom_weights';

export function OEBTCWeightConfigurator({
  roMacro,
  etfFlow,
  btcMomentum,
  defaultWeights = DEFAULT_WEIGHTS,
  onWeightsChange,
}: OEBTCWeightConfiguratorProps) {
  const [weights, setWeights] = useState<WeightConfig>(defaultWeights);
  const [showComparison, setShowComparison] = useState(true);

  // Load saved weights from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWeights(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load custom weights:', error);
    }
  }, []);

  // Calculate OE-BTC values
  const defaultValue = roMacro * defaultWeights.macro + etfFlow * defaultWeights.etf + btcMomentum * defaultWeights.btc;
  const customValue = roMacro * weights.macro + etfFlow * weights.etf + btcMomentum * weights.btc;
  const difference = customValue - defaultValue;
  const percentDiff = ((difference / Math.abs(defaultValue)) * 100);

  // Update weight while maintaining sum = 1.0
  const updateWeight = (key: keyof WeightConfig, value: number) => {
    const newWeights = { ...weights };
    const oldValue = weights[key];
    const delta = value - oldValue;
    
    // Distribute the change across other weights
    const otherKeys = (Object.keys(weights) as Array<keyof WeightConfig>).filter(k => k !== key);
    const otherSum = otherKeys.reduce((sum, k) => sum + weights[k], 0);
    
    if (otherSum > 0) {
      newWeights[key] = value;
      otherKeys.forEach(k => {
        const proportion = weights[k] / otherSum;
        newWeights[k] = Math.max(0, weights[k] - delta * proportion);
      });
    } else {
      // If others are 0, split evenly
      newWeights[key] = value;
      const remaining = 1 - value;
      otherKeys.forEach(k => {
        newWeights[k] = remaining / otherKeys.length;
      });
    }

    // Normalize to ensure sum = 1
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    Object.keys(newWeights).forEach(k => {
      newWeights[k as keyof WeightConfig] /= sum;
    });

    setWeights(newWeights);
    onWeightsChange?.(newWeights);
  };

  // Save weights to localStorage
  const saveWeights = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(weights));
      alert('Custom weights saved!');
    } catch (error) {
      console.error('Failed to save weights:', error);
      alert('Failed to save weights');
    }
  };

  // Reset to default
  const resetWeights = () => {
    setWeights(defaultWeights);
    onWeightsChange?.(defaultWeights);
  };

  return (
    <Card className="p-4 bg-card/40 border border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-semibold">Custom Weights</h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetWeights}
            className="p-2 hover:bg-muted/50 rounded transition-colors"
            title="Reset to default"
          >
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={saveWeights}
            className="p-2 hover:bg-blue-500/20 rounded transition-colors"
            title="Save weights"
          >
            <Save className="w-4 h-4 text-blue-400" />
          </button>
        </div>
      </div>

      {/* Weight sliders */}
      <div className="space-y-4 mb-4">
        {/* Macro weight */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Macro (SPY, JNK, EEM, GLD, DXY)</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Default: {(defaultWeights.macro * 100).toFixed(0)}%</span>
              <span className="text-sm font-bold text-blue-400">{(weights.macro * 100).toFixed(0)}%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={weights.macro * 100}
            onChange={(e) => updateWeight('macro', parseFloat(e.target.value) / 100)}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* ETF weight */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">ETF Flows</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Default: {(defaultWeights.etf * 100).toFixed(0)}%</span>
              <span className="text-sm font-bold text-cyan-400">{(weights.etf * 100).toFixed(0)}%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={weights.etf * 100}
            onChange={(e) => updateWeight('etf', parseFloat(e.target.value) / 100)}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* BTC weight */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">BTC Momentum</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Default: {(defaultWeights.btc * 100).toFixed(0)}%</span>
              <span className="text-sm font-bold text-purple-400">{(weights.btc * 100).toFixed(0)}%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={weights.btc * 100}
            onChange={(e) => updateWeight('btc', parseFloat(e.target.value) / 100)}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      </div>

      {/* Comparison */}
      {showComparison && (
        <div className="p-3 bg-muted/20 rounded-lg border border-border/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Comparison</span>
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>

          <div className="space-y-2">
            {/* Default */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Default OE-BTC:</span>
              <span className="text-sm font-bold">{defaultValue.toFixed(2)}</span>
            </div>

            {/* Custom */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Custom OE-BTC:</span>
              <span className="text-sm font-bold text-blue-400">{customValue.toFixed(2)}</span>
            </div>

            {/* Difference */}
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <span className="text-xs font-medium">Difference:</span>
              <div className="text-right">
                <div className={`text-sm font-bold ${difference > 0 ? 'text-emerald-400' : difference < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ({percentDiff > 0 ? '+' : ''}{percentDiff.toFixed(1)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-3 relative h-8 bg-muted/30 rounded overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center text-xs font-mono text-white/80 z-10">
              {Math.abs(difference) < 0.01 ? 'No change' : difference > 0 ? `+${difference.toFixed(2)}` : difference.toFixed(2)}
            </div>
            <div
              className={`absolute top-0 h-full transition-all duration-300 ${
                difference > 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'
              }`}
              style={{
                width: `${Math.min(Math.abs(percentDiff), 100)}%`,
                left: difference > 0 ? '50%' : `${50 - Math.min(Math.abs(percentDiff), 50)}%`,
              }}
            />
            {/* Center line */}
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/30" />
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-2 bg-blue-500/5 border border-blue-500/20 rounded text-xs text-muted-foreground">
        <strong className="text-blue-400">Tip:</strong> Weights are automatically normalized to sum to 100%. 
        Save your custom configuration to persist across sessions.
      </div>
    </Card>
  );
}
