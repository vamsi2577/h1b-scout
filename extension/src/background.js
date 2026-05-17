importScripts("shared/normalization.js", "shared/lookup.js", "shared/local-db.js");

// ── Data source ─────────────────────────────────────────────────────────────
// Base URL for the per-letter shard files on GitHub Releases.
const BASE_RELEASE_URL =
  "https://github.com/vamsi2577/h1b-scout/releases/latest/download";

const CACHE_NAME = "visa-sponsor-data-v2";

// For non-GitHub custom data URLs (e.g. self-hosted), fall back to a 30-day
// staleness window. Data updates ~quarterly so this is a sensible default.
const FALLBACK_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Key prefix for auto-mirrored shards in LocalShardDB.
// Keeps them distinct from manually uploaded shards (single-letter keys).
const MIRROR_PREFIX = "_m_";

// ── In-memory state ──────────────────────────────────────────────────────────
const shardPromises = new Map();
const latestContextByTab = new Map();
const panelEnabledTabs = new Set();
// Release tags resolved this SW session — avoids re-hitting the GitHub API
// on every panel open. Cleared when the service worker restarts or when the
// custom URL changes.
const resolvedTagCache = new Map();

// ── Shard helpers ─────────────────────────────────────────────────────────────
function shardLetter(companyName) {
  const normalized = VisaSponsor.normalizeEmployer(companyName || "");
  const first = (normalized || "")[0]?.toUpperCase() || "0";
  return /[A-Z]/.test(first) ? first : "0";
}

// Returns the GitHub REST API URL for the latest release, given the shard
// base download URL. Returns null for non-GitHub custom URLs.
function githubApiUrlFor(base) {
  const m = (base || "").match(/github\.com\/([^/]+\/[^/]+)/);
  if (!m) return null;
  return `https://api.github.com/repos/${m[1]}/releases/latest`;
}

// Fetches the latest release tag from GitHub (e.g. "data-2026-05-01").
// Results are cached in-memory for the SW lifetime to minimise API calls.
// Returns null if the URL is not GitHub or if the request fails.
async function resolveLatestTag(base) {
  const apiUrl = githubApiUrlFor(base);
  if (!apiUrl) return null;
  if (resolvedTagCache.has(base)) return resolvedTagCache.get(base);
  try {
    const res = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const { tag_name } = await res.json();
    if (tag_name) resolvedTagCache.set(base, tag_name);
    return tag_name || null;
  } catch {
    return null;
  }
}

// ── Shard loading ─────────────────────────────────────────────────────────────
// Priority:
//   1. Manually uploaded shard in IndexedDB (always wins — user intent)
//   2a. GitHub URLs — version-aware: if release tag matches cached tag, serve
//       from Cache API; if Cache API evicted, serve from IndexedDB mirror.
//   2b. Non-GitHub URLs — 30-day TTL: serve from Cache API or IndexedDB mirror.
//   3.  Tag mismatch / TTL expired — fetch fresh, store in Cache API + mirror.
//   4.  Fetch failure — stale Cache API → IndexedDB mirror → error.
async function loadShard(letter) {
  if (shardPromises.has(letter)) return shardPromises.get(letter);

  const promise = (async () => {
    // 1. Manually uploaded shard takes highest priority
    const local = await LocalShardDB.get(letter).catch(() => null);
    if (local) return local;

    // Resolve base URL (custom override or default GitHub Releases URL)
    const { customBaseUrl = "" } = await chrome.storage.local.get("customBaseUrl");
    const base = (customBaseUrl || "").trim() || BASE_RELEASE_URL;
    const url = `${base}/sponsorship-${letter}.json`;
    const cache = await caches.open(CACHE_NAME);
    const isGitHub = githubApiUrlFor(base) !== null;

    if (isGitHub) {
      // 2a. Version-aware path: only re-fetch when the release tag changes
      const latestTag = await resolveLatestTag(base);
      const { cachedTag = {} } = await chrome.storage.local.get("cachedTag");

      if (latestTag && cachedTag[letter] === latestTag) {
        // Tag matches — cached shard is still current
        const cached = await cache.match(url);
        if (cached) return cached.json();
        // Cache API evicted — try the durable IndexedDB mirror
        const mirror = await LocalShardDB.get(MIRROR_PREFIX + letter).catch(() => null);
        if (mirror) return mirror;
        // Both evicted — fall through to re-fetch (data unchanged, just restoring caches)
      }

      // Tag mismatch, unknown tag, or caches empty — fetch fresh shard
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Repopulate Cache API
        await cache.put(url, new Response(JSON.stringify(data),
          { headers: { "Content-Type": "application/json" } }));
        // Mirror to IndexedDB — survives Cache API eviction (fire-and-forget)
        LocalShardDB.set(MIRROR_PREFIX + letter, data).catch(() => {});
        // Record tag so the next load can skip the fetch
        if (latestTag) {
          const { cachedTag: curr = {} } = await chrome.storage.local.get("cachedTag");
          await chrome.storage.local.set({ cachedTag: { ...curr, [letter]: latestTag } });
        }
        return data;
      } catch (fetchError) {
        const stale = await cache.match(url);
        if (stale) {
          console.warn(`H1B Scout: shard ${letter} fetch failed, using stale Cache API copy.`, fetchError.message);
          return stale.json();
        }
        const mirror = await LocalShardDB.get(MIRROR_PREFIX + letter).catch(() => null);
        if (mirror) {
          console.warn(`H1B Scout: shard ${letter} fetch failed, using IndexedDB mirror.`, fetchError.message);
          return mirror;
        }
        throw new Error(
          "Unable to load sponsorship data. Open Settings (⚙) to set a custom data URL or upload local shard files."
        );
      }
    } else {
      // 2b. Non-GitHub custom URL — 30-day TTL fallback
      const { shardCachedAt = {} } = await chrome.storage.local.get("shardCachedAt");
      const isFresh = Date.now() - (shardCachedAt[letter] || 0) < FALLBACK_STALE_MS;

      if (isFresh) {
        const cached = await cache.match(url);
        if (cached) return cached.json();
        // Cache API evicted — try IndexedDB mirror
        const mirror = await LocalShardDB.get(MIRROR_PREFIX + letter).catch(() => null);
        if (mirror) return mirror;
        // Both evicted despite fresh timestamp — re-fetch to restore caches
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        await cache.put(url, new Response(JSON.stringify(data),
          { headers: { "Content-Type": "application/json" } }));
        LocalShardDB.set(MIRROR_PREFIX + letter, data).catch(() => {});

        const { shardCachedAt: curr = {} } = await chrome.storage.local.get("shardCachedAt");
        await chrome.storage.local.set({ shardCachedAt: { ...curr, [letter]: Date.now() } });
        return data;
      } catch (fetchError) {
        const stale = await cache.match(url);
        if (stale) {
          console.warn(`H1B Scout: shard ${letter} fetch failed, using stale Cache API copy.`, fetchError.message);
          return stale.json();
        }
        const mirror = await LocalShardDB.get(MIRROR_PREFIX + letter).catch(() => null);
        if (mirror) {
          console.warn(`H1B Scout: shard ${letter} fetch failed, using IndexedDB mirror.`, fetchError.message);
          return mirror;
        }
        throw new Error(
          "Unable to load sponsorship data. Open Settings (⚙) to set a custom data URL or upload local shard files."
        );
      }
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
      shardPromises.clear();
      resolvedTagCache.clear(); // reset in-memory tag cache — new URL may point elsewhere
      // Clear persisted version markers so the next load re-checks the release
      chrome.storage.local.remove(["cachedTag", "shardCachedAt"]).catch(() => {});
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true; // async
  }

  // Panel writes shards to IndexedDB directly; this clears the in-memory
  // promise cache and the version markers so the next lookup re-reads fresh.
  if (message.type === "CLEAR_SHARD_CACHE") {
    const letters = Array.isArray(message.letters) ? message.letters : [];
    if (letters.length === 0) {
      // Full clear — wipe everything including IndexedDB mirrors
      shardPromises.clear();
      resolvedTagCache.clear();
      chrome.storage.local.remove(["cachedTag", "shardCachedAt"]).catch(() => {});
      LocalShardDB.keys()
        .then(keys => Promise.all(
          keys
            .filter(k => k.startsWith(MIRROR_PREFIX))
            .map(k => LocalShardDB.remove(k).catch(() => {}))
        ))
        .catch(() => {});
    } else {
      // Selective clear — only the requested letters
      for (const letter of letters) {
        shardPromises.delete(letter);
        LocalShardDB.remove(MIRROR_PREFIX + letter).catch(() => {});
      }
      // Remove the cached version markers for just these letters
      Promise.all([
        chrome.storage.local.get("cachedTag"),
        chrome.storage.local.get("shardCachedAt")
      ]).then(([{ cachedTag = {} }, { shardCachedAt = {} }]) => {
        for (const letter of letters) {
          delete cachedTag[letter];
          delete shardCachedAt[letter];
        }
        return chrome.storage.local.set({ cachedTag, shardCachedAt });
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
