# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Run all unit tests
node --test

# Build the sponsorship data index from DOL OFLC CSV/XLSX files
node scripts/prepare-data.mjs --lca <file> --perm <file> --out extension/data/sponsorship-index.json

# Validate the generated index against known employers
node scripts/index-smoke.mjs

# Chrome service worker smoke test (requires Chrome running with remote debugging)
node scripts/chrome-smoke.mjs

# Full end-to-end test against real job postings (requires Chrome with extension loaded)
node scripts/e2e-smoke.mjs [--greenhouse-url <url>] [--workday-url <url>] [--skip-greenhouse] [--skip-workday]
```

### Running a single test
Node's built-in test runner has no single-test flag — use `--test-name-pattern`:
```powershell
node --test --test-name-pattern "biweekly"
```

### Starting Chrome for smoke/e2e tests
```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch-chrome.ps1
# Chrome path: C:\Program Files\Google\Chrome\Application\chrome.exe
```

## Architecture

### Message flow
```
Job page (content script)
  → chrome.runtime.sendMessage(JOB_CONTEXT_FOUND)
  → background.js (service worker)
      stores context in latestContextByTab Map
      pushes CONTEXT_UPDATED to open panel
  → panel.js calls GET_PANEL_DATA
  → background.js runs lookupSponsorship(index, company, title)
  → panel.js renders result
```

### Key files

| File | Role |
|------|------|
| `extension/src/background.js` | Service worker. Owns `latestContextByTab` (in-memory, lost on SW restart) and `panelEnabledTabs`. Handles three message types: `JOB_CONTEXT_FOUND`, `GET_PANEL_DATA`, `LOOKUP_OVERRIDE`. |
| `extension/src/content/job-extractor.js` | Content script for `*.greenhouse.io` and `*.myworkdayjobs.com` / `*.workdayjobs.com`. Multi-heuristic detection (JSON-LD → OpenGraph → h1 → title → URL slug). Sends context at load + 1s + 3s, then via MutationObserver (disconnects after first successful send). |
| `extension/src/shared/normalization.js` | IIFE on `globalThis.VisaSponsor`. `normalizeEmployer` strips legal suffixes. `titleSimilarity` uses Jaccard with stop words. Used by both content script and service worker. |
| `extension/src/shared/lookup.js` | IIFE on `globalThis.VisaSponsor`. `lookupSponsorship` → `findEmployer` (exact → alias → O(n) substring) → `bestTitleStats` (exact → ≥0.45 Jaccard) → `addStats` (weighted-average wages across years). |
| `extension/src/sidepanel/panel.js` | Panel controller. Listens for `CONTEXT_UPDATED` from background to auto-refresh. Reload button (↺) triggers `loadPanelData()` manually. |
| `scripts/prepare-data.mjs` | Builds `extension/data/sponsorship-index.json` from DOL OFLC CSV/XLSX files. Groups by employer → fiscal year → job title. Fiscal years are inferred from filenames (`FY2026`, `FY2025`, etc.) — no hardcoded filter. `partialYear` defaults to the most recent year found. |

### Data index shape
```js
{
  metadata: { fiscalYears: [2026, 2025], partialYear: 2026, coverageLabel: "...", ... },
  employers: {
    "GOOGLE LLC": {
      displayName: "Google LLC",
      years: {
        "2026": {
          summary: { lca: { employerTotal, certified, denied, withdrawn, avgWage, minWage, maxWage }, perm: {...} },
          titles: { "SOFTWARE ENGINEER": { lca: {...}, perm: {...} } }
        }
      }
    }
  },
  aliases: { "GOOGLE": "GOOGLE LLC" }
}
```

### IIFE pattern for shared code
`normalization.js` and `lookup.js` use `(function(root){ ... })(globalThis)` so they work as both MV3 content scripts (no ESM) and in Node.js tests (via `globalThis.VisaSponsor`). `prepare-data.mjs` duplicates `LEGAL_SUFFIXES` from `normalization.js` — keep both in sync when editing.

### Custom-domain Greenhouse boards
Content script only runs on `*.greenhouse.io`, `*.myworkdayjobs.com`, `*.workdayjobs.com`. Company career pages on custom domains (e.g. `navan.com/careers`) are not detected — users must use the manual lookup form in the panel.

### What's gitignored
- `extension/data/sponsorship-index.json` — generated, up to ~124 MB
- `.chrome-test-profile/`, `.chrome-smoke-profile*/` — Chrome test profiles
- `.claude/` — local Claude Code config
