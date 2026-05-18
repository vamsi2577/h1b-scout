(function attachLeverExtractor(root) {
  const { text, meta, fromJsonLd } = root.VisaExtractors;

  function leverContext() {
    const jsonLd = fromJsonLd();
    return {
      companyName: jsonLd.companyName || meta("og:site_name") || "",
      jobTitle: jsonLd.jobTitle || text("h1") || meta("og:title") || ""
    };
  }

  root.VisaExtractors.lever = leverContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
