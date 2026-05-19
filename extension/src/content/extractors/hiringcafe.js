(function attachHiringCafeExtractor(root) {
  const { meta, parseTitleAtCompany } = root.VisaExtractors;

  // Populated when the user clicks a job card on the search/listing page.
  // Cleared on SPA navigation so full-view /job/[id] pages always use og:title.
  let lastCardContext = null;

  // Clear on any SPA navigation (hiring.cafe uses history.pushState for full-view links)
  window.addEventListener("popstate", () => { lastCardContext = null; });
  const _origPush = history.pushState.bind(history);
  history.pushState = (...args) => { lastCardContext = null; return _origPush(...args); };

  // How long to wait (ms) for React to update the detail panel after a card click
  // before calling sendContext. 150ms gives React a comfortable render window.
  const REACT_SETTLE_MS = 150;

  function hiringCafeContext() {
    // ── Mobile: Chakra drawer opened when a card is tapped ───────────────────
    // role="dialog" chakra-modal__content is only present on mobile/narrow viewports.
    const modal = document.querySelector('[role="dialog"].chakra-modal__content');
    if (modal) {
      const jobTitle    = modal.querySelector('h2.font-extrabold')?.textContent?.trim() || "";
      const companyRaw  = modal.querySelector('span.text-xl.font-semibold')?.textContent?.trim() || "";
      const companyName = companyRaw.replace(/^@\s*/, "").trim();
      if (jobTitle || companyName) return { companyName, jobTitle };
    }

    // ── Desktop: card click sets lastCardContext (see listener below) ─────────
    // Skip on /job/[id] full-view pages — og:title is authoritative there and
    // lastCardContext from a prior search visit would otherwise shadow it.
    if (lastCardContext && !location.pathname.startsWith("/job/")) {
      return lastCardContext;
    }

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
  //   Title:   span.font-bold.line-clamp-2 / .line-clamp-3 / .text-start
  //   Company: .line-clamp-3.font-light span.font-bold
  document.addEventListener("click", (e) => {
    // Ignore "Job Posting" / "View all" links — those navigate and og:title handles it.
    if (e.target.closest('a[href^="/job/"], a[href^="/org/"]')) return;

    const card = e.target.closest("div.relative.bg-white.rounded-xl");
    if (!card) return;

    const jobTitle    = card.querySelector("span.font-bold.line-clamp-2, span.font-bold.line-clamp-3, span.font-bold.text-start")?.textContent?.trim() || "";
    const companyName = card.querySelector(".line-clamp-3.font-light span.font-bold")?.textContent?.trim() || "";

    if (!jobTitle && !companyName) return;

    lastCardContext = { companyName, jobTitle };

    // Trigger the job-extractor's sendContext after React has settled
    setTimeout(() => window._h1bScoutReextract?.(), REACT_SETTLE_MS);
  }, true /* capture — fires before React's own handlers */);

  root.VisaExtractors.hiringcafe = hiringCafeContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
