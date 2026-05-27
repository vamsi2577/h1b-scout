(function attachGreenhouseBadger(root) {
  const { BADGE_ATTR, register } = root.VisaBadgerUtils;

  register({
    name: "greenhouse",

    match(hostname, path) {
      // Includes boards and search pages.
      // Exclude actual application/detail pages (usually /jobs/123456).
      return hostname.includes("greenhouse.io") && !/\/jobs\/\d+/.test(path);
    },

    getJobCards() {
      // my.greenhouse.io search results use data-provides="search-result".
      // boards.greenhouse.io use .opening / .job-post / data-gh='job'.
      return document.querySelectorAll(`
        [data-provides="search-result"]:not([${BADGE_ATTR}]),
        .opening:not([${BADGE_ATTR}]),
        .job-post:not([${BADGE_ATTR}]),
        [data-gh='job']:not([${BADGE_ATTR}])
      `.trim());
    },

    getCompanyText(card) {
      // my.greenhouse.io search results: company name is always in <p class="body">
      // next to the <h4 class="section-title"> job title. Using p.body avoids the
      // company-logo__placeholder letter (e.g. "Z") polluting innerText line counts.
      const bodyP = card.querySelector("p.body");
      if (bodyP) return bodyP.textContent.trim();

      // boards.greenhouse.io standard boards
      const perCardName =
        card.querySelector(".company-name")?.textContent?.trim() ||
        card.querySelector("[data-mapped='true'] .company-name")?.textContent?.trim() ||
        card.querySelector("[class*='company']")?.textContent?.trim() ||
        card.querySelector(".company")?.textContent?.trim() ||
        card.querySelector(".employer")?.textContent?.trim();

      if (perCardName) return perCardName;

      // Fallback to board-wide company name from page meta or headings
      return (
        document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
        document.querySelector('meta[name="author"]')?.content?.trim() ||
        document.querySelector("h1")?.textContent?.replace(/Current openings at /i, "")?.trim() ||
        document.title.split(/[-|]/)[0]?.replace(/Jobs at /i, "")?.trim() ||
        ""
      );
    },

    getBadgeTarget(card) {
      // my.greenhouse.io: inline badge appended to the p.body company name element
      const bodyP = card.querySelector("p.body");
      if (bodyP) return bodyP;

      // boards.greenhouse.io: inline targets
      return (
        card.querySelector(".company-name") ||
        card.querySelector("[class*='company']") ||
        card.querySelector(".level, a") ||
        card.querySelector("p, span") ||
        card
      );
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
