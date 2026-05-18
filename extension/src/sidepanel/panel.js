/**
 * SECURITY NOTE: This panel displays data extracted from third-party websites.
 * ALWAYS use .textContent for untrusted data. NEVER use .innerHTML or .insertAdjacentHTML.
 */

const {
  elements, format,
  setStatus, renderStats, renderTrend, renderSuggestions,
  renderYearBreakdown, renderSignals, renderSponsorScore, renderLinks
} = PanelUI;

let currentContext = {};

// ── Main render ───────────────────────────────────────────────────────────────
function render(payload) {
  if (!payload.ok) {
    setStatus(payload.error || "Unable to load sponsorship data. Open Settings (⚙) to configure a data source.");
    return;
  }

  currentContext = payload.context || {};
  const lookup = payload.lookup;
  const company = format.truncate(currentContext.companyName || "");
  const title = format.truncate(currentContext.jobTitle || "");

  elements.companyHeading.textContent = company || "No company detected";
  elements.companyHeading.title = currentContext.companyName || "";
  elements.jobHeading.textContent = title || "No job title detected";
  elements.jobHeading.title = currentContext.jobTitle || "";
  elements.companyInput.value = company;
  elements.titleInput.value = title;
  elements.form.hidden = true;
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
  elements.dataAge.textContent = format.dataAge(payload.dataAge);
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
      elements.form.hidden = true;
    }
  );
});

// ── Edit lookup toggle ────────────────────────────────────────────────────────
elements.editLookupBtn.addEventListener("click", () => {
  elements.form.hidden = false;
  elements.companyInput.focus();
});

elements.cancelEditBtn.addEventListener("click", () => {
  elements.form.hidden = true;
});

// ── Reload button ─────────────────────────────────────────────────────────────
elements.reloadBtn.addEventListener("click", async () => {
  elements.reloadBtn.classList.add("spinning");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { elements.reloadBtn.classList.remove("spinning"); return; }

  chrome.runtime.sendMessage({ type: "REEXTRACT", tabId: tab?.id }, (response) => {
    if (response && !response.ok) {
      clearTimeout(elements.reloadBtn._fallbackTimer);
      loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
    }
  });

  const fallbackTimer = setTimeout(() => {
    loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
  }, 2000);
  elements.reloadBtn._fallbackTimer = fallbackTimer;
});

// ── Background messages ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONTEXT_UPDATED") {
    clearTimeout(elements.reloadBtn._fallbackTimer);
    elements.reloadBtn.classList.remove("spinning");
    loadPanelData();
  }
});

window.addEventListener("unload", () => {
  clearTimeout(elements.reloadBtn._fallbackTimer);
});

// ── Init ──────────────────────────────────────────────────────────────────────
PanelSettings.init();
setStatus("Loading sponsorship data…");
loadPanelData();
