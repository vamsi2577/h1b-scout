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

  /**
   * createCopyButton(buildTextFn)
   * Returns a styled "Copy JD" <button> that copies buildTextFn() to the
   * clipboard on click. The caller is responsible for setting btn.id and
   * inserting it into the DOM.
   */
  function createCopyButton(buildTextFn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy JD";
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "border:1px solid #d4d4d8",
      "border-radius:6px",
      "padding:3px 10px",
      "font-size:12px",
      "font-weight:500",
      "background:#fff",
      "color:#2563eb",
      "cursor:pointer",
      "flex-shrink:0",
      "transition:background 0.15s",
    ].join(";");

    btn.addEventListener("mouseenter", () => { btn.style.background = "#eff6ff"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#fff"; });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(buildTextFn()).then(() => {
        btn.textContent = "✓ Copied";
        btn.style.color = "#16a34a";
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = "#2563eb"; }, 2000);
      }).catch(() => {
        btn.textContent = "Failed";
        btn.style.color = "#dc2626";
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = "#2563eb"; }, 2000);
      });
    });

    return btn;
  }

  root.VisaExtractors = {
    ...(root.VisaExtractors || {}),
    text,
    meta,
    fromJsonLd,
    parseTitleAtCompany,
    titleCaseSlug,
    createCopyButton
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
