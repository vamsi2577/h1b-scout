import test from "node:test";
import assert from "node:assert/strict";

// ── HiringCafe extraction logic ───────────────────────────────────────────────
// The extractor is DOM-dependent so we test the pure logic it relies on:
//   1. "@ Company" → "Company" transformation (company name cleaning)
//   2. og:title "Job Title at Company Name" parsing (via parseTitleAtCompany regex)
//   3. Edge cases: missing "@", extra whitespace, multi-"at" titles

function stripAtPrefix(raw) {
  return String(raw || "").replace(/^@\s*/, "").trim();
}

// Mirrors parseTitleAtCompany in common.js without importing the full extractor
function parseTitleAtCompany(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const appMatch = text.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
  if (appMatch) return { jobTitle: appMatch[1].trim(), companyName: appMatch[2].trim() };
  const atMatch = text.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) return { jobTitle: atMatch[1].trim(), companyName: atMatch[2].trim() };
  return {};
}

// ── Company name cleaning ─────────────────────────────────────────────────────

test("hiringcafe: '@ Nexla' → 'Nexla'", () => {
  assert.equal(stripAtPrefix("@ Nexla"), "Nexla");
});

test("hiringcafe: '@Amount' (no space) → 'Amount'", () => {
  assert.equal(stripAtPrefix("@Amount"), "Amount");
});

test("hiringcafe: '@  Google' (extra spaces) → 'Google'", () => {
  assert.equal(stripAtPrefix("@  Google"), "Google");
});

test("hiringcafe: plain company without '@' passes through unchanged", () => {
  assert.equal(stripAtPrefix("Johnson Health Tech"), "Johnson Health Tech");
});

test("hiringcafe: empty string → empty string", () => {
  assert.equal(stripAtPrefix(""), "");
});

// ── og:title parsing ──────────────────────────────────────────────────────────

test("hiringcafe: 'Job Title at Company' splits correctly", () => {
  const r = parseTitleAtCompany("Software Engineer at Google");
  assert.equal(r.jobTitle, "Software Engineer");
  assert.equal(r.companyName, "Google");
});

test("hiringcafe: title with location suffix splits on last 'at'... wait, non-greedy title", () => {
  // parseTitleAtCompany is non-greedy on title, so first " at " is the split point
  const r = parseTitleAtCompany("Post-Grad Mentorship Opportunity for Dentists - Topeka at Lumio Dental");
  assert.equal(r.companyName, "Lumio Dental");
  assert.ok(r.jobTitle.includes("Topeka"));
});

test("hiringcafe: 'Automation Engineer at Amount' splits correctly", () => {
  const r = parseTitleAtCompany("Automation Engineer at Amount");
  assert.equal(r.jobTitle, "Automation Engineer");
  assert.equal(r.companyName, "Amount");
});

test("hiringcafe: og:title without 'at' returns empty object", () => {
  const r = parseTitleAtCompany("HiringCafe - AI Job Search");
  assert.equal(r.jobTitle, undefined);
  assert.equal(r.companyName, undefined);
});

test("hiringcafe: empty og:title returns empty object", () => {
  const r = parseTitleAtCompany("");
  assert.equal(r.jobTitle, undefined);
});

test("hiringcafe: 'Job Application for Engineer at Google' parses application format", () => {
  const r = parseTitleAtCompany("Job Application for Engineer at Google");
  assert.equal(r.jobTitle, "Engineer");
  assert.equal(r.companyName, "Google");
});
