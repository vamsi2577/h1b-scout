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
