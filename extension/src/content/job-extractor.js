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

  // LinkedIn renders job content inside a same-origin /preload iframe (no sandbox).
  // When the content script runs inside the iframe, `document` is correct.
  // When it runs in the main frame, we read the iframe's contentDocument directly.
  function getLinkedInDoc() {
    if (location.pathname.startsWith("/preload")) return document; // already inside the iframe
    try {
      const iframe = document.querySelector("iframe[src*='/preload']");
      const iDoc = iframe?.contentDocument;
      if (iDoc && iDoc.readyState !== "uninitialized" && iDoc.body) return iDoc;
    } catch { /* cross-origin guard — fall through */ }
    return document;
  }

  function linkedinContext() {
    const doc = getLinkedInDoc();

    // JSON-LD: present on direct /jobs/view/* pages in the main doc
    const jsonLd = fromJsonLd();

    // Confirmed selectors (verified against live LinkedIn DOM May 2026):
    // Title lives in an h1 with class "t-24 t-bold inline" inside
    //   div.job-details-jobs-unified-top-card__job-title
    // Company lives in div.job-details-jobs-unified-top-card__company-name > a
    const titleEl =
      doc.querySelector("h1.job-details-jobs-unified-top-card__job-title") ||
      doc.querySelector(".jobs-unified-top-card__job-title h1") ||
      doc.querySelector("h1[class*='job-title']") ||
      doc.querySelector("h1");  // fallback — the h1 uses utility classes, not a job-title class

    const companyEl =
      doc.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      doc.querySelector(".job-details-jobs-unified-top-card__company-name") ||  // div fallback
      doc.querySelector(".jobs-unified-top-card__company-name a") ||
      doc.querySelector("[class*='top-card__company'] a") ||
      doc.querySelector("[class*='company-name'] a");

    // og:title is "Job Title at Company" on /jobs/view/* pages
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
    // LinkedIn: two contexts where this script runs —
    //   1. Main frame at /jobs/* — guard on currentJobId or /jobs/view/ path.
    //   2. Preload iframe at /preload/ — the entire jobs UI lives here; guard on
    //      job content being present in the DOM (can't read parent URL from sandboxed iframe).
    if (source === "linkedin") {
      if (location.pathname.startsWith("/jobs/")) {
        const currentJobId = new URLSearchParams(location.search).get("currentJobId");
        if (!currentJobId && !location.pathname.startsWith("/jobs/view/")) return;
      } else if (location.pathname.startsWith("/preload/") || location.pathname === "/preload") {
        // Inside the preload iframe — only proceed if job detail content is present
        const hasJobContent = !!(
          document.querySelector("[class*='job-details-jobs-unified-top-card']") ||
          document.querySelector("[class*='jobs-details__main']") ||
          document.querySelector("h1")
        );
        if (!hasJobContent) return;
      } else {
        return; // Not a recognized LinkedIn jobs path
      }
    }
    const context = extractContext();
    if (!context.companyName && !context.jobTitle) return;
    // Include signal count so a retry that finds new signals (e.g. description
    // loaded after first send) isn't blocked by the deduplication check.
    const key = `${context.companyName}|${context.jobTitle}|${context.url}|${context.signals.length}`;
    if (key === lastSent.key) return;
    lastSent.key = key;
    chrome.runtime.sendMessage(context).catch(() => {});
    // Keep observer alive on LinkedIn — user browses multiple jobs in the same pane.
    // On all other sources the page content is fixed once loaded, so disconnect.
    if (source !== "linkedin") observer?.disconnect();
  }

  // Declare before the initial sendContext() calls so observer?.disconnect() is safe (undefined = no-op).
  let observer;

  sendContext();
  setTimeout(sendContext, 1000);
  setTimeout(sendContext, 3000);
  // LinkedIn hydrates slowly — extra retry catches cases where the iframe content
  // isn't ready within the first 3 seconds.
  if (source === "linkedin") setTimeout(sendContext, 6000);

  observer = new MutationObserver(() => sendContext());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // LinkedIn changes the URL (currentJobId) via history.pushState when the user
  // clicks a different job in the list. Re-run sendContext on each navigation so
  // the panel updates without a page reload.
  if (source === "linkedin") {
    window.addEventListener("popstate", sendContext);
    const origPush = history.pushState.bind(history);
    history.pushState = (...args) => { origPush(...args); sendContext(); };
    const origReplace = history.replaceState.bind(history);
    history.replaceState = (...args) => { origReplace(...args); sendContext(); };
  }
})();
