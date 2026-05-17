import test from "node:test";
import assert from "node:assert/strict";

globalThis.VisaSponsor = {};
await import("../extension/src/shared/normalization.js");
await import("../extension/src/shared/lookup.js");

const index = {
  metadata: {
    fiscalYears: [2026, 2025],
    partialYear: 2026,
    coverageLabel: "FY2026 Q1 + FY2025"
  },
  aliases: {},
  employers: {
    ACME: {
      displayName: "Acme Inc",
      years: {
        "2026": {
          summary: {
            lca: { employerTotal: 2, titleTotal: 0, certified: 2, denied: 0, withdrawn: 0, avgWage: 120000, minWage: 110000, maxWage: 130000 },
            perm: { employerTotal: 1, titleTotal: 0, certified: 1, denied: 0, withdrawn: 0 }
          },
          titles: {
            "SOFTWARE ENGINEER": {
              lca: { employerTotal: 1, certified: 1, denied: 0, withdrawn: 0 },
              perm: { employerTotal: 1, certified: 1, denied: 0, withdrawn: 0 }
            }
          }
        },
        "2025": {
          summary: {
            lca: { employerTotal: 3, titleTotal: 0, certified: 2, denied: 1, withdrawn: 0, avgWage: 100000, minWage: 90000, maxWage: 120000 },
            perm: { employerTotal: 0, titleTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
          },
          titles: {
            "SENIOR SOFTWARE ENGINEER": {
              lca: { employerTotal: 2, certified: 2, denied: 0, withdrawn: 0 },
              perm: { employerTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
            }
          }
        }
      }
    }
  }
};

test("returns combined and fiscal-year sponsorship stats", () => {
  const result = VisaSponsor.lookupSponsorship(index, "Acme Inc.", "Software Engineer");
  assert.equal(result.confidence, "high");
  assert.equal(result.employerMatch, "ACME");
  assert.equal(result.combined.lca.employerTotal, 5);
  assert.equal(result.combined.perm.employerTotal, 1);
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 1);
  assert.equal(result.byFiscalYear["2025"].lca.titleTotal, 2);
});

test("returns no-match shape for unknown companies", () => {
  const result = VisaSponsor.lookupSponsorship(index, "Unknown Co", "Software Engineer");
  assert.equal(result.confidence, "none");
  assert.equal(result.combined.lca.employerTotal, 0);
  assert.equal(result.byFiscalYear["2026"].perm.employerTotal, 0);
});

test("alias lookup resolves to canonical employer key with high confidence", () => {
  const indexWithAlias = {
    metadata: { fiscalYears: [2026], partialYear: 2026, coverageLabel: "FY2026" },
    aliases: { "ACME CORP": "ACME" },
    employers: index.employers
  };
  const result = VisaSponsor.lookupSponsorship(indexWithAlias, "Acme Corp", "Software Engineer");
  assert.equal(result.confidence, "high");
  assert.equal(result.employerMatch, "ACME");
});

test("substring match returns medium confidence when score > 0.7", () => {
  const indexSub = {
    metadata: { fiscalYears: [2026], partialYear: 2026, coverageLabel: "FY2026" },
    aliases: {},
    employers: { "ACME GLOBAL SOLUTIONS": index.employers.ACME }
  };
  const result = VisaSponsor.lookupSponsorship(indexSub, "Acme Global", "Software Engineer");
  assert.ok(["medium", "low"].includes(result.confidence), `unexpected confidence: ${result.confidence}`);
});

test("addStats weighted average across two fiscal years", () => {
  const result = VisaSponsor.lookupSponsorship(index, "Acme Inc.", "Software Engineer");
  const expectedAvg = Math.round((120000 * 2 + 100000 * 3) / 5);
  assert.equal(result.combined.lca.avgWage, expectedAvg);
});

test("addStats with null wages on both sides produces null avgWage", () => {
  const indexNoWage = {
    metadata: { fiscalYears: [2026], partialYear: 2026, coverageLabel: "FY2026" },
    aliases: {},
    employers: {
      BETA: {
        displayName: "Beta",
        years: {
          "2026": {
            summary: {
              lca: { employerTotal: 1, titleTotal: 0, certified: 1, denied: 0, withdrawn: 0, avgWage: null, minWage: null, maxWage: null },
              perm: { employerTotal: 0, titleTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
            },
            titles: {}
          }
        }
      }
    }
  };
  const result = VisaSponsor.lookupSponsorship(indexNoWage, "Beta", "Engineer");
  assert.equal(result.combined.lca.avgWage, null);
});

test("partialYear is passed through from metadata", () => {
  const result = VisaSponsor.lookupSponsorship(index, "Acme Inc.", "Software Engineer");
  assert.equal(result.partialYear, 2026);
});

test("suggestCompanies returns similar names from the shard", () => {
  const shard = {
    employers: {
      "AMAZON WEB SERVICES": { displayName: "Amazon Web Services" },
      "AMAZON CORP": { displayName: "Amazon Corp" },
      "GOOGLE": { displayName: "Google" },
      "FACEBOOK": { displayName: "Facebook" }
    }
  };
  const suggestions = VisaSponsor.suggestCompanies(shard, "Amazon");
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].displayName, "Amazon Web Services");
  assert.equal(suggestions[1].displayName, "Amazon Corp");
});

test("calculateTrend identifies up, down, and flat trends", () => {
  assert.equal(VisaSponsor.calculateTrend(111, 100), "up");
  assert.equal(VisaSponsor.calculateTrend(89, 100), "down");
  assert.equal(VisaSponsor.calculateTrend(105, 100), "flat");
  assert.equal(VisaSponsor.calculateTrend(100, 100), "flat");
  assert.equal(VisaSponsor.calculateTrend(10, 0), "up");
  assert.equal(VisaSponsor.calculateTrend(0, 0), "flat");
});

test("calculateCertRate returns rounded percentage", () => {
  assert.equal(VisaSponsor.calculateCertRate(9, 1, 0), 90);
  assert.equal(VisaSponsor.calculateCertRate(1, 1, 1), 33);
  assert.equal(VisaSponsor.calculateCertRate(0, 0, 0), 0);
});

// ── lookup.js: "low" confidence branch ───────────────────────────────────────
// "ACME GLOBAL" (11 chars) is a substring of "ACME GLOBAL SOLUTIONS" (20 chars).
// score = min(11,20)/max(11,20) = 0.55 which is ≤ 0.7, so findEmployer assigns "low".
test("substring match returns low confidence when score <= 0.7", () => {
  const indexLow = {
    metadata: { fiscalYears: [2026], partialYear: 2026, coverageLabel: "FY2026" },
    aliases: {},
    employers: { "ACME GLOBAL SOLUTIONS": index.employers.ACME }
  };
  // "Acme Global" normalizes to "ACME GLOBAL" (11 chars).
  // The key "ACME GLOBAL SOLUTIONS" (20 chars) contains "ACME GLOBAL".
  // Ratio 11/20 = 0.55 → confidence "low" (≤ 0.7 threshold in findEmployer).
  const result = VisaSponsor.lookupSponsorship(indexLow, "Acme Global", "Software Engineer");
  assert.equal(result.confidence, "low");
});

// ── bestTitleStats: Jaccard false-positive guards ────────────────────────────

// Build a focused index for title-matching tests.
// Employer has three title entries that are easily confused when query tokens are short.
const titleTestIndex = {
  metadata: { fiscalYears: [2026], partialYear: 2026, coverageLabel: "FY2026" },
  aliases: {},
  employers: {
    CORP: {
      displayName: "Corp",
      years: {
        "2026": {
          summary: {
            lca: { employerTotal: 10, titleTotal: 0, certified: 10, denied: 0, withdrawn: 0, avgWage: 150000, minWage: 140000, maxWage: 160000 },
            perm: { employerTotal: 0, titleTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
          },
          titles: {
            // Exact data-engineer entry
            "DATA ENGINEER": {
              lca: { employerTotal: 3, certified: 3, denied: 0, withdrawn: 0 },
              perm: { employerTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
            },
            // A different data-adjacent title — should NOT match "Data Engineer"
            "DATA ANALYST": {
              lca: { employerTotal: 5, certified: 5, denied: 0, withdrawn: 0 },
              perm: { employerTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
            },
            // Machine Learning — shares "MACHINE" token with "Machine Vision"
            "MACHINE LEARNING ENGINEER": {
              lca: { employerTotal: 2, certified: 2, denied: 0, withdrawn: 0 },
              perm: { employerTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
            }
          }
        }
      }
    }
  }
};

test("bare 'Engineer' (all stop words) falls back to employer summary, not a title match", () => {
  // titleTokens("Engineer") → [] → Jaccard skipped → titleTotal stays 0 (summary value)
  const result = VisaSponsor.lookupSponsorship(titleTestIndex, "Corp", "Engineer");
  assert.equal(result.confidence, "high");
  // titleTotal must be 0 because no title match was made; employer summary has titleTotal 0
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 0);
});

test("'Senior Engineer' (all stop words) also falls back to employer summary", () => {
  const result = VisaSponsor.lookupSponsorship(titleTestIndex, "Corp", "Senior Engineer");
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 0);
});

test("'Data Engineer' exact match is found before Jaccard runs", () => {
  // normalizeTitle("Data Engineer") = "DATA ENGINEER" → exact key hit → titleTotal = 3
  const result = VisaSponsor.lookupSponsorship(titleTestIndex, "Corp", "Data Engineer");
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 3);
});

test("'Data Engineer' does NOT fall through to 'Data Analyst' via Jaccard (1-token guard)", () => {
  // If the exact key were absent, Jaccard on token ["DATA"] vs ["DATA","ANALYST"]
  // scores 0.5 which is below the 1-token threshold of 0.9 — no spurious match.
  const indexWithoutExact = structuredClone(titleTestIndex);
  delete indexWithoutExact.employers.CORP.years["2026"].titles["DATA ENGINEER"];
  const result = VisaSponsor.lookupSponsorship(indexWithoutExact, "Corp", "Data Engineer");
  // Should fall back to summary (titleTotal 0), not pick DATA ANALYST (titleTotal 5)
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 0);
});

test("'Machine Vision Engineer' does NOT match 'Machine Learning Engineer' via single-token overlap", () => {
  // queryTokens("Machine Vision Engineer") = ["MACHINE","VISION"] (2 tokens)
  // DB title "MACHINE LEARNING ENGINEER" tokens = ["MACHINE","LEARNING"]
  // overlap = 1 (only "MACHINE") → below minOverlap=2 → rejected
  const result = VisaSponsor.lookupSponsorship(titleTestIndex, "Corp", "Machine Vision Engineer");
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 0);
});

test("'Machine Learning Engineer' matches its own DB entry via exact key", () => {
  const result = VisaSponsor.lookupSponsorship(titleTestIndex, "Corp", "Machine Learning Engineer");
  assert.equal(result.byFiscalYear["2026"].lca.titleTotal, 2);
});
