// Inline copies of pure utility functions from extension/src/sidepanel/panel.js.
// panel.js is wrapped in DOMContentLoaded and uses browser globals, so it cannot
// be imported in Node. The function bodies are copied verbatim here.

import { test } from "node:test";
import assert from "node:assert/strict";

// ── Inline copies ─────────────────────────────────────────────────────────────

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatMoney(value) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDataAge(isoString) {
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
}

function truncate(str, length = 200) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

// ── formatNumber ──────────────────────────────────────────────────────────────

test("formatNumber formats large numbers with commas", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
});

test("formatNumber formats zero", () => {
  assert.equal(formatNumber(0), "0");
});

test("formatNumber treats null as zero", () => {
  assert.equal(formatNumber(null), "0");
});

test("formatNumber treats undefined as zero", () => {
  assert.equal(formatNumber(undefined), "0");
});

test("formatNumber formats small numbers without commas", () => {
  assert.equal(formatNumber(42), "42");
});

// ── formatMoney ───────────────────────────────────────────────────────────────

test("formatMoney returns null for falsy input", () => {
  assert.equal(formatMoney(null), null);
  assert.equal(formatMoney(0), null);
  assert.equal(formatMoney(undefined), null);
});

test("formatMoney formats a wage as USD currency", () => {
  const result = formatMoney(150000);
  assert.ok(result.includes("$"), `expected $ in: ${result}`);
  assert.ok(result.includes("150"), `expected 150 in: ${result}`);
});

test("formatMoney has no decimal places", () => {
  const result = formatMoney(99999);
  assert.ok(!result.includes("."), `expected no decimal in: ${result}`);
});

// ── formatDataAge ─────────────────────────────────────────────────────────────

test("formatDataAge returns empty string for null", () => {
  assert.equal(formatDataAge(null), "");
});

test("formatDataAge returns empty string for invalid date string", () => {
  assert.equal(formatDataAge("not-a-date"), "");
});

test("formatDataAge returns 'today' for a date less than 1 day ago", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
  assert.equal(formatDataAge(iso), "Index updated today");
});

test("formatDataAge returns '1 day ago' for yesterday", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(); // 25h ago
  assert.equal(formatDataAge(iso), "Index updated 1 day ago");
});

test("formatDataAge returns days for dates under 30 days", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(); // 10 days ago
  assert.equal(formatDataAge(iso), "Index updated 10 days ago");
});

test("formatDataAge returns '1 month ago' for ~30 days", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 32).toISOString(); // 32 days ago
  assert.equal(formatDataAge(iso), "Index updated 1 month ago");
});

test("formatDataAge returns months for dates under 12 months", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(); // ~3 months
  assert.equal(formatDataAge(iso), "Index updated 3 months ago");
});

test("formatDataAge returns years for dates over 12 months", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400).toISOString(); // ~13 months
  assert.equal(formatDataAge(iso), "Index updated 1 year ago");
});

test("formatDataAge returns plural years for 2+ years", () => {
  const iso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 800).toISOString(); // ~26 months
  assert.equal(formatDataAge(iso), "Index updated 2 years ago");
});

// ── truncate ──────────────────────────────────────────────────────────────────

test("truncate returns empty string for falsy input", () => {
  assert.equal(truncate(null), "");
  assert.equal(truncate(""), "");
  assert.equal(truncate(undefined), "");
});

test("truncate returns string unchanged when under limit", () => {
  assert.equal(truncate("hello"), "hello");
});

test("truncate returns string unchanged at exactly the limit", () => {
  const s = "x".repeat(200);
  assert.equal(truncate(s), s);
});

test("truncate cuts and appends ellipsis when over limit", () => {
  const s = "x".repeat(201);
  const result = truncate(s);
  assert.equal(result.length, 201); // 200 chars + "…" (single char)
  assert.ok(result.endsWith("…"));
});

test("truncate respects a custom length argument", () => {
  const result = truncate("abcdefgh", 5);
  assert.equal(result, "abcde…");
});
