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
})(typeof globalThis !== "undefined" ? globalThis : window);
