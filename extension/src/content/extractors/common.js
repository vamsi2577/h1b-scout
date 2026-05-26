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
    // Detect OS colour scheme — the button is injected into third-party ATS pages
    // that don't share the extension's CSS variables, so we set colours directly.
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const C = dark
      ? { bg: "#1e293b", border: "#334155", text: "#60a5fa", hover: "#1e3a5f", success: "#4ade80", error: "#f87171" }
      : { bg: "#fff",    border: "#d4d4d8", text: "#2563eb", hover: "#eff6ff", success: "#16a34a", error: "#dc2626" };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy JD";
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      `border:1px solid ${C.border}`,
      "border-radius:6px",
      "padding:3px 10px",
      "font-size:12px",
      "font-weight:500",
      `background:${C.bg}`,
      `color:${C.text}`,
      "cursor:pointer",
      "flex-shrink:0",
      "transition:background 0.15s",
    ].join(";");

    btn.addEventListener("mouseenter", () => { btn.style.background = C.hover; });
    btn.addEventListener("mouseleave", () => { btn.style.background = C.bg; });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(buildTextFn()).then(() => {
        btn.textContent = "✓ Copied";
        btn.style.color = C.success;
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = C.text; }, 2000);
      }).catch(() => {
        btn.textContent = "Failed";
        btn.style.color = C.error;
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = C.text; }, 2000);
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
