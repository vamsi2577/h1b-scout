(function attachGreenhouseExtractor(root) {
  const { text, meta, fromJsonLd, parseTitleAtCompany, titleCaseSlug } = root.VisaExtractors;

  function greenhouseCompanyFromPath(pathname = location.pathname) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "jobs") {
      return titleCaseSlug(parts[0]);
    }
    return "";
  }

  function greenhouseContext() {
    const jsonLd = fromJsonLd();
    const ogTitle = meta("og:title");
    const parsedOgTitle = parseTitleAtCompany(ogTitle);
    const parsedHeading = parseTitleAtCompany(text("h1"));
    const parsedDocumentTitle = parseTitleAtCompany(document.title.split("|")[0]);

    return {
      companyName:
        jsonLd.companyName ||
        parsedOgTitle.companyName ||
        parsedHeading.companyName ||
        parsedDocumentTitle.companyName ||
        text("[data-mapped='true'] .company-name") ||
        text(".company-name") ||
        meta("og:site_name") ||
        document.title.split("|").at(-1)?.trim() ||
        greenhouseCompanyFromPath() ||
        "",
      jobTitle:
        jsonLd.jobTitle ||
        parsedOgTitle.jobTitle ||
        parsedHeading.jobTitle ||
        parsedDocumentTitle.jobTitle ||
        text("h1").replace(/^Job Application for\s+/i, "").replace(/\s+at\s+.+$/i, "").trim() ||
        ""
    };
  }

  root.VisaExtractors.greenhouse = greenhouseContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
