/**
 * OE-BTC Alert Configuration Component
 * Configure alerts for OE-BTC threshold crossings
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Bell, Plus, Trash2, X } from 'lucide-react';

interface Alert {
  id: string;
  threshold: number;
  direction: 'above' | 'below' | 'crosses';
  enabled: boolean;
  createdAt: number;
}

interface OEBTCAlertConfigProps {
  currentValue: number;
  onClose?: () => void;
}

const STORAGE_KEY = 'oe_btc_alerts';

export function OEBTCAlertConfig({ currentValue, onClose }: OEBTCAlertConfigProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newThreshold, setNewThreshold] = useState<number>(0);
  const [newDirection, setNewDirection] = useState<'above' | 'below' | 'crosses'>('above');

  // Load alerts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setAlerts(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  }, []);

  // Save alerts to localStorage
  const saveAlerts = (newAlerts: Alert[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAlerts));
      setAlerts(newAlerts);
    } catch (error) {
      console.error('Failed to save alerts:', error);
    }
  };

  // Add new alert
  const addAlert = () => {
    if (isNaN(newThreshold)) return;

    const alert: Alert = {
      id: Date.now().toString(),
      threshold: newThreshold,
      direction: newDirection,
      enabled: true,
      createdAt: Date.now(),
    };

    saveAlerts([...alerts, alert]);
    setNewThreshold(0);
  };

  // Delete alert
  const deleteAlert = (id: string) => {
    saveAlerts(alerts.filter(a => a.id !== id));
  };

  // Toggle alert
  const toggleAlert = (id: string) => {
    saveAlerts(alerts.map(a => 
      a.id === id ? { ...a, enabled: !a.enabled } : a
    ));
  };

  // Check if alert would trigger
  const wouldTrigger = (alert: Alert) => {
    switch (alert.direction) {
      case 'above':
        return currentValue > alert.threshold;
      case 'below':
        return currentValue < alert.threshold;
      case 'crosses':
        // For crosses, we'd need historical data to check
        // For now, just show if close to threshold
        return Math.abs(currentValue - alert.threshold) < 0.1;
      default:
        return false;
    }
  };

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'above': return '⬆ Above';
      case 'below': return '⬇ Below';
      case 'crosses': return '↔ Crosses';
      default: return direction;
    }
  };

  return (
    <Card className="p-6 bg-card/95 border border-border/50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold">Alert Configuration</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted/50 rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Current value display */}
      <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="text-xs text-muted-foreground mb-1">Current OE-BTC</div>
        <div className="text-2xl font-bold text-blue-400">{currentValue.toFixed(2)}</div>
      </div>

      {/* New alert form */}
      <div className="mb-6 p-4 bg-muted/20 rounded-lg border border-border/30">
        <div className="text-sm font-semibold mb-3">Create New Alert</div>
        <div className="flex gap-2 mb-2">
          <input
            type="number"
            step="0.1"
            value={newThreshold}
            onChange={(e) => setNewThreshold(parseFloat(e.target.value))}
            placeholder="Threshold (e.g., 0.5)"
            className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm"
          />
          <select
            value={newDirection}
            onChange={(e) => setNewDirection(e.target.value as any)}
            className="px-3 py-2 bg-background border border-border rounded text-sm"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="crosses">Crosses</option>
          </select>
        </div>
        <button
          onClick={addAlert}
          disabled={isNaN(newThreshold)}
          className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-sm font-medium text-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Alert
        </button>
      </div>

      {/* Alerts list */}
      <div className="space-y-2">
        <div className="text-sm font-semibold mb-3">
          Active Alerts ({alerts.filter(a => a.enabled).length}/{alerts.length})
        </div>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No alerts configured yet
          </div>
        ) : (
          alerts.map((alert) => {
            const triggered = wouldTrigger(alert);
            return (
              <div
                key={alert.id}
                className={`
                  p-3 rounded-lg border transition-all
                  ${alert.enabled 
                    ? triggered
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-muted/20 border-border/30'
                    : 'bg-muted/10 border-border/20 opacity-50'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => toggleAlert(alert.id)}
                        className={`
                          w-10 h-5 rounded-full transition-colors relative
                          ${alert.enabled ? 'bg-blue-500' : 'bg-muted'}
                        `}
                      >
                        <div
                          className={`
                            w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform
                            ${alert.enabled ? 'translate-x-5' : 'translate-x-0.5'}
                          `}
                        />
                      </button>
                      <span className="font-mono font-semibold">
                        {getDirectionLabel(alert.direction)} {alert.threshold.toFixed(2)}
                      </span>
                      {triggered && alert.enabled && (
                        <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                          Would trigger!
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(alert.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="p-2 hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Info */}
      <div className="mt-6 p-3 bg-blue-500/5 border border-blue-500/20 rounded text-xs text-muted-foreground">
        <strong className="text-blue-400">Note:</strong> Alerts are stored locally in your browser. 
        You'll need to keep this page open or implement backend notifications for real-time alerts.
      </div>
    </Card>
  );
}
