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

  // HigherEdJobs search pages — /admin/search.cfm and similar listing paths.
  // Exclude detail pages (/details.cfm) which are handled by job-extractor instead.
  const isHigherEdJobs = (hostname === "www.higheredjobs.com" || hostname === "higheredjobs.com")
    && !path.includes("/details.cfm");

  // hiring.cafe search/listing pages — homepage and ?searchState=… filtered views.
  // Exclude individual job detail pages (/job/…) handled by job-extractor instead.
  const isHiringCafe = (hostname === "hiring.cafe" || hostname === "www.hiring.cafe")
    && !path.startsWith("/job/");

  if (!isLinkedIn && !isGreenhouse && !isHigherEdJobs && !isHiringCafe) return;

  const BADGE_ATTR = "data-h1b-badge";
  let scanTimeout;
  let coldStartRetried = false;

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
      return document.querySelectorAll(`
        [data-provides="search-result"]:not([${BADGE_ATTR}]),
        .opening:not([${BADGE_ATTR}]),
        .job-post:not([${BADGE_ATTR}]),
        [data-gh='job']:not([${BADGE_ATTR}])
      `.trim());
    }
    if (isHigherEdJobs) {
      // Verified against live DOM: each listing is a div.row.record
      return document.querySelectorAll(`.row.record:not([${BADGE_ATTR}])`);
    }
    if (isHiringCafe) {
      // Verified against live DOM: each job card is a div.relative.bg-white.rounded-xl
      return document.querySelectorAll(`div.relative.bg-white.rounded-xl:not([${BADGE_ATTR}])`);
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
    if (isHigherEdJobs) {
      // Verified against live DOM: institution name is a bare text node after the
      // first <br> inside .col-sm-7. It is not wrapped in an element.
      const col = card.querySelector(".col-sm-7");
      if (!col) return "";
      for (const node of col.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent.trim();
          if (t) return t;
        }
      }
      return "";
    }
    if (isHiringCafe) {
      // Verified against live DOM: company name is the bold span inside the
      // font-light description section — the 2nd span.font-bold in the card.
      return card.querySelector(".line-clamp-3.font-light span.font-bold")?.textContent?.trim() || "";
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
    if (isHigherEdJobs) {
      // Wrap the bare institution text node in a <span> on first call so the
      // badge has an inline element to append to. Re-use existing span on retry.
      const col = card.querySelector(".col-sm-7");
      if (!col) return null;
      const existing = col.querySelector(".hej-inst-name");
      if (existing) return existing;
      for (const node of col.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          const span = document.createElement("span");
          span.className = "hej-inst-name";
          span.textContent = node.textContent;
          node.replaceWith(span);
          return span;
        }
      }
      return null;
    }
    if (isHiringCafe) {
      // Append badge inline after the company name bold span
      return card.querySelector(".line-clamp-3.font-light span.font-bold") || null;
    }
    return null;
  }

  // ── Badge rendering ──────────────────────────────────────────────────────────

  function createBadge(lca, confidence, isCardAppend, trend) {
    const el = document.createElement("span");
    el.className = `h1b-scout-badge h1b-scout-badge--${confidence}`;
    if (isCardAppend) el.classList.add("h1b-scout-badge--top-right");
    const trendArrow = trend === "up" ? " ↑" : trend === "down" ? " ↓" : " →";
    el.title = `H-1B LCA filings — ${confidence} confidence match`;
    el.textContent = `H-1B ${Number(lca).toLocaleString("en-US")}${trendArrow}`;
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

    // Cold-start detection: if every company returned "none", the SW was likely
    // waking up and failed to load shards. Reset attrs and retry once after 4s.
    const allNone = companyToCards.size > 2 &&
      [...companyToCards.keys()].every(n => !results[n] || results[n].confidence === "none");
    if (allNone && !coldStartRetried) {
      coldStartRetried = true;
      setTimeout(() => {
        for (const cards of companyToCards.values()) {
          for (const card of cards) card.removeAttribute(BADGE_ATTR);
        }
        scanAndBadge();
      }, 4000);
      return;
    }

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

        target.append(createBadge(result.lca, result.confidence, isCardAppend, result.trend));
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
