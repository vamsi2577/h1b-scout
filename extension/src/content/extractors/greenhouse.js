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

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   Title:  h1.section-header  (just "h1" — stable enough)
  //   JD:     .job__description  (div has two classes: "job__description body")
  //   Company: og:site_name / JSON-LD / path-derived (same as greenhouseContext)

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const jsonLd        = fromJsonLd();
    const ogTitle       = meta("og:title");
    const parsedOgTitle = parseTitleAtCompany(ogTitle);
    const title         = jsonLd.jobTitle    || parsedOgTitle.jobTitle    || text("h1") || "";
    const company       = jsonLd.companyName || parsedOgTitle.companyName || meta("og:site_name") || greenhouseCompanyFromPath() || "";
    const jdEl          = document.querySelector(".job__description");
    const jd            = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    // Skip confirmation / application sub-pages
    if (/\/(confirmation|application)(\/|$)/i.test(location.pathname)) return;
    if (document.getElementById(BTN_ID)) return;
    const jdEl = document.querySelector(".job__description");
    if (!jdEl) return;

    const btn = document.createElement("button");
    btn.id   = BTN_ID;
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
      navigator.clipboard.writeText(buildCopyText()).then(() => {
        btn.textContent = "✓ Copied";
        btn.style.color = "#16a34a";
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = "#2563eb"; }, 2000);
      }).catch(() => {
        btn.textContent = "Failed";
        btn.style.color = "#dc2626";
        setTimeout(() => { btn.textContent = "Copy JD"; btn.style.color = "#2563eb"; }, 2000);
      });
    });

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
