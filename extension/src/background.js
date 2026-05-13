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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;

  if (message.type === "JOB_CONTEXT_FOUND" && tabId) {
    const context = {
      companyName: message.companyName || "",
      jobTitle: message.jobTitle || "",
      source: message.source || "unknown",
      url: message.url || sender.tab?.url || ""
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
