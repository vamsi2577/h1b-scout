(function attachBadgeInjector() {
  const hostname = location.hostname;
  const path = location.pathname;

  const isLinkedIn = hostname.includes("linkedin.com") && (
    path.startsWith("/jobs/search") ||
    path.startsWith("/jobs/collections") ||
    path.startsWith("/jobs/recommended")
  );
  
  // Greenhouse: includes boards and search pages. 
  // Exclude actual application pages (usually /jobs/123456)
  const isGreenhouse = hostname.includes("greenhouse.io") && !/\/jobs\/\d+/.test(path);

  if (!isLinkedIn && !isGreenhouse) return;

  const BADGE_ATTR = "data-h1b-badge";
  let scanTimeout;

  // ── DOM helpers ──────────────────────────────────────────────────────────────

  function getJobCards() {
    if (isLinkedIn) {
      // LinkedIn reuses elements; check if the jobId has changed since last injection
      const cards = document.querySelectorAll('li[data-occludable-job-id]');
      return [...cards].filter(card => {
        const jobId = card.getAttribute('data-occludable-job-id');
        return card.getAttribute(BADGE_ATTR) !== jobId;
      });
    }
    if (isGreenhouse) {
      // my.greenhouse.io search results use data-provides="search-result".
      // boards.greenhouse.io use .opening / .job-post / data-gh='job'.
      // The old class-based selectors ([class*='border-gray-00'], div:has(>a[href*="/jobs/"]))
      // were too broad and couldn't reliably extract company names via innerText lines.
      return document.querySelectorAll(`
        [data-provides="search-result"]:not([${BADGE_ATTR}]),
        .opening:not([${BADGE_ATTR}]),
        .job-post:not([${BADGE_ATTR}]),
        [data-gh='job']:not([${BADGE_ATTR}])
      `.trim());
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
    if (isGreenhouse) {
      // my.greenhouse.io search results: company name is always in <p class="body">
      // next to the <h4 class="section-title"> job title. Using p.body avoids the
      // company-logo__placeholder letter (e.g. "Z") polluting innerText line counts.
      const bodyP = card.querySelector('p.body');
      if (bodyP) return bodyP.textContent.trim();

      // boards.greenhouse.io standard boards
      const perCardName =
        card.querySelector(".company-name")?.textContent?.trim() ||
        card.querySelector("[data-mapped='true'] .company-name")?.textContent?.trim() ||
        card.querySelector("[class*='company']")?.textContent?.trim() ||
        card.querySelector(".company")?.textContent?.trim() ||
        card.querySelector(".employer")?.textContent?.trim();

      if (perCardName) return perCardName;

      // Fallback to board-wide company name from page meta or headings
      return (
        document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
        document.querySelector('meta[name="author"]')?.content?.trim() ||
        document.querySelector('h1')?.textContent?.replace(/Current openings at /i, '')?.trim() ||
        document.title.split(/[-|]/)[0]?.replace(/Jobs at /i, '')?.trim() ||
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
    if (isGreenhouse) {
      // my.greenhouse.io: inline badge appended to the p.body company name element
      const bodyP = card.querySelector('p.body');
      if (bodyP) return bodyP;

      // boards.greenhouse.io: inline targets
      return (
        card.querySelector(".company-name") ||
        card.querySelector("[class*='company']") ||
        card.querySelector(".level, a") ||
        card.querySelector("p, span") ||
        card
      );
    }
    return null;
  }

  // ── Badge rendering ──────────────────────────────────────────────────────────

  function createBadge(lca, confidence, isCardAppend) {
    const el = document.createElement("span");
    el.className = `h1b-scout-badge h1b-scout-badge--${confidence}`;
    if (isCardAppend) el.classList.add("h1b-scout-badge--top-right");
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

    for (const [name, groupCards] of companyToCards.entries()) {
      const result = results[name];
      for (const card of groupCards) {
        // Mark as processed with the current jobId for LinkedIn, or "1" for others
        const id = (isLinkedIn ? card.getAttribute('data-occludable-job-id') : null) || "1";
        card.setAttribute(BADGE_ATTR, id);

        // Remove old badges if they exist (in case of element reuse)
        card.querySelectorAll('.h1b-scout-badge').forEach(el => el.remove());

        if (!result || result.confidence === "none" || !result.lca) continue;
        const target = getBadgeTarget(card);
        if (!target) continue;
        
        const isCardAppend = (target === card);
        if (isCardAppend) {
          // Ensure container is relative for absolute positioning
          if (getComputedStyle(card).position === 'static') {
            card.style.position = 'relative';
          }
        }

        target.append(createBadge(result.lca, result.confidence, isCardAppend));
      }
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndBadge, 400);
  }

  scheduleScan();

  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-occludable-job-id']
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
