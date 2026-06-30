import { readFileSync, writeFileSync } from "node:fs";
import {
  calculateDukascopyQuoteSummary,
  calculateTrueOrderFlowSummary,
  parseDatabentoOrderFlowCsv,
  parseDukascopyBidAskCsv,
} from "../src/lib/data-handlers/microstructure-data";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = arg("--input");
const type = arg("--type");
const output = arg("--output") ?? ".scratch/microstructure-report.json";
const tickSize = Number(arg("--tick-size") ?? "0.0001");
const pipSize = Number(arg("--pip-size") ?? "0.0001");

if (!input || !type) {
  throw new Error(
    "Usage: tsx scripts/analyze_microstructure_csv.ts --type dukascopy|databento --input file.csv [--output report.json]"
  );
}

const csv = readFileSync(input, "utf8");
const report =
  type === "dukascopy"
    ? calculateDukascopyQuoteSummary(parseDukascopyBidAskCsv(csv), pipSize)
    : type === "databento"
      ? calculateTrueOrderFlowSummary(parseDatabentoOrderFlowCsv(csv), tickSize)
      : (() => {
          throw new Error(`Unsupported type: ${type}`);
        })();

writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
