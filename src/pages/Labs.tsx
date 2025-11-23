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
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 border border-dashed border-zinc-800 rounded-lg bg-zinc-900/20">
            <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800">
              <FlaskConical className="w-8 h-8 text-zinc-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-zinc-200">Backtesting Engine</h3>
              <p className="text-zinc-500 max-w-md">
                Advanced strategy backtesting environment is currently under development. 
                Check back soon for updates.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono bg-zinc-950 px-3 py-1 rounded border border-zinc-900">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              WORK IN PROGRESS
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};


export default Labs;
