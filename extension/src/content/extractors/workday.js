(function attachWorkdayExtractor(root) {
  const { text, meta, fromJsonLd, titleCaseSlug } = root.VisaExtractors;

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

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(value) || /(?:^|\s)[\w-]+\.[\w-]+(?:\/|$)/.test(value);
  }

  function cleanWorkdayCompany(value) {
    const cleaned = String(value || "").replace(/^Careers\s+at\s+/i, "").replace(/ Careers$/i, "").trim();
    if (!cleaned || looksLikeUrl(cleaned)) return "";
    return cleaned;
  }

  function cleanWorkdayTitle(value) {
    const cleaned = String(value || "").replace(/\s*-\s*.+ Careers$/i, "").trim();
    if (!cleaned || looksLikeUrl(cleaned)) return "";
    return cleaned;
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

  root.VisaExtractors.workday = workdayContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
