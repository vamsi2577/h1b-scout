# H1B Scout

![H1B Scout](h1b_scout_icons/h1b_scout_icon_128.png)

A Chrome extension that shows H-1B LCA and PERM sponsorship history for any employer — right from the job post. Open the side panel on any supported job board and instantly see how many sponsorships the company has filed, broken down by year and job title.

**Supported job boards:** Greenhouse, Workday, Lever, Ashby, LinkedIn

---

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension` folder

---

## Data

Sponsorship data comes from the [DOL OFLC Performance Data](https://www.dol.gov/agencies/eta/foreign-labor/performance) — the official public disclosure files for H-1B LCA and PERM applications.

The extension fetches per-letter index shards from the [latest GitHub Release](https://github.com/vamsi2577/h1b-scout/releases/latest) on first use and caches them locally. No data is ever sent to any server — all lookups happen in your browser.

### Build the index locally

To build and host your own data (e.g. after a new DOL quarterly release):

```powershell
# Downloads DOL files, builds index + shards, runs smoke test
npm run data:local
```

Options:
```powershell
node scripts/build-local.mjs --skip-download        # reuse files already in data/raw/
node scripts/build-local.mjs --fy 2026 --coverage "FY2026 Q1 + FY2025"
```

### Automated quarterly updates

A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs on the 1st of Feb, May, Aug, and Nov — when DOL typically publishes new quarterly data. It downloads the XLSX files, builds the index, and publishes a new GitHub Release automatically.

To trigger manually:
```powershell
gh workflow run update-data.yml --field 'coverage=FY2026 Q1 + FY2025'
```

---

## Settings

Click the ⚙ gear icon in the side panel to:

- **Custom data URL** — point to a different GitHub fork or static host serving the shard JSON files
- **Local offline files** — upload shard files directly for fully offline use (no network required)

---

## Development

### Run tests

```powershell
npm test
```

### Chrome smoke test (service worker only)

Start Chrome with remote debugging:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch-chrome.ps1
```

Then:
```powershell
npm run smoke:chrome
```

### End-to-end test against live job posts

With Chrome running (from `launch-chrome.ps1`):

```powershell
npm run smoke:e2e
```

Override test URLs:
```powershell
npm run smoke:e2e -- --greenhouse-url "https://boards.greenhouse.io/acme/jobs/123"
```

### Validate the index after a local build

```powershell
npm run smoke:index
```
