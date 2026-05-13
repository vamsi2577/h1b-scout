# Visa Sponsorship Side Panel Extension

Chrome Manifest V3 extension that detects company and job title on Greenhouse and Workday job posts, then shows local DOL OFLC sponsorship statistics in Chrome's side panel.

## Load the extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the `extension` folder.

## Build the local sponsorship index

The extension reads `extension/data/sponsorship-index.json`. A small empty index is included so the UI works immediately.

To generate a real index, download the official DOL OFLC disclosure files from:

- https://www.dol.gov/agencies/eta/foreign-labor/performance

Use FY2026 current published files plus FY2025 files. Export the official `.xlsx` files to CSV, or install the optional `xlsx` package and pass the `.xlsx` files directly.

Example:

```powershell
node scripts/prepare-data.mjs `
  --lca data/raw/LCA_Disclosure_Data_FY2026_Q1.csv `
  --lca data/raw/LCA_Disclosure_Data_FY2025_Q1.csv `
  --lca data/raw/LCA_Disclosure_Data_FY2025_Q2.csv `
  --lca data/raw/LCA_Disclosure_Data_FY2025_Q3.csv `
  --lca data/raw/LCA_Disclosure_Data_FY2025_Q4.csv `
  --perm data/raw/PERM_Disclosure_Data_FY2026_Q1.csv `
  --perm data/raw/PERM_Disclosure_Data_FY2025.csv `
  --coverage "FY2026 Q1 + FY2025" `
  --out extension/data/sponsorship-index.json
```

## Test

### Unit tests

```powershell
node --test
# or
npm test
```

### Chrome smoke test (service worker only, no browser window needed)

Requires Chrome running with remote debugging. Start it first:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch-chrome.ps1
```

Then in a second terminal:

```powershell
npm run smoke:chrome
```

This verifies the service worker starts, loads the index, and can run a lookup — no page navigation required.

### End-to-end test against real job postings

With Chrome still running (from `launch-chrome.ps1`):

```powershell
npm run smoke:e2e
```

This opens real Greenhouse and Workday job pages, waits for the content script to detect the job, and verifies the sponsorship data is returned. Defaults:

| Platform   | Default test URL |
|------------|-----------------|
| Greenhouse | `boards.greenhouse.io/vercel/jobs/5370875004` |
| Workday    | `nvidia.wd5.myworkdayjobs.com/...` |

Override with your own URLs:

```powershell
npm run smoke:e2e -- --greenhouse-url "https://boards.greenhouse.io/acme/jobs/123" `
                     --workday-url "https://acme.myworkdayjobs.com/..."
```

Skip a platform if needed:

```powershell
npm run smoke:e2e -- --skip-workday
```

### Index validation (requires a real data file)

After running `prepare:data`:

```powershell
npm run smoke:index
```
