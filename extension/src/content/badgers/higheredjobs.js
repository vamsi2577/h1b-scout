(function attachHigherEdJobsBadger(root) {
  const { BADGE_ATTR, register } = root.VisaBadgerUtils;

  register({
    name: "higheredjobs",

    match(hostname, path) {
      // Search/listing pages — /admin/search.cfm and similar listing paths.
      // Exclude detail pages (/details.cfm) handled by job-extractor instead.
      return (hostname === "www.higheredjobs.com" || hostname === "higheredjobs.com")
        && !path.includes("/details.cfm");
    },

    getJobCards() {
      // Verified against live DOM: each listing is a div.row.record
      return document.querySelectorAll(`.row.record:not([${BADGE_ATTR}])`);
    },

    getCompanyText(card) {
      // Verified against live DOM: institution name is a bare text node after the
      // first <br> inside .col-sm-7. It is not wrapped in an element.
      const col = card.querySelector(".col-sm-7");
      if (!col) return "";
      for (const node of col.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent.trim();
          if (t) return t;
        }
      }
      return "";
    },

    getBadgeTarget(card) {
      // Wrap the bare institution text node in a <span> on first call so the
      // badge has an inline element to append to. Re-use existing span on retry.
      const col = card.querySelector(".col-sm-7");
      if (!col) return null;
      const existing = col.querySelector(".hej-inst-name");
      if (existing) return existing;
      for (const node of col.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          const span = document.createElement("span");
          span.className = "hej-inst-name";
          span.textContent = node.textContent;
          node.replaceWith(span);
          return span;
        }
      }
      return null;
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
