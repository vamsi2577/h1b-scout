import test from "node:test";
import assert from "node:assert/strict";

// signals-extractor.js reads document.body.innerText — mock the DOM
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => []
};
globalThis.window = globalThis;
globalThis.VisaSponsor = {};

await import("../extension/src/content/signals-extractor.js");
const { extractSignals } = globalThis.VisaSponsor;

function withBody(text, fn) {
  globalThis.document.body = { innerText: text };
  return fn();
}

// ── No sponsorship ────────────────────────────────────────────────────────────

test("detects 'no visa sponsorship'", () => {
  const signals = withBody(
    "We do not offer no visa sponsorship for this role.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "no_sponsorship"));
  assert.equal(signals.find((s) => s.type === "no_sponsorship").severity, "high");
});

test("detects 'will not sponsor'", () => {
  const signals = withBody(
    "The company will not sponsor visas for this position.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "no_sponsorship"));
});

test("detects 'sponsorship is not available'", () => {
  const signals = withBody("Sponsorship is not available for this role.", extractSignals);
  assert.ok(signals.some((s) => s.type === "no_sponsorship"));
});

test("detects long-form 'sponsorship ... is not available' with intervening clause", () => {
  const signals = withBody(
    "Please note that sponsorship of new applicants for employment authorization, or any other immigration-related support, is not available for this position at this time.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "no_sponsorship"));
});

// ── Citizenship required ──────────────────────────────────────────────────────

test("detects 'US citizen only'", () => {
  const signals = withBody("Applicants must be US citizen only.", extractSignals);
  assert.ok(signals.some((s) => s.type === "citizenship_required"));
  assert.equal(signals.find((s) => s.type === "citizenship_required").severity, "high");
});

test("detects 'GC or citizen'", () => {
  const signals = withBody(
    "Candidates must be a green card or citizen of the United States.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "citizenship_required"));
});

// ── Work auth required ────────────────────────────────────────────────────────

test("detects 'must be authorized to work'", () => {
  const signals = withBody(
    "Candidates must be legally authorized to work in the US.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "work_auth_required"));
  assert.equal(signals.find((s) => s.type === "work_auth_required").severity, "medium");
});

test("detects 'right to work in the US'", () => {
  const signals = withBody("Must have right to work in the US without restriction.", extractSignals);
  assert.ok(signals.some((s) => s.type === "work_auth_required"));
});

// ── Clearance required ────────────────────────────────────────────────────────

test("detects 'TS/SCI clearance'", () => {
  const signals = withBody("Active TS/SCI clearance is required.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_required"));
  assert.equal(signals.find((s) => s.type === "clearance_required").severity, "high");
});

test("detects 'Top Secret clearance'", () => {
  const signals = withBody("Must hold an active Top Secret clearance.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_required"));
});

test("detects 'Secret clearance required'", () => {
  const signals = withBody("Secret clearance required for this position.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_required"));
});

test("detects 'polygraph required'", () => {
  const signals = withBody("Candidates must pass a polygraph test.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_required"));
});

test("detects 'DoD clearance'", () => {
  const signals = withBody("Must have an active DoD security clearance.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_required"));
});

// ── Clearance preferred ───────────────────────────────────────────────────────

test("detects 'clearance preferred'", () => {
  const signals = withBody(
    "An active Secret clearance is preferred but not required.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "clearance_preferred"));
  assert.equal(signals.find((s) => s.type === "clearance_preferred").severity, "medium");
});

test("detects 'clearance eligible'", () => {
  const signals = withBody("Candidate must be clearance eligible.", extractSignals);
  assert.ok(signals.some((s) => s.type === "clearance_preferred"));
});

// ── No false positives ────────────────────────────────────────────────────────

test("returns no signals for a clean job description", () => {
  const signals = withBody(
    "We are looking for a software engineer to join our team. Competitive salary and benefits.",
    extractSignals
  );
  assert.equal(signals.length, 0);
});

test("does not match 'trade secret' as clearance", () => {
  const signals = withBody(
    "You will work with proprietary trade secret technologies.",
    extractSignals
  );
  assert.ok(!signals.some((s) => s.type === "clearance_required"));
});

// ── Signal quote captured ─────────────────────────────────────────────────────

test("captures the matched quote text", () => {
  const signals = withBody("This role requires no visa sponsorship at this time.", extractSignals);
  const sig = signals.find((s) => s.type === "no_sponsorship");
  assert.ok(sig?.quote, "should have a quote");
  assert.ok(sig.quote.toLowerCase().includes("sponsorship"));
});

// ── signals-extractor.js lines 99–103: getDescriptionText() selector path ────
// The default mock returns null from querySelector, so all existing tests exercise
// only the document.body.innerText fallback (line 103). This test overrides
// querySelector to return a fake element for the first selector in
// DESCRIPTION_SELECTORS ('[data-automation-id="jobPostingDescription"]'),
// covering the selector-hit branch (lines 99–102).
test("getDescriptionText uses selector element when querySelector returns a match", () => {
  const originalQS = document.querySelector;
  // The first selector tried is '[data-automation-id="jobPostingDescription"]' (Workday).
  // Return a fake element only for that selector so the branch on line 101 is hit.
  document.querySelector = (sel) => {
    if (sel === '[data-automation-id="jobPostingDescription"]') {
      return { innerText: "This position does not sponsor visas of any kind." };
    }
    return null;
  };

  try {
    const signals = extractSignals();
    // "does not sponsor" matches /\bdoes\s+not\s+sponsor\b/i → no_sponsorship
    assert.ok(signals.some((s) => s.type === "no_sponsorship"),
      "expected no_sponsorship signal from text read via selector element");
  } finally {
    document.querySelector = originalQS;
  }
});
