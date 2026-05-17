/** 
 * SECURITY NOTE: This panel displays data extracted from third-party websites.
 * ALWAYS use .textContent for untrusted data. NEVER use .innerHTML or .insertAdjacentHTML. 
 */

const elements = {
  reloadBtn: document.querySelector("#reloadBtn"),
// ... (omitting intermediate lines for brevity in thought, but I must provide full context in the tool call)
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
  lcaTrend: document.querySelector("#lcaTrend"),
  lcaRate: document.querySelector("#lcaRate"),
  lcaTitleTotal: document.querySelector("#lcaTitleTotal"),
  lcaCertified: document.querySelector("#lcaCertified"),
  lcaDenied: document.querySelector("#lcaDenied"),
  lcaWithdrawn: document.querySelector("#lcaWithdrawn"),
  permTotal: document.querySelector("#permTotal"),
  permTrend: document.querySelector("#permTrend"),
  permRate: document.querySelector("#permRate"),
  permTitleTotal: document.querySelector("#permTitleTotal"),
  permCertified: document.querySelector("#permCertified"),
  permDenied: document.querySelector("#permDenied"),
  permWithdrawn: document.querySelector("#permWithdrawn"),
  permBreakdown: document.querySelector("#permBreakdown"),
  statsGrid: document.querySelector("#statsGrid"),
  wageCard: document.querySelector("#wageCard"),
  yearCard: document.querySelector("#yearCard"),
  wageSummary: document.querySelector("#wageSummary"),
  dataAge: document.querySelector("#dataAge"),
  sponsorScore: document.querySelector("#sponsorScore"),
  lookupDisplay: document.querySelector("#lookupDisplay"),
  lookupCompanyText: document.querySelector("#lookupCompanyText"),
  lookupTitleText: document.querySelector("#lookupTitleText"),
  editLookupBtn: document.querySelector("#editLookupBtn"),
  cancelEditBtn: document.querySelector("#cancelEditBtn"),
  suggestionsSection: document.querySelector("#suggestionsSection"),
  suggestionsList: document.querySelector("#suggestionsList"),
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

function truncate(str, length = 200) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
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
  elements.lcaTitleTotal.textContent = stats.lca.titleTotal > 0
    ? `${formatNumber(stats.lca.titleTotal)} for this title`
    : stats.lca.employerTotal > 0 ? "title not matched" : "0 for this title";
  elements.lcaCertified.textContent = formatNumber(stats.lca.certified);
  elements.lcaDenied.textContent = formatNumber(stats.lca.denied);
  elements.lcaWithdrawn.textContent = formatNumber(stats.lca.withdrawn);

  elements.permTotal.textContent = formatNumber(stats.perm.employerTotal);
  elements.permTitleTotal.textContent = stats.perm.titleTotal > 0
    ? `${formatNumber(stats.perm.titleTotal)} for this title`
    : stats.perm.employerTotal > 0 ? "title not matched" : "0 for this title";
  elements.permCertified.textContent = formatNumber(stats.perm.certified);
  elements.permDenied.textContent = formatNumber(stats.perm.denied);
  elements.permWithdrawn.textContent = formatNumber(stats.perm.withdrawn);

  // Collapse PERM breakdown when all zero
  const permAllZero = !stats.perm.certified && !stats.perm.denied && !stats.perm.withdrawn;
  elements.permBreakdown.hidden = permAllZero;

  // Certification rate badges
  // Thresholds: >= 90% (Good/Green), >= 70% (OK/Yellow), < 70% (Poor/Red).
  // These represent common benchmarks for sponsorship reliability.
  function setCertRate(el, certified, denied, withdrawn) {
    const total = (certified || 0) + (denied || 0) + (withdrawn || 0);
    if (!total) { el.textContent = ""; el.className = "cert-rate"; return; }
    const rate = VisaSponsor.calculateCertRate(certified, denied, withdrawn);
    el.textContent = `${rate}% approved`;
    el.className = `cert-rate ${rate >= 90 ? "good" : rate >= 70 ? "ok" : "poor"}`;
    const sampleWarning = total < 5 ? " (Low sample size)" : "";
    el.title = `${rate}% certification rate (${formatNumber(certified)} certified of ${formatNumber(total)})${sampleWarning}`;
  }
  setCertRate(elements.lcaRate, stats.lca.certified, stats.lca.denied, stats.lca.withdrawn);
  setCertRate(elements.permRate, stats.perm.certified, stats.perm.denied, stats.perm.withdrawn);

  const min = formatMoney(stats.lca.minWage);
  const max = formatMoney(stats.lca.maxWage);
  const avg = formatMoney(stats.lca.avgWage);
  elements.wageSummary.textContent = min && max
    ? `Range ${min} to ${max}${avg ? `, average ${avg}` : ""}.`
    : "No wage data in the current match.";
}

function renderTrend(lookup) {
  const years = [...(lookup.fiscalYears || [])].sort((a, b) => b - a);
  function clearArrow(el) { el.textContent = ""; el.className = "trend-arrow"; el.removeAttribute("title"); }
  if (years.length < 2) { clearArrow(elements.lcaTrend); clearArrow(elements.permTrend); return; }
  const [latest, prev] = years;
  const latestData = lookup.byFiscalYear[String(latest)] || VisaSponsor.emptyStats();
  const prevData   = lookup.byFiscalYear[String(prev)]   || VisaSponsor.emptyStats();

  function setArrow(el, curr, prior) {
    const label = prior ? `${prior > 0 ? formatNumber(prior) : "0"} in FY${prev}` : `no data in FY${prev}`;
    if (!prior && !curr) { clearArrow(el); return; }
    
    const trend = VisaSponsor.calculateTrend(curr, prior);
    if (trend === "up") {
      el.textContent = "↑"; el.className = "trend-arrow up";
      el.title = `Up from ${label}`;
    } else if (trend === "down") {
      el.textContent = "↓"; el.className = "trend-arrow down";
      el.title = `Down from ${label}`;
    } else {
      el.textContent = "→"; el.className = "trend-arrow flat";
      el.title = `Flat vs ${label}`;
    }
    el.setAttribute("aria-label", el.title);
  }
  setArrow(elements.lcaTrend,  latestData.lca.employerTotal,  prevData.lca.employerTotal);
  setArrow(elements.permTrend, latestData.perm.employerTotal, prevData.perm.employerTotal);
}

function renderSuggestions(suggestions) {
  elements.suggestionsList.replaceChildren();
  elements.suggestionsSection.hidden = !suggestions?.length;
  if (!suggestions?.length) return;
  for (const s of suggestions) {
    const btn = document.createElement("button");
    btn.className = "suggestion-chip";
    btn.type = "button";
    btn.textContent = s.displayName;
    btn.addEventListener("click", () => {
      elements.companyInput.value = s.displayName;
      elements.form.requestSubmit();
    });
    elements.suggestionsList.append(btn);
  }
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
    const icon = signal.severity === "high" ? "✕"
      : signal.severity === "positive" ? "✓"
      : signal.severity === "info" ? "ℹ"
      : "⚠";
    label.textContent = `${icon} ${signal.label}`;
    chip.append(label);
    if (signal.quote) {
      const quote = document.createElement("span");
      const truncatedQuote = truncate(signal.quote);
      quote.textContent = `"${truncatedQuote}"`;
      chip.append(quote);
      chip.classList.add("clickable");
      chip.title = "Click to jump to this text in the page";
      chip.addEventListener("click", () => scrollToSignalText(signal.quote));
    }
    elements.signalsList.append(chip);
  }
}

function renderSponsorScore(lookup) {
  const el = elements.sponsorScore;
  const result = VisaSponsor.computeSponsorScore(lookup);
  if (!result) { el.hidden = true; el.textContent = ""; el.className = "grade-badge"; return; }
  el.hidden = false;
  el.textContent = `H-1B Grade: ${result.grade}`;
  el.className = `grade-badge grade-${result.grade}`;
  el.title = `Score: ${result.score}/100 · ${result.certRate}% approval · ${formatNumber(result.volume)} LCA filings`;
}

function renderLinks(links) {
  elements.sourceLinks.replaceChildren();
  for (const link of links || []) {
    const anchor = document.createElement("a");
    // Extra safety check for URLs even though they come from our own lookup.js
    if (link.url && (link.url.startsWith("https://") || link.url.startsWith("http://"))) {
      anchor.href = link.url;
    }
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
  const company = truncate(currentContext.companyName || "");
  const title = truncate(currentContext.jobTitle || "");

  elements.companyHeading.textContent = company || "No company detected";
  elements.companyHeading.title = currentContext.companyName || "";
  elements.jobHeading.textContent = title || "No job title detected";
  elements.jobHeading.title = currentContext.jobTitle || "";
  elements.companyInput.value = company;
  elements.titleInput.value = title;
  elements.lookupCompanyText.textContent = company || "—";
  elements.lookupTitleText.textContent = title || "—";
  // Collapse form back to display mode on fresh data load
  elements.form.hidden = true;
  elements.lookupDisplay.hidden = false;
  elements.coverageLabel.textContent = lookup.coverageLabel;
  elements.confidenceLabel.textContent = lookup.confidence === "none" ? "No match" : `${lookup.confidence} match`;

  if (!company && !title) {
    setStatus("Open a job post on Greenhouse, Workday, Lever, Ashby, LinkedIn, or HigherEdJobs — or enter a company and title manually.");
  } else if (!lookup.employerMatch) {
    setStatus("No employer match found in the local OFLC index. Try editing the company name.");
  } else if (!lookup.combined.lca.employerTotal && !lookup.combined.perm.employerTotal) {
    setStatus("Employer matched, but no LCA or PERM counts were found for the selected coverage.");
  } else {
    setStatus("");
  }

  // Hide data sections when there is no employer match
  const hasMatch = !!lookup.employerMatch;
  elements.statsGrid.hidden = !hasMatch;
  elements.wageCard.hidden = !hasMatch;
  elements.yearCard.hidden = !hasMatch;

  renderSignals(currentContext.signals || []);
  renderSuggestions(payload.suggestions || []);
  renderStats(lookup.combined);
  renderTrend(lookup);
  renderSponsorScore(lookup);
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
    (payload) => {
      render(payload);
      // Collapse form back to display mode after a successful lookup
      elements.form.hidden = true;
      elements.lookupDisplay.hidden = false;
    }
  );
});

// ── Edit lookup toggle ────────────────────────────────────────────────────────
elements.editLookupBtn.addEventListener("click", () => {
  elements.form.hidden = false;
  elements.lookupDisplay.hidden = true;
  elements.companyInput.focus();
});

elements.cancelEditBtn.addEventListener("click", () => {
  elements.form.hidden = true;
  elements.lookupDisplay.hidden = false;
});

// ── Reload button ─────────────────────────────────────────────────────────────
// Re-injects the content script so the page is re-scraped, then waits for
// CONTEXT_UPDATED (fast path) or falls back to GET_PANEL_DATA after 2 s
// (for unsupported pages or when scripting is blocked).
elements.reloadBtn.addEventListener("click", async () => {
  elements.reloadBtn.classList.add("spinning");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    elements.reloadBtn.classList.remove("spinning");
    return;
  }

  // Ask the service worker to re-run the content script on the current tab.    // If it succeeds, the content script sends JOB_CONTEXT_FOUND → SW fires
  // CONTEXT_UPDATED → the listener below handles rendering and stops the spinner.
  // If it fails immediately (no tabId, scripting blocked), skip the 2 s wait
  // and render the current context right away.
  chrome.runtime.sendMessage({ type: "REEXTRACT", tabId: tab?.id }, (response) => {
    if (response && !response.ok) {
      clearTimeout(elements.reloadBtn._fallbackTimer);
      loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
    }
  });

  // Fallback: if CONTEXT_UPDATED doesn't arrive within 2 s (unsupported page,
  // scripting blocked, already-idle page with no DOM changes), pull whatever
  // context the SW currently knows and render it.
  const fallbackTimer = setTimeout(() => {
    loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
  }, 2000);

  // Store the timer id so the CONTEXT_UPDATED listener can cancel it early.
  elements.reloadBtn._fallbackTimer = fallbackTimer;
});

// ── Background messages ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONTEXT_UPDATED") {
    // Cancel the reload fallback timer if the content script responded in time.
    clearTimeout(elements.reloadBtn._fallbackTimer);
    elements.reloadBtn.classList.remove("spinning");
    loadPanelData();
  }
});

// Clean up the fallback timer if the panel is closed while a reload is in flight.
window.addEventListener("unload", () => {
  clearTimeout(elements.reloadBtn._fallbackTimer);
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
