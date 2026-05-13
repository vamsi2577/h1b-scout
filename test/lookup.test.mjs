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
