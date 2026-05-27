(function attachDiceBadger(root) {
  const { BADGE_ATTR, register } = root.VisaBadgerUtils;

  register({
    name: "dice",
    spaNav: true,

    match(hostname, path) {
      // Job search pages (/jobs?q=… and /jobs/q-*).
      // Exclude job detail pages (/job-detail/…) handled by job-extractor instead.
      return (hostname === "www.dice.com" || hostname === "dice.com")
        && path.startsWith("/jobs");
    },

    getJobCards() {
      // Verified against live DOM: each card is [data-testid="job-card"] with a stable
      // data-id attribute. Filter by data-id (not BADGE_ATTR absence) so React element
      // reuse is handled correctly — same pattern as LinkedIn's data-occludable-job-id.
      const cards = document.querySelectorAll('[data-testid="job-card"]');
      return [...cards].filter((card) =>
        card.getAttribute(BADGE_ATTR) !== card.getAttribute("data-id")
      );
    },

    getCardId(card) {
      return card.getAttribute("data-id");
    },

    getCompanyText(card) {
      // Company name link: the anchor to /company-profile/ that is NOT the logo anchor.
      // The logo anchor has aria-label="Company Logo"; the name anchor has plain text.
      return card.querySelector('a[href^="/company-profile"]:not([aria-label="Company Logo"])')?.textContent?.trim() || "";
    },

    getBadgeTarget(card) {
      return card.querySelector('a[href^="/company-profile"]:not([aria-label="Company Logo"])') || null;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
