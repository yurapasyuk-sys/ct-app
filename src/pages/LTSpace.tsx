import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { ArrowLeft, Terminal, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import ltSpaceLogo from "../assets/calogo.png";

interface CombinedChartData {
  date: string;
  met: number;
  ray: number;
}

const LTSpace = () => {
  const [feesData, setFeesData] = useState<CombinedChartData[]>([]);
  const [revenueData, setRevenueData] = useState<CombinedChartData[]>([]);
  const [fdmcFeesData, setFdmcFeesData] = useState<CombinedChartData[]>([]);
  const [fdmcRevenueData, setFdmcRevenueData] = useState<CombinedChartData[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<30 | 60 | 90>(90);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const endDate = new Date().toISOString().split("T")[0];
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - timeframe);
        const startDate = startDateObj.toISOString().split("T")[0];

        const headers = {
          accept: "application/json, text/plain, */*",
          authorization: "_QUAsXmDQbfx12dNLKAlYhkrY4wbQBa71zfoPvWoJ05B",
          origin: "https://app.artemisanalytics.com",
          referer: "https://app.artemisanalytics.com/",
          "x-art-webtoken":
            "eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NjgzMTUxMjksImV4cCI6MTc2ODQwMTUyOX0.WFes6s4VU1ZgwEuNSzb5LxF8-jwPjOsw9zFX4ZuN25s", // Ideally this should be refreshed or proxied
        };

        // Fetch MET Data (FEES)
        const metResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FEES?symbols=met&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!metResponse.ok) throw new Error("Failed to fetch MET data");
        const metJson = await metResponse.json();

        // Fetch RAY Data (FEES)
        const rayResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FEES?symbols=ray&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!rayResponse.ok) throw new Error("Failed to fetch RAY data");
        const rayJson = await rayResponse.json();

        // Fetch MET Revenue
        const metRevResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/REVENUE?symbols=met&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!metRevResponse.ok) throw new Error("Failed to fetch MET revenue");
        const metRevJson = await metRevResponse.json();

        // Fetch RAY Revenue
        const rayRevResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/REVENUE?symbols=ray&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!rayRevResponse.ok) throw new Error("Failed to fetch RAY revenue");
        const rayRevJson = await rayRevResponse.json();

        // Fetch MET FDMC/Fees Ratio
        const metFdmcFeesResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FDMC_FEES_RATIO?symbols=met&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!metFdmcFeesResponse.ok)
          throw new Error("Failed to fetch MET FDMC Fees Ratio");
        const metFdmcFeesJson = await metFdmcFeesResponse.json();

        // Fetch RAY FDMC/Fees Ratio
        const rayFdmcFeesResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FDMC_FEES_RATIO?symbols=ray&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!rayFdmcFeesResponse.ok)
          throw new Error("Failed to fetch RAY FDMC Fees Ratio");
        const rayFdmcFeesJson = await rayFdmcFeesResponse.json();

        // Fetch MET FDMC/Revenue Ratio
        const metFdmcRevResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FDMC_REVENUE_RATIO?symbols=met&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!metFdmcRevResponse.ok)
          throw new Error("Failed to fetch MET FDMC Revenue Ratio");
        const metFdmcRevJson = await metFdmcRevResponse.json();

        // Fetch RAY FDMC/Revenue Ratio
        const rayFdmcRevResponse = await fetch(
          `https://data-svc.artemisxyz.com/v2/data/FDMC_REVENUE_RATIO?symbols=ray&startDate=${startDate}&endDate=${endDate}`,
          { headers },
        );
        if (!rayFdmcRevResponse.ok)
          throw new Error("Failed to fetch RAY FDMC Revenue Ratio");
        const rayFdmcRevJson = await rayFdmcRevResponse.json();

        // Process and Merge Data
        const processAndMerge = (
          json1: any,
          symbol1: string,
          json2: any,
          symbol2: string,
        ) => {
          const getData = (json: any, sym: string) => {
            const series = json.series?.find(
              (s: any) => s.asset.toLowerCase() === sym.toLowerCase(),
            );
            return series ? series.data : [];
          };

          const data1 = getData(json1, symbol1);
          const data2 = getData(json2, symbol2);

          // Use a map to merge by timestamp
          const merged = new Map<
            number,
            { date: string; met: number; ray: number }
          >();

          data1.forEach((item: any[]) => {
            merged.set(item[0], {
              date: new Date(item[0]).toISOString().slice(5, 10),
              met: item[1],
              ray: 0,
            });
          });

          data2.forEach((item: any[]) => {
            const timestamp = item[0];
            if (merged.has(timestamp)) {
              merged.get(timestamp)!.ray = item[1];
            } else {
              merged.set(timestamp, {
                date: new Date(timestamp).toISOString().slice(5, 10),
                met: 0,
                ray: item[1],
              });
            }
          });

          // Convert to array and sort by timestamp (key)
          return Array.from(merged.entries())
            .sort((a, b) => a[0] - b[0])
            .map((entry) => entry[1]);
        };

        setFeesData(processAndMerge(metJson, "met", rayJson, "ray"));
        setRevenueData(processAndMerge(metRevJson, "met", rayRevJson, "ray"));
        setFdmcFeesData(
          processAndMerge(metFdmcFeesJson, "met", rayFdmcFeesJson, "ray"),
        );
        setFdmcRevenueData(
          processAndMerge(metFdmcRevJson, "met", rayFdmcRevJson, "ray"),
        );
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to initialize data stream.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeframe]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-[#050505] flex flex-col items-center justify-center text-white relative overflow-hidden">
        {/* Ambient Background */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[100px]" />

        <div className="z-10 flex flex-col items-center gap-6">
          <img
            src={ltSpaceLogo}
            alt="LT Space"
            className="w-48 h-48 animate-pulse rounded-full opacity-90"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="text-2xl font-mono tracking-widest font-bold">
              INITIALIZING LT SPACE
            </div>
            <div className="text-xs text-neutral-600 font-mono">
              ESTABLISHING SECURE CONNECTION...
            </div>
          </div>

          <div className="w-64 h-1 bg-neutral-900 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-white animate-progress-indeterminate"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 relative overflow-hidden selection:bg-white/20">
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />

      {/* Header */}
      <header className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-6">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-neutral-500 hover:text-white transition-colors mb-4 text-sm font-mono group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            RETURN TO BASE
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">
            LT SPACE <span className="text-neutral-600">ANALYTICS</span>
          </h1>
          <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Data Feed
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex bg-neutral-900/50 rounded-sm p-1 border border-white/10 backdrop-blur-sm">
            {[90, 60, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeframe(days as 30 | 60 | 90)}
                className={`px-3 py-1 text-xs font-mono transition-colors rounded-sm ${
                  timeframe === days
                    ? "bg-white text-black font-bold"
                    : "text-neutral-500 hover:text-white"
                }`}
              >
                {days}D
              </button>
            ))}
          </div>

          <div className="px-4 py-2 border border-white/10 rounded-sm bg-white/5 backdrop-blur-sm">
            <div className="text-[10px] text-neutral-400 font-mono mb-1">
              NETWORK STATUS
            </div>
            <div className="text-sm font-bold text-emerald-400">OPTIMAL</div>
          </div>
        </div>
      </header>

      {/* Content Grid */}
      <div className="space-y-8 relative z-10">
        {/* Fees Chart */}
        <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
              MET vs RAY FEES
            </h3>
            <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
              DAILY TIMEFRAME
            </span>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={feesData}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  dy={10}
                />
                <YAxis
                  hide={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  tickFormatter={(value) =>
                    `$${Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)}`
                  }
                />
                <Tooltip
                  cursor={{ fill: "white", opacity: 0.05 }}
                  contentStyle={{
                    backgroundColor: "#000",
                    borderColor: "#333",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) =>
                    `$${Intl.NumberFormat("en-US").format(value)}`
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="square"
                  formatter={(value) => (
                    <span className="text-neutral-400 font-mono text-sm ml-2">
                      {value}
                    </span>
                  )}
                />
                <Bar
                  name="Meteora"
                  dataKey="met"
                  fill="#06b6d4" // Cyan
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  name="Raydium"
                  dataKey="ray"
                  fill="#8b5cf6" // Purple
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
              MET vs RAY REVENUE
            </h3>
            <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
              DAILY TIMEFRAME
            </span>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  dy={10}
                />
                <YAxis
                  hide={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  tickFormatter={(value) =>
                    `$${Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value)}`
                  }
                />
                <Tooltip
                  cursor={{ fill: "white", opacity: 0.05 }}
                  contentStyle={{
                    backgroundColor: "#000",
                    borderColor: "#333",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) =>
                    `$${Intl.NumberFormat("en-US").format(value)}`
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="square"
                  formatter={(value) => (
                    <span className="text-neutral-400 font-mono text-sm ml-2">
                      {value}
                    </span>
                  )}
                />
                <Bar
                  name="Meteora"
                  dataKey="met"
                  fill="#10b981" // Emerald
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  name="Raydium"
                  dataKey="ray"
                  fill="#f97316" // Orange
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* FDMC Ratio Charts */}
      <div className="space-y-8 relative z-10 mt-8">
        {/* FDMC / Fees Chart */}
        <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
              MET vs RAY FDMC / FEES RATIO
            </h3>
            <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
              DAILY TIMEFRAME
            </span>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fdmcFeesData}>
                <defs>
                  <linearGradient
                    id="colorMetFdmcFees"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorRayFdmcFees"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#f472b6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  dy={10}
                />
                <YAxis
                  hide={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#000",
                    borderColor: "#333",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) =>
                    `${Intl.NumberFormat("en-US", {
                      maximumFractionDigits: 2,
                    }).format(value)}x`
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  formatter={(value) => (
                    <span className="text-neutral-400 font-mono text-sm ml-2">
                      {value}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  name="Meteora"
                  dataKey="met"
                  stroke="#38bdf8"
                  fillOpacity={1}
                  fill="url(#colorMetFdmcFees)"
                />
                <Area
                  type="monotone"
                  name="Raydium"
                  dataKey="ray"
                  stroke="#f472b6"
                  fillOpacity={1}
                  fill="url(#colorRayFdmcFees)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FDMC / Revenue Chart */}
        <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
              MET vs RAY FDMC / REVENUE RATIO
            </h3>
            <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
              DAILY TIMEFRAME
            </span>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fdmcRevenueData}>
                <defs>
                  <linearGradient
                    id="colorMetFdmcRev"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorRayFdmcRev"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#fb7185" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                  dy={10}
                />
                <YAxis
                  hide={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#525252",
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#000",
                    borderColor: "#333",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) =>
                    `${Intl.NumberFormat("en-US", {
                      maximumFractionDigits: 2,
                    }).format(value)}x`
                  }
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  formatter={(value) => (
                    <span className="text-neutral-400 font-mono text-sm ml-2">
                      {value}
                    </span>
                  )}
                />
                <Area
                  type="monotone"
                  name="Meteora"
                  dataKey="met"
                  stroke="#2dd4bf"
                  fillOpacity={1}
                  fill="url(#colorMetFdmcRev)"
                />
                <Area
                  type="monotone"
                  name="Raydium"
                  dataKey="ray"
                  stroke="#fb7185"
                  fillOpacity={1}
                  fill="url(#colorRayFdmcRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LTSpace;
