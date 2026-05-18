(function attachScoring(root) {
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

  // Compute an A–F sponsorship grade from combined LCA stats + trend.
  // Scoring (max 100):
  //   Cert rate  0–60 pts  — primary signal
  //   Volume     0–30 pts  — log-scaled: 10 at 1, 20 at 10, 30 at 100+
  //   Trend      0–10 pts  — y-o-y direction (up=10, flat=5, down=0)
  function computeSponsorScore(lookup) {
    const { combined, byFiscalYear, fiscalYears } = lookup;
    const filingTotal = (combined.lca.certified || 0) + (combined.lca.denied || 0) + (combined.lca.withdrawn || 0);
    if (!filingTotal) return null;

    const certRate = calculateCertRate(combined.lca.certified, combined.lca.denied, combined.lca.withdrawn);
    const volume = combined.lca.employerTotal || 0;

    const certScore   = Math.round(certRate * 0.6);
    const volumeScore = Math.min(30, Math.round(10 * Math.log10(volume || 1) + 10));

    const years = [...(fiscalYears || [])].sort((a, b) => b - a);
    let trendScore = 5;
    if (years.length >= 2) {
      const curr  = byFiscalYear[String(years[0])]?.lca?.employerTotal || 0;
      const prior = byFiscalYear[String(years[1])]?.lca?.employerTotal || 0;
      trendScore = curr > prior * 1.1 ? 10 : curr < prior * 0.9 ? 0 : 5;
    }

    const score = certScore + volumeScore + trendScore;
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
    return { score, grade, certRate, volume };
  }

  root.VisaSponsor = {
    ...(root.VisaSponsor || {}),
    calculateTrend,
    calculateCertRate,
    computeSponsorScore
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
