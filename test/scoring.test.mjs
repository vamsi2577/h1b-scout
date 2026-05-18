import test from "node:test";
import assert from "node:assert/strict";

globalThis.VisaSponsor = {};
await import("../extension/src/shared/scoring.js");

const { calculateTrend, calculateCertRate, computeSponsorScore } = globalThis.VisaSponsor;

// ── calculateTrend ────────────────────────────────────────────────────────────
test("calculateTrend: flat when both zero", () => {
  assert.equal(calculateTrend(0, 0), "flat");
});

test("calculateTrend: up when prior is zero and curr > 0", () => {
  assert.equal(calculateTrend(10, 0), "up");
});

test("calculateTrend: up when curr > prior * 1.1", () => {
  assert.equal(calculateTrend(120, 100), "up");
});

test("calculateTrend: flat at exactly 10% increase boundary (curr == prior * 1.1)", () => {
  assert.equal(calculateTrend(110, 100), "flat");
});

test("calculateTrend: down when curr < prior * 0.9", () => {
  assert.equal(calculateTrend(80, 100), "down");
});

test("calculateTrend: flat at exactly 10% decrease boundary (curr == prior * 0.9)", () => {
  assert.equal(calculateTrend(90, 100), "flat");
});

test("calculateTrend: flat within 10% band", () => {
  assert.equal(calculateTrend(105, 100), "flat");
});

// ── calculateCertRate ─────────────────────────────────────────────────────────
test("calculateCertRate: 0 when no filings", () => {
  assert.equal(calculateCertRate(0, 0, 0), 0);
});

test("calculateCertRate: 100 when all certified", () => {
  assert.equal(calculateCertRate(10, 0, 0), 100);
});

test("calculateCertRate: includes denied and withdrawn in denominator", () => {
  assert.equal(calculateCertRate(8, 1, 1), 80);
});

test("calculateCertRate: rounds to nearest integer", () => {
  assert.equal(calculateCertRate(1, 2, 0), 33); // 1/3 = 33.33...
});

// ── computeSponsorScore ───────────────────────────────────────────────────────
function makeLookup({ certified = 0, denied = 0, withdrawn = 0, employerTotal = 0 } = {}, fiscalYears = [2026, 2025], byFiscalYear = {}) {
  return {
    combined: {
      lca: { employerTotal, certified, denied, withdrawn },
      perm: { employerTotal: 0, certified: 0, denied: 0, withdrawn: 0 }
    },
    fiscalYears,
    byFiscalYear
  };
}

test("computeSponsorScore: null when no filings", () => {
  assert.equal(computeSponsorScore(makeLookup()), null);
});

test("computeSponsorScore: grade A for high cert rate + high volume", () => {
  const result = computeSponsorScore(makeLookup({ certified: 490, denied: 5, withdrawn: 5, employerTotal: 500 }));
  assert.ok(result);
  assert.equal(result.grade, "A");
});

test("computeSponsorScore: grade F for very low cert rate (10%) + low volume", () => {
  // certScore=6 (10%*0.6) + volumeScore=20 (log10(10)*10+10) + trendScore=5 = 31 → F
  const result = computeSponsorScore(makeLookup({ certified: 1, denied: 9, withdrawn: 0, employerTotal: 10 }));
  assert.ok(result);
  assert.equal(result.grade, "F");
});

test("computeSponsorScore: result includes certRate and volume", () => {
  const result = computeSponsorScore(makeLookup({ certified: 90, denied: 5, withdrawn: 5, employerTotal: 100 }));
  assert.equal(result.certRate, 90);
  assert.equal(result.volume, 100);
});

test("computeSponsorScore: score is a number between 0 and 100", () => {
  const result = computeSponsorScore(makeLookup({ certified: 50, denied: 30, withdrawn: 20, employerTotal: 100 }));
  assert.ok(result.score >= 0 && result.score <= 100);
});

test("computeSponsorScore: trend bonus applied for up year (curr > prior * 1.1)", () => {
  const withUpTrend = makeLookup({ certified: 80, denied: 10, withdrawn: 10, employerTotal: 100 }, [2026, 2025], {
    "2026": { lca: { employerTotal: 120 }, perm: {} },
    "2025": { lca: { employerTotal: 100 }, perm: {} }
  });
  const withFlat = makeLookup({ certified: 80, denied: 10, withdrawn: 10, employerTotal: 100 }, [2026, 2025], {
    "2026": { lca: { employerTotal: 100 }, perm: {} },
    "2025": { lca: { employerTotal: 100 }, perm: {} }
  });
  assert.ok(computeSponsorScore(withUpTrend).score > computeSponsorScore(withFlat).score);
});
