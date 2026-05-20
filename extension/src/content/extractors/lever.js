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

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   JD container: [data-qa="job-description"]  (stable data-qa attr)
  //   Title:        .posting-headline h2
  //   Company:      og:site_name / JSON-LD

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const jsonLd  = fromJsonLd();
    const title   = jsonLd.jobTitle    || text(".posting-headline h2") || meta("og:title") || "";
    const company = jsonLd.companyName || meta("og:site_name") || "";

    // Lever splits the JD across multiple data-qa sections:
    //   job-description      — intro / overview paragraphs
    //   posting-requirements — responsibilities, skills, requirements (multiple els)
    //   salary-range         — compensation info
    // Verified against live DOM (2026-05).
    const sectionEls = document.querySelectorAll(
      '[data-qa="job-description"], [data-qa="posting-requirements"], [data-qa="salary-range"]'
    );
    const jd = [...sectionEls]
      .map(el => el.innerText?.trim())
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n");

    return [title, company, jd].filter(Boolean).join("\n\n");
  }

  function tryInjectCopyButton() {
    if (document.getElementById(BTN_ID)) return;
    // Some Lever pages omit job-description and go straight to posting-requirements
    const hasContent = document.querySelector(
      '[data-qa="job-description"], [data-qa="posting-requirements"], [data-qa="salary-range"]'
    );
    if (!hasContent) return;

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

    // Place inline after the job title heading
    const heading =
      document.querySelector(".posting-headline h2") ||
      document.querySelector("h2") ||
      document.querySelector("h1");
    if (heading) {
      heading.style.display = "inline";
      heading.insertAdjacentElement("afterend", btn);
    } else {
      hasContent.insertAdjacentElement("beforebegin", btn);
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
