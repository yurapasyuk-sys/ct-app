import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MacroCorrelations } from "@/components/macro/MacroCorrelations";

const Macro = () => {
  return (
    <div className="h-full overflow-y-auto p-8 space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Macro Environment</h2>
        <p className="text-muted-foreground">Global economic indicators and liquidity metrics.</p>
      </div>

      <MacroCorrelations />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Global M2 Supply YoY</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] flex items-center justify-center bg-muted/20 rounded-md border border-dashed border-muted-foreground/20">
              <span className="text-muted-foreground text-sm">Chart Visualization Placeholder</span>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Central Bank Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['FED', 'ECB', 'BOJ', 'PBOC', 'BOE'].map((bank) => (
                <div key={bank} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-medium">{bank}</span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">5.50%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Macro;
