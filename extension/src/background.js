importScripts("shared/normalization.js", "shared/lookup.js");

// ── Data source ─────────────────────────────────────────────────────────────
// Base URL for the per-letter shard files on GitHub Releases.
// After pushing this repo to GitHub and creating the first release (by running
// the "Update Sponsorship Data" GitHub Action), replace the placeholder below:
//   https://github.com/<owner>/<repo>/releases/latest/download
const BASE_RELEASE_URL =
  "https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/releases/latest/download";

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

function shardUrl(letter) {
  return `${BASE_RELEASE_URL}/sponsorship-${letter}.json`;
}

// ── Shard loading ─────────────────────────────────────────────────────────────
// Each letter shard is fetched once, cached in the Cache API, and kept in memory.
// Staleness is tracked per-letter in chrome.storage.local under "shardCachedAt".
async function loadShard(letter) {
  if (shardPromises.has(letter)) return shardPromises.get(letter);

  const promise = (async () => {
    const url = shardUrl(letter);
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
        console.warn(`Visa Sponsorship: shard ${letter} fetch failed, using cached copy.`, fetchError.message);
        return stale.json();
      }
      throw new Error(
        "Unable to load sponsorship data. Check the GitHub Releases URL in background.js, ensure the repo is public, and that a data release exists."
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
    return { lookup: empty, generatedAt: null };
  }
  const letter = shardLetter(context.companyName);
  const shard = await loadShard(letter);
  const lookup = VisaSponsor.lookupSponsorship(shard, context.companyName, context.jobTitle);
  return { lookup, generatedAt: shard.metadata?.generatedAt || null };
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
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
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

      const context = { companyName: companyName || "", jobTitle, source: "greenhouse", url: changeInfo.url, signals: [] };
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

      const context = { companyName: probe?.result?.companyName || "", jobTitle: "", source: "ashby", url: changeInfo.url, signals: [] };
      latestContextByTab.set(tabId, context);
      chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    }
  } catch {
    // scripting.executeScript can fail if the tab navigated away
  }
});

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      .then(({ lookup, generatedAt }) =>
        sendResponse({ ok: true, context, lookup, dataAge: generatedAt })
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
      .then(({ lookup, generatedAt }) =>
        sendResponse({ ok: true, context, lookup, dataAge: generatedAt })
      )
      .catch((error) => sendResponse({ ok: false, error: error.message, context }));
    return true;
  }

  return false;
});
