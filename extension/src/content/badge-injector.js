/**
 * Badge injector orchestrator.
 *
 * Platform-specific DOM logic lives in src/content/badgers/*.js — each registers
 * a badger descriptor on globalThis.VisaBadgers (see badgers/common.js for the
 * interface). This file is platform-agnostic: it picks the active badger for the
 * current page, then scans, batches company lookups, and injects badges.
 */
(function attachBadgeInjector(root) {
  const { BADGE_ATTR } = root.VisaBadgerUtils || {};
  const badgers = root.VisaBadgers || [];

  const hostname = location.hostname;
  const path = location.pathname;

  const active = badgers.find((b) => b.match(hostname, path));
  if (!active) return;

  let scanTimeout;
  let coldStartRetried = false;

  // ── Scan and inject ──────────────────────────────────────────────────────────

  async function scanAndBadge() {
    const cards = [...active.getJobCards()];
    if (!cards.length) return;

    // Collect unique company names; mark cards as "pending" to skip next scan
    const companyToCards = new Map();
    for (const card of cards) {
      card.setAttribute(BADGE_ATTR, "pending");
      const name = active.getCompanyText(card);
      if (!name) { card.setAttribute(BADGE_ATTR, "none"); continue; }
      if (!companyToCards.has(name)) companyToCards.set(name, []);
      companyToCards.get(name).push(card);
    }

    const companies = [...companyToCards.keys()];
    if (!companies.length) {
      // Cleanup pending markers if no companies found
      for (const card of cards) {
        if (card.getAttribute(BADGE_ATTR) === "pending") {
          card.setAttribute(BADGE_ATTR, "none");
        }
      }
      return;
    }

    let results = {};
    try {
      results = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_BADGES", companies }, (res) => {
          void chrome.runtime.lastError; // suppress unchecked-error warning when SW is sleeping
          resolve(res?.ok ? res.results : {});
        });
      });
    } catch { /* service worker sleeping or quota — skip silently */ }

    // Cold-start detection: if every company returned "none", the SW was likely
    // waking up and failed to load shards. Reset attrs and retry once after 4s.
    const allNone = companyToCards.size > 2 &&
      [...companyToCards.keys()].every(n => !results[n] || results[n].confidence === "none");
    if (allNone && !coldStartRetried) {
      coldStartRetried = true;
      setTimeout(() => {
        for (const groupCards of companyToCards.values()) {
          for (const card of groupCards) card.removeAttribute(BADGE_ATTR);
        }
        scanAndBadge();
      }, 4000);
      return;
    }

    for (const [name, groupCards] of companyToCards.entries()) {
      const result = results[name];
      for (const card of groupCards) {
        // Mark as processed with the badger's stable card id (LinkedIn/Dice reuse
        // DOM nodes), or "1" for platforms that don't recycle elements.
        card.setAttribute(BADGE_ATTR, active.getCardId?.(card) || "1");

        // Remove old badges if they exist (in case of element reuse)
        card.querySelectorAll(".h1b-scout-badge").forEach(el => el.remove());

        if (!result || result.confidence === "none" || !result.lca) continue;
        const target = active.getBadgeTarget(card);
        if (!target) continue;

        const isCardAppend = (target === card);
        if (isCardAppend) {
          // Ensure container is relative for absolute positioning
          if (getComputedStyle(card).position === "static") {
            card.style.position = "relative";
          }
        }

        target.append(root.VisaBadgerUtils.createBadge(result.lca, result.confidence, isCardAppend, result.trend));
      }
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndBadge, 400);
  }

  scheduleScan();

  const observerInit = { childList: true, subtree: true };
  if (active.observerAttributeFilter) {
    observerInit.attributes = true;
    observerInit.attributeFilter = active.observerAttributeFilter;
  }
  new MutationObserver(scheduleScan).observe(document.body, observerInit);

  // SPA navigation (LinkedIn / Dice) — re-run when the user browses to a different search
  if (active.spaNav) {
    const origPush = history.pushState.bind(history);
    history.pushState = (...args) => { origPush(...args); scheduleScan(); };
    const origReplace = history.replaceState.bind(history);
    history.replaceState = (...args) => { origReplace(...args); scheduleScan(); };
    window.addEventListener("popstate", scheduleScan);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
