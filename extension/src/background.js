importScripts("shared/normalization.js", "shared/lookup.js");

const DATA_URL = chrome.runtime.getURL("data/sponsorship-index.json");
let indexPromise;
const latestContextByTab = new Map();
const panelEnabledTabs = new Set();

async function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) throw new Error(`Unable to load sponsorship index: ${response.status}`);
      return response.json();
    });
  }
  return indexPromise;
}

async function refreshPanel(tabId, context) {
  const index = await loadIndex();
  return VisaSponsor.lookupSponsorship(index, context.companyName, context.jobTitle);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  latestContextByTab.delete(tabId);
  panelEnabledTabs.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

// Detect Greenhouse/Ashby boards embedded on company career pages via URL params.
// ?gh_jid=<id>  → Greenhouse   |   ?ashby_jid=<id> → Ashby
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  let url;
  try { url = new URL(changeInfo.url); } catch { return; }

  const ghJid = url.searchParams.get("gh_jid");
  const ashbyJid = url.searchParams.get("ashby_jid");
  if (!ghJid && !ashbyJid) return;

  // Enable the panel immediately so the user can see something
  if (!panelEnabledTabs.has(tabId)) {
    panelEnabledTabs.add(tabId);
    chrome.sidePanel.setOptions({ tabId, path: "src/sidepanel/panel.html", enabled: true });
  }

  try {
    if (ghJid) {
      // Probe the page: look for an embedded Greenhouse iframe to extract the board token,
      // and grab a company name from page metadata as a fallback.
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

      const context = {
        companyName: companyName || "",
        jobTitle,
        source: "greenhouse",
        url: changeInfo.url,
        signals: []
      };
      latestContextByTab.set(tabId, context);
      chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    }

    if (ashbyJid) {
      // Ashby job IDs are UUIDs; without the org slug we can't call their GraphQL API.
      // Extract company name from page metadata and let the user confirm via the manual form.
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

      const context = {
        companyName: probe?.result?.companyName || "",
        jobTitle: "",
        source: "ashby",
        url: changeInfo.url,
        signals: []
      };
      latestContextByTab.set(tabId, context);
      chrome.runtime.sendMessage({ type: "CONTEXT_UPDATED", tabId }).catch(() => {});
    }
  } catch {
    // scripting.executeScript can fail if the tab navigated away or the page blocked injection
  }
});

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
      companyName: "",
      jobTitle: "",
      source: "unsupported",
      url: ""
    };
    refreshPanel(tabId, context)
      .then((lookup) => sendResponse({ ok: true, context, lookup }))
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
    refreshPanel(tabId, context)
      .then((lookup) => sendResponse({ ok: true, context, lookup }))
      .catch((error) => sendResponse({ ok: false, error: error.message, context }));
    return true;
  }

  return false;
});
