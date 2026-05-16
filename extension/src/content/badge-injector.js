(function attachBadgeInjector() {
  const hostname = location.hostname;
  const path = location.pathname;

  const isLinkedIn = hostname.includes("linkedin.com") && (
    path.startsWith("/jobs/search") ||
    path.startsWith("/jobs/collections") ||
    path.startsWith("/jobs/recommended")
  );
  const isGreenhouseBoard = hostname.includes("greenhouse.io") && !path.includes("/jobs/");

  if (!isLinkedIn && !isGreenhouseBoard) return;

  const BADGE_ATTR = "data-h1b-badge";
  let scanTimeout;

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function getJobCards() {
    if (isLinkedIn) {
      return document.querySelectorAll(`li[data-occludable-job-id]:not([${BADGE_ATTR}])`);
    }
    if (isGreenhouseBoard) {
      return document.querySelectorAll(`.opening:not([${BADGE_ATTR}])`);
    }
    return [];
  }

  function getCompanyText(card) {
    if (isLinkedIn) {
      return (
        card.querySelector(".job-card-container__company-name")?.textContent?.trim() ||
        card.querySelector(".artdeco-entity-lockup__subtitle")?.textContent?.trim() ||
        card.querySelector("[class*='company-name']")?.textContent?.trim() ||
        ""
      );
    }
    if (isGreenhouseBoard) {
      // All jobs on a board belong to one company — read from page meta
      return (
        document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
        document.title.split(/[-|]/)[0]?.trim() ||
        ""
      );
    }
    return "";
  }

  function getBadgeTarget(card) {
    if (isLinkedIn) {
      return (
        card.querySelector(".job-card-container__company-name") ||
        card.querySelector(".artdeco-entity-lockup__subtitle") ||
        card.querySelector("[class*='company-name']")
      );
    }
    if (isGreenhouseBoard) {
      return card.querySelector(".level, a") || card;
    }
    return null;
  }

  // ── Badge rendering ──────────────────────────────────────────────────────────

  function createBadge(lca, confidence) {
    const el = document.createElement("span");
    el.className = `h1b-scout-badge h1b-scout-badge--${confidence}`;
    el.title = `H-1B LCA filings — ${confidence} confidence match`;
    el.textContent = `H-1B ${Number(lca).toLocaleString("en-US")} ✓`;
    return el;
  }

  // ── Scan and inject ──────────────────────────────────────────────────────────

  async function scanAndBadge() {
    const cards = [...getJobCards()];
    if (!cards.length) return;

    // Collect unique company names; mark cards as "pending" to skip next scan
    const companyToCards = new Map();
    for (const card of cards) {
      card.setAttribute(BADGE_ATTR, "pending");
      const name = getCompanyText(card);
      if (!name) { card.setAttribute(BADGE_ATTR, "1"); continue; }
      if (!companyToCards.has(name)) companyToCards.set(name, []);
      companyToCards.get(name).push(card);
    }

    const companies = [...companyToCards.keys()];
    if (!companies.length) return;

    let results = {};
    try {
      results = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_BADGES", companies }, (res) => {
          resolve(res?.ok ? res.results : {});
        });
      });
    } catch { /* service worker sleeping or quota — skip silently */ }

    for (const [name, groupCards] of companyToCards.entries()) {
      const result = results[name];
      for (const card of groupCards) {
        card.setAttribute(BADGE_ATTR, "1");
        if (!result || result.confidence === "none" || !result.lca) continue;
        const target = getBadgeTarget(card);
        if (!target) continue;
        target.append(createBadge(result.lca, result.confidence));
      }
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndBadge, 400);
  }

  scheduleScan();

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // LinkedIn SPA navigation — re-run when the user browses to a different search
  if (isLinkedIn) {
    const origPush = history.pushState.bind(history);
    history.pushState = (...args) => { origPush(...args); scheduleScan(); };
    const origReplace = history.replaceState.bind(history);
    history.replaceState = (...args) => { origReplace(...args); scheduleScan(); };
    window.addEventListener("popstate", scheduleScan);
  }
})();
