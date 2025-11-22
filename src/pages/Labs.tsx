import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaskConical, Play, RotateCcw, Settings2 } from "lucide-react";
import { CrossPairAnalyzer } from "@/components/labs/CrossPairAnalyzer";

const Labs = () => {
  return (
    <div className="h-full overflow-y-auto p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Research Labs</h2>
          <p className="text-muted-foreground">Quantitative analysis and strategy development environment.</p>
        </div>
      </div>

      <Tabs defaultValue="crosspairs" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="crosspairs">Cross Pairs</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
        </TabsList>

        <TabsContent value="crosspairs" className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
          <CrossPairAnalyzer />
        </TabsContent>

        <TabsContent value="backtest" className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="flex items-center justify-end gap-2 mb-4">
            <Button variant="outline" size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button size="sm">
              <Play className="mr-2 h-4 w-4" />
              Run Simulation
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-12">
            {/* Configuration Panel */}
            <Card className="md:col-span-4 lg:col-span-3 h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Strategy Model</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <option>Mean Reversion (RVWAP)</option>
                    <option>Momentum Breakout</option>
                    <option>Statistical Arbitrage</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label>Lookback Period</Label>
                  <Input type="number" defaultValue={20} />
                </div>

                <div className="space-y-2">
                  <Label>StdDev Multiplier</Label>
                  <Input type="number" defaultValue={2.0} step={0.1} />
                </div>

                <div className="space-y-2">
                  <Label>Stop Loss (%)</Label>
                  <Input type="number" defaultValue={1.5} step={0.1} />
                </div>

                <div className="space-y-2">
                  <Label>Take Profit (%)</Label>
                  <Input type="number" defaultValue={3.0} step={0.1} />
                </div>
              </CardContent>
            </Card>

            {/* Results Panel */}
            <div className="md:col-span-8 lg:col-span-9 space-y-6">
              {/* Key Metrics */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Total Return</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-500">+124.5%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Sharpe Ratio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">2.45</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Max Drawdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500">-12.3%</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Win Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">64.2%</div>
                  </CardContent>
                </Card>
              </div>

              {/* Equity Curve */}
              <Card className="h-[400px]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    Equity Curve
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-[320px] flex items-center justify-center bg-muted/10 rounded-md border border-dashed border-muted-foreground/20">
                    <span className="text-muted-foreground text-sm">Backtest Visualization Placeholder</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};


export default Labs;
