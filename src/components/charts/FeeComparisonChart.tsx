import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const FeeComparisonChart = () => {
  const [tradeSize, setTradeSize] = useState([10000]);

  const data = useMemo(() => {
    const points = [];
    const size = tradeSize[0];
    
    // Fee Rates (Spot Taker)
    const binanceRate = 0.001; // 0.1%
    const bybitRate = 0.001;   // 0.1%
    const okxRate = 0.0008;    // 0.08%
    const okxRebateRate = 0.0008 * 0.85; // 15% off

    for (let i = 0; i <= 100; i += 5) {
      points.push({
        trades: i,
        Binance: Math.round(i * size * binanceRate),
        Bybit: Math.round(i * size * bybitRate),
        OKX: Math.round(i * size * okxRate),
        'OKX + Rebate': Math.round(i * size * okxRebateRate),
      });
    }
    return points;
  }, [tradeSize]);

  const totalSavings = data[data.length - 1].Binance - data[data.length - 1]['OKX + Rebate'];

  return (
    <Card className="w-full bg-card/50 backdrop-blur-sm border-border">
      <CardHeader>
        <CardTitle>Fee Comparison (100 Trades)</CardTitle>
        <CardDescription>
          Cumulative fees based on trade volume. See how much you save with OKX + Rebate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-8 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Trade Volume:</span>
            <span className="font-mono font-bold text-primary">${tradeSize[0].toLocaleString()}</span>
          </div>
          <Slider
            value={tradeSize}
            onValueChange={setTradeSize}
            min={10000}
            max={1000000}
            step={10000}
            className="w-full"
          />
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <span className="text-muted-foreground text-sm">Potential Savings: </span>
            <span className="text-xl font-bold text-primary ml-2">${totalSavings.toLocaleString()}</span>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="trades" 
                stroke="#94a3b8" 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Number of Trades', position: 'insideBottomRight', offset: -5, fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                itemStyle={{ fontSize: '12px' }}
                formatter={(value: number) => [`$${value}`, 'Fees Paid']}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              <Line type="monotone" dataKey="Binance" stroke="#F3BA2F" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="Bybit" stroke="#9ca3af" strokeWidth={3} dot={false} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="OKX" stroke="#3b82f6" strokeWidth={3} dot={false} name="OKX Standard" />
              
              <Line 
                type="monotone" 
                dataKey="OKX + Rebate" 
                stroke="#22c55e" 
                strokeWidth={4} 
                dot={{ r: 4, fill: '#22c55e' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
