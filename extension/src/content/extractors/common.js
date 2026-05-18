(function attachCommonExtractors(root) {
  function text(selector, rootDoc = document) {
    return rootDoc.querySelector(selector)?.textContent?.trim() || "";
  }

  function meta(name, rootDoc = document) {
    return (
      rootDoc.querySelector(`meta[property="${name}"]`)?.content ||
      rootDoc.querySelector(`meta[name="${name}"]`)?.content ||
      ""
    ).trim();
  }

  function fromJsonLd(rootDoc = document) {
    for (const script of rootDoc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        if (typeof parsed !== "object" || parsed === null) continue;
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        const job = nodes.find((node) => node && (node["@type"] === "JobPosting" || node.title));
        if (job) {
          return {
            companyName: job.hiringOrganization?.name || "",
            jobTitle: job.title || ""
          };
        }
      } catch { /* skip malformed */ }
    }
    return {};
  }

  function parseTitleAtCompany(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const applicationMatch = text.match(/^Job Application for\s+(.+?)\s+at\s+(.+)$/i);
    if (applicationMatch) {
      return { jobTitle: applicationMatch[1].trim(), companyName: applicationMatch[2].trim() };
    }
    const atMatch = text.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      return { jobTitle: atMatch[1].trim(), companyName: atMatch[2].trim() };
    }
    return {};
  }

  function titleCaseSlug(value) {
    const upperCaseBrands = new Map([["relx", "RELX"], ["lseg", "LSEG"], ["resmed", "ResMed"]]);
    const cleaned = String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    const mapped = upperCaseBrands.get(cleaned.toLowerCase());
    if (mapped) return mapped;
    return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  root.VisaExtractors = {
    ...(root.VisaExtractors || {}),
    text,
    meta,
    fromJsonLd,
    parseTitleAtCompany,
    titleCaseSlug
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
