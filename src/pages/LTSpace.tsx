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
  ComposedChart,
  Line,
  PieChart,
  Pie,
} from "recharts";
import { ArrowLeft, Terminal, Activity, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import ltSpaceLogo from "../assets/calogo.png";
import cexHoldingsData from "../assets/cex_holdings.json";

interface CombinedChartData {
  date: string;
  met: number;
  ray: number;
}

interface EthfiTvlData {
  date: string;
  tvlEth: number;
  tvlUsd: number;
}

interface EthfiRevenueData {
  date: string;
  "Liquid Vaults": number;
  Staking: number;
  Withdrawals: number;
  "ether.fi Cash": number;
  "ether.fi Cash Borrows": number;
}

interface EthfiBuybackData {
  date: string;
  weekly: number;
  cumulative: number;
}

interface EthfiActiveLoansData {
  date: string;
  activeLoans: number;
}

interface EthfiRevenueGrowthData {
  date: string;
  growthPercent: number;
}

interface EthfiStakedData {
  date: string;
  stakedSupply: number;
  percStaked: number;
}

interface EthfiMarketShareData {
  date: string;
  totalTvl: number;
  ethfiTvl: number;
  ethfiShare: number;
}

interface EthfiCashVolumeData {
  date: string;
  volume: number;
}

interface EthfiLiquidVaultsTvlData {
  date: string;
  [key: string]: number | string;
}

interface EthfiRevenueDistributionData {
  name: string;
  value: number;
  percentage: number;
  fill: string;
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

// Helper to parse CSV
const parseCSV = (csv: string): Record<string, string>[] => {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim() || "";
    });
    return obj;
  });
};

const LTSpace = () => {
  const [activeTab, setActiveTab] = useState<"met-ray" | "ethfi">("met-ray");
  const [feesData, setFeesData] = useState<CombinedChartData[]>([]);
  const [revenueData, setRevenueData] = useState<CombinedChartData[]>([]);
  const [fdmcFeesData, setFdmcFeesData] = useState<CombinedChartData[]>([]);

  // ETHFI data states
  const [ethfiTvlData, setEthfiTvlData] = useState<EthfiTvlData[]>([]);
  const [ethfiRevenueData, setEthfiRevenueData] = useState<EthfiRevenueData[]>(
    [],
  );
  const [ethfiBuybackData, setEthfiBuybackData] = useState<EthfiBuybackData[]>(
    [],
  );
  const [ethfiActiveLoansData, setEthfiActiveLoansData] = useState<
    EthfiActiveLoansData[]
  >([]);
  const [ethfiRevenueGrowthData, setEthfiRevenueGrowthData] = useState<
    EthfiRevenueGrowthData[]
  >([]);
  const [ethfiStakedData, setEthfiStakedData] = useState<EthfiStakedData[]>([]);
  const [ethfiLrtMarketShare, setEthfiLrtMarketShare] = useState<
    EthfiMarketShareData[]
  >([]);
  const [ethfiLstMarketShare, setEthfiLstMarketShare] = useState<
    EthfiMarketShareData[]
  >([]);
  const [ethfiCashSpendVolume, setEthfiCashSpendVolume] = useState<
    EthfiCashVolumeData[]
  >([]);
  const [ethfiCashBorrowVolume, setEthfiCashBorrowVolume] = useState<
    EthfiCashVolumeData[]
  >([]);
  const [ethfiLiquidVaultsTvl, setEthfiLiquidVaultsTvl] = useState<
    EthfiLiquidVaultsTvlData[]
  >([]);
  const [ethfiRevenueDistribution, setEthfiRevenueDistribution] = useState<
    EthfiRevenueDistributionData[]
  >([]);
  const [ethfiLoading, setEthfiLoading] = useState(false);
  const [ethfiError, setEthfiError] = useState<string | null>(null);
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
            "eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3Njg4NjA2NTIsImV4cCI6MTc2ODk0NzA1Mn0.wPWh--m3-LejeuKYbAK4Nz-XuUdDbMrrMWu8VVa1Q2o",
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

  // Fetch ETHFI data when tab switches to ethfi
  useEffect(() => {
    if (activeTab !== "ethfi") return;
    if (ethfiTvlData.length > 0) return; // Already loaded

    const fetchEthfiData = async () => {
      setEthfiLoading(true);
      setEthfiError(null);
      try {
        const API_BASE = "https://api.borkiss.trade/v1/query";

        // Fetch all datasets in parallel
        // Calculate date range for Artemis API (90 days)
        const endDate = new Date();
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 90);
        const formatArtemisDate = (d: Date) => d.toISOString().split("T")[0];

        const artemisHeaders = {
          accept: "application/json, text/plain, */*",
          authorization: "_QUAsXmDQbfx12dNLKAlYhkrY4wbQBa71zfoPvWoJ05B",
          origin: "https://app.artemisanalytics.com",
          referer: "https://app.artemisanalytics.com/",
          "x-art-webtoken":
            "eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3Njg4NjA2NTIsImV4cCI6MTc2ODk0NzA1Mn0.wPWh--m3-LejeuKYbAK4Nz-XuUdDbMrrMWu8VVa1Q2o",
        };

        // Use Promise.allSettled to prevent one failing API from crashing the whole dashboard
        const results = await Promise.allSettled([
          fetch(`${API_BASE}/3961816/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(`${API_BASE}/5490119/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(`${API_BASE}/5135676/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(`${API_BASE}/4283053/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch("https://api.tokenterminal.com/trpc/metrics.postTimeseries", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer c0e5035a-64f6-4d2c-b5f6-ac1d1cb3da2f",
              "x-tt-terminal-jwt":
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmcm9udEVuZCI6InRlcm1pbmFsIGRhc2hib2FyZCIsImlhdCI6MTc2ODYxMDE3NCwiZXhwIjoxNzY5ODE5Nzc0fQ.lLTq3tyur3JRZiU8otKw4uD6BvO39M8tTg_-_BLkBXg",
            },
            body: JSON.stringify({
              data_ids: ["etherfi"],
              metric_ids: ["active_loans"],
              interval: "1095d",
              groupBy: "chain",
              includeSelf: false,
              include_products_in_project_breakdown: false,
              bridged: false,
            }),
          }).then((r) =>
            r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(
            `https://data-svc.artemisxyz.com/v2/data/LRT_TVL?symbols=bedrock,egp,ethfi,kep,puffer,rez,layer,swell&startDate=${formatArtemisDate(startDateObj)}&endDate=${formatArtemisDate(endDate)}`,
            { headers: artemisHeaders },
          ).then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))),
          fetch(
            `https://data-svc.artemisxyz.com/v2/data/LST_TVL?symbols=bnb,eq-coin,fxs,jto,kntq,ldo,mnt,mnde,rpl,sd,strd,swell&startDate=${formatArtemisDate(startDateObj)}&endDate=${formatArtemisDate(endDate)}`,
            { headers: artemisHeaders },
          ).then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))),
          fetch(`${API_BASE}/4455397/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(`${API_BASE}/4533826/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
          fetch(`${API_BASE}/4656856/results/csv`).then((r) =>
            r.ok ? r.text() : Promise.reject(`HTTP ${r.status}`),
          ),
        ]);

        // Extract values, using null for failed requests
        const getValue = <T,>(result: PromiseSettledResult<T>): T | null =>
          result.status === "fulfilled" ? result.value : null;

        const tvlCsv = getValue(results[0]) as string | null;
        const revenueCsv = getValue(results[1]) as string | null;
        const buybackCsv = getValue(results[2]) as string | null;

        // Log which requests succeeded/failed
        console.log("[ETHFI] API results:", {
          tvl: tvlCsv ? "OK" : "FAILED",
          revenue: revenueCsv ? "OK" : "FAILED",
          buyback: buybackCsv ? "OK" : "FAILED",
          staked: getValue(results[3]) ? "OK" : "FAILED",
          activeLoans: getValue(results[4]) ? "OK" : "FAILED",
          lrtTvl: getValue(results[5]) ? "OK" : "FAILED",
          lstTvl: getValue(results[6]) ? "OK" : "FAILED",
          cashSpend: getValue(results[7]) ? "OK" : "FAILED",
          cashBorrow: getValue(results[8]) ? "OK" : "FAILED",
          liquidVaults: getValue(results[9]) ? "OK" : "FAILED",
        });
        const stakedCsv = getValue(results[3]) as string | null;
        const activeLoansJson = getValue(results[4]) as any | null;
        const lrtTvlJson = getValue(results[5]) as any | null;
        const lstTvlJson = getValue(results[6]) as any | null;
        const cashSpendCsv = getValue(results[7]) as string | null;
        const cashBorrowCsv = getValue(results[8]) as string | null;
        const liquidVaultsCsv = getValue(results[9]) as string | null;

        // Log failed requests for debugging
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            const names = [
              "tvl",
              "revenue",
              "buyback",
              "staked",
              "activeLoans",
              "lrtTvl",
              "lstTvl",
              "cashSpend",
              "cashBorrow",
              "liquidVaults",
            ];
            console.warn(`[ETHFI] ${names[i]} failed:`, r.reason);
          }
        });

        // Parse TVL data (Chart 1)
        let tvlParsed: EthfiTvlData[] = [];
        if (tvlCsv) {
          try {
            const tvlRaw = parseCSV(tvlCsv);
            tvlParsed = tvlRaw
              .map((row) => ({
                date: new Date(row.day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.day).getTime(),
                tvlEth: parseFloat(row.token_supply_eth) || 0,
                tvlUsd: parseFloat(row.token_supply_usd) || 0,
              }))
              .sort((a, b) => a.rawDate - b.rawDate)
              .map(({ rawDate, ...rest }) => rest);
            setEthfiTvlData(tvlParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse TVL data:", e);
          }
        }

        // Parse Revenue data (Chart 2) - need to pivot by date and revenue_source
        let revenueParsed: EthfiRevenueData[] = [];
        if (revenueCsv) {
          try {
            console.log("[ETHFI] Revenue CSV length:", revenueCsv.length);
            const revenueRaw = parseCSV(revenueCsv);
            console.log("[ETHFI] Revenue parsed rows:", revenueRaw.length);
            if (revenueRaw.length > 0) {
              console.log(
                "[ETHFI] Revenue first row keys:",
                Object.keys(revenueRaw[0]),
              );
              console.log("[ETHFI] Revenue first row:", revenueRaw[0]);
            }
            const revenueByDate: Record<string, EthfiRevenueData> = {};
            revenueRaw.forEach((row) => {
              const dateKey = new Date(row.day).toISOString().split("T")[0];
              if (!revenueByDate[dateKey]) {
                revenueByDate[dateKey] = {
                  date: new Date(row.day).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                  }),
                  "Liquid Vaults": 0,
                  Staking: 0,
                  Withdrawals: 0,
                  "ether.fi Cash": 0,
                  "ether.fi Cash Borrows": 0,
                };
              }
              const source = row.revenue_source as keyof Omit<
                EthfiRevenueData,
                "date"
              >;
              if (source && source in revenueByDate[dateKey]) {
                revenueByDate[dateKey][source] =
                  parseFloat(row.amount_usd) || 0;
              }
            });
            revenueParsed = Object.entries(revenueByDate)
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([, data]) => data);
            console.log(
              "[ETHFI] Revenue final parsed:",
              revenueParsed.length,
              "entries",
            );
            setEthfiRevenueData(revenueParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Revenue data:", e);
          }
        }

        // Parse Buyback data (Chart 3)
        if (buybackCsv) {
          try {
            const buybackRaw = parseCSV(buybackCsv);
            const buybackParsed: EthfiBuybackData[] = buybackRaw
              .map((row) => ({
                date: new Date(row.hour).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.hour).getTime(),
                weekly: parseFloat(row.ethfi_bought) || 0,
                cumulative: parseFloat(row.cum_ethfi_bought) || 0,
              }))
              .sort((a, b) => a.rawDate - b.rawDate)
              .map(({ rawDate, ...rest }) => rest);
            setEthfiBuybackData(buybackParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Buyback data:", e);
          }
        }

        // Parse Active Loans data (Chart 6) - from TokenTerminal
        if (activeLoansJson?.result?.data?.data) {
          try {
            const loansData = activeLoansJson.result.data.data;
            const loansParsed: EthfiActiveLoansData[] = loansData
              .map((row: { timestamp: string; value: number }) => ({
                date: new Date(row.timestamp).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.timestamp).getTime(),
                activeLoans: row.value || 0,
              }))
              .sort(
                (a: { rawDate: number }, b: { rawDate: number }) =>
                  a.rawDate - b.rawDate,
              )
              .map(({ rawDate, ...rest }: { rawDate: number }) => rest);
            setEthfiActiveLoansData(loansParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Active Loans data:", e);
          }
        }

        // Parse ETHFI Staked data (Chart 8)
        if (stakedCsv) {
          try {
            const stakedRaw = parseCSV(stakedCsv);
            const stakedParsed: EthfiStakedData[] = stakedRaw
              .map((row) => ({
                date: new Date(row.day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.day).getTime(),
                stakedSupply: parseFloat(row.staked_supply) || 0,
                percStaked: parseFloat(row.perc_staked) * 100 || 0, // Convert to percentage
              }))
              .sort((a, b) => a.rawDate - b.rawDate)
              .map(({ rawDate, ...rest }) => rest);
            setEthfiStakedData(stakedParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Staked data:", e);
          }
        }

        // Calculate Revenue Growth Rate (Chart 7) - 13 week rolling sum change
        // Group revenue by week and calculate 13-week sum, then % change
        if (revenueCsv) {
          try {
            const revenueParsedForGrowth = Object.entries(
              parseCSV(revenueCsv).reduce((acc: Record<string, any>, row) => {
                const dateKey = new Date(row.day).toISOString().split("T")[0];
                if (!acc[dateKey]) {
                  acc[dateKey] = {
                    date: new Date(row.day).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    }),
                    "Liquid Vaults": 0,
                    Staking: 0,
                    Withdrawals: 0,
                    "ether.fi Cash": 0,
                    "ether.fi Cash Borrows": 0,
                  };
                }
                const source = row.revenue_source as string;
                if (source && source in acc[dateKey]) {
                  acc[dateKey][source] = parseFloat(row.amount_usd) || 0;
                }
                return acc;
              }, {}),
            )
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([, data]) => data as EthfiRevenueData);

            const weeklyTotals: { weekKey: string; total: number }[] = [];

            revenueParsedForGrowth.forEach((row) => {
              // Each row is already a week
              const total =
                row["Liquid Vaults"] +
                row.Staking +
                row.Withdrawals +
                row["ether.fi Cash"] +
                row["ether.fi Cash Borrows"];
              weeklyTotals.push({ weekKey: row.date, total });
            });

            // Calculate 13-week rolling sums and % change
            const revenueGrowthParsed: EthfiRevenueGrowthData[] = [];
            for (let i = 25; i < weeklyTotals.length; i++) {
              // Need at least 26 weeks (13 current + 13 previous)
              let currentSum = 0;
              let prevSum = 0;

              for (let j = 0; j < 13; j++) {
                currentSum += weeklyTotals[i - j].total;
                prevSum += weeklyTotals[i - 13 - j].total;
              }

              const growthPercent =
                prevSum > 0 ? ((currentSum - prevSum) / prevSum) * 100 : 0;

              revenueGrowthParsed.push({
                date: weeklyTotals[i].weekKey,
                growthPercent,
              });
            }
            setEthfiRevenueGrowthData(revenueGrowthParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Revenue Growth data:", e);
          }
        }

        // Parse LRT TVL data for Chart 4 (Restaking Market Share)
        try {
          // Build a map of ETHFI TVL by date from our TVL data
          const ethfiTvlByDate: Record<string, number> = {};
          tvlParsed.forEach((row) => {
            ethfiTvlByDate[row.date] = row.tvlUsd;
          });

          // Artemis API format: { series: [{ asset, data: [[timestamp, value], ...] }, ...] }
          if (
            lrtTvlJson &&
            lrtTvlJson.series &&
            Array.isArray(lrtTvlJson.series)
          ) {
            // Group by date and sum all protocol TVLs
            const lrtByDate: Record<string, number> = {};

            lrtTvlJson.series.forEach(
              (protocol: { asset: string; data: number[][] | string }) => {
                // Skip if data is not available (string error message)
                if (!Array.isArray(protocol.data)) return;

                protocol.data.forEach(
                  ([timestamp, value]: [number, number]) => {
                    const dateStr = new Date(timestamp).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "2-digit",
                      },
                    );
                    if (!lrtByDate[dateStr]) {
                      lrtByDate[dateStr] = 0;
                    }
                    lrtByDate[dateStr] += value || 0;
                  },
                );
              },
            );

            const lrtMarketShareParsed: EthfiMarketShareData[] = Object.entries(
              lrtByDate,
            )
              .map(([date, totalTvl]) => {
                const ethfiTvl = ethfiTvlByDate[date] || 0;
                return {
                  date,
                  totalTvl,
                  ethfiTvl,
                  ethfiShare: totalTvl > 0 ? (ethfiTvl / totalTvl) * 100 : 0,
                };
              })
              .sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime(),
              );
            setEthfiLrtMarketShare(lrtMarketShareParsed);
          }

          // Parse LST TVL data for Chart 5 (Liquid Staking Market Share)
          if (
            lstTvlJson &&
            lstTvlJson.series &&
            Array.isArray(lstTvlJson.series)
          ) {
            // Group by date and sum all protocol TVLs
            const lstByDate: Record<string, number> = {};

            lstTvlJson.series.forEach(
              (protocol: { asset: string; data: number[][] | string }) => {
                // Skip if data is not available (string error message)
                if (!Array.isArray(protocol.data)) return;

                protocol.data.forEach(
                  ([timestamp, value]: [number, number]) => {
                    const dateStr = new Date(timestamp).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "2-digit",
                      },
                    );
                    if (!lstByDate[dateStr]) {
                      lstByDate[dateStr] = 0;
                    }
                    lstByDate[dateStr] += value || 0;
                  },
                );
              },
            );

            const lstMarketShareParsed: EthfiMarketShareData[] = Object.entries(
              lstByDate,
            )
              .map(([date, totalTvl]) => {
                const ethfiTvl = ethfiTvlByDate[date] || 0;
                return {
                  date,
                  totalTvl,
                  ethfiTvl,
                  ethfiShare: totalTvl > 0 ? (ethfiTvl / totalTvl) * 100 : 0,
                };
              })
              .sort(
                (a, b) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime(),
              );
            setEthfiLstMarketShare(lstMarketShareParsed);
          }
        } catch (e) {
          console.warn("[ETHFI] Failed to parse Market Share data:", e);
        }

        // Parse Cash Spend Volume data (last 90 days)
        if (cashSpendCsv) {
          try {
            const cashSpendRaw = parseCSV(cashSpendCsv);
            const cashSpendParsed: EthfiCashVolumeData[] = cashSpendRaw
              .map((row) => ({
                date: new Date(row.day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.day).getTime(),
                volume: parseFloat(row.spend_usd) || 0,
              }))
              .sort((a, b) => a.rawDate - b.rawDate)
              .slice(-90)
              .map(
                ({
                  rawDate,
                  ...rest
                }: {
                  rawDate: number;
                  date: string;
                  volume: number;
                }) => rest,
              );
            setEthfiCashSpendVolume(cashSpendParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Cash Spend data:", e);
          }
        }

        // Parse Cash Borrow Volume data (last 90 days)
        if (cashBorrowCsv) {
          try {
            const cashBorrowRaw = parseCSV(cashBorrowCsv);
            const cashBorrowParsed: EthfiCashVolumeData[] = cashBorrowRaw
              .map((row) => ({
                date: new Date(row.day).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "2-digit",
                }),
                rawDate: new Date(row.day).getTime(),
                volume: parseFloat(row.spend_usd) || 0,
              }))
              .sort((a, b) => a.rawDate - b.rawDate)
              .slice(-90)
              .map(
                ({
                  rawDate,
                  ...rest
                }: {
                  rawDate: number;
                  date: string;
                  volume: number;
                }) => rest,
              );
            setEthfiCashBorrowVolume(cashBorrowParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Cash Borrow data:", e);
          }
        }

        // Parse Liquid Vaults TVL data - Stacked Area by vault type
        if (liquidVaultsCsv) {
          try {
            const liquidVaultsRaw = parseCSV(liquidVaultsCsv);
            const vaultsByDate: Record<string, Record<string, number>> = {};
            const vaultNames = new Set<string>();

            liquidVaultsRaw.forEach((row) => {
              const dateStr = new Date(row.day).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "2-digit",
              });
              const vaultName = row.enriched_symbol || row.symbol;
              const tvl = parseFloat(row.tvl_usd) || 0;

              vaultNames.add(vaultName);

              if (!vaultsByDate[dateStr]) {
                vaultsByDate[dateStr] = {
                  rawDate: new Date(row.day).getTime(),
                };
              }
              vaultsByDate[dateStr][vaultName] = tvl;
            });

            const liquidVaultsParsed: EthfiLiquidVaultsTvlData[] =
              Object.entries(vaultsByDate)
                .map(([date, vaults]) => ({
                  date,
                  rawDate: vaults.rawDate as number,
                  ...Object.fromEntries(
                    Array.from(vaultNames).map((name) => [
                      name,
                      vaults[name] || 0,
                    ]),
                  ),
                }))
                .sort((a, b) => (a.rawDate as number) - (b.rawDate as number))
                .slice(-90)
                .map(
                  ({ rawDate, ...rest }) => rest as EthfiLiquidVaultsTvlData,
                );
            setEthfiLiquidVaultsTvl(liquidVaultsParsed);
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Liquid Vaults data:", e);
          }
        }

        // Parse Revenue Distribution (last week from revenue data)
        if (revenueParsed.length > 0) {
          try {
            // Find the latest week and calculate totals by source
            const revenueColors: Record<string, string> = {
              "Liquid Vaults": "#22c55e",
              Staking: "#6366f1",
              Withdrawals: "#f59e0b",
              "ether.fi Cash": "#a855f7",
              "ether.fi Cash Borrows": "#ef4444",
            };

            // Get the latest week's data
            const sortedRevenue = [...revenueParsed].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            );
            const latestWeek = sortedRevenue[0];

            if (latestWeek) {
              const sources = [
                { name: "Liquid Vaults", value: latestWeek["Liquid Vaults"] },
                { name: "Staking", value: latestWeek.Staking },
                { name: "Withdrawals", value: latestWeek.Withdrawals },
                { name: "ether.fi Cash", value: latestWeek["ether.fi Cash"] },
                {
                  name: "ether.fi Cash Borrows",
                  value: latestWeek["ether.fi Cash Borrows"],
                },
              ];

              const total = sources.reduce((sum, s) => sum + s.value, 0);

              const distributionParsed: EthfiRevenueDistributionData[] = sources
                .filter((s) => s.value > 0)
                .map((s) => ({
                  name: s.name,
                  value: s.value,
                  percentage: total > 0 ? (s.value / total) * 100 : 0,
                  fill: revenueColors[s.name] || "#525252",
                }))
                .sort((a, b) => b.value - a.value);

              setEthfiRevenueDistribution(distributionParsed);
            }
          } catch (e) {
            console.warn("[ETHFI] Failed to parse Revenue Distribution:", e);
          }
        }
      } catch (err) {
        // Just log the error - individual charts will be empty but dashboard won't crash
        console.error("Error fetching ETHFI data:", err);
      } finally {
        setEthfiLoading(false);
      }
    };

    fetchEthfiData();
  }, [activeTab, ethfiTvlData.length]);

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

  const visibleCexHoldings = useMemo(() => {
    if (!cexHoldingsData || cexHoldingsData.length === 0) return [];
    const sliced = cexHoldingsData.slice(-timeframe);
    return sliced.map((item) => ({
      ...item,
      date: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
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

      {/* Tabs */}
      <div className="relative z-10 flex gap-2 mb-8">
        <button
          onClick={() => setActiveTab("met-ray")}
          className={`px-6 py-3 font-mono text-sm transition-all rounded-sm ${
            activeTab === "met-ray"
              ? "bg-white text-black font-bold border border-white"
              : "bg-neutral-900/50 text-neutral-400 border border-white/10 hover:text-white hover:border-white/20"
          }`}
        >
          MET vs RAY
        </button>
        <button
          onClick={() => setActiveTab("ethfi")}
          className={`px-6 py-3 font-mono text-sm transition-all rounded-sm ${
            activeTab === "ethfi"
              ? "bg-white text-black font-bold border border-white"
              : "bg-neutral-900/50 text-neutral-400 border border-white/10 hover:text-white hover:border-white/20"
          }`}
        >
          ETHFI
        </button>
      </div>

      {/* Content Grid */}
      {activeTab === "met-ray" && (
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
                        <stop
                          offset="5%"
                          stopColor="#38bdf8"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#38bdf8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorRayFdmcFees"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#f472b6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#f472b6"
                          stopOpacity={0}
                        />
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
                        <stop
                          offset="5%"
                          stopColor="#2dd4bf"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#2dd4bf"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorRayFdmcRev"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#fb7185"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#fb7185"
                          stopOpacity={0}
                        />
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
          </div>

          {/* Bottom Grid: Sankey & CEX */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10 mt-8">
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

            {/* CEX Holdings Chart */}
            <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  MET HELD ON CEXs
                </h3>
                <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                  DAILY TIMEFRAME
                </span>
              </div>

              <div className="h-[600px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleCexHoldings}>
                    <defs>
                      <linearGradient
                        id="colorBybit"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#e88a0e"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#e88a0e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorKuCoin"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#6cd88e"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6cd88e"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorMEXC"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#43d4dd"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#43d4dd"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorBitget"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#4773b4"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#4773b4"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="colorOKX" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#484646"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#484646"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorOther"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#9a9595"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#9a9595"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#555"
                      tick={{ fill: "#666", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#555"
                      tick={{ fill: "#666", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) =>
                        new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(val)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        borderColor: "#374151",
                        color: "#F3F4F6",
                      }}
                      itemStyle={{ color: "#F3F4F6" }}
                      formatter={(value: number) =>
                        new Intl.NumberFormat("en-US").format(value)
                      }
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="Other"
                      stackId="1"
                      stroke="#9a9595"
                      fill="url(#colorOther)"
                    />
                    <Area
                      type="monotone"
                      dataKey="Bitget"
                      stackId="1"
                      stroke="#4773b4"
                      fill="url(#colorBitget)"
                    />
                    <Area
                      type="monotone"
                      dataKey="KuCoin"
                      stackId="1"
                      stroke="#6cd88e"
                      fill="url(#colorKuCoin)"
                    />
                    <Area
                      type="monotone"
                      dataKey="MEXC"
                      stackId="1"
                      stroke="#43d4dd"
                      fill="url(#colorMEXC)"
                    />
                    <Area
                      type="monotone"
                      dataKey="Bybit"
                      stackId="1"
                      stroke="#e88a0e"
                      fill="url(#colorBybit)"
                    />
                    <Area
                      type="monotone"
                      dataKey="OKX"
                      stackId="1"
                      stroke="#484646"
                      fill="url(#colorOKX)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ETHFI Tab Content */}
      {activeTab === "ethfi" && (
        <div className="space-y-8 relative z-10">
          {ethfiLoading ? (
            <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm">
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Loader2 className="w-16 h-16 text-neutral-500 mx-auto mb-4 animate-spin" />
                  <h3 className="text-xl font-bold text-neutral-500 mb-2">
                    LOADING ETHFI DATA
                  </h3>
                  <p className="text-neutral-600 font-mono text-sm">
                    Fetching from API...
                  </p>
                </div>
              </div>
            </div>
          ) : ethfiError ? (
            <div className="bg-[#0A0A0A] border border-red-500/20 p-6 rounded-lg backdrop-blur-sm">
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Activity className="w-16 h-16 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-red-400 mb-2">ERROR</h3>
                  <p className="text-neutral-500 font-mono text-sm">
                    {ethfiError}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Chart 1: TVL (Native) & TVL (USD) - Dual Axis Area Chart */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    eETH TVL (ETH & USD)
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY TIMEFRAME
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={ethfiTvlData}>
                      <defs>
                        <linearGradient
                          id="colorTvlEth"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#a855f7"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#a855f7"
                            stopOpacity={0}
                          />
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="left"
                        orientation="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#a855f7",
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        tickFormatter={(value) =>
                          `${Intl.NumberFormat("en-US", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(value)}`
                        }
                        label={{
                          value: "TVL (ETH)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#a855f7",
                          fontSize: 11,
                          fontFamily: "monospace",
                        }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
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
                        label={{
                          value: "TVL (USD)",
                          angle: 90,
                          position: "insideRight",
                          fill: "#525252",
                          fontSize: 11,
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
                        formatter={(value: number, name: string) => {
                          if (name === "TVL (ETH)") {
                            return `${Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 0,
                            }).format(value)} ETH`;
                          }
                          return `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`;
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-sm ml-2">
                            {value}
                          </span>
                        )}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="tvlEth"
                        name="TVL (ETH)"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fill="url(#colorTvlEth)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="tvlUsd"
                        name="TVL (USD)"
                        stroke="#ffffff"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Revenue by Product - Stacked Bar Chart */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ETHER.FI REVENUE BY PRODUCT
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    WEEKLY
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiRevenueData}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                          `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`
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
                        dataKey="Staking"
                        stackId="revenue"
                        fill="#525252"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="Withdrawals"
                        stackId="revenue"
                        fill="#6366f1"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="Liquid Vaults"
                        stackId="revenue"
                        fill="#22c55e"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="ether.fi Cash Borrows"
                        stackId="revenue"
                        fill="#ef4444"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="ether.fi Cash"
                        stackId="revenue"
                        fill="#a855f7"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Buybacks - Bar + Line Chart */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ETHFI BUYBACKS
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    WEEKLY
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={ethfiBuybackData}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="left"
                        orientation="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#6366f1",
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        tickFormatter={(value) =>
                          Intl.NumberFormat("en-US", {
                            notation: "compact",
                            maximumFractionDigits: 0,
                          }).format(value)
                        }
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#525252",
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        tickFormatter={(value) =>
                          Intl.NumberFormat("en-US", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(value)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#000",
                          borderColor: "#333",
                          color: "#fff",
                        }}
                        itemStyle={{ color: "#fff" }}
                        formatter={(value: number, name: string) =>
                          `${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)} ETHFI`
                        }
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-sm ml-2">
                            {value}
                          </span>
                        )}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="weekly"
                        name="Weekly"
                        fill="#6366f1"
                        radius={[2, 2, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulative"
                        name="Cum. ETHFI Bought"
                        stroke="#ffffff"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 4: ETHFI Market Share of Total Restaking TVL */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ETHFI MARKET SHARE OF RESTAKING TVL
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • LRT
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiLrtMarketShare}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                        formatter={(value: number, name: string) => {
                          if (name === "ETHFI Share %") {
                            return `${value.toFixed(2)}%`;
                          }
                          return `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`;
                        }}
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
                        dataKey="totalTvl"
                        name="Total LRT TVL"
                        fill="#525252"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="ethfiTvl"
                        name="ETHFI TVL"
                        fill="#a855f7"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {ethfiLrtMarketShare.length > 0 && (
                  <div className="mt-4 text-center">
                    <span className="text-sm font-mono text-neutral-400">
                      Current ETHFI Share:{" "}
                      <span className="text-a855f7 font-bold">
                        {ethfiLrtMarketShare[
                          ethfiLrtMarketShare.length - 1
                        ]?.ethfiShare.toFixed(2)}
                        %
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Chart 5: ETHFI Market Share of Total Liquid Staking TVL */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ETHFI MARKET SHARE OF LIQUID STAKING TVL
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • LST
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiLstMarketShare}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                        formatter={(value: number, name: string) => {
                          if (name === "ETHFI Share %") {
                            return `${value.toFixed(2)}%`;
                          }
                          return `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`;
                        }}
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
                        dataKey="totalTvl"
                        name="Total LST TVL"
                        fill="#525252"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="ethfiTvl"
                        name="ETHFI TVL"
                        fill="#22c55e"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {ethfiLstMarketShare.length > 0 && (
                  <div className="mt-4 text-center">
                    <span className="text-sm font-mono text-neutral-400">
                      Current ETHFI Share:{" "}
                      <span className="text-green-500 font-bold">
                        {ethfiLstMarketShare[
                          ethfiLstMarketShare.length - 1
                        ]?.ethfiShare.toFixed(2)}
                        %
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Chart 6: Active Loans - Area Chart */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ACTIVE LOANS (ETHER.FI CASH)
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • SCROLL
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ethfiActiveLoansData}>
                      <defs>
                        <linearGradient
                          id="colorActiveLoans"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#22c55e"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#22c55e"
                            stopOpacity={0}
                          />
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-sm ml-2">
                            {value}
                          </span>
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="activeLoans"
                        name="Active Loans"
                        stroke="#22c55e"
                        strokeWidth={2}
                        fill="url(#colorActiveLoans)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 7: Revenue Growth Rate - Bar Chart */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    REVENUE GROWTH RATE (90D)
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    % CHANGE OF 13W SUM
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiRevenueGrowthData}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                        dataKey="growthPercent"
                        name="Growth %"
                        fill="#f59e0b"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 8: ETHFI Staked - Dual Axis Area + Line */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    ETHFI STAKED
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={ethfiStakedData}>
                      <defs>
                        <linearGradient
                          id="colorStakedSupply"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0}
                          />
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="left"
                        orientation="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#8b5cf6",
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        tickFormatter={(value) =>
                          Intl.NumberFormat("en-US", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(value)
                        }
                        label={{
                          value: "Staked Supply",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#8b5cf6",
                          fontSize: 11,
                          fontFamily: "monospace",
                        }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fill: "#06b6d4",
                          fontSize: 10,
                          fontFamily: "monospace",
                        }}
                        tickFormatter={(value) => `${value.toFixed(1)}%`}
                        label={{
                          value: "% Staked",
                          angle: 90,
                          position: "insideRight",
                          fill: "#06b6d4",
                          fontSize: 11,
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
                        formatter={(value: number, name: string) => {
                          if (name === "% Staked") {
                            return `${value.toFixed(2)}%`;
                          }
                          return Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value);
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-sm ml-2">
                            {value}
                          </span>
                        )}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="stakedSupply"
                        name="Staked Supply"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#colorStakedSupply)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="percStaked"
                        name="% Staked"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart: Cash Spend Volume */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    CASH: SPEND VOLUME
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • LAST 90D
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiCashSpendVolume}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                          `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`
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
                        dataKey="volume"
                        name="Daily Spend"
                        fill="#a855f7"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart: Cash Borrow Volume */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    CASH: BORROW VOLUME
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • LAST 90D
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ethfiCashBorrowVolume}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                          `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`
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
                        dataKey="volume"
                        name="Daily Borrow"
                        fill="#6366f1"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart: Liquid Vaults TVL - Stacked Area */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    LIQUID VAULTS TVL
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    DAILY • LAST 90D
                  </span>
                </div>

                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ethfiLiquidVaultsTvl}>
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
                        interval="preserveStartEnd"
                      />
                      <YAxis
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
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-xs ml-1">
                            {value}
                          </span>
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (ETH Vault)"
                        stackId="1"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (USD Vault)"
                        stackId="1"
                        stroke="#14b8a6"
                        fill="#14b8a6"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (BTC Vault)"
                        stackId="1"
                        stroke="#f59e0b"
                        fill="#f59e0b"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (Katana ETH Vault)"
                        stackId="1"
                        stroke="#525252"
                        fill="#525252"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (Bera ETH Vault)"
                        stackId="1"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (Bera BTC Vault)"
                        stackId="1"
                        stroke="#ec4899"
                        fill="#ec4899"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="UltraYield Stablecoin Vault"
                        stackId="1"
                        stroke="#eab308"
                        fill="#eab308"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Elixir Stable Vault"
                        stackId="1"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Usual Stable Vault"
                        stackId="1"
                        stroke="#a855f7"
                        fill="#a855f7"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (Move ETH Vault)"
                        stackId="1"
                        stroke="#0ea5e9"
                        fill="#0ea5e9"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="Liquid (Reserve Vault)"
                        stackId="1"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.8}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart: Revenue Distribution by Source (Last Week) */}
              <div className="bg-[#0A0A0A] border border-white/5 p-6 rounded-lg backdrop-blur-sm relative group hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    REVENUE DISTRIBUTION BY SOURCE
                  </h3>
                  <span className="text-xs font-mono text-neutral-500 bg-neutral-900 px-2 py-1 rounded">
                    LAST WEEK
                  </span>
                </div>

                <div className="h-[400px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ethfiRevenueDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={140}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percentage }) =>
                          `${name}: ${percentage.toFixed(1)}%`
                        }
                        labelLine={{ stroke: "#525252" }}
                      >
                        {ethfiRevenueDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#000",
                          borderColor: "#333",
                          color: "#fff",
                        }}
                        formatter={(value: number, name: string) => [
                          `$${Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(value)}`,
                          name,
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                          <span className="text-neutral-400 font-mono text-sm ml-2">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {ethfiRevenueDistribution.length > 0 && (
                  <div className="mt-4 text-center">
                    <span className="text-sm font-mono text-neutral-400">
                      Total Weekly Revenue:{" "}
                      <span className="text-white font-bold">
                        $
                        {Intl.NumberFormat("en-US", {
                          maximumFractionDigits: 0,
                        }).format(
                          ethfiRevenueDistribution.reduce(
                            (sum, s) => sum + s.value,
                            0,
                          ),
                        )}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LTSpace;
