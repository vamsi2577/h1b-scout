(function attachJobExtractor() {
  const source = detectSource(location.hostname);
  const lastSent = { key: "" };

  function detectSource(hostname) {
    if (hostname.includes("greenhouse.io")) return "greenhouse";
    if (hostname.includes("workdayjobs.com") || hostname.includes("myworkdayjobs.com")) return "workday";
    if (hostname.includes("lever.co")) return "lever";
    if (hostname.includes("ashbyhq.com")) return "ashby";
    if (hostname.includes("linkedin.com")) return "linkedin";
    return "unsupported";
  }

  function text(selector) {
    return document.querySelector(selector)?.textContent?.trim() || "";
  }

  function meta(name) {
    return (
      document.querySelector(`meta[property="${name}"]`)?.content ||
      document.querySelector(`meta[name="${name}"]`)?.content ||
      ""
    ).trim();
  }

  function fromJsonLd() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
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

  function workdayCompanyFromUrl() {
    const hostRoot = location.hostname.split(".")[0] || "";
    if (hostRoot && !["www", "jobs", "careers"].includes(hostRoot.toLowerCase())) {
      return titleCaseSlug(hostRoot);
    }

    const pathSegment = location.pathname.split("/").filter(Boolean)[1] || "";
    return titleCaseSlug(pathSegment.replace(/Careers|External|_Careers/gi, ""));
  }

  function workdayTitleFromUrl() {
    const jobSlug = location.pathname.split("/job/")[1]?.split("/")[0] || "";
    const withoutRequisition = jobSlug.replace(/_[A-Z]{0,4}[-_0-9A-Z]+$/i, "");
    return titleCaseSlug(decodeURIComponent(withoutRequisition));
  }

  function cleanWorkdayCompany(value) {
    const cleaned = String(value || "")
      .replace(/^Careers\s+at\s+/i, "")
      .replace(/ Careers$/i, "")
      .trim();
    if (!cleaned || cleaned.includes(".myworkdayjobs.com") || cleaned.includes("/job/")) return "";
    return cleaned;
  }

  function cleanWorkdayTitle(value) {
    const cleaned = String(value || "").replace(/\s*-\s*.+ Careers$/i, "").trim();
    if (!cleaned || cleaned.includes(".myworkdayjobs.com") || cleaned.includes("/job/")) return "";
    return cleaned;
  }

  function greenhouseContext() {
    const jsonLd = fromJsonLd();
    const ogTitle = meta("og:title");
    const parsedOgTitle = parseTitleAtCompany(ogTitle);
    const parsedHeading = parseTitleAtCompany(text("h1"));
    const parsedDocumentTitle = parseTitleAtCompany(document.title.split("|")[0]);

    return {
      companyName:
        jsonLd.companyName ||
        parsedOgTitle.companyName ||
        parsedHeading.companyName ||
        parsedDocumentTitle.companyName ||
        text("[data-mapped='true'] .company-name") ||
        text(".company-name") ||
        meta("og:site_name") ||
        document.title.split("|").at(-1)?.trim() ||
        "",
      jobTitle:
        jsonLd.jobTitle ||
        parsedOgTitle.jobTitle ||
        parsedHeading.jobTitle ||
        parsedDocumentTitle.jobTitle ||
        text("h1").replace(/^Job Application for\s+/i, "").replace(/\s+at\s+.+$/i, "").trim() ||
        ""
    };
  }

  function workdayContext() {
    const jsonLd = fromJsonLd();
    const title = jsonLd.jobTitle || text('[data-automation-id="jobPostingHeader"]') || text("h1") || meta("og:title");
    return {
      companyName:
        jsonLd.companyName ||
        text('[data-automation-id="jobPostingCompany"]') ||
        cleanWorkdayCompany(meta("og:site_name")) ||
        cleanWorkdayCompany(document.title.split("|").at(-1)) ||
        workdayCompanyFromUrl() ||
        "",
      jobTitle: cleanWorkdayTitle(title) || workdayTitleFromUrl()
    };
  }

  function leverContext() {
    const jsonLd = fromJsonLd();
    return {
      companyName: jsonLd.companyName || meta("og:site_name") || "",
      jobTitle: jsonLd.jobTitle || text("h1") || meta("og:title") || ""
    };
  }

  function ashbyContext() {
    const jsonLd = fromJsonLd();
    return {
      companyName: jsonLd.companyName || meta("og:site_name") || "",
      jobTitle: jsonLd.jobTitle || text("h1") || meta("og:title") || ""
    };
  }

  function linkedinContext() {
    // LinkedIn emits schema.org/JobPosting JSON-LD on /jobs/view/* pages — try it first.
    const jsonLd = fromJsonLd();

    // CSS selector fallbacks (LinkedIn updates classes periodically; ordered most → least stable)
    const titleEl =
      document.querySelector("h1.job-details-jobs-unified-top-card__job-title") ||
      document.querySelector(".jobs-unified-top-card__job-title h1") ||
      document.querySelector("h1[class*='job-title']") ||
      document.querySelector("h1");

    const companyEl =
      document.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      document.querySelector(".jobs-unified-top-card__company-name a") ||
      document.querySelector("[class*='top-card__company'] a") ||
      document.querySelector("[class*='company-name'] a");

    // og:title on LinkedIn is often "Job Title at Company Name" — reuse the parser.
    const parsedOg = parseTitleAtCompany(meta("og:title"));

    return {
      jobTitle:
        jsonLd.jobTitle ||
        titleEl?.textContent?.trim() ||
        parsedOg.jobTitle ||
        "",
      companyName:
        jsonLd.companyName ||
        companyEl?.textContent?.trim() ||
        parsedOg.companyName ||
        meta("og:site_name") ||
        ""
    };
  }

  function extractContext() {
    let context = {};
    if (source === "greenhouse") context = greenhouseContext();
    else if (source === "workday") context = workdayContext();
    else if (source === "lever") context = leverContext();
    else if (source === "ashby") context = ashbyContext();
    else if (source === "linkedin") context = linkedinContext();

    const signals = (typeof VisaSponsor !== "undefined" && VisaSponsor.extractSignals)
      ? VisaSponsor.extractSignals()
      : [];

    return {
      type: "JOB_CONTEXT_FOUND",
      companyName: context.companyName || "",
      jobTitle: context.jobTitle || "",
      source,
      url: location.href,
      signals
    };
  }

  function sendContext() {
    if (source === "unsupported") return;
    if (source === "greenhouse" && !location.pathname.includes("/jobs/")) return;
    if (source === "workday" && !location.pathname.includes("/job/")) return;
    // Lever: /company-name/uuid  — must have a path with at least 2 segments
    if (source === "lever" && location.pathname.split("/").filter(Boolean).length < 2) return;
    // Ashby: /company-name/uuid — same structure
    if (source === "ashby" && location.pathname.split("/").filter(Boolean).length < 2) return;
    // LinkedIn: only fire on individual job view pages, not search/listings
    if (source === "linkedin" && !location.pathname.startsWith("/jobs/view/")) return;
    const context = extractContext();
    if (!context.companyName && !context.jobTitle) return;
    const key = `${context.companyName}|${context.jobTitle}|${context.url}`;
    if (key === lastSent.key) return;
    lastSent.key = key;
    chrome.runtime.sendMessage(context).catch(() => {});
    observer.disconnect();
  }

  sendContext();
  setTimeout(sendContext, 1000);
  setTimeout(sendContext, 3000);

  const observer = new MutationObserver(() => sendContext());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
