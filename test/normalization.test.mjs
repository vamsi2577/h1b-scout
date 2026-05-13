import test from "node:test";
import assert from "node:assert/strict";

globalThis.VisaSponsor = {};
await import("../extension/src/shared/normalization.js");

test("normalizes employer legal suffixes and punctuation", () => {
  assert.equal(VisaSponsor.normalizeEmployer("Acme, Inc."), "ACME");
  assert.equal(VisaSponsor.normalizeEmployer("Foo & Bar LLC"), "FOO AND BAR");
  assert.equal(VisaSponsor.normalizeEmployer("Example Corporation"), "EXAMPLE");
});

test("normalizes titles and scores related titles", () => {
  assert.equal(VisaSponsor.normalizeTitle("Senior Software Engineer"), "SENIOR SOFTWARE ENGINEER");
  assert.ok(VisaSponsor.titleSimilarity("Software Engineer", "Senior Software Engineer II") >= 0.5);
  assert.equal(VisaSponsor.titleSimilarity("Product Designer", "Tax Analyst"), 0);
});
