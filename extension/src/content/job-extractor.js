(function attachJobExtractor() {
  const source = detectSource(location.hostname);
  const lastSent = { key: "" };

  function detectSource(hostname) {
    if (hostname === "greenhouse.io" || hostname.endsWith(".greenhouse.io")) return "greenhouse";
    if (hostname.endsWith(".workdayjobs.com") || hostname.endsWith(".myworkdayjobs.com")) return "workday";
    if (hostname === "lever.co" || hostname.endsWith(".lever.co")) return "lever";
    if (hostname === "ashbyhq.com" || hostname.endsWith(".ashbyhq.com")) return "ashby";
    if (hostname === "www.linkedin.com") return "linkedin";
    if (hostname === "www.higheredjobs.com" || hostname === "higheredjobs.com") return "higheredjobs";
    if (hostname === "hiring.cafe" || hostname === "www.hiring.cafe") return "hiringcafe";
    return "unsupported";
  }

  function extractContext() {
    const extractor = typeof VisaExtractors !== "undefined" ? VisaExtractors[source] : null;
    const context = extractor ? extractor() : {};
    const signals = (typeof VisaSponsor !== "undefined" && VisaSponsor.extractSignals)
      ? VisaSponsor.extractSignals()
      : [];
    return {
      type: "JOB_CONTEXT_FOUND",
      companyName: context.companyName || "",
      jobTitle: context.jobTitle || "",
      source,
      url: location.href,
      signals
    };
  }

  function sendContext() {
    if (source === "unsupported") return;
    if (source === "greenhouse" && !location.pathname.includes("/jobs/")) return;
    if (source === "workday" && !location.pathname.includes("/job/")) return;
    if (source === "lever" && location.pathname.split("/").filter(Boolean).length < 2) return;
    if (source === "ashby" && location.pathname.split("/").filter(Boolean).length < 2) return;
    if (source === "higheredjobs" && !location.pathname.includes("/details.cfm")) return;
    // hiringcafe: allow on /job/[id] full-view pages AND on search pages when
    // the Chakra inline panel (role="dialog") is open after clicking a card.
    if (source === "hiringcafe"
        && !location.pathname.startsWith("/job/")
        && !document.querySelector('[role="dialog"].chakra-modal__content')) return;
    if (source === "linkedin") {
      if (location.pathname.startsWith("/jobs/")) {
        const currentJobId = new URLSearchParams(location.search).get("currentJobId");
        if (!currentJobId && !location.pathname.startsWith("/jobs/view/")) return;
      } else if (location.pathname.startsWith("/preload/") || location.pathname === "/preload") {
        const hasJobContent = !!(
          document.querySelector("[class*='job-details-jobs-unified-top-card']") ||
          document.querySelector("[class*='jobs-details__main']") ||
          document.querySelector("h1")
        );
        if (!hasJobContent) return;
      } else {
        return;
      }
    }
    const context = extractContext();
    if (!context.companyName && !context.jobTitle) return;
    const key = `${context.companyName}|${context.jobTitle}|${context.url}|${context.signals.length}`;
    if (key === lastSent.key) return;
    lastSent.key = key;
    chrome.runtime.sendMessage(context).catch(() => {});
    if (source !== "linkedin") observer?.disconnect();
  }

  let observer;
  let observerTimer;

  sendContext();
  setTimeout(sendContext, 1000);
  setTimeout(sendContext, 3000);
  if (source === "linkedin") setTimeout(sendContext, 6000);

  if (!window._h1bScoutAttached) {
    window._h1bScoutAttached = true;
    window._h1bScoutReextract = sendContext;

    const observeRoot = (source === "linkedin" && document.body) ? document.body : document.documentElement;
    observer = new MutationObserver(() => {
      if (source === "linkedin") {
        clearTimeout(observerTimer);
        observerTimer = setTimeout(sendContext, 300);
      } else {
        sendContext();
      }
    });
    observer.observe(observeRoot, { childList: true, subtree: true });

    if (source === "linkedin") {
      window.addEventListener("popstate", sendContext);
      const origPush = history.pushState.bind(history);
      history.pushState = (...args) => { origPush(...args); sendContext(); };
      const origReplace = history.replaceState.bind(history);
      history.replaceState = (...args) => { origReplace(...args); sendContext(); };
    }
  }
})();
