(function attachLinkedInBadger(root) {
  const { BADGE_ATTR, register } = root.VisaBadgerUtils;

  register({
    name: "linkedin",
    spaNav: true,
    observerAttributeFilter: ["data-occludable-job-id"],

    match(hostname, path) {
      return hostname === "www.linkedin.com" && (
        path.startsWith("/jobs/search") ||
        path.startsWith("/jobs/collections") ||
        path.startsWith("/jobs/recommended")
      );
    },

    getJobCards() {
      // LinkedIn reuses elements; check if the jobId has changed since last injection
      const cards = document.querySelectorAll("li[data-occludable-job-id]");
      return [...cards].filter((card) => {
        const jobId = card.getAttribute("data-occludable-job-id");
        return card.getAttribute(BADGE_ATTR) !== jobId;
      });
    },

    getCardId(card) {
      return card.getAttribute("data-occludable-job-id");
    },

    getCompanyText(card) {
      return (
        card.querySelector(".job-card-container__company-name")?.textContent?.trim() ||
        card.querySelector(".artdeco-entity-lockup__subtitle")?.textContent?.trim() ||
        card.querySelector("[class*='company-name']")?.textContent?.trim() ||
        ""
      );
    },

    getBadgeTarget(card) {
      return (
        card.querySelector(".job-card-container__company-name") ||
        card.querySelector(".artdeco-entity-lockup__subtitle") ||
        card.querySelector("[class*='company-name']")
      );
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
