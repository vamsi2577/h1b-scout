(function attachHiringCafeBadger(root) {
  const { BADGE_ATTR, register } = root.VisaBadgerUtils;

  register({
    name: "hiringcafe",

    match(hostname, path) {
      // Search/listing pages — homepage and ?searchState=… filtered views.
      // Exclude individual job detail pages (/job/…) handled by job-extractor instead.
      return (hostname === "hiring.cafe" || hostname === "www.hiring.cafe")
        && !path.startsWith("/job/");
    },

    getJobCards() {
      // Verified against live DOM: each job card is a div.relative.bg-white.rounded-xl
      return document.querySelectorAll(`div.relative.bg-white.rounded-xl:not([${BADGE_ATTR}])`);
    },

    getCompanyText(card) {
      // Verified against live DOM: company name is the bold span inside the
      // font-light description section — the 2nd span.font-bold in the card.
      return card.querySelector(".line-clamp-3.font-light span.font-bold")?.textContent?.trim() || "";
    },

    getBadgeTarget(card) {
      // Append badge inline after the company name bold span
      return card.querySelector(".line-clamp-3.font-light span.font-bold") || null;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
