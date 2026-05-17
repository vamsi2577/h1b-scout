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

// ── Sponsorship available (positive) ─────────────────────────────────────────

test("detects 'visa sponsorship available'", () => {
  const signals = withBody(
    "Visa sponsorship is available for qualified candidates.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "sponsorship_available"));
  assert.equal(signals.find((s) => s.type === "sponsorship_available").severity, "positive");
});

test("detects 'will sponsor' as sponsorship_available", () => {
  const signals = withBody(
    "We will sponsor H-1B visas for exceptional candidates.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "sponsorship_available"));
});

test("detects 'h1b sponsor' as sponsorship_available", () => {
  const signals = withBody(
    "This company is an H1B sponsor and welcomes international applicants.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "sponsorship_available"));
});

// ── OPT / CPT welcome (positive) ─────────────────────────────────────────────

test("detects 'OPT welcome'", () => {
  const signals = withBody("OPT welcome. CPT candidates may also apply.", extractSignals);
  assert.ok(signals.some((s) => s.type === "opt_cpt_welcome"));
  assert.equal(signals.find((s) => s.type === "opt_cpt_welcome").severity, "positive");
});

test("detects 'OPT/CPT' as opt_cpt_welcome", () => {
  const signals = withBody(
    "We accept OPT/CPT students for this internship position.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "opt_cpt_welcome"));
});

test("detects 'STEM OPT' as opt_cpt_welcome", () => {
  const signals = withBody(
    "Candidates on STEM OPT extension are encouraged to apply.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "opt_cpt_welcome"));
});

// ── E-Verify enrolled (info) ──────────────────────────────────────────────────

test("detects 'E-Verify' as everify_enrolled", () => {
  const signals = withBody(
    "This employer participates in E-Verify to confirm work authorization.",
    extractSignals
  );
  assert.ok(signals.some((s) => s.type === "everify_enrolled"));
  assert.equal(signals.find((s) => s.type === "everify_enrolled").severity, "info");
});

test("detects 'everify' (no hyphen) as everify_enrolled", () => {
  const signals = withBody("We use everify to confirm employment eligibility.", extractSignals);
  assert.ok(signals.some((s) => s.type === "everify_enrolled"));
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
