importScripts("shared/normalization.js", "shared/lookup.js", "shared/local-db.js");

// ── Data source ─────────────────────────────────────────────────────────────
// Base URL for the per-letter shard files on GitHub Releases.
// After pushing this repo to GitHub and creating the first release (by running
// the "Update Sponsorship Data" GitHub Action), replace the placeholder below:
//   https://github.com/<owner>/<repo>/releases/latest/download
const BASE_RELEASE_URL =
  "https://github.com/vamsi2577/h1b-scout/releases/latest/download";

const CACHE_NAME = "visa-sponsor-data-v2";
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── In-memory state ──────────────────────────────────────────────────────────
// Per-letter shard promises — loaded on demand, one per first letter of company name
const shardPromises = new Map();
const latestContextByTab = new Map();
const panelEnabledTabs = new Set();

// ── Shard helpers ─────────────────────────────────────────────────────────────
function shardLetter(companyName) {
  const normalized = VisaSponsor.normalizeEmployer(companyName || "");
  const first = (normalized || "")[0]?.toUpperCase() || "0";
  return /[A-Z]/.test(first) ? first : "0";
}

async function shardUrl(letter) {
  const { customBaseUrl = "" } = await chrome.storage.local.get("customBaseUrl");
  const base = (customBaseUrl || "").trim() || BASE_RELEASE_URL;
  return `${base}/sponsorship-${letter}.json`;
}

// ── Shard loading ─────────────────────────────────────────────────────────────
// Priority: locally-uploaded file in IndexedDB → remote URL (custom or default)
// Remote copies are cached in the Cache API; staleness is tracked per-letter
// in chrome.storage.local under "shardCachedAt".
async function loadShard(letter) {
  if (shardPromises.has(letter)) return shardPromises.get(letter);

  const promise = (async () => {
    // 1. Check for a locally uploaded shard first (survives offline, no network needed)
    const local = await LocalShardDB.get(letter).catch(() => null);
    if (local) return local;

    // 2. Fetch from remote (respects custom URL override)
    const url = await shardUrl(letter);
    const cache = await caches.open(CACHE_NAME);
    const { shardCachedAt = {} } = await chrome.storage.local.get("shardCachedAt");
    const isStale = Date.now() - (shardCachedAt[letter] || 0) > STALE_AFTER_MS;

    // Serve from cache when fresh
    if (!isStale) {
      const cached = await cache.match(url);
      if (cached) return cached.json();
    }

    // Fetch a fresh copy; on failure fall back to the stale cached copy
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await cache.put(url, response.clone());
      // Re-read before writing to avoid clobbering concurrent shard fetches
      const { shardCachedAt: current = {} } = await chrome.storage.local.get("shardCachedAt");
      await chrome.storage.local.set({ shardCachedAt: { ...current, [letter]: Date.now() } });
      return response.json();
    } catch (fetchError) {
      const stale = await cache.match(url);
      if (stale) {
        console.warn(`H1B Scout: shard ${letter} fetch failed, using cached copy.`, fetchError.message);
        return stale.json();
      }
      throw new Error(
        "Unable to load sponsorship data. Open Settings (⚙) to set a custom data URL or upload local shard files."
      );
    }
  })().catch((error) => {
    shardPromises.delete(letter); // allow retry on next panel open
    throw error;
  });

  shardPromises.set(letter, promise);
  return promise;
}

async function refreshPanel(context) {
  // When no company is known, return an empty result without fetching any shard
  if (!context.companyName) {
    const empty = VisaSponsor.lookupSponsorship({ metadata: {}, employers: {}, aliases: {} }, "", "");
    return { lookup: empty, generatedAt: null, suggestions: [] };
  }
  const letter = shardLetter(context.companyName);
  const shard = await loadShard(letter);
  const lookup = VisaSponsor.lookupSponsorship(shard, context.companyName, context.jobTitle);
  // When there is no employer match, surface the closest names from the loaded shard
  const suggestions = lookup.confidence === "none"
    ? VisaSponsor.suggestCompanies(shard, context.companyName)
    : [];
  return { lookup, generatedAt: shard.metadata?.generatedAt || null, suggestions };
}

// ── Telemetry helpers ─────────────────────────────────────────────────────────
// In-memory set of recently logged URLs — prevents the same URL from being
// written multiple times within a single SW session (e.g. on repeated panel
// opens without navigating away).
const recentlyLoggedUrls = new Set();

async function logExtractionFailure(context) {
  try {
    if (context.companyName || context.source === "unsupported" || !context.url) return;
    // Deduplicate: skip if this URL was already logged in the current SW session
    if (recentlyLoggedUrls.has(context.url)) return;
    recentlyLoggedUrls.add(context.url);

    const { extractionFailures = [] } = await chrome.storage.local.get("extractionFailures");
    extractionFailures.push({ url: context.url, source: context.source, timestamp: Date.now() });
    const trimmed = extractionFailures.slice(-20);
    await chrome.storage.local.set({ extractionFailures: trimmed });
  } catch {
    // telemetry must never throw
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  latestContextByTab.delete(tabId);
  panelEnabledTabs.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

// ── Embedded ATS detection (gh_jid / ashby_jid URL params) ───────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // When the page finishes loading, retry signals extraction for embedded ATS tabs
  // whose signals were still empty (script was injected too early at URL-change time).
  if (changeInfo.status === "complete" && !changeInfo.url) {
    const existing = latestContextByTab.get(tabId);
    if (existing && (!existing.signals || existing.signals.length === 0)) {
      let hasEmbeddedAts = false;
      try {
        const u = new URL(tab?.url || "");
        hasEmbeddedAts = u.searchParams.has("gh_jid") || u.searchParams.has("ashby_jid");
      } catch {}
      if (hasEmbeddedAts) {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ["src/shared/normalization.js", "src/content/signals-extractor.js"] });
          const [sigResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => (typeof VisaSponsor !== "undefined" && VisaSponsor.extractSignals) ? VisaSponsor.extractSignals() : []
          });
          const signals = Array.isArray(sigResult?.result) ? sigResult.result : [];
          if (signals.length > 0) {
            latestContextByTab.set(tabId, { ...existing, signals });
            chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
          }
        } catch { /* page may block injection */ }
      }
    }
    return;
  }

  if (!changeInfo.url) return;
  let url;
  try { url = new URL(changeInfo.url); } catch { return; }

  const ghJid = url.searchParams.get("gh_jid");
  const ashbyJid = url.searchParams.get("ashby_jid");
  if (!ghJid && !ashbyJid) return;

  if (!panelEnabledTabs.has(tabId)) {
    panelEnabledTabs.add(tabId);
    chrome.sidePanel.setOptions({ tabId, path: "src/sidepanel/panel.html", enabled: true });
  }

  try {
    if (ghJid) {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const iframe =
            document.querySelector('iframe[src*="boards.greenhouse.io"]') ||
            document.querySelector('iframe[src*="greenhouse.io"]');
          const boardToken =
            iframe?.src?.match(/greenhouse\.io\/([^/?#]+)/)?.[1] || null;
          const companyName = (
            document.querySelector('meta[property="og:site_name"]')?.content ||
            document.title.split(/\s*[|\-–]\s*/)[0] ||
            ""
          ).trim();
          return { boardToken, companyName };
        }
      });

      const { boardToken, companyName } = probe?.result || {};
      let jobTitle = "";

      if (boardToken) {
        try {
          const res = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${ghJid}`
          );
          if (res.ok) {
            const job = await res.json();
            jobTitle = job.title || "";
          }
        } catch { /* network failure — leave title empty */ }
      }

      // The manifest content_scripts only run on greenhouse.io domains, not on
      // third-party sites embedding a Greenhouse board. Inject and run the signals
      // extractor here so clearance/sponsorship signals are captured on those pages.
      let signals = [];
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["src/shared/normalization.js", "src/content/signals-extractor.js"] });
        const [sigResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (typeof VisaSponsor !== "undefined" && VisaSponsor.extractSignals) ? VisaSponsor.extractSignals() : []
        });
        signals = Array.isArray(sigResult?.result) ? sigResult.result : [];
      } catch { /* page may block script injection — signals stay empty */ }

      const context = { companyName: companyName || "", jobTitle, source: "greenhouse", url: changeInfo.url, signals };
      latestContextByTab.set(tabId, context);
      chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    }

    if (ashbyJid) {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          companyName: (
            document.querySelector('meta[property="og:site_name"]')?.content ||
            document.title.split(/\s*[|\-–]\s*/)[0] ||
            ""
          ).trim()
        })
      });

      let signals = [];
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["src/shared/normalization.js", "src/content/signals-extractor.js"] });
        const [sigResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (typeof VisaSponsor !== "undefined" && VisaSponsor.extractSignals) ? VisaSponsor.extractSignals() : []
        });
        signals = Array.isArray(sigResult?.result) ? sigResult.result : [];
      } catch { /* page may block script injection — signals stay empty */ }

      const context = { companyName: probe?.result?.companyName || "", jobTitle: "", source: "ashby", url: changeInfo.url, signals };
      latestContextByTab.set(tabId, context);
      chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    }
  } catch {
    // scripting.executeScript can fail if the tab navigated away
  }
});

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is the extension itself
  if (sender.id !== chrome.runtime.id) {
    console.warn("Rejected message from external sender:", sender.id);
    return;
  }

  const tabId = sender.tab?.id || message.tabId;

  if (message.type === "JOB_CONTEXT_FOUND" && tabId) {
    const context = {
      companyName: message.companyName || "",
      jobTitle: message.jobTitle || "",
      source: message.source || "unknown",
      url: message.url || sender.tab?.url || "",
      signals: Array.isArray(message.signals) ? message.signals : []
    };
    latestContextByTab.set(tabId, context);
    logExtractionFailure(context);
    if (!panelEnabledTabs.has(tabId)) {
      panelEnabledTabs.add(tabId);
      chrome.sidePanel.setOptions({ tabId, path: "src/sidepanel/panel.html", enabled: true });
    }
    chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_PANEL_DATA") {
    const context = latestContextByTab.get(tabId) || {
      companyName: "", jobTitle: "", source: "unsupported", url: ""
    };
    refreshPanel(context)
      .then(({ lookup, generatedAt, suggestions }) =>
        sendResponse({ ok: true, context, lookup, dataAge: generatedAt, suggestions })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message, context }));
    return true;
  }

  if (message.type === "LOOKUP_OVERRIDE") {
    const context = {
      companyName: message.companyName || "",
      jobTitle: message.jobTitle || "",
      source: message.source || "manual",
      url: message.url || ""
    };
    if (tabId) latestContextByTab.set(tabId, context);
    refreshPanel(context)
      .then(({ lookup, generatedAt, suggestions }) =>
        sendResponse({ ok: true, context, lookup, dataAge: generatedAt, suggestions })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message, context }));
    return true;
  }

  // ── Badge lookup (job list pages) ──────────────────────────────────────────
  if (message.type === "GET_BADGES") {
    const companies = Array.isArray(message.companies) ? message.companies : [];
    const results = {};
    // Group by shard letter so each shard is loaded at most once
    const byLetter = new Map();
    for (const name of companies) {
      if (!name) continue;
      const letter = shardLetter(name);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(name);
    }
    Promise.all([...byLetter.entries()].map(async ([letter, names]) => {
      try {
        const shard = await loadShard(letter);
        for (const name of names) {
          const lookup = VisaSponsor.lookupSponsorship(shard, name, "");
          const years = lookup.fiscalYears || [];
          let trend = "flat";
          if (years.length >= 2) {
            const curr = lookup.byFiscalYear[years[0]]?.lca?.employerTotal ?? 0;
            const prior = lookup.byFiscalYear[years[1]]?.lca?.employerTotal ?? 0;
            trend = VisaSponsor.calculateTrend(curr, prior);
          }
          results[name] = { lca: lookup.combined.lca.employerTotal, confidence: lookup.confidence, trend };
        }
      } catch {
        for (const name of names) results[name] = { lca: 0, confidence: "none" };
      }
    })).then(() => sendResponse({ ok: true, results }));
    return true;
  }

  // ── Settings messages ──────────────────────────────────────────────────────

  if (message.type === "GET_SETTINGS") {
    Promise.all([
      chrome.storage.local.get("customBaseUrl"),
      LocalShardDB.keys().catch(() => [])
    ]).then(([{ customBaseUrl = "" }, localLetters]) => {
      sendResponse({ ok: true, customBaseUrl, localLetters });
    }).catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  if (message.type === "SAVE_SETTINGS") {
    const url = String(message.customBaseUrl || "").trim();
    chrome.storage.local.set({ customBaseUrl: url }).then(() => {
      shardPromises.clear(); // force re-fetch with new URL on next lookup
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  // Panel writes shards to IndexedDB directly; this just clears the in-memory
  // promise cache so the next lookup re-reads from IndexedDB (or remote).
  if (message.type === "CLEAR_SHARD_CACHE") {
    const letters = Array.isArray(message.letters) ? message.letters : [];
    if (letters.length === 0) {
      shardPromises.clear();
    } else {
      for (const letter of letters) shardPromises.delete(letter);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
