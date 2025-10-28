/**
 * Standalone RVWAP Panel Test Route
 * Purpose: Verify RVWAP component works in isolation
 * Route: /dashboard/rvwap
 */

import { RvwapPanel } from '@/components/rvwap/RvwapPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RvwapOnly() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard/mtm')}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to MTM
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Rolling VWAP Test</h1>
                <p className="text-sm text-muted-foreground">
                  Isolated component verification
                </p>
              </div>
            </div>
            <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500 rounded text-emerald-400 text-xs font-mono">
              TEST ROUTE
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded">
          <h2 className="font-semibold mb-2">🧪 Test Route Information</h2>
          <p className="text-sm text-muted-foreground">
            This page renders <code className="px-1 py-0.5 bg-muted rounded">RvwapPanel</code> in isolation.
            If you see the chart below with the "RVWAP ACTIVE" badge, the component works.
            If it doesn't appear on <code className="px-1 py-0.5 bg-muted rounded">/dashboard/mtm</code>,
            the issue is with conditional rendering logic there.
          </p>
        </div>

        <RvwapPanel symbol="BTCUSDT" dataSource="spot" />
      </main>
    </div>
  );
}
