(function attachDiceExtractor(root) {
  // ── Job context extractor (detail pages only) ─────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   Header card:   [data-testid="job-detail-header-card"]
  //   Job title:     h1 inside the header card
  //   Company name:  a[data-wa-click="djv-job-company-profile-click"]

  function diceContext() {
    const header = document.querySelector('[data-testid="job-detail-header-card"]');
    if (!header) return { companyName: "", jobTitle: "" };

    const companyName =
      header.querySelector('a[data-wa-click="djv-job-company-profile-click"]')?.textContent?.trim() || "";
    const jobTitle =
      header.querySelector("h1")?.textContent?.trim() || "";

    return { companyName, jobTitle };
  }

  root.VisaExtractors.dice = diceContext;

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Injects a "Copy JD" button next to the "Job Details" h2 on detail pages.
  // Copies job title + company + full description text to clipboard.
  //
  // JD container selector: [class*="jobDescription"]
  //   The class uses a CSS module hash (e.g. job-detail-description-module__EJDWFq__jobDescription)
  //   that changes between deploys — the partial match is intentionally stable.

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const header  = document.querySelector('[data-testid="job-detail-header-card"]');
    const title   = header?.querySelector("h1")?.innerText?.trim() || "";
    const company = header?.querySelector('a[data-wa-click="djv-job-company-profile-click"]')?.innerText?.trim() || "";
    const jdEl    = document.querySelector('[class*="jobDescription"]');
    const jd      = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    if (!location.pathname.startsWith("/job-detail/")) return;
    if (document.getElementById(BTN_ID)) return;               // already present
    const jdEl = document.querySelector('[class*="jobDescription"]');
    if (!jdEl) return;                                          // not rendered yet

    const btn = root.VisaExtractors.createCopyButton(buildCopyText);
    btn.id = BTN_ID;

    // Place inline after the "Job Details" h2
    const h2 = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent.trim() === "Job Details"
    );
    if (h2) {
      h2.style.display = "inline";
      h2.insertAdjacentElement("afterend", btn);
    } else {
      // fallback: above the JD container
      jdEl.insertAdjacentElement("beforebegin", btn);
    }
  }

  // Try immediately and at intervals (React may not have rendered yet)
  tryInjectCopyButton();
  setTimeout(tryInjectCopyButton, 800);
  setTimeout(tryInjectCopyButton, 2500);

  // MutationObserver handles: late rendering + SPA navigation between detail pages
  // (React removes the old detail DOM when navigating, so the button disappears
  //  and we re-inject it when the new page mounts).
  const btnObserver = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) tryInjectCopyButton();
  });
  // Start observing once body is ready
  const startObserving = () =>
    btnObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
  if (document.body) startObserving();
  else document.addEventListener("DOMContentLoaded", startObserving, { once: true });

})(typeof globalThis !== "undefined" ? globalThis : window);
