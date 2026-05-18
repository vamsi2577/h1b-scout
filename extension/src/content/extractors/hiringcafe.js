(function attachHiringCafeExtractor(root) {
  const { meta, parseTitleAtCompany } = root.VisaExtractors;

  // Populated when the user clicks a job card on the search/listing page.
  // Cleared on full-page navigation (script re-runs from scratch).
  let lastCardContext = null;

  function hiringCafeContext() {
    // ── Mobile: Chakra drawer opened when a card is tapped ───────────────────
    // role="dialog" chakra-modal__content is only present on mobile/narrow viewports.
    const modal = document.querySelector('[role="dialog"].chakra-modal__content');
    if (modal) {
      const jobTitle   = modal.querySelector('h2.font-extrabold')?.textContent?.trim() || "";
      const companyRaw = modal.querySelector('span.text-xl.font-semibold')?.textContent?.trim() || "";
      const companyName = companyRaw.replace(/^@\s*/, "").trim();
      if (jobTitle || companyName) return { companyName, jobTitle };
    }

    // ── Desktop: card click sets lastCardContext (see listener below) ─────────
    if (lastCardContext) return lastCardContext;

    // ── Full-view page (/job/[id]) ────────────────────────────────────────────
    // og:title / document.title format: "Job Title at Company Name".
    // og:site_name is "HiringCafe: Job Search Engine" — not a company name, skip it.
    const parsed =
      parseTitleAtCompany(meta("og:title")) ||
      parseTitleAtCompany(document.title) ||
      {};

    const h2Title =
      document.querySelector("h2.font-extrabold")?.textContent?.trim() ||
      document.querySelector("h2")?.textContent?.trim() ||
      "";

    return {
      companyName: parsed.companyName || "",
      jobTitle:    parsed.jobTitle    || h2Title || ""
    };
  }

  // ── Card click listener (search & listing pages) ──────────────────────────
  // On desktop hiring.cafe uses a persistent split-panel layout — clicking a
  // card updates the right column without navigating or mounting a new dialog.
  // We extract title + company directly from the card that was clicked and
  // call the job-extractor's reextract hook so the extension panel updates.
  //
  // Selectors verified against live DOM (2026-05):
  //   Title:   span.font-bold.line-clamp-2   (inside the md:mr-10 heading div)
  //   Company: .line-clamp-3.font-light span.font-bold
  document.addEventListener("click", (e) => {
    // Only act on card clicks, not on the "Job Posting" / "View all" links
    // (those navigate to a new page which handles itself via og:title).
    if (e.target.closest('a[href^="/job/"], a[href^="/org/"]')) return;

    const card = e.target.closest("div.relative.bg-white.rounded-xl");
    if (!card) return;

    const jobTitle    = card.querySelector("span.font-bold.line-clamp-2")?.textContent?.trim() || "";
    const companyName = card.querySelector(".line-clamp-3.font-light span.font-bold")?.textContent?.trim() || "";

    if (!jobTitle && !companyName) return;

    lastCardContext = { companyName, jobTitle };

    // Trigger the job-extractor's sendContext after React has updated the panel
    setTimeout(() => window._h1bScoutReextract?.(), 100);
  }, true /* capture — fires before React's own handlers */);

  root.VisaExtractors.hiringcafe = hiringCafeContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
