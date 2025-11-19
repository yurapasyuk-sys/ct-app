import React from 'react';
import { usePulseAlerts } from '@/hooks/usePulseAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export const MarketPulseAlerts = () => {
  const { alerts, isLoading } = usePulseAlerts();

  return (
    <Card className="h-full border-border/40 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col">
      <CardHeader className="py-3 px-4 border-b border-border/40">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary" />
          Pulse Alerts <span className="text-muted-foreground text-sm font-normal">(Last 14 Days)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        {isLoading && alerts.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col divide-y divide-border/40">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No threshold crossings detected in the last 14 days.
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{alert.symbol}</span>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                          {alert.interval}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(alert.timestamp, 'MMM d, HH:mm')}
                      </span>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Price:</span>
                        <span className="text-sm font-mono">${alert.price.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="text-xs text-muted-foreground">Pulse:</span>
                         <span className={`text-sm font-mono font-medium ${Math.abs(alert.pulseValue) > alert.threshold * 1.5 ? 'text-red-400' : 'text-orange-400'}`}>
                           {alert.pulseValue.toFixed(2)}
                         </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};