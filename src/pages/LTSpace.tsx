import React, { useEffect, useState, useMemo } from "react";
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
  Sankey,
} from "recharts";
import { ArrowLeft, Terminal, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import ltSpaceLogo from "../assets/calogo.png";

interface CombinedChartData {
  date: string;
  met: number;
  ray: number;
}

const sankeyData = {
  nodes: [
    { name: "DAMM", fill: "#737373" },
    { name: "DLMM", fill: "#737373" },
    { name: "AI Agents", fill: "#ec4899" },
    { name: "Bitcoin", fill: "#f59e0b" },
    { name: "Composite Tokens", fill: "#14b8a6" },
    { name: "LST Swaps", fill: "#3b82f6" },
    { name: "Memes", fill: "#a855f7" },
    { name: "Other", fill: "#9ca3af" },
    { name: "Project Tokens", fill: "#ef4444" },
    { name: "SOL-Stablecoin", fill: "#6366f1" },
    { name: "Stablecoin Swaps", fill: "#22c55e" },
    { name: "Tokenized Assets", fill: "#eab308" },
    { name: "DBC", fill: "#8b5cf6" },
  ],
  links: [
    { source: 0, target: 2, value: 227.65 },
    { source: 0, target: 3, value: 94.02 },
    { source: 0, target: 4, value: 8.86 },
    { source: 0, target: 5, value: 755.62 },
    { source: 0, target: 6, value: 920608.86 },
    { source: 0, target: 9, value: 6296.89 },
    { source: 0, target: 8, value: 14291.76 },
    { source: 0, target: 10, value: 0.33 },
    { source: 0, target: 11, value: 493.56 },
    { source: 0, target: 7, value: 500.48 },
    { source: 1, target: 2, value: 228.67 },
    { source: 1, target: 3, value: 1198.88 },
    { source: 1, target: 4, value: 988.52 },
    { source: 1, target: 5, value: 91.19 },
    { source: 1, target: 6, value: 290085.02 },
    { source: 1, target: 9, value: 13237.32 },
    { source: 1, target: 8, value: 15024.9 },
    { source: 1, target: 10, value: 26.17 },
    { source: 1, target: 11, value: 57.84 },
    { source: 12, target: 6, value: 150000 },
    { source: 12, target: 8, value: 40000 },
    { source: 12, target: 5, value: 5000 },
  ],
};

const SankeyLink = (props: any) => {
  const { sourceX, targetX, sourceY, targetY, linkWidth, payload } = props;
  const color = payload.target.fill || "#525252";

  const path = `
    M${sourceX},${sourceY}
    C${sourceX + (targetX - sourceX) / 2},${sourceY}
     ${sourceX + (targetX - sourceX) / 2},${targetY}
     ${targetX},${targetY}
  `;

  return (
    <path
      d={path}
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      fill="none"
      opacity={0.4}
      style={{ transition: "all 0.3s" }}
    />
  );
};

const LTSpace = () => {
  const [feesData, setFeesData] = useState<CombinedChartData[]>([]);
  const [revenueData, setRevenueData] = useState<CombinedChartData[]>([]);
  const [fdmcFeesData, setFdmcFeesData] = useState<CombinedChartData[]>([]);
  const [fdmcRevenueData, setFdmcRevenueData] = useState<CombinedChartData[]>(
    [],
  );
  const [feesGrowthData, setFeesGrowthData] = useState<CombinedChartData[]>([]);
  const [revenueGrowthData, setRevenueGrowthData] = useState<
    CombinedChartData[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<30 | 60 | 90>(90);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const endDate = new Date().toISOString().split("T")[0];
        // Request 400 days to calculate 90d growth of 30d rolling sums
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 400);
        const startDate = startDateObj.toISOString().split("T")[0];

        const headers = {
          accept: "application/json, text/plain, */*",
          authorization: "_QUAsXmDQbfx12dNLKAlYhkrY4wbQBa71zfoPvWoJ05B",
          origin: "https://app.artemisanalytics.com",
          referer: "https://app.artemisanalytics.com/",
          "x-art-webtoken":
            "eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NjgzMTUxMjksImV4cCI6MTc2ODQwMTUyOX0.WFes6s4VU1ZgwEuNSzb5LxF8-jwPjOsw9zFX4ZuN25s",
        };

        const fetchEndpoint = async (metric: string, symbol: string) => {
          const res = await fetch(
            `https://data-svc.artemisxyz.com/v2/data/${metric}?symbols=${symbol}&startDate=${startDate}&endDate=${endDate}`,
            { headers },
          );
          if (!res.ok)
            throw new Error(`Failed to fetch ${metric} for ${symbol}`);
          return res.json();
        };

        // Parallel Fetching
        const [
          metFees,
          rayFees,
          metRev,
          rayRev,
          metFdmcFees,
          rayFdmcFees,
          metFdmcRev,
          rayFdmcRev,
        ] = await Promise.all([
          fetchEndpoint("FEES", "met"),
          fetchEndpoint("FEES", "ray"),
          fetchEndpoint("REVENUE", "met"),
          fetchEndpoint("REVENUE", "ray"),
          fetchEndpoint("FDMC_FEES_RATIO", "met"),
          fetchEndpoint("FDMC_FEES_RATIO", "ray"),
          fetchEndpoint("FDMC_REVENUE_RATIO", "met"),
          fetchEndpoint("FDMC_REVENUE_RATIO", "ray"),
        ]);

        // --- Helpers ---

        const getSeriesData = (
          json: any,
          symbol: string,
        ): [number, number][] => {
          const series = json.series?.find(
            (s: any) => s.asset.toLowerCase() === symbol.toLowerCase(),
          );
          return series ? series.data : [];
        };

        const mergeSeries = (
          data1: [number, number][],
          data2: [number, number][],
        ): CombinedChartData[] => {
          const merged = new Map<
            number,
            { date: string; met: number; ray: number }
          >();

          data1.forEach(([ts, val]) => {
            merged.set(ts, {
              date: new Date(ts).toISOString().slice(5, 10),
              met: val,
              ray: 0,
            });
          });

          data2.forEach(([ts, val]) => {
            if (merged.has(ts)) {
              merged.get(ts)!.ray = val;
            } else {
              merged.set(ts, {
                date: new Date(ts).toISOString().slice(5, 10),
                met: 0,
                ray: val,
              });
            }
          });

          return Array.from(merged.entries())
            .sort((a, b) => a[0] - b[0])
            .map((entry) => entry[1]);
        };

        const calculateGrowth = (
          data: [number, number][],
        ): [number, number][] => {
          // 1. Calculate Rolling 30d Sums
          const sums = data.map((_, i) => {
            if (i < 29) return null; // Need 30 days
            let s = 0;
            for (let k = 0; k < 30; k++) s += data[i - k][1];
            return s;
          });

          // 2. Calculate % Change vs 90 days ago
          return data.map((item, i) => {
            const currentSum = sums[i];
            const prevSum = i >= 90 ? sums[i - 90] : null;

            if (
              currentSum === null ||
              prevSum === null ||
              prevSum === 0 ||
              currentSum === 0
            ) {
              return [item[0], 0];
            }

            const change = ((currentSum - prevSum) / prevSum) * 100;
            return [item[0], change];
          });
        };

        // --- Data Processing ---

        // 1. Raw Series
        const metFeesData = getSeriesData(metFees, "met");
        const rayFeesData = getSeriesData(rayFees, "ray");
        const metRevData = getSeriesData(metRev, "met");
        const rayRevData = getSeriesData(rayRev, "ray");

        // 2. Main Charts (Fees, Rev)
        setFeesData(mergeSeries(metFeesData, rayFeesData));
        setRevenueData(mergeSeries(metRevData, rayRevData));

        // 3. FDMC Charts
        setFdmcFeesData(
          mergeSeries(
            getSeriesData(metFdmcFees, "met"),
            getSeriesData(rayFdmcFees, "ray"),
          ),
        );
        setFdmcRevenueData(
          mergeSeries(
            getSeriesData(metFdmcRev, "met"),
            getSeriesData(rayFdmcRev, "ray"),
          ),
        );

        // 4. Growth Charts
        const metFeesGrowth = calculateGrowth(metFeesData);
        const rayFeesGrowth = calculateGrowth(rayFeesData);
        const metRevGrowth = calculateGrowth(metRevData);
        const rayRevGrowth = calculateGrowth(rayRevData);

        setFeesGrowthData(mergeSeries(metFeesGrowth, rayFeesGrowth));
        setRevenueGrowthData(mergeSeries(metRevGrowth, rayRevGrowth));
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to initialize data stream.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Run once on mount. Timeframe filtering is done in render/useMemo.
  }, []);

  // Filter Data based on selected Timeframe
  const sliceData = (data: CombinedChartData[]) => {
    // Assuming data is daily and sorted.
    // If the API returns fewer days than requested due to gaps, we might show less.
    // .slice(-timeframe) takes the last N items.
    if (!data || data.length === 0) return [];
    return data.slice(-timeframe);
  };

  const visibleFees = useMemo(() => sliceData(feesData), [feesData, timeframe]);
  const visibleRevenue = useMemo(
    () => sliceData(revenueData),
    [revenueData, timeframe],
  );
  const visibleFdmcFees = useMemo(
    () => sliceData(fdmcFeesData),
    [fdmcFeesData, timeframe],
  );
  const visibleFdmcRev = useMemo(
    () => sliceData(fdmcRevenueData),
    [fdmcRevenueData, timeframe],
  );
  const visibleFeesGrowth = useMemo(
    () => sliceData(feesGrowthData),
    [feesGrowthData, timeframe],
  );
  const visibleRevenueGrowth = useMemo(
    () => sliceData(revenueGrowthData),
    [revenueGrowthData, timeframe],
  );

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
              <BarChart data={visibleFees}>
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
              <BarChart data={visibleRevenue}>
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

        {/* FDMC Ratio Charts */}
        <div className="grid grid-cols-1 gap-8 relative z-10 mt-8">
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
                <AreaChart data={visibleFdmcFees}>
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
                <AreaChart data={visibleFdmcRev}>
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

        {/* Growth Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10 mt-8">
          {/* Fees Growth Chart */}
          <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                FEES GROWTH RATE (90D)
              </h3>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                % CHANGE OF 30D SUM
              </span>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleFeesGrowth}>
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
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
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
                      `${Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 2,
                      }).format(value)}%`
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
                    fill="#3b82f6" // Blue
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    name="Raydium"
                    dataKey="ray"
                    fill="#a855f7" // Purple
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue Growth Chart */}
          <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                REVENUE GROWTH RATE (90D)
              </h3>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                % CHANGE OF 30D SUM
              </span>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleRevenueGrowth}>
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
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
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
                      `${Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 2,
                      }).format(value)}%`
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
                    fill="#10b981" // Green
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

          {/* Sankey Chart */}
          <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                METEORA: REVENUE SOURCES
              </h3>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                LAST 7 DAYS
              </span>
            </div>

            <div className="h-[600px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={sankeyData}
                  node={({ x, y, width, height, index, payload, fill }) => {
                    const isSource = payload.targetLinks.length === 0;

                    if (height < 10 && !isSource) {
                      return (
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={fill}
                          opacity={0.9}
                        />
                      );
                    }

                    return (
                      <g>
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={fill}
                          opacity={0.9}
                        />
                        <text
                          x={isSource ? x - 6 : x + width + 6}
                          y={y + height / 2}
                          dy={4}
                          textAnchor={isSource ? "end" : "start"}
                          fontSize={10}
                          fontFamily="monospace"
                          fontWeight="bold"
                          fill="#fff"
                          style={{
                            pointerEvents: "none",
                            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                          }}
                        >
                          {payload.name}
                        </text>
                      </g>
                    );
                  }}
                  link={<SankeyLink />}
                  nodePadding={10}
                  nodeWidth={20}
                  margin={{ left: 100, right: 150, top: 20, bottom: 20 }}
                >
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#000",
                      borderColor: "#333",
                      color: "#fff",
                    }}
                    itemStyle={{ color: "#fff" }}
                    formatter={(value: number) =>
                      `$${Intl.NumberFormat("en-US", {
                        maximumFractionDigits: 0,
                      }).format(value)}`
                    }
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LTSpace;
