(function attachLinkedInExtractor(root) {
  const { meta, fromJsonLd, parseTitleAtCompany } = root.VisaExtractors;

  function getLinkedInDoc() {
    if (location.pathname.startsWith("/preload")) return document;
    try {
      const iframe = document.querySelector("iframe[src*='/preload']");
      const iDoc = iframe?.contentDocument;
      if (iDoc && iDoc.readyState !== "uninitialized" && iDoc.body) return iDoc;
    } catch { /* cross-origin guard */ }
    return document;
  }

  function linkedinContext() {
    const doc = getLinkedInDoc();
    const jsonLd = fromJsonLd();

    const titleEl =
      doc.querySelector("h1.job-details-jobs-unified-top-card__job-title") ||
      doc.querySelector(".jobs-unified-top-card__job-title h1") ||
      doc.querySelector("h1[class*='job-title']") ||
      doc.querySelector("h1");

    const companyEl =
      doc.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      doc.querySelector(".job-details-jobs-unified-top-card__company-name") ||
      doc.querySelector(".jobs-unified-top-card__company-name a") ||
      doc.querySelector("[class*='top-card__company'] a") ||
      doc.querySelector("[class*='company-name'] a");

    const parsedOg = parseTitleAtCompany(meta("og:title"));

    return {
      jobTitle: jsonLd.jobTitle || titleEl?.textContent?.trim() || parsedOg.jobTitle || "",
      companyName: jsonLd.companyName || companyEl?.textContent?.trim() || parsedOg.companyName || meta("og:site_name") || ""
    };
  }

  root.VisaExtractors.linkedin = linkedinContext;

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   Title:   h1 (class changes; textContent is reliable)
  //   Company: .job-details-jobs-unified-top-card__company-name a (+ fallbacks)
  //   JD:      #job-details  (stable id; class has CSS-module hash suffix)

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const doc = getLinkedInDoc();
    const titleEl =
      doc.querySelector("h1.job-details-jobs-unified-top-card__job-title") ||
      doc.querySelector("h1[class*='job-title']") ||
      doc.querySelector("h1");
    const title = titleEl?.textContent?.trim() || "";

    const companyEl =
      doc.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
      doc.querySelector(".job-details-jobs-unified-top-card__company-name") ||
      doc.querySelector(".jobs-unified-top-card__company-name a") ||
      doc.querySelector("[class*='top-card__company'] a") ||
      doc.querySelector("[class*='company-name'] a");
    const company = companyEl?.textContent?.trim() || "";

    // #job-details is in the main document, not the preload iframe
    const jdEl = document.querySelector("#job-details") || document.querySelector(".jobs-description__content");
    const jd   = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    if (document.getElementById(BTN_ID)) return;
    // #job-details is always in the main document (not the preload iframe)
    // No path guard needed — LinkedIn loads job details in a side panel
    // without changing the URL, so #job-details presence is the only reliable signal.
    const jdEl = document.querySelector("#job-details") || document.querySelector(".jobs-description__content");
    if (!jdEl) return;

    const btn = root.VisaExtractors.createCopyButton(buildCopyText);
    btn.id = BTN_ID;

    // Place inline after the h1 job title
    const heading = document.querySelector("h1");
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
