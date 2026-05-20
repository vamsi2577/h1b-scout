import test from "node:test";
import assert from "node:assert/strict";

// ── Dice extraction logic ─────────────────────────────────────────────────────
// The extractor is DOM-dependent so we test the logic it relies on using
// minimal mock DOM objects (plain JS objects with a querySelector stub).
//
// Mirrors diceContext() from extractors/dice.js:
//   company → a[data-wa-click="djv-job-company-profile-click"] textContent
//   title   → h1 textContent
//   both wrapped in the [data-testid="job-detail-header-card"] container guard

function mockEl(textContent) {
  return { textContent };
}

// Minimal querySelector mock: maps exact selector strings → child elements.
function mockHeader(children = {}) {
  return {
    querySelector(sel) {
      return children[sel] ?? null;
    }
  };
}

// Mirrors diceContext() extraction
function diceContext(header) {
  if (!header) return { companyName: "", jobTitle: "" };
  const companyEl = header.querySelector('a[data-wa-click="djv-job-company-profile-click"]');
  const titleEl   = header.querySelector("h1");
  return {
    companyName: companyEl?.textContent?.trim() || "",
    jobTitle:    titleEl?.textContent?.trim()    || "",
  };
}

// Mirrors buildCopyText() assembly logic (pure string joining)
function buildCopyText(title, company, jd) {
  return [title, company, jd].filter(Boolean).join("\n\n");
}

// ── diceContext ───────────────────────────────────────────────────────────────

test("dice: extracts company and title from header card", () => {
  const header = mockHeader({
    'a[data-wa-click="djv-job-company-profile-click"]': mockEl("Randstad Digital"),
    "h1": mockEl("Java Developer"),
  });
  const { companyName, jobTitle } = diceContext(header);
  assert.equal(companyName, "Randstad Digital");
  assert.equal(jobTitle, "Java Developer");
});

test("dice: trims whitespace from company and title", () => {
  const header = mockHeader({
    'a[data-wa-click="djv-job-company-profile-click"]': mockEl("  Accenture  "),
    "h1": mockEl("  Senior Java Developer  "),
  });
  const { companyName, jobTitle } = diceContext(header);
  assert.equal(companyName, "Accenture");
  assert.equal(jobTitle, "Senior Java Developer");
});

test("dice: returns empty strings when header card is null", () => {
  const { companyName, jobTitle } = diceContext(null);
  assert.equal(companyName, "");
  assert.equal(jobTitle, "");
});

test("dice: returns empty company when company element is missing", () => {
  const header = mockHeader({
    "h1": mockEl("Backend Engineer"),
    // no company anchor
  });
  const { companyName, jobTitle } = diceContext(header);
  assert.equal(companyName, "");
  assert.equal(jobTitle, "Backend Engineer");
});

test("dice: returns empty title when h1 is missing", () => {
  const header = mockHeader({
    'a[data-wa-click="djv-job-company-profile-click"]': mockEl("Google"),
    // no h1
  });
  const { companyName, jobTitle } = diceContext(header);
  assert.equal(companyName, "Google");
  assert.equal(jobTitle, "");
});

test("dice: both elements missing → both empty strings", () => {
  const header = mockHeader({});
  const { companyName, jobTitle } = diceContext(header);
  assert.equal(companyName, "");
  assert.equal(jobTitle, "");
});

test("dice: company name with special characters", () => {
  const header = mockHeader({
    'a[data-wa-click="djv-job-company-profile-click"]': mockEl("AT&T Inc."),
    "h1": mockEl("Staff Software Engineer"),
  });
  const { companyName } = diceContext(header);
  assert.equal(companyName, "AT&T Inc.");
});

// ── buildCopyText ─────────────────────────────────────────────────────────────

test("dice copyText: assembles title + company + JD with blank-line separators", () => {
  const result = buildCopyText("Java Developer", "Randstad Digital", "job summary:\n...");
  assert.equal(result, "Java Developer\n\nRandstad Digital\n\njob summary:\n...");
});

test("dice copyText: omits empty fields — no double blank lines", () => {
  const result = buildCopyText("Senior Engineer", "", "responsibilities:\n...");
  assert.equal(result, "Senior Engineer\n\nresponsibilities:\n...");
});

test("dice copyText: all fields empty → empty string", () => {
  const result = buildCopyText("", "", "");
  assert.equal(result, "");
});

test("dice copyText: only JD present", () => {
  const result = buildCopyText("", "", "Some job description text.");
  assert.equal(result, "Some job description text.");
});

test("dice copyText: title and company only (no JD text yet)", () => {
  const result = buildCopyText("Data Engineer", "Databricks", "");
  assert.equal(result, "Data Engineer\n\nDatabricks");
});
