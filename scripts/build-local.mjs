/**
 * build-local.mjs
 *
 * Full local build pipeline — mirrors the GitHub Actions workflow exactly:
 *   1. Download DOL OFLC XLSX files into data/raw/   (skips files already present)
 *   2. Build sponsorship-index.json + per-letter shards  (with progress logging)
 *   3. Run smoke test to validate the index
 *
 * Usage:
 *   node scripts/build-local.mjs
 *   node scripts/build-local.mjs --fy 2026 --coverage "FY2026 Q1 + FY2025"
 *   node scripts/build-local.mjs --skip-download   # use files already in data/raw/
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAW_DIR = path.join(rootDir, "data", "raw");
const BASE_URL = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";

// ── Args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { skipDownload: false, fy: null, coverage: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--skip-download") args.skipDownload = true;
    else if (argv[i] === "--fy") args.fy = Number(argv[++i]);
    else if (argv[i] === "--coverage") args.coverage = argv[++i];
  }
  return args;
}

// ── DOL fiscal period ─────────────────────────────────────────────────────────
// DOL FY: Oct 1 – Sep 30.  Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
function currentPeriod(overrideFY) {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  let fy, q;
  if (month >= 10) { fy = year + 1; q = 1; }
  else if (month <= 3) { fy = year; q = 2; }
  else if (month <= 6) { fy = year; q = 3; }
  else { fy = year; q = 4; }
  return { fy: overrideFY ?? fy, q, prevFY: (overrideFY ?? fy) - 1 };
}

// ── Download helper ───────────────────────────────────────────────────────────
async function tryDownload(filename) {
  const dest = path.join(RAW_DIR, filename);
  if (fs.existsSync(dest)) {
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  ↩ ${filename} already exists (${kb.toLocaleString()} KB) — skipping`);
    return dest;
  }
  const url = `${BASE_URL}/${filename}`;
  process.stdout.write(`  ↓ ${filename} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) { process.stdout.write("not yet published, skipping\n"); return null; }
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
  process.stdout.write(`${Math.round(buf.byteLength / 1024).toLocaleString()} KB ✓\n`);
  return dest;
}

async function downloadFiles(fy, q, prevFY) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const lcaFiles = [], permFiles = [];

  console.log(`\n=== FY${fy} LCA (Q1–Q${q}) ===`);
  for (let qn = 1; qn <= q; qn++) {
    const f = await tryDownload(`LCA_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
    if (f) lcaFiles.push(f);
  }
  console.log(`\n=== FY${prevFY} LCA (all quarters) ===`);
  for (let qn = 1; qn <= 4; qn++) {
    const f = await tryDownload(`LCA_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
    if (f) lcaFiles.push(f);
  }
  console.log(`\n=== FY${fy} PERM (Q1–Q${q}) ===`);
  for (let qn = 1; qn <= q; qn++) {
    const f = await tryDownload(`PERM_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
    if (f) permFiles.push(f);
  }
  console.log(`\n=== FY${prevFY} PERM (all quarters) ===`);
  for (let qn = 1; qn <= 4; qn++) {
    const f = await tryDownload(`PERM_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
    if (f) permFiles.push(f);
  }
  return { lcaFiles, permFiles };
}

function collectExistingFiles(fy, q, prevFY) {
  const lcaFiles = [], permFiles = [];
  for (let qn = 1; qn <= q; qn++) {
    const f = path.join(RAW_DIR, `LCA_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
    if (fs.existsSync(f)) lcaFiles.push(f); else console.log(`  ✗ LCA FY${fy} Q${qn} — not found in data/raw/`);
  }
  for (let qn = 1; qn <= 4; qn++) {
    const f = path.join(RAW_DIR, `LCA_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
    if (fs.existsSync(f)) lcaFiles.push(f); else console.log(`  ✗ LCA FY${prevFY} Q${qn} — not found in data/raw/`);
  }
  for (let qn = 1; qn <= q; qn++) {
    const f = path.join(RAW_DIR, `PERM_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
    if (fs.existsSync(f)) permFiles.push(f); else console.log(`  ✗ PERM FY${fy} Q${qn} — not found in data/raw/`);
  }
  for (let qn = 1; qn <= 4; qn++) {
    const f = path.join(RAW_DIR, `PERM_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
    if (fs.existsSync(f)) permFiles.push(f); else console.log(`  ✗ PERM FY${prevFY} Q${qn} — not found in data/raw/`);
  }
  return { lcaFiles, permFiles };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const { fy, q, prevFY } = currentPeriod(args.fy);
const coverage = args.coverage ?? `FY${fy} Q1 + FY${prevFY}`;

console.log("╔══════════════════════════════════════════════════╗");
console.log("║       H1B Scout — Local Build Pipeline          ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`\n  Fiscal year : FY${fy}  (current Q${q}, prev FY${prevFY})`);
console.log(`  Coverage    : ${coverage}`);
console.log(`  Raw dir     : ${RAW_DIR}`);

// ── Step 1: Download ──────────────────────────────────────────────────────────
let lcaFiles, permFiles;
if (args.skipDownload) {
  console.log("\n[1/3] Skipping download — collecting files already in data/raw/");
  ({ lcaFiles, permFiles } = collectExistingFiles(fy, q, prevFY));
} else {
  console.log("\n[1/3] Downloading DOL OFLC XLSX files...");
  ({ lcaFiles, permFiles } = await downloadFiles(fy, q, prevFY));
}
console.log(`\n  LCA: ${lcaFiles.length} file(s)  |  PERM: ${permFiles.length} file(s)`);

if (lcaFiles.length === 0 && permFiles.length === 0) {
  console.error("\nNo data files found — aborting.");
  process.exit(1);
}

// ── Step 2: Build index + shards ──────────────────────────────────────────────
console.log("\n[2/3] Building sponsorship index and shards...\n");

const lcaArgs  = lcaFiles.flatMap(f => ["--lca", f]);
const permArgs = permFiles.flatMap(f => ["--perm", f]);
const outPath  = path.join(rootDir, "extension", "data", "sponsorship-index.json");
const shardDir = path.join(rootDir, "data", "shards");

execFileSync(process.execPath, [
  path.join(rootDir, "scripts", "prepare-data.mjs"),
  ...lcaArgs,
  ...permArgs,
  "--coverage", coverage,
  "--out", outPath,
  "--shard-dir", shardDir
], { stdio: "inherit", cwd: rootDir });

// Print size summary
const indexKb = Math.round(fs.statSync(outPath).size / 1024);
const shardCount = fs.readdirSync(shardDir).filter(f => f.startsWith("sponsorship-")).length;
console.log(`\n  Full index : ${indexKb.toLocaleString()} KB`);
console.log(`  Shards     : ${shardCount} files in data/shards/`);

// ── Step 3: Smoke test ────────────────────────────────────────────────────────
console.log("\n[3/3] Running smoke test...\n");
execFileSync(process.execPath, [
  path.join(rootDir, "scripts", "index-smoke.mjs")
], { stdio: "inherit", cwd: rootDir });

console.log("\n✓ Local build complete! Reload the extension in Chrome to use fresh data.\n");
