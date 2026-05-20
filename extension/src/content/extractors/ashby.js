(function attachAshbyExtractor(root) {
  const { text, meta, fromJsonLd } = root.VisaExtractors;

  function ashbyContext() {
    const jsonLd = fromJsonLd();
    return {
      companyName: jsonLd.companyName || meta("og:site_name") || "",
      jobTitle: jsonLd.jobTitle || text("h1") || meta("og:title") || ""
    };
  }

  root.VisaExtractors.ashby = ashbyContext;

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   Title:  h1[class*="ashby-job-posting-heading"]  (stable Ashby semantic class)
  //   JD:     [class*="descriptionText"] inside .ashby-job-posting-right-pane
  //           (CSS module hash changes between deploys — partial match is stable)

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const jsonLd  = fromJsonLd();
    const title   = jsonLd.jobTitle    || text('h1[class*="ashby-job-posting-heading"]') || text("h1") || meta("og:title") || "";
    const company = jsonLd.companyName || meta("og:site_name") || "";
    const rightPane = document.querySelector(".ashby-job-posting-right-pane");
    const jdEl      = rightPane?.querySelector('[class*="descriptionText"]');
    const jd        = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    if (document.getElementById(BTN_ID)) return;
    const rightPane = document.querySelector(".ashby-job-posting-right-pane");
    const jdEl      = rightPane?.querySelector('[class*="descriptionText"]');
    if (!jdEl) return;

    const btn = root.VisaExtractors.createCopyButton(buildCopyText);
    btn.id = BTN_ID;

    // Place inline after the h1 job title
    const heading =
      document.querySelector('h1[class*="ashby-job-posting-heading"]') ||
      document.querySelector("h1");
    if (heading) {
      heading.style.display = "inline";
      heading.insertAdjacentElement("afterend", btn);
    } else {
      jdEl.insertAdjacentElement("beforebegin", btn);
    }
  }

  tryInjectCopyButton();
  setTimeout(tryInjectCopyButton, 800);
  setTimeout(tryInjectCopyButton, 2500);

  const btnObserver = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) tryInjectCopyButton();
  });
  const startObserving = () =>
    btnObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  if (document.body) startObserving();
  else document.addEventListener("DOMContentLoaded", startObserving, { once: true });

})(typeof globalThis !== "undefined" ? globalThis : window);
