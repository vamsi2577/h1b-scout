import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const LEGAL_SUFFIXES = new Set([
  "INC",
  "INCORPORATED",
  "LLC",
  "L L C",
  "LTD",
  "LIMITED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LP",
  "LLP",
  "PLC",
  "USA",
  "US"
]);

function normalizeText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmployer(value) {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function normalizeTitle(value) {
  return normalizeText(value);
}

function parseArgs(argv) {
  const args = { lca: [], perm: [], out: "extension/data/sponsorship-index.json", shardDir: null, coverage: "FY2026 Q1 + FY2025", partialYear: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--lca") args.lca.push(argv[++index]);
    else if (arg === "--perm") args.perm.push(argv[++index]);
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--shard-dir") args.shardDir = argv[++index];
    else if (arg === "--coverage") args.coverage = argv[++index];
    else if (arg === "--partial-year") args.partialYear = Number(argv[++index]);
    else if (arg === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/prepare-data.mjs --lca <file.csv|xlsx> --perm <file.csv|xlsx> --out extension/data/sponsorship-index.json

Pass FY2026 current published files and FY2025 files. The script infers fiscal years from filenames containing FY2026 or FY2025. CSV works with no dependencies. XLSX requires optional package "xlsx".`;
}

function normalizeColumn(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvRecord(line) {
  const row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  return row;
}

async function* readCsvRows(absolutePath) {
  const lines = readline.createInterface({
    input: fs.createReadStream(absolutePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  let headers = null;
  let pending = "";
  let quoteCount = 0;

  for await (const line of lines) {
    pending = pending ? `${pending}\n${line}` : line;
    quoteCount += (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) continue;

    const values = parseCsvRecord(pending);
    pending = "";
    quoteCount = 0;

    if (!headers) {
      headers = values.map((header) => normalizeColumn(header));
      continue;
    }

    if (!values.some((value) => value.trim())) continue;
    yield Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  }
}

async function* readRows(filePath) {
  const absolutePath = path.resolve(rootDir, filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    yield* readCsvRows(absolutePath);
    return;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    let xlsx;
    try {
      xlsx = await import("xlsx");
    } catch {
      throw new Error(`Reading ${ext} requires optional dependency "xlsx". Export ${filePath} to CSV or run npm install.`);
    }
    const lib = xlsx.default ?? xlsx; // CJS package — dynamic import wraps it in .default
    const workbook = lib.readFile(absolutePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    for (const row of lib.utils.sheet_to_json(sheet, { defval: "" })) {
      yield Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeColumn(key), String(value ?? "")]));
    }
    return;
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}

function fiscalYearFromPath(filePath) {
  const match = filePath.match(/FY\s*([0-9]{4})/i);
  if (!match) throw new Error(`Cannot infer fiscal year from filename: ${filePath}`);
  return Number(match[1]);
}

function firstValue(row, columns) {
  for (const column of columns) {
    const value = row[column];
    if (value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function numberValue(value) {
  const parsed = Number(String(value || "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function annualWage(row) {
  const from = numberValue(firstValue(row, ["WAGE_RATE_OF_PAY_FROM", "WAGE_OFFER_FROM_9089", "WAGE_OFFER_FROM"]));
  const to = numberValue(firstValue(row, ["WAGE_RATE_OF_PAY_TO", "WAGE_OFFER_TO_9089", "WAGE_OFFER_TO"]));
  const unit = firstValue(row, ["WAGE_UNIT_OF_PAY", "WAGE_UNIT_OF_PAY_9089", "PW_UNIT_OF_PAY"]).toUpperCase();
  const base = from && to ? (from + to) / 2 : from || to;
  if (!base) return null;
  if (unit.includes("HOUR")) return Math.round(base * 40 * 52);
  if (unit.includes("BI")) return Math.round(base * 26);
  if (unit.includes("WEEK")) return Math.round(base * 52);
  if (unit.includes("MONTH")) return Math.round(base * 12);
  return Math.round(base);
}

function createProgramStats() {
  return {
    employerTotal: 0,
    titleTotal: 0,
    certified: 0,
    denied: 0,
    withdrawn: 0,
    wageCount: 0,
    wageSum: 0,
    minWage: null,
    maxWage: null
  };
}

function createStats() {
  return {
    lca: createProgramStats(),
    perm: createProgramStats()
  };
}

function ensureYear(index, employerKey, fiscalYear) {
  index.employers[employerKey] ||= { displayName: employerKey, years: {} };
  index.employers[employerKey].years[String(fiscalYear)] ||= { summary: createStats(), titles: {} };
  return index.employers[employerKey].years[String(fiscalYear)];
}

function ensureTitle(yearStats, titleKey) {
  yearStats.titles[titleKey] ||= createStats();
  return yearStats.titles[titleKey];
}

function addProgram(programStats, status, wage) {
  programStats.employerTotal += 1;
  const normalizedStatus = normalizeText(status);
  if (normalizedStatus.includes("WITHDRAW")) programStats.withdrawn += 1;
  else if (normalizedStatus.includes("DENIED")) programStats.denied += 1;
  else if (normalizedStatus.includes("CERTIFIED")) programStats.certified += 1;
  if (wage) {
    programStats.wageCount += 1;
    programStats.wageSum += wage;
    programStats.minWage = programStats.minWage === null ? wage : Math.min(programStats.minWage, wage);
    programStats.maxWage = programStats.maxWage === null ? wage : Math.max(programStats.maxWage, wage);
  }
}

function recordRow(index, program, fiscalYear, row) {
  const employer = firstValue(row, ["EMPLOYER_NAME", "EMPLOYER_BUSINESS_NAME", "EMPLOYER_NAME_9089"]);
  const title = firstValue(row, ["JOB_TITLE", "JOB_TITLE_9089", "SOC_TITLE"]);
  const status = firstValue(row, ["CASE_STATUS", "DECISION_STATUS", "CASE_STATUS_9089"]);
  const employerKey = normalizeEmployer(employer);
  const titleKey = normalizeTitle(title);
  if (!employerKey) return;

  const yearStats = ensureYear(index, employerKey, fiscalYear);
  index.employers[employerKey].displayName = employer || employerKey;
  const wage = program === "lca" ? annualWage(row) : null;
  addProgram(yearStats.summary[program], status, wage);

  if (titleKey) {
    const titleStats = ensureTitle(yearStats, titleKey);
    addProgram(titleStats[program], status, wage);
  }
}

function finalizeProgram(programStats) {
  programStats.avgWage = programStats.wageCount ? Math.round(programStats.wageSum / programStats.wageCount) : null;
  delete programStats.wageCount;
  delete programStats.wageSum;
  return programStats;
}

function finalizeStats(stats) {
  finalizeProgram(stats.lca);
  finalizeProgram(stats.perm);
  return stats;
}

function finalizeIndex(index) {
  for (const employer of Object.values(index.employers)) {
    for (const yearStats of Object.values(employer.years)) {
      finalizeStats(yearStats.summary);
      for (const titleStats of Object.values(yearStats.titles)) finalizeStats(titleStats);
    }
  }
  return index;
}

export async function buildIndex({ lca = [], perm = [], coverage = "FY2026 Q1 + FY2025", partialYear = null }) {
  const fiscalYears = new Set();
  const index = {
    metadata: {
      fiscalYears: [],
      partialYear: null,
      coverageLabel: coverage,
      generatedAt: new Date().toISOString(),
      source: "DOL OFLC Performance Data",
      sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
      note: "Generated from official DOL OFLC public disclosure files."
    },
    employers: {},
    aliases: {}
  };

  for (const filePath of lca) {
    const fiscalYear = fiscalYearFromPath(filePath);
    fiscalYears.add(fiscalYear);
    for await (const row of readRows(filePath)) recordRow(index, "lca", fiscalYear, row);
  }

  for (const filePath of perm) {
    const fiscalYear = fiscalYearFromPath(filePath);
    fiscalYears.add(fiscalYear);
    for await (const row of readRows(filePath)) recordRow(index, "perm", fiscalYear, row);
  }

  const sortedYears = [...fiscalYears].sort((a, b) => b - a);
  index.metadata.fiscalYears = sortedYears;
  index.metadata.partialYear = partialYear ?? (sortedYears[0] ?? null);
  return finalizeIndex(index);
}

function writeShards(index, shardDir) {
  const outDir = path.resolve(rootDir, shardDir);
  fs.mkdirSync(outDir, { recursive: true });

  // Partition employers by first letter of their normalized key (A-Z or "0" for digits/symbols)
  const buckets = new Map();
  for (const [key, employer] of Object.entries(index.employers)) {
    const first = key[0]?.toUpperCase() || "0";
    const letter = /[A-Z]/.test(first) ? first : "0";
    if (!buckets.has(letter)) {
      buckets.set(letter, { metadata: index.metadata, employers: {}, aliases: {} });
    }
    buckets.get(letter).employers[key] = employer;
  }

  // Partition aliases by the same first-letter rule as their alias key
  for (const [aliasKey, targetKey] of Object.entries(index.aliases || {})) {
    const first = aliasKey[0]?.toUpperCase() || "0";
    const letter = /[A-Z]/.test(first) ? first : "0";
    const bucket = buckets.get(letter);
    if (bucket) bucket.aliases[aliasKey] = targetKey;
  }

  for (const [letter, shard] of buckets) {
    const filePath = path.join(outDir, `sponsorship-${letter}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(shard)}\n`);
  }

  return { buckets: buckets.size, total: Object.keys(index.employers).length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const index = await buildIndex(args);
  const employerCount = Object.keys(index.employers).length;

  if (args.out) {
    const outPath = path.resolve(rootDir, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(index)}\n`);
    console.log(`Wrote ${employerCount} employers to ${outPath}`);
  }

  if (args.shardDir) {
    const { buckets } = writeShards(index, args.shardDir);
    const resolvedDir = path.resolve(rootDir, args.shardDir);
    console.log(`Wrote ${employerCount} employers across ${buckets} letter shards to ${resolvedDir}/`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
