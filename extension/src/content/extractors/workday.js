(function attachWorkdayExtractor(root) {
  const { text, meta, fromJsonLd, titleCaseSlug } = root.VisaExtractors;

  function workdayCompanyFromUrl() {
    const hostRoot = location.hostname.split(".")[0] || "";
    if (hostRoot && !["www", "jobs", "careers"].includes(hostRoot.toLowerCase())) {
      return titleCaseSlug(hostRoot);
    }
    const pathSegment = location.pathname.split("/").filter(Boolean)[1] || "";
    return titleCaseSlug(pathSegment.replace(/Careers|External|_Careers/gi, ""));
  }

  function workdayTitleFromUrl() {
    const jobSlug = location.pathname.split("/job/")[1]?.split("/")[0] || "";
    const withoutRequisition = jobSlug.replace(/_[A-Z]{0,4}[-_0-9A-Z]+$/i, "");
    return titleCaseSlug(decodeURIComponent(withoutRequisition));
  }

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(value) || /(?:^|\s)[\w-]+\.[\w-]+(?:\/|$)/.test(value);
  }

  function cleanWorkdayCompany(value) {
    const cleaned = String(value || "").replace(/^Careers\s+at\s+/i, "").replace(/ Careers$/i, "").trim();
    if (!cleaned || looksLikeUrl(cleaned)) return "";
    return cleaned;
  }

  function cleanWorkdayTitle(value) {
    const cleaned = String(value || "").replace(/\s*-\s*.+ Careers$/i, "").trim();
    if (!cleaned || looksLikeUrl(cleaned)) return "";
    return cleaned;
  }

  function workdayContext() {
    const jsonLd = fromJsonLd();
    const title = jsonLd.jobTitle || text('[data-automation-id="jobPostingHeader"]') || text("h1") || meta("og:title");
    return {
      companyName:
        jsonLd.companyName ||
        text('[data-automation-id="jobPostingCompany"]') ||
        cleanWorkdayCompany(meta("og:site_name")) ||
        cleanWorkdayCompany(document.title.split("|").at(-1)) ||
        workdayCompanyFromUrl() ||
        "",
      jobTitle: cleanWorkdayTitle(title) || workdayTitleFromUrl()
    };
  }

  root.VisaExtractors.workday = workdayContext;

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Injects a "Copy JD" button next to the job title on Workday detail pages.
  // Workday uses stable data-automation-id attributes across all tenants.
  //
  // JD container:  [data-automation-id="jobPostingDescription"]
  // Title heading: [data-automation-id="jobPostingHeader"] or h1
  // Company:       [data-automation-id="jobPostingCompany"]

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const title   = text('[data-automation-id="jobPostingHeader"]') || text("h1") || "";
    const company = text('[data-automation-id="jobPostingCompany"]') || workdayCompanyFromUrl() || "";
    const jdEl    = document.querySelector('[data-automation-id="jobPostingDescription"]');
    const jd      = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    if (!location.pathname.includes("/job/")) return;
    if (document.getElementById(BTN_ID)) return;
    const jdEl = document.querySelector('[data-automation-id="jobPostingDescription"]');
    if (!jdEl) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
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
      document.querySelector('[data-automation-id="jobPostingHeader"]') ||
      document.querySelector("h1");
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
