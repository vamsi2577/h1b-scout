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
})(typeof globalThis !== "undefined" ? globalThis : window);
