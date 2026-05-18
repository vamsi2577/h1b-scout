(function attachHiringCafeExtractor(root) {
  const { meta, parseTitleAtCompany } = root.VisaExtractors;

  function hiringCafeContext() {
    // ── Inline panel (Chakra UI modal opened when a search-result card is clicked) ──
    // The panel is a role="dialog" chakra-modal__content element.
    // Job title: h2.font-extrabold inside the modal.
    // Company:   span.text-xl.font-semibold with "@ CompanyName" text.
    const modal = document.querySelector('[role="dialog"].chakra-modal__content');
    if (modal) {
      const jobTitle = modal.querySelector('h2.font-extrabold')?.textContent?.trim() || "";
      const companyRaw = modal.querySelector('span.text-xl.font-semibold')?.textContent?.trim() || "";
      const companyName = companyRaw.replace(/^@\s*/, "").trim();
      if (jobTitle || companyName) {
        return { companyName, jobTitle };
      }
    }

    // ── Full-view page (/job/[id]) ────────────────────────────────────────────────
    // og:title / document.title format: "Job Title at Company Name".
    // og:site_name is "HiringCafe: Job Search Engine" — not a company name, skip it.
    const parsed =
      parseTitleAtCompany(meta("og:title")) ||
      parseTitleAtCompany(document.title) ||
      {};

    // H2 holds the job title alone (no company suffix) — fallback for title only.
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
