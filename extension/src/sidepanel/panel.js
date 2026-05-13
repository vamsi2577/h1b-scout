const elements = {
  reloadBtn: document.querySelector("#reloadBtn"),
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
  wageSummary: document.querySelector("#wageSummary")
};

let currentContext = {};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatMoney(value) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function setStatus(message) {
  elements.status.hidden = !message;
  elements.status.textContent = message || "";
}

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
    span1.textContent = `${formatNumber(stats.lca.employerTotal)} LCA, ${formatNumber(stats.perm.employerTotal)} PERM`;
    const span2 = document.createElement("span");
    span2.textContent = `${formatNumber(stats.lca.titleTotal)} LCA and ${formatNumber(stats.perm.titleTotal)} PERM matched this title`;
    row.replaceChildren(strong, span1, span2);
    elements.yearBreakdown.append(row);
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

function render(payload) {
  if (!payload.ok) {
    setStatus(payload.error || "Unable to load sponsorship data.");
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
    setStatus("Open a supported Greenhouse or Workday job post, or enter a company and title manually.");
  } else if (!lookup.employerMatch) {
    setStatus("No employer match found in the local OFLC index. Try editing the company name.");
  } else if (!lookup.combined.lca.employerTotal && !lookup.combined.perm.employerTotal) {
    setStatus("Employer matched, but no LCA or PERM counts were found for the selected coverage.");
  } else {
    setStatus("");
  }

  renderStats(lookup.combined);
  renderYearBreakdown(lookup);
  renderLinks(lookup.sourceLinks);
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONTEXT_UPDATED") loadPanelData();
});

elements.reloadBtn.addEventListener("click", () => {
  elements.reloadBtn.classList.add("spinning");
  loadPanelData().finally(() => elements.reloadBtn.classList.remove("spinning"));
});

setStatus("Loading sponsorship data…");
loadPanelData();
