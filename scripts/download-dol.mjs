/**
 * download-dol.mjs
 *
 * Downloads DOL OFLC LCA and PERM quarterly XLSX files into data/raw/.
 * Mirrors the "Download DOL OFLC XLSX files" step in .github/workflows/update-data.yml
 * so you can run the full build pipeline locally on Windows or Mac without bash.
 *
 * Usage:
 *   node scripts/download-dol.mjs           # auto-detect current fiscal year/quarter
 *   node scripts/download-dol.mjs --fy 2026 # override fiscal year
 *
 * Files that don't exist yet on DOL's server (future quarters) are skipped with a warning.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAW_DIR = path.join(rootDir, "data", "raw");
const BASE = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";

// ── Determine current DOL fiscal year & quarter ───────────────────────────────
// DOL FY: Oct 1 – Sep 30.  Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
function currentPeriod(overrideFY) {
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();
  let fy, q;
  if (month >= 10) { fy = year + 1; q = 1; }
  else if (month <= 3) { fy = year; q = 2; }
  else if (month <= 6) { fy = year; q = 3; }
  else { fy = year; q = 4; }
  return { fy: overrideFY ?? fy, q, prevFY: (overrideFY ?? fy) - 1 };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fy") args.fy = Number(argv[++i]);
  }
  return args;
}

// ── Download helper ───────────────────────────────────────────────────────────
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return false; // not yet published
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
  const kb = Math.round(buf.byteLength / 1024);
  process.stdout.write(`  ✓ ${path.basename(dest)} (${kb.toLocaleString()} KB)\n`);
  return true;
}

async function tryDownload(filename) {
  const url = `${BASE}/${filename}`;
  const dest = path.join(RAW_DIR, filename);
  if (fs.existsSync(dest)) {
    const kb = Math.round(fs.statSync(dest).size / 1024);
    process.stdout.write(`  ↩ ${filename} already exists (${kb.toLocaleString()} KB) — skipping\n`);
    return true;
  }
  const ok = await download(url, dest);
  if (!ok) process.stdout.write(`  ✗ ${filename} — not yet published, skipping\n`);
  return ok;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const { fy, q, prevFY } = currentPeriod(args.fy);

console.log(`\nDOL OFLC download — FY${fy} (current), FY${prevFY} (previous)\n`);
fs.mkdirSync(RAW_DIR, { recursive: true });

let downloaded = 0;

console.log(`=== Current FY${fy} LCA (Q1 through Q${q}) ===`);
for (let qn = 1; qn <= q; qn++) {
  const ok = await tryDownload(`LCA_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
  if (ok) downloaded++;
}

console.log(`\n=== Previous FY${prevFY} LCA (all quarters) ===`);
for (let qn = 1; qn <= 4; qn++) {
  const ok = await tryDownload(`LCA_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
  if (ok) downloaded++;
}

console.log(`\n=== Current FY${fy} PERM (Q1 through Q${q}) ===`);
for (let qn = 1; qn <= q; qn++) {
  const ok = await tryDownload(`PERM_Disclosure_Data_FY${fy}_Q${qn}.xlsx`);
  if (ok) downloaded++;
}

console.log(`\n=== Previous FY${prevFY} PERM (all quarters) ===`);
for (let qn = 1; qn <= 4; qn++) {
  const ok = await tryDownload(`PERM_Disclosure_Data_FY${prevFY}_Q${qn}.xlsx`);
  if (ok) downloaded++;
}

console.log(`\nDownloaded ${downloaded} file(s) to ${RAW_DIR}\n`);

if (downloaded === 0) {
  console.error("No files downloaded — aborting.");
  process.exit(1);
}
