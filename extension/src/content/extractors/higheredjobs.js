(function attachHigherEdJobsExtractor(root) {
  const { text } = root.VisaExtractors;

  function higheredContext() {
    return {
      companyName: text(".job-inst") || "",
      jobTitle: text("#jobtitle-header") || ""
    };
  }

  root.VisaExtractors.higheredjobs = higheredContext;

  // ── Copy JD button ────────────────────────────────────────────────────────
  // Selectors verified against live DOM (2026-05):
  //   Title:   #jobtitle-header  (stable id)
  //   Company: .job-inst         (stable class)
  //   JD:      #jobDesc          (stable id)

  const BTN_ID = "h1b-scout-copy-jd";

  function buildCopyText() {
    const title   = text("#jobtitle-header") || "";
    const company = text(".job-inst") || "";
    const jdEl    = document.querySelector("#jobDesc");
    const jd      = jdEl?.innerText?.trim() || "";
    return [title, company, jd].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  }

  function tryInjectCopyButton() {
    if (document.getElementById(BTN_ID)) return;
    const jdEl = document.querySelector("#jobDesc");
    if (!jdEl) return;

    const btn = root.VisaExtractors.createCopyButton(buildCopyText);
    btn.id = BTN_ID;

    // Place inline after the h1 job title
    const heading = document.querySelector("#jobtitle-header") || document.querySelector("h1");
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
