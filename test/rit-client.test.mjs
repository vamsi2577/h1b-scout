// Tests for the RIT backend-proxy pure helpers (extension/src/shared/rit-client.js).
// These cover the data-shaping the service worker does around the RIT backend:
// backend-URL normalization and résumé-generation response-header parsing.
// No browser, no chrome.*, no live backend.

import test from "node:test";
import assert from "node:assert/strict";

globalThis.VisaSponsor = {};
await import("../extension/src/shared/rit-client.js");
const { normalizeBackendUrl, parseGenerateResumeHeaders, buildAuthHeaders, tokenPrefix, DEFAULT_BACKEND_URL } =
  globalThis.VisaSponsor.RIT;

// A minimal Headers-like double: case-sensitive .get(), like the test only
// ever asks for the exact header names the code uses.
function headers(map) {
  return { get: (name) => (name in map ? map[name] : null) };
}

// ── normalizeBackendUrl ───────────────────────────────────────────────────────

test("normalizeBackendUrl falls back to the default when unset", () => {
  assert.equal(normalizeBackendUrl(undefined), DEFAULT_BACKEND_URL);
  assert.equal(normalizeBackendUrl(null), DEFAULT_BACKEND_URL);
  assert.equal(normalizeBackendUrl(""), DEFAULT_BACKEND_URL);
});

test("normalizeBackendUrl honours a configured URL", () => {
  assert.equal(normalizeBackendUrl("https://rit.example.com"), "https://rit.example.com");
});

test("normalizeBackendUrl strips trailing slashes", () => {
  assert.equal(normalizeBackendUrl("http://localhost:8000/"), "http://localhost:8000");
  assert.equal(normalizeBackendUrl("http://localhost:8000///"), "http://localhost:8000");
});

test("normalizeBackendUrl accepts a custom fallback", () => {
  assert.equal(normalizeBackendUrl("", "http://127.0.0.1:9000"), "http://127.0.0.1:9000");
});

test("normalizeBackendUrl ignores non-string configured values", () => {
  assert.equal(normalizeBackendUrl(1234), DEFAULT_BACKEND_URL);
  assert.equal(normalizeBackendUrl({}), DEFAULT_BACKEND_URL);
});

// ── buildAuthHeaders ──────────────────────────────────────────────────────────

test("buildAuthHeaders adds a Bearer header when a token is present", () => {
  assert.deepEqual(buildAuthHeaders("rit_abc"), { Authorization: "Bearer rit_abc" });
});

test("buildAuthHeaders merges into base headers without mutating them", () => {
  const base = { "Content-Type": "application/json" };
  const out = buildAuthHeaders("rit_abc", base);
  assert.deepEqual(out, { "Content-Type": "application/json", Authorization: "Bearer rit_abc" });
  assert.deepEqual(base, { "Content-Type": "application/json" });  // unmutated
});

test("buildAuthHeaders omits Authorization for a blank/absent token", () => {
  assert.deepEqual(buildAuthHeaders(""), {});
  assert.deepEqual(buildAuthHeaders("   "), {});
  assert.deepEqual(buildAuthHeaders(undefined), {});
  assert.deepEqual(buildAuthHeaders(null, { a: 1 }), { a: 1 });
});

test("buildAuthHeaders trims surrounding whitespace from the token", () => {
  assert.deepEqual(buildAuthHeaders("  rit_abc  "), { Authorization: "Bearer rit_abc" });
});

// ── tokenPrefix ───────────────────────────────────────────────────────────────

test("tokenPrefix returns the leading slug and never throws on junk", () => {
  assert.equal(tokenPrefix("rit_abcdefghijklmnop"), "rit_abcdefgh");   // default len 12
  assert.equal(tokenPrefix("rit_abc", 12), "rit_abc");                 // shorter than len
  assert.equal(tokenPrefix("  rit_abcdef ", 8), "rit_abcd");           // trims first
  assert.equal(tokenPrefix(""), "");
  assert.equal(tokenPrefix(undefined), "");
  assert.equal(tokenPrefix(1234), "");
});

// ── parseGenerateResumeHeaders: X-Metadata is canonical ───────────────────────

test("parseGenerateResumeHeaders prefers X-Metadata fields", () => {
  const meta = {
    filename: "Jane_Doe_Acme.docx",
    application_id: "app-123",
    company_name: "Acme",
    job_title: "Engineer",
    duplicate_warning: true,
  };
  const out = parseGenerateResumeHeaders(headers({
    "X-Metadata": JSON.stringify(meta),
    "Content-Disposition": 'attachment; filename="ignored.docx"',
    "X-Application-Id": "ignored",
    "X-Duplicate-Warning": "false",
  }));
  assert.equal(out.filename, "Jane_Doe_Acme.docx");
  assert.equal(out.applicationId, "app-123");
  assert.equal(out.duplicateWarning, true);
  assert.deepEqual(out.metadata, meta);
});

test("parseGenerateResumeHeaders treats duplicate_warning:false from metadata as false", () => {
  // Even when the fallback header says "true", a boolean in metadata wins.
  const out = parseGenerateResumeHeaders(headers({
    "X-Metadata": JSON.stringify({ duplicate_warning: false }),
    "X-Duplicate-Warning": "true",
  }));
  assert.equal(out.duplicateWarning, false);
});

// ── parseGenerateResumeHeaders: fallbacks when X-Metadata absent ──────────────

test("parseGenerateResumeHeaders falls back to Content-Disposition filename", () => {
  const out = parseGenerateResumeHeaders(headers({
    "Content-Disposition": 'attachment; filename="Resume_From_Header.docx"',
  }));
  assert.equal(out.filename, "Resume_From_Header.docx");
});

test("parseGenerateResumeHeaders falls back to X-Application-Id and X-Duplicate-Warning", () => {
  const out = parseGenerateResumeHeaders(headers({
    "X-Application-Id": "app-fallback",
    "X-Duplicate-Warning": "true",
  }));
  assert.equal(out.applicationId, "app-fallback");
  assert.equal(out.duplicateWarning, true);
  assert.equal(out.metadata, null);
});

test("parseGenerateResumeHeaders defaults filename to Resume.docx", () => {
  const out = parseGenerateResumeHeaders(headers({}));
  assert.equal(out.filename, "Resume.docx");
  assert.equal(out.applicationId, null);
  assert.equal(out.duplicateWarning, false);
  assert.equal(out.metadata, null);
});

// ── parseGenerateResumeHeaders: robustness ────────────────────────────────────

test("parseGenerateResumeHeaders survives malformed X-Metadata JSON", () => {
  // Bad JSON must not throw — it should fall through to the X-* fallbacks.
  const out = parseGenerateResumeHeaders(headers({
    "X-Metadata": "{not valid json",
    "Content-Disposition": 'attachment; filename="fallback.docx"',
    "X-Application-Id": "app-x",
  }));
  assert.equal(out.metadata, null);
  assert.equal(out.filename, "fallback.docx");
  assert.equal(out.applicationId, "app-x");
});

test("parseGenerateResumeHeaders handles a missing headers object", () => {
  const out = parseGenerateResumeHeaders(null);
  assert.equal(out.filename, "Resume.docx");
  assert.equal(out.applicationId, null);
  assert.equal(out.duplicateWarning, false);
  assert.equal(out.metadata, null);
});

test("parseGenerateResumeHeaders X-Duplicate-Warning only true for exact 'true'", () => {
  assert.equal(parseGenerateResumeHeaders(headers({ "X-Duplicate-Warning": "TRUE" })).duplicateWarning, false);
  assert.equal(parseGenerateResumeHeaders(headers({ "X-Duplicate-Warning": "1" })).duplicateWarning, false);
  assert.equal(parseGenerateResumeHeaders(headers({ "X-Duplicate-Warning": "true" })).duplicateWarning, true);
});
