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

// ── cleanWorkdayCompany ──────────────────────────────────────────────────────

function cleanWorkdayCompany(value) {
  const cleaned = String(value || "")
    .replace(/^Careers\s+at\s+/i, "")
    .replace(/ Careers$/i, "")
    .trim();
  // Use anchored regex instead of substring check to avoid incomplete URL
  // sanitization — ensures myworkdayjobs.com only matches as a hostname component.
  if (!cleaned
    || /(?:^|\.)myworkdayjobs\.com(?:\/|:|$)/i.test(cleaned)
    || /(?:^|\/)job\//i.test(cleaned)) return "";
  return cleaned;
}

test("cleanWorkdayCompany strips leading 'Careers at' prefix", () => {
  assert.equal(cleanWorkdayCompany("Careers at Acme Corp"), "Acme Corp");
});

test("cleanWorkdayCompany strips trailing ' Careers' suffix", () => {
  assert.equal(cleanWorkdayCompany("Acme Corp Careers"), "Acme Corp");
});

test("cleanWorkdayCompany returns value unchanged when no prefix or suffix", () => {
  assert.equal(cleanWorkdayCompany("Acme Corp"), "Acme Corp");
});

test("cleanWorkdayCompany rejects values containing .myworkdayjobs.com", () => {
  assert.equal(cleanWorkdayCompany("https://acme.myworkdayjobs.com"), "");
});

test("cleanWorkdayCompany rejects values containing /job/ path", () => {
  assert.equal(cleanWorkdayCompany("acme.com/job/engineer"), "");
});

test("cleanWorkdayCompany returns empty string for empty input", () => {
  assert.equal(cleanWorkdayCompany(""), "");
});

test("cleanWorkdayCompany returns empty string for null input", () => {
  assert.equal(cleanWorkdayCompany(null), "");
});

// ── cleanWorkdayTitle ────────────────────────────────────────────────────────

function cleanWorkdayTitle(value) {
  const cleaned = String(value || "").replace(/\s*-\s*.+ Careers$/i, "").trim();
  // Anchored regex — same rationale as cleanWorkdayCompany above.
  if (!cleaned
    || /(?:^|\.)myworkdayjobs\.com(?:\/|:|$)/i.test(cleaned)
    || /(?:^|\/)job\//i.test(cleaned)) return "";
  return cleaned;
}

test("cleanWorkdayTitle strips ' - Acme Careers' suffix", () => {
  assert.equal(cleanWorkdayTitle("Software Engineer - Acme Careers"), "Software Engineer");
});

test("cleanWorkdayTitle returns value unchanged when no suffix", () => {
  assert.equal(cleanWorkdayTitle("Software Engineer"), "Software Engineer");
});

test("cleanWorkdayTitle rejects values containing .myworkdayjobs.com", () => {
  assert.equal(cleanWorkdayTitle("https://acme.myworkdayjobs.com/job/abc"), "");
});

test("cleanWorkdayTitle returns empty string for empty input", () => {
  assert.equal(cleanWorkdayTitle(""), "");
});

test("cleanWorkdayTitle returns empty string for null input", () => {
  assert.equal(cleanWorkdayTitle(null), "");
});

// ── fromJsonLd ───────────────────────────────────────────────────────────────

function fromJsonLdWithScripts(scripts) {
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || "{}");
      if (typeof parsed !== "object" || parsed === null) continue;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const job = nodes.find((node) => node && (node["@type"] === "JobPosting" || node.title));
      if (job) {
        return {
          companyName: job.hiringOrganization?.name || "",
          jobTitle: job.title || ""
        };
      }
    } catch {
      // Ignore malformed site-provided JSON-LD.
    }
  }
  return {};
}

test("fromJsonLd returns empty object for null JSON parse result", () => {
  assert.deepStrictEqual(fromJsonLdWithScripts([{ textContent: "null" }]), {});
});

test("fromJsonLd returns empty object for string JSON parse result", () => {
  assert.deepStrictEqual(fromJsonLdWithScripts([{ textContent: '"just a string"' }]), {});
});

test("fromJsonLd returns empty object for numeric JSON parse result", () => {
  assert.deepStrictEqual(fromJsonLdWithScripts([{ textContent: "42" }]), {});
});

test("fromJsonLd extracts title and company from valid JobPosting", () => {
  const ld = { "@type": "JobPosting", title: "Engineer", hiringOrganization: { name: "Acme" } };
  const result = fromJsonLdWithScripts([{ textContent: JSON.stringify(ld) }]);
  assert.equal(result.jobTitle, "Engineer");
  assert.equal(result.companyName, "Acme");
});

test("fromJsonLd handles array of LD+JSON nodes, picks JobPosting", () => {
  const ld = [{ "@type": "Organization" }, { "@type": "JobPosting", title: "Eng", hiringOrganization: { name: "Corp" } }];
  const result = fromJsonLdWithScripts([{ textContent: JSON.stringify(ld) }]);
  assert.equal(result.jobTitle, "Eng");
  assert.equal(result.companyName, "Corp");
});

test("fromJsonLd skips malformed JSON and continues to next script", () => {
  const valid = { "@type": "JobPosting", title: "Dev", hiringOrganization: { name: "Co" } };
  const result = fromJsonLdWithScripts([
    { textContent: "{ bad json {{" },
    { textContent: JSON.stringify(valid) }
  ]);
  assert.equal(result.jobTitle, "Dev");
});

test("fromJsonLd returns empty object when no scripts match", () => {
  assert.deepStrictEqual(fromJsonLdWithScripts([{ textContent: '{"@type":"WebPage"}' }]), {});
});
