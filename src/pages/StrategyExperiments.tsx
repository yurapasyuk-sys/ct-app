import { useEffect, useMemo, useState } from "react";
import { AlertCircleIcon, FlaskConicalIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpandableResultCard } from "@/components/ui/expandable-result-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortKey = "ranking_score" | "profit_factor" | "win_rate" | "expectancy_r" | "trades" | "net_profit";
type DirectionFilter = "all" | "long_only" | "short_only";
type FamilyFilter = string;

interface ExperimentMetrics {
  trades: number;
  winners: number;
  losers: number;
  breakeven: number;
  win_rate: number;
  resolved_win_rate: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
  final_equity: number;
  partial_win_rate?: number;
  full_tp_rate?: number;
}

interface BreakdownRow {
  key: string;
  trades: number;
  win_rate: number;
  resolved_win_rate?: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  max_drawdown: number;
}

interface CostRow {
  cost_pips: number;
  net_profit: number;
  profit_factor: number;
  expectancy_r: number;
  win_rate: number;
  resolved_win_rate?: number;
  max_drawdown: number;
}

interface ExperimentReport {
  symbol: string;
  variant_name: string;
  strategy_family?: string;
  status?: "success" | "failed";
  error_message?: string;
  metrics: ExperimentMetrics;
  ranking_score: number;
  warnings: string[];
  paper_testing_assessment?: {
    status: "pass" | "fail";
    reasons: string[];
    profit_factor_after_0_5_pip_cost: number;
    profit_factor_after_1_pip_cost: number;
    expectancy_r_after_0_5_pip_cost: number;
    expectancy_r_after_1_pip_cost: number;
  };
  execution_cost_simulation?: CostRow[];
  direction_breakdown?: BreakdownRow[];
  liquidity_source_breakdown?: BreakdownRow[];
  outlier_dependency: {
    percent_profit_from_top_3_trades: number;
    net_profit_without_top_3_trades: number;
  };
}

interface ExperimentSummary {
  suite_name?: string;
  suite_version?: string;
  generated_at: string;
  warnings: string[];
  reports: ExperimentReport[];
  best_variant: ExperimentReport | null;
  paper_testing_candidates?: ExperimentReport[];
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "Infinity";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "Infinity";
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value, 1)}%`;
}

function sortValue(report: ExperimentReport, key: SortKey) {
  if (key === "profit_factor") return report.metrics.profit_factor;
  if (key === "win_rate") return report.metrics.win_rate;
  if (key === "expectancy_r") return report.metrics.expectancy_r;
  if (key === "trades") return report.metrics.trades;
  if (key === "net_profit") return report.metrics.net_profit;
  return report.ranking_score;
}

function familyFor(report: ExperimentReport): string {
  if (report.strategy_family) return report.strategy_family;
  if (report.variant_name.startsWith("bios_")) return "BIOS";
  if (report.variant_name.startsWith("order_flow_proxy")) return "Order Flow Proxy";
  return "ICT";
}

function costPf(report: ExperimentReport, costPips: number) {
  return report.execution_cost_simulation?.find((row) => row.cost_pips === costPips)?.profit_factor ?? 0;
}

export default function StrategyExperiments() {
  const [summary, setSummary] = useState<ExperimentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("net_profit");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("ALL");
  const [strategyFilter, setStrategyFilter] = useState("ALL");

  useEffect(() => {
    let cancelled = false;
    fetch("/exports/all_strategy_backtest_matrix_summary.json")
      .then(async (response) => {
        if (response.ok) return response.json() as Promise<ExperimentSummary>;
        const bios = await fetch("/exports/bios_orderflow_experiment_summary.json");
        if (bios.ok) return bios.json() as Promise<ExperimentSummary>;
        const ict = await fetch("/exports/ict_fvg_experiment_summary.json");
        if (!ict.ok) throw new Error(`Experiment summary not found: ${response.status}`);
        return ict.json() as Promise<ExperimentSummary>;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Failed to load experiments.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const symbols = useMemo(
    () => ["ALL", ...new Set((summary?.reports ?? []).map((report) => report.symbol))],
    [summary]
  );
  const families = useMemo(
    () => ["ALL", ...new Set((summary?.reports ?? []).map((report) => familyFor(report)))],
    [summary]
  );
  const strategies = useMemo(
    () => ["ALL", ...new Set((summary?.reports ?? []).map((report) => report.variant_name))],
    [summary]
  );

  const rows = useMemo(() => {
    return (summary?.reports ?? [])
      .filter((report) => symbol === "ALL" || report.symbol === symbol)
      .filter((report) => familyFilter === "ALL" || familyFor(report) === familyFilter)
      .filter((report) => strategyFilter === "ALL" || report.variant_name === strategyFilter)
      .filter((report) => {
        if (directionFilter === "long_only") return report.variant_name === "v3_long_only";
        if (directionFilter === "short_only") return report.variant_name === "v3_short_only";
        return true;
      })
      .sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
  }, [directionFilter, familyFilter, sortKey, strategyFilter, summary, symbol]);

  const best = summary?.best_variant ?? null;

  return (
    <div className="flex min-h-[720px] w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden">
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-hidden rounded-lg">
          <CardHeader className="pb-4">
            <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
              <FlaskConicalIcon className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{summary?.suite_name ?? "Strategy Experiments"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-2">
              <span className="text-xs uppercase text-muted-foreground">Symbol</span>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {symbols.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-muted-foreground">Family</span>
              <Select value={familyFilter} onValueChange={(value) => setFamilyFilter(value as FamilyFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {families.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "ALL" ? "All" : item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-muted-foreground">Strategy</span>
              <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strategies.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "ALL" ? "All" : item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-muted-foreground">Direction</span>
              <Select
                value={directionFilter}
                onValueChange={(value) => setDirectionFilter(value as DirectionFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="long_only">Only long</SelectItem>
                  <SelectItem value="short_only">Only short</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <span className="text-xs uppercase text-muted-foreground">Sort by</span>
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ranking_score">ranking_score</SelectItem>
                  <SelectItem value="profit_factor">profit_factor</SelectItem>
                  <SelectItem value="win_rate">win_rate</SelectItem>
                  <SelectItem value="expectancy_r">expectancy_r</SelectItem>
                  <SelectItem value="trades">trades</SelectItem>
                  <SelectItem value="net_profit">net_profit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <ExpandableResultCard
          contentClassName="space-y-2"
          title="Best variant"
          titleClassName="text-sm text-muted-foreground"
        >
            {best ? (
              <>
                <div className="break-all font-mono text-sm leading-5">{best.symbol} / {best.variant_name}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{familyFor(best)}</Badge>
                  {best.paper_testing_assessment ? (
                    <Badge variant={best.paper_testing_assessment.status === "pass" ? "default" : "destructive"}>
                      paper {best.paper_testing_assessment.status}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-2xl font-semibold">{formatNumber(best.ranking_score, 2)}</div>
                {summary?.paper_testing_candidates ? (
                  <div className="text-xs text-muted-foreground">
                    paper candidates: {summary.paper_testing_candidates.length}
                  </div>
                ) : null}
                {best.paper_testing_assessment?.reasons.length ? (
                  <div className="break-words text-xs leading-5 text-muted-foreground">
                    {best.paper_testing_assessment.reasons.join(", ")}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {best.warnings.map((warning) => (
                    <Badge key={warning} variant="secondary" className="max-w-full break-words">
                      {warning}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No experiment export loaded.</div>
            )}
        </ExpandableResultCard>
      </section>

      {error ? (
        <section className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{error}</span>
        </section>
      ) : null}

      {summary?.warnings.length ? (
        <section className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span>{summary.warnings.join("; ")}</span>
        </section>
      ) : null}

      <ExpandableResultCard
        title={
          <span className="block truncate">
            Experiment summary
            {summary ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                generated {new Date(summary.generated_at).toLocaleString()}
              </span>
            ) : null}
          </span>
        }
      >
          <div className="h-[calc(100vh-220px)] min-h-[760px] max-w-full overflow-auto rounded-md border border-border/60">
            <Table className="min-w-[1120px] table-fixed text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px] whitespace-nowrap px-3">symbol</TableHead>
                  <TableHead className="w-[104px] whitespace-nowrap px-3">family</TableHead>
                  <TableHead className="w-[190px] whitespace-nowrap px-3">variant</TableHead>
                  <TableHead className="w-[70px] whitespace-nowrap px-3 text-right">trades</TableHead>
                  <TableHead className="w-[70px] whitespace-nowrap px-3 text-right">WR</TableHead>
                  <TableHead className="hidden w-[92px] whitespace-nowrap px-3 text-right xl:table-cell">resolved</TableHead>
                  <TableHead className="w-[66px] whitespace-nowrap px-3 text-right">PF</TableHead>
                  <TableHead className="w-[86px] whitespace-nowrap px-3 text-right">exp</TableHead>
                  <TableHead className="w-[104px] whitespace-nowrap px-3 text-right">net</TableHead>
                  <TableHead className="w-[74px] whitespace-nowrap px-3 text-right">PF .5</TableHead>
                  <TableHead className="w-[74px] whitespace-nowrap px-3 text-right">PF 1</TableHead>
                  <TableHead className="hidden w-[104px] whitespace-nowrap px-3 text-right lg:table-cell">DD</TableHead>
                  <TableHead className="hidden w-[80px] whitespace-nowrap px-3 text-right xl:table-cell">top3</TableHead>
                  <TableHead className="w-[78px] whitespace-nowrap px-3 text-right">score</TableHead>
                  <TableHead className="w-[72px] whitespace-nowrap px-3">paper</TableHead>
                  <TableHead className="w-[210px] whitespace-nowrap px-3">warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((report) => (
                  <TableRow key={`${report.symbol}-${report.variant_name}`}>
                    <TableCell className="truncate px-3 py-2 font-mono text-xs">{report.symbol}</TableCell>
                    <TableCell className="truncate px-3 py-2 text-xs">{familyFor(report)}</TableCell>
                    <TableCell className="break-words px-3 py-2 font-mono text-xs leading-4">{report.variant_name}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(report.metrics.trades, 0)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatPercent(report.metrics.win_rate)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap px-3 py-2 text-right font-mono text-xs xl:table-cell">{formatPercent(report.metrics.resolved_win_rate)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(report.metrics.profit_factor, 2)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(report.metrics.expectancy_r, 3)}R</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatCurrency(report.metrics.net_profit)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(costPf(report, 0.5), 2)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(costPf(report, 1), 2)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap px-3 py-2 text-right font-mono text-xs lg:table-cell">{formatCurrency(report.metrics.max_drawdown)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap px-3 py-2 text-right font-mono text-xs xl:table-cell">
                      {formatPercent(report.outlier_dependency.percent_profit_from_top_3_trades)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs">{formatNumber(report.ranking_score, 2)}</TableCell>
                    <TableCell className="px-3 py-2 text-xs">
                      {report.paper_testing_assessment ? (
                        <Badge variant={report.paper_testing_assessment.status === "pass" ? "default" : "secondary"}>
                          {report.paper_testing_assessment.status}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="break-words px-3 py-2 text-xs leading-4">
                      {report.status === "failed"
                        ? report.error_message ?? "failed"
                        : report.warnings.join(", ") || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      </ExpandableResultCard>

      {best ? (
        <section className="grid min-w-0 gap-4 lg:grid-cols-3">
          <ExpandableResultCard title="Execution cost" titleClassName="text-sm text-muted-foreground">
              <div className="max-w-full overflow-auto">
                <Table className="min-w-[460px] table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      {["cost", "PF", "WR", "net", "DD"].map((header) => (
                        <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(best.execution_cost_simulation ?? []).map((row) => (
                      <TableRow key={row.cost_pips}>
                        <TableCell className="font-mono text-xs">{row.cost_pips} pip</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumber(row.profit_factor, 2)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatPercent(row.win_rate)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCurrency(row.net_profit)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCurrency(row.max_drawdown)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </ExpandableResultCard>

          <ExpandableResultCard title="Direction breakdown" titleClassName="text-sm text-muted-foreground">
              <div className="max-w-full overflow-auto">
                <Table className="min-w-[420px] table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      {["side", "trades", "WR", "PF", "net"].map((header) => (
                        <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(best.direction_breakdown ?? []).map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-mono text-xs">{row.key}</TableCell>
                        <TableCell className="font-mono text-xs">{row.trades}</TableCell>
                        <TableCell className="font-mono text-xs">{formatPercent(row.win_rate)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumber(row.profit_factor, 2)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCurrency(row.net_profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </ExpandableResultCard>

          <ExpandableResultCard title="Liquidity breakdown" titleClassName="text-sm text-muted-foreground">
              <div className="max-w-full overflow-auto">
                <Table className="min-w-[460px] table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      {["source", "trades", "WR", "PF", "net"].map((header) => (
                        <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(best.liquidity_source_breakdown ?? []).map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-mono text-xs">{row.key}</TableCell>
                        <TableCell className="font-mono text-xs">{row.trades}</TableCell>
                        <TableCell className="font-mono text-xs">{formatPercent(row.win_rate)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumber(row.profit_factor, 2)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatCurrency(row.net_profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </ExpandableResultCard>
        </section>
      ) : null}
    </div>
  );
}
