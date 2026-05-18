(function attachHiringCafeExtractor(root) {
  const { meta, parseTitleAtCompany } = root.VisaExtractors;

  function hiringCafeContext() {
    // og:title / document.title format: "Job Title at Company Name"
    // og:site_name is "HiringCafe: Job Search Engine" — not a company name, skip it.
    const parsed =
      parseTitleAtCompany(meta("og:title")) ||
      parseTitleAtCompany(document.title) ||
      {};

    // H2 holds the job title alone (no company suffix) — use as fallback for title
    const h2Title =
      document.querySelector("h2.font-extrabold")?.textContent?.trim() ||
      document.querySelector("h2")?.textContent?.trim() ||
      "";

    return {
      companyName: parsed.companyName || "",
      jobTitle: parsed.jobTitle || h2Title || ""
    };
  }

  root.VisaExtractors.hiringcafe = hiringCafeContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
