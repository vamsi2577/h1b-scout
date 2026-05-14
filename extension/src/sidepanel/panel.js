const elements = {
  reloadBtn: document.querySelector("#reloadBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  settingsDrawer: document.querySelector("#settingsDrawer"),
  signalsSection: document.querySelector("#signalsSection"),
  signalsList: document.querySelector("#signalsList"),
  companyHeading: document.querySelector("#companyHeading"),
  jobHeading: document.querySelector("#jobHeading"),
  companyInput: document.querySelector("#companyInput"),
  titleInput: document.querySelector("#titleInput"),
  form: document.querySelector("#lookupForm"),
  status: document.querySelector("#status"),
  coverageLabel: document.querySelector("#coverageLabel"),
  confidenceLabel: document.querySelector("#confidenceLabel"),
  sourceLinks: document.querySelector("#sourceLinks"),
  yearBreakdown: document.querySelector("#yearBreakdown"),
  lcaTotal: document.querySelector("#lcaTotal"),
  lcaTitleTotal: document.querySelector("#lcaTitleTotal"),
  lcaCertified: document.querySelector("#lcaCertified"),
  lcaDenied: document.querySelector("#lcaDenied"),
  lcaWithdrawn: document.querySelector("#lcaWithdrawn"),
  permTotal: document.querySelector("#permTotal"),
  permTitleTotal: document.querySelector("#permTitleTotal"),
  permCertified: document.querySelector("#permCertified"),
  permDenied: document.querySelector("#permDenied"),
  permWithdrawn: document.querySelector("#permWithdrawn"),
  wageSummary: document.querySelector("#wageSummary"),
  dataAge: document.querySelector("#dataAge"),
  // Settings drawer children
  customUrlInput: document.querySelector("#customUrlInput"),
  saveUrlBtn: document.querySelector("#saveUrlBtn"),
  resetUrlBtn: document.querySelector("#resetUrlBtn"),
  shardFileInput: document.querySelector("#shardFileInput"),
  clearShardsBtn: document.querySelector("#clearShardsBtn"),
  localShardsStatus: document.querySelector("#localShardsStatus")
};

let currentContext = {};

// ── Formatters ────────────────────────────────────────────────────────────────
function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatMoney(value) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDataAge(isoString) {
  if (!isoString) return "";
  const generated = new Date(isoString);
  if (Number.isNaN(generated.getTime())) return "";
  const diffMs = Date.now() - generated.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "Index updated today";
  if (diffDays === 1) return "Index updated 1 day ago";
  if (diffDays < 30) return `Index updated ${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "Index updated 1 month ago";
  if (diffMonths < 12) return `Index updated ${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return `Index updated ${diffYears === 1 ? "1 year" : `${diffYears} years`} ago`;
}

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(message, type = "warning") {
  elements.status.hidden = !message;
  elements.status.textContent = message || "";
  elements.status.className = `status ${type}`;
}

// ── Stats rendering ───────────────────────────────────────────────────────────
function renderStats(stats) {
  elements.lcaTotal.textContent = formatNumber(stats.lca.employerTotal);
  elements.lcaTitleTotal.textContent = `${formatNumber(stats.lca.titleTotal)} for this title`;
  elements.lcaCertified.textContent = formatNumber(stats.lca.certified);
  elements.lcaDenied.textContent = formatNumber(stats.lca.denied);
  elements.lcaWithdrawn.textContent = formatNumber(stats.lca.withdrawn);

  elements.permTotal.textContent = formatNumber(stats.perm.employerTotal);
  elements.permTitleTotal.textContent = `${formatNumber(stats.perm.titleTotal)} for this title`;
  elements.permCertified.textContent = formatNumber(stats.perm.certified);
  elements.permDenied.textContent = formatNumber(stats.perm.denied);
  elements.permWithdrawn.textContent = formatNumber(stats.perm.withdrawn);

  const min = formatMoney(stats.lca.minWage);
  const max = formatMoney(stats.lca.maxWage);
  const avg = formatMoney(stats.lca.avgWage);
  elements.wageSummary.textContent = min && max
    ? `Range ${min} to ${max}${avg ? `, average ${avg}` : ""}.`
    : "No wage data in the current match.";
}

function renderYearBreakdown(lookup) {
  elements.yearBreakdown.replaceChildren();
  const partialYear = lookup.partialYear;
  for (const fiscalYear of lookup.fiscalYears || []) {
    const stats = lookup.byFiscalYear[String(fiscalYear)] || VisaSponsor.emptyStats();
    const row = document.createElement("article");
    row.className = "year-row";
    const strong = document.createElement("strong");
    strong.textContent = `FY${fiscalYear}${fiscalYear === partialYear ? " YTD" : ""}`;
    const span1 = document.createElement("span");
    const lcaDW = (stats.lca.denied || 0) + (stats.lca.withdrawn || 0);
    const permDW = (stats.perm.denied || 0) + (stats.perm.withdrawn || 0);
    span1.textContent = `${formatNumber(stats.lca.employerTotal)} LCA${lcaDW ? `, Denied/withdrawn: ${formatNumber(lcaDW)}` : ""} | ${formatNumber(stats.perm.employerTotal)} PERM${permDW ? `, Denied/withdrawn: ${formatNumber(permDW)}` : ""}`;
    const span2 = document.createElement("span");
    span2.textContent = `${formatNumber(stats.lca.titleTotal)} LCA and ${formatNumber(stats.perm.titleTotal)} PERM matched this title`;
    row.replaceChildren(strong, span1, span2);
    elements.yearBreakdown.append(row);
  }
}

async function scrollToSignalText(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SCROLL_TO_SIGNAL", text });
  }
}

function renderSignals(signals) {
  elements.signalsList.replaceChildren();
  if (!signals?.length) {
    elements.signalsSection.hidden = true;
    return;
  }
  elements.signalsSection.hidden = false;
  for (const signal of signals) {
    const chip = document.createElement("div");
    chip.className = `signal-chip ${signal.severity}`;
    const label = document.createElement("strong");
    label.textContent = signal.severity === "high" ? `⚠ ${signal.label}` : `ℹ ${signal.label}`;
    chip.append(label);
    if (signal.quote) {
      const quote = document.createElement("span");
      quote.textContent = `"${signal.quote}"`;
      chip.append(quote);
      chip.classList.add("clickable");
      chip.title = "Click to jump to this text in the page";
      chip.addEventListener("click", () => scrollToSignalText(signal.quote));
    }
    elements.signalsList.append(chip);
  }
}

function renderLinks(links) {
  elements.sourceLinks.replaceChildren();
  for (const link of links || []) {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.textContent = link.label;
    elements.sourceLinks.append(anchor);
  }
}

// ── Main render ───────────────────────────────────────────────────────────────
function render(payload) {
  if (!payload.ok) {
    setStatus(payload.error || "Unable to load sponsorship data. Open Settings (⚙) to configure a data source.");
    return;
  }

  currentContext = payload.context || {};
  const lookup = payload.lookup;
  const company = currentContext.companyName || "";
  const title = currentContext.jobTitle || "";

  elements.companyHeading.textContent = company || "No company detected";
  elements.jobHeading.textContent = title || "No job title detected";
  elements.companyInput.value = company;
  elements.titleInput.value = title;
  elements.coverageLabel.textContent = lookup.coverageLabel;
  elements.confidenceLabel.textContent = lookup.confidence === "none" ? "No match" : `${lookup.confidence} match`;

  if (!company && !title) {
    setStatus("Open a job post on Greenhouse, Workday, Lever, Ashby, or LinkedIn — or enter a company and title manually.");
  } else if (!lookup.employerMatch) {
    setStatus("No employer match found in the local OFLC index. Try editing the company name.");
  } else if (!lookup.combined.lca.employerTotal && !lookup.combined.perm.employerTotal) {
    setStatus("Employer matched, but no LCA or PERM counts were found for the selected coverage.");
  } else {
    setStatus("");
  }

  renderSignals(currentContext.signals || []);
  renderStats(lookup.combined);
  renderYearBreakdown(lookup);
  renderLinks(lookup.sourceLinks);
  elements.dataAge.textContent = formatDataAge(payload.dataAge);
}

function loadPanelData() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      chrome.runtime.sendMessage({ type: "GET_PANEL_DATA", tabId: tab?.id }, (payload) => {
        render(payload);
        resolve();
      });
    });
  });
}

// ── Form submit ───────────────────────────────────────────────────────────────
elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage(
    {
      type: "LOOKUP_OVERRIDE",
      tabId: tab?.id,
      companyName: elements.companyInput.value.trim(),
      jobTitle: elements.titleInput.value.trim(),
      source: currentContext.source || "manual",
      url: currentContext.url || tab?.url || ""
    },
    render
  );
});

// ── Reload button ─────────────────────────────────────────────────────────────
elements.reloadBtn.addEventListener("click", () => {
  elements.reloadBtn.classList.add("spinning");
  loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
});

// ── Background messages ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONTEXT_UPDATED") loadPanelData();
});

// ── Settings drawer ───────────────────────────────────────────────────────────
let settingsOpen = false;

function updateLocalShardsStatus(localLetters) {
  const el = elements.localShardsStatus;
  if (!localLetters?.length) {
    el.textContent = "No local files stored.";
  } else {
    const sorted = [...localLetters].sort();
    el.textContent = `${sorted.length} letter${sorted.length !== 1 ? "s" : ""} stored locally: ${sorted.join(", ")}`;
  }
}

function loadSettings() {
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    if (!response?.ok) return;
    elements.customUrlInput.value = response.customBaseUrl || "";
    updateLocalShardsStatus(response.localLetters || []);
  });
}

// Toggle drawer
elements.settingsBtn.addEventListener("click", () => {
  settingsOpen = !settingsOpen;
  elements.settingsDrawer.hidden = !settingsOpen;
  elements.settingsBtn.setAttribute("aria-expanded", String(settingsOpen));
  elements.settingsBtn.classList.toggle("active", settingsOpen);
  if (settingsOpen) loadSettings();
});

// Save custom URL
elements.saveUrlBtn.addEventListener("click", () => {
  const url = elements.customUrlInput.value.trim();
  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", customBaseUrl: url }, (response) => {
    if (response?.ok) {
      setStatus(url ? `Custom URL saved. Data will reload on next lookup.` : "URL reset to default.", "info");
    }
  });
});

// Reset custom URL
elements.resetUrlBtn.addEventListener("click", () => {
  elements.customUrlInput.value = "";
  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", customBaseUrl: "" }, (response) => {
    if (response?.ok) setStatus("URL reset to built-in default.", "info");
  });
});

// Partition a full sponsorship-index.json into per-letter buckets (mirrors writeShards in prepare-data.mjs)
function shardFullIndex(data) {
  const buckets = new Map();
  for (const [key, employer] of Object.entries(data.employers || {})) {
    const first = key[0]?.toUpperCase() || "0";
    const letter = /[A-Z]/.test(first) ? first : "0";
    if (!buckets.has(letter)) {
      buckets.set(letter, { metadata: data.metadata, employers: {}, aliases: {} });
    }
    buckets.get(letter).employers[key] = employer;
  }
  for (const [aliasKey, targetKey] of Object.entries(data.aliases || {})) {
    const first = aliasKey[0]?.toUpperCase() || "0";
    const letter = /[A-Z]/.test(first) ? first : "0";
    const bucket = buckets.get(letter);
    if (bucket) bucket.aliases[aliasKey] = targetKey;
  }
  return buckets; // Map<letter, shardObject>
}

// Auto-store local shard files (or full index) as soon as the user picks them
elements.shardFileInput.addEventListener("change", async () => {
  const files = elements.shardFileInput.files;
  if (!files.length) return;

  const uploaded = [];
  const failed = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.employers) {
        failed.push(file.name);
        continue;
      }

      const isFullIndex = /sponsorship-index\.json$/i.test(file.name);

      if (isFullIndex) {
        // Partition the full index into per-letter shards and store each one
        const buckets = shardFullIndex(data);
        for (const [letter, shard] of buckets) {
          await LocalShardDB.set(letter, shard);
          uploaded.push(letter);
        }
      } else {
        // Single shard file — determine its letter from filename or first employer key
        const match = file.name.match(/sponsorship-([A-Z0])/i);
        let letter = match ? match[1].toUpperCase() : null;
        if (!letter) {
          const firstKey = Object.keys(data.employers)[0] || "";
          const firstChar = firstKey[0]?.toUpperCase() || "";
          letter = /[A-Z]/.test(firstChar) ? firstChar : (firstChar ? "0" : null);
        }
        if (!letter) { failed.push(file.name); continue; }
        await LocalShardDB.set(letter, data);
        uploaded.push(letter);
      }
    } catch {
      failed.push(file.name);
    }
  }

  // Tell the background to invalidate its in-memory promise cache for uploaded letters
  if (uploaded.length) {
    chrome.runtime.sendMessage({ type: "CLEAR_SHARD_CACHE", letters: uploaded });
  }

  const msg = [
    uploaded.length ? `Stored locally: ${[...new Set(uploaded)].sort().join(", ")}.` : "",
    failed.length ? `Failed to read: ${failed.join(", ")}.` : ""
  ].filter(Boolean).join(" ");
  setStatus(msg || "No valid shard files found.", uploaded.length ? "info" : "warning");

  elements.shardFileInput.value = "";
  loadSettings(); // refresh the "X letters stored" status line
});

// Clear all local shard files
elements.clearShardsBtn.addEventListener("click", async () => {
  await LocalShardDB.clear();
  // Clear entire in-memory shard cache so background re-fetches from remote
  const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0".split("");
  chrome.runtime.sendMessage({ type: "CLEAR_SHARD_CACHE", letters: ALL_LETTERS });
  updateLocalShardsStatus([]);
  setStatus("Local shard files cleared. Data will be fetched from the remote URL on next lookup.", "info");
});

// ── Init ──────────────────────────────────────────────────────────────────────
setStatus("Loading sponsorship data…");
loadPanelData();
