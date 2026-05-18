(function attachPanelUI(root) {
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
    editLookupBtn: document.querySelector("#editLookupBtn"),
    cancelEditBtn: document.querySelector("#cancelEditBtn"),
    suggestionsSection: document.querySelector("#suggestionsSection"),
    suggestionsList: document.querySelector("#suggestionsList"),
    customUrlInput: document.querySelector("#customUrlInput"),
    saveUrlBtn: document.querySelector("#saveUrlBtn"),
    resetUrlBtn: document.querySelector("#resetUrlBtn"),
    shardFileInput: document.querySelector("#shardFileInput"),
    clearShardsBtn: document.querySelector("#clearShardsBtn"),
    localShardsStatus: document.querySelector("#localShardsStatus")
  };

  const format = {
    number(value) {
      return new Intl.NumberFormat("en-US").format(value || 0);
    },
    money(value) {
      if (!value) return null;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
    },
    dataAge(isoString) {
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
    },
    truncate(str, length = 200) {
      if (!str) return "";
      if (str.length <= length) return str;
      return str.slice(0, length) + "…";
    }
  };

  function setStatus(message, type = "warning") {
    elements.status.hidden = !message;
    elements.status.textContent = message || "";
    elements.status.className = `status ${type}`;
  }

  function renderStats(stats) {
    elements.lcaTotal.textContent = format.number(stats.lca.employerTotal);
    elements.lcaTitleTotal.textContent = stats.lca.titleTotal > 0
      ? `${format.number(stats.lca.titleTotal)} for this title`
      : stats.lca.employerTotal > 0 ? "title not matched" : "0 for this title";
    elements.lcaCertified.textContent = format.number(stats.lca.certified);
    elements.lcaDenied.textContent = format.number(stats.lca.denied);
    elements.lcaWithdrawn.textContent = format.number(stats.lca.withdrawn);

    elements.permTotal.textContent = format.number(stats.perm.employerTotal);
    elements.permTitleTotal.textContent = stats.perm.titleTotal > 0
      ? `${format.number(stats.perm.titleTotal)} for this title`
      : stats.perm.employerTotal > 0 ? "title not matched" : "0 for this title";
    elements.permCertified.textContent = format.number(stats.perm.certified);
    elements.permDenied.textContent = format.number(stats.perm.denied);
    elements.permWithdrawn.textContent = format.number(stats.perm.withdrawn);

    const permAllZero = !stats.perm.certified && !stats.perm.denied && !stats.perm.withdrawn;
    elements.permBreakdown.hidden = permAllZero;

    function setCertRate(el, certified, denied, withdrawn) {
      const total = (certified || 0) + (denied || 0) + (withdrawn || 0);
      if (!total) { el.textContent = ""; el.className = "cert-rate"; return; }
      const rate = VisaSponsor.calculateCertRate(certified, denied, withdrawn);
      el.textContent = `${rate}% approved`;
      el.className = `cert-rate ${rate >= 90 ? "good" : rate >= 70 ? "ok" : "poor"}`;
      const sampleWarning = total < 5 ? " (Low sample size)" : "";
      el.title = `${rate}% certification rate (${format.number(certified)} certified of ${format.number(total)})${sampleWarning}`;
    }
    setCertRate(elements.lcaRate, stats.lca.certified, stats.lca.denied, stats.lca.withdrawn);
    setCertRate(elements.permRate, stats.perm.certified, stats.perm.denied, stats.perm.withdrawn);

    const min = format.money(stats.lca.minWage);
    const max = format.money(stats.lca.maxWage);
    const avg = format.money(stats.lca.avgWage);
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
      const label = prior ? `${prior > 0 ? format.number(prior) : "0"} in FY${prev}` : `no data in FY${prev}`;
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
      span1.textContent = `${format.number(stats.lca.employerTotal)} LCA${lcaDW ? `, Denied/withdrawn: ${format.number(lcaDW)}` : ""} | ${format.number(stats.perm.employerTotal)} PERM${permDW ? `, Denied/withdrawn: ${format.number(permDW)}` : ""}`;
      const span2 = document.createElement("span");
      span2.textContent = `${format.number(stats.lca.titleTotal)} LCA and ${format.number(stats.perm.titleTotal)} PERM matched this title`;
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
        const truncatedQuote = format.truncate(signal.quote);
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
    el.title = `Score: ${result.score}/100 · ${result.certRate}% approval · ${format.number(result.volume)} LCA filings`;
  }

  function renderLinks(links) {
    elements.sourceLinks.replaceChildren();
    for (const link of links || []) {
      const anchor = document.createElement("a");
      if (link.url && (link.url.startsWith("https://") || link.url.startsWith("http://"))) {
        anchor.href = link.url;
      }
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.textContent = link.label;
      elements.sourceLinks.append(anchor);
    }
  }

  root.PanelUI = {
    elements,
    format,
    setStatus,
    renderStats,
    renderTrend,
    renderSuggestions,
    renderYearBreakdown,
    renderSignals,
    renderSponsorScore,
    renderLinks
  };
})(window);
