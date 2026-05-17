(function attachLookup(root) {
  const normalization = root.VisaSponsor;

  function emptyStats() {
    return {
      lca: {
        employerTotal: 0,
        titleTotal: 0,
        certified: 0,
        denied: 0,
        withdrawn: 0,
        avgWage: null,
        minWage: null,
        maxWage: null
      },
      perm: {
        employerTotal: 0,
        titleTotal: 0,
        certified: 0,
        denied: 0,
        withdrawn: 0
      }
    };
  }

  function cloneStats(stats) {
    return JSON.parse(JSON.stringify(stats || emptyStats()));
  }

  function addStats(target, source) {
    const previousAverage = target.lca.avgWage;
    const previousWeight = target.lca.employerTotal;
    const sourceAverage = source?.lca?.avgWage;
    const sourceWeight = source?.lca?.employerTotal || 0;

    for (const program of ["lca", "perm"]) {
      target[program].employerTotal += source?.[program]?.employerTotal || 0;
      target[program].titleTotal += source?.[program]?.titleTotal || 0;
      target[program].certified += source?.[program]?.certified || 0;
      target[program].denied += source?.[program]?.denied || 0;
      target[program].withdrawn += source?.[program]?.withdrawn || 0;
    }

    const wages = [target.lca.minWage, target.lca.maxWage, source?.lca?.minWage, source?.lca?.maxWage]
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    target.lca.minWage = wages.length ? Math.min(...wages) : null;
    target.lca.maxWage = wages.length ? Math.max(...wages) : null;

    const weightedWages = [];
    if (previousAverage != null && previousWeight) weightedWages.push([previousAverage, previousWeight]);
    if (sourceAverage != null && sourceWeight) weightedWages.push([sourceAverage, sourceWeight]);
    const totalWeight = weightedWages.reduce((sum, [, weight]) => sum + weight, 0);
    target.lca.avgWage = totalWeight
      ? Math.round(weightedWages.reduce((sum, [wage, weight]) => sum + wage * weight, 0) / totalWeight)
      : null;
    return target;
  }

  function sourceLinks(companyName) {
    const encoded = encodeURIComponent(companyName || "");
    const slug = (companyName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return [
      { label: "DOL OFLC source data", url: "https://www.dol.gov/agencies/eta/foreign-labor/performance" },
      { label: "MyVisaJobs", url: `https://www.myvisajobs.com/Search_Visa_Sponsor.aspx?N=${encoded}` },
      { label: "H1BGrader", url: `https://h1bgrader.com/h1b-sponsors/${slug}` },
      { label: "USCIS H-1B Employer Data Hub", url: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" }
    ];
  }

  function findEmployer(index, companyName) {
    const normalized = normalization.normalizeEmployer(companyName);
    if (!normalized) return null;
    if (index.employers[normalized]) return { key: normalized, confidence: "high" };
    const alias = index.aliases?.[normalized];
    if (alias && index.employers[alias]) return { key: alias, confidence: "high" };

    let best = null;
    for (const key of Object.keys(index.employers)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        const score = Math.min(key.length, normalized.length) / Math.max(key.length, normalized.length);
        if (!best || score > best.score) best = { key, score, confidence: score > 0.7 ? "medium" : "low" };
      }
    }
    return best;
  }

  function bestTitleStats(yearStats, jobTitle) {
    const titles = yearStats?.titles || {};
    const exact = titles[normalization.normalizeTitle(jobTitle)];
    if (exact) return exact;

    const queryTokens = normalization.titleTokens(jobTitle);

    // Title collapsed to zero meaningful tokens after stop-word removal (e.g. bare
    // "Engineer", "Senior Engineer"). Jaccard on an empty set is undefined — skip
    // fuzzy matching and fall back to the employer-level summary instead.
    if (queryTokens.length === 0) return null;

    // Scale the acceptance threshold by query token count:
    //   1 token  → 0.9: the DB title must also be a single-token set with the same
    //              word (score = 1.0). Prevents "DATA" matching "DATA ANALYST" (0.5).
    //   2+ tokens → 0.45: existing behaviour, but a single shared word is not
    //              sufficient — at least 2 tokens must overlap to guard against
    //              e.g. "MACHINE LEARNING" spuriously matching "MACHINE VISION".
    const threshold = queryTokens.length === 1 ? 0.9 : 0.45;
    const querySet = new Set(queryTokens);

    let best = null;
    for (const [title, stats] of Object.entries(titles)) {
      const score = normalization.titleSimilarity(jobTitle, title);
      if (score < threshold) continue;
      if (querySet.size >= 2) {
        const dbTokens = normalization.titleTokens(title);
        const overlap = dbTokens.filter((t) => querySet.has(t)).length;
        if (overlap < 2) continue;
      }
      if (!best || score > best.score) best = { score, stats };
    }
    return best?.stats || null;
  }

  function mergeEmployerAndTitleStats(yearStats, jobTitle) {
    const stats = cloneStats(yearStats?.summary);
    const titleStats = bestTitleStats(yearStats, jobTitle);
    if (titleStats) {
      stats.lca.titleTotal = titleStats.lca?.employerTotal || 0;
      stats.perm.titleTotal = titleStats.perm?.employerTotal || 0;
    }
    return stats;
  }

  // Return up to `limit` employer names from the loaded shard whose normalized key
  // is similar to the user's query. Used when findEmployer returns no match.
  function suggestCompanies(index, companyName, limit = 3) {
    const normalized = normalization.normalizeEmployer(companyName);
    if (!normalized || normalized.length < 2) return [];

    const candidates = [];
    for (const [key, data] of Object.entries(index.employers || {})) {
      if (key.length < 2) continue;
      let score = 0;
      // Substring overlap: user input found inside employer key (e.g. "AMAZON" in "AMAZON WEB SERVICES")
      if (key.includes(normalized)) score = Math.max(score, 0.8);
      // Employer key found inside user input (only for keys long enough to be meaningful)
      else if (normalized.includes(key) && key.length >= 4) score = Math.max(score, 0.65);
      // Jaccard token similarity as a fallback
      score = Math.max(score, normalization.titleSimilarity(normalized, key));
      if (score >= 0.2) candidates.push({ key, displayName: data.displayName || key, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  }

  function calculateTrend(curr, prior) {
    if (!prior && !curr) return "flat";
    if (!prior && curr > 0) return "up";
    if (curr > prior * 1.1) return "up";
    if (curr < prior * 0.9) return "down";
    return "flat";
  }

  function calculateCertRate(certified, denied, withdrawn) {
    const total = (certified || 0) + (denied || 0) + (withdrawn || 0);
    return total ? Math.round((certified || 0) / total * 100) : 0;
  }

  function lookupSponsorship(index, companyName, jobTitle) {
    const metadata = index.metadata || {};
    const fiscalYears = metadata.fiscalYears || [2026, 2025];
    const partialYear = metadata.partialYear ?? 2026;
    const match = findEmployer(index, companyName);
    const byFiscalYear = {};
    const combined = emptyStats();

    for (const fiscalYear of fiscalYears) {
      const yearKey = String(fiscalYear);
      const yearStats = match ? index.employers[match.key]?.years?.[yearKey] : null;
      const stats = yearStats ? mergeEmployerAndTitleStats(yearStats, jobTitle) : emptyStats();
      byFiscalYear[yearKey] = stats;
      addStats(combined, stats);
    }

    const displayName = match ? (index.employers[match.key]?.displayName || companyName) : companyName;

    return {
      fiscalYears,
      partialYear,
      coverageLabel: metadata.coverageLabel || "FY2026 Q1 + FY2025",
      employerMatch: match?.key || null,
      confidence: match?.confidence || "none",
      combined,
      byFiscalYear,
      sourceLinks: sourceLinks(displayName)
    };
  }

  root.VisaSponsor = {
    ...(root.VisaSponsor || {}),
    emptyStats,
    lookupSponsorship,
    suggestCompanies,
    calculateTrend,
    calculateCertRate
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
