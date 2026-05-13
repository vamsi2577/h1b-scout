import test from "node:test";
import assert from "node:assert/strict";

function parseTitleAtCompany(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const applicationMatch = text.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
  if (applicationMatch) {
    return {
      jobTitle: applicationMatch[1].trim(),
      companyName: applicationMatch[2].trim()
    };
  }

  const atMatch = text.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return {
      jobTitle: atMatch[1].trim(),
      companyName: atMatch[2].trim()
    };
  }

  return {};
}

function titleCaseSlug(value) {
  const upperCaseBrands = new Map([
    ["relx", "RELX"],
    ["lseg", "LSEG"],
    ["resmed", "ResMed"]
  ]);
  const cleaned = String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mapped = upperCaseBrands.get(cleaned.toLowerCase());
  if (mapped) return mapped;
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function workdayFallback(url) {
  const parsed = new URL(url);
  const hostRoot = parsed.hostname.split(".")[0] || "";
  const companyName = titleCaseSlug(hostRoot);
  const jobSlug = parsed.pathname.split("/job/")[1]?.split("/")[0] || "";
  const jobTitle = titleCaseSlug(decodeURIComponent(jobSlug.replace(/_[A-Z]{0,4}[-_0-9A-Z]+$/i, "")));
  return { companyName, jobTitle };
}

test("parses Greenhouse application heading into title and company", () => {
  assert.deepEqual(parseTitleAtCompany("Job Application for Software Engineer, Next.js at Vercel"), {
    jobTitle: "Software Engineer, Next.js",
    companyName: "Vercel"
  });
});

test("parses Greenhouse OpenGraph title into title and company", () => {
  assert.deepEqual(parseTitleAtCompany("Software Engineer, Next.js at Vercel"), {
    jobTitle: "Software Engineer, Next.js",
    companyName: "Vercel"
  });
});

test("builds Workday fallback company and title from job URL", () => {
  assert.deepEqual(
    workdayFallback("https://resmed.wd3.myworkdayjobs.com/en-US/ResMed_External_Careers/job/Software-Engineer_JR_044991-1"),
    {
      companyName: "ResMed",
      jobTitle: "Software Engineer"
    }
  );
});

test("preserves known uppercase Workday company names from host slug", () => {
  assert.equal(workdayFallback("https://relx.wd3.myworkdayjobs.com/en-US/relx/job/Software-Engineer-III_R111455").companyName, "RELX");
});

test("removes numeric-only Workday requisition suffixes from fallback title", () => {
  assert.equal(
    workdayFallback("https://philips.wd3.myworkdayjobs.com/en-US/jobs-and-careers/job/Software-Engineer---Systems-Programming---Application-Development-C--_576842").jobTitle,
    "Software Engineer Systems Programming Application Development C"
  );
});
