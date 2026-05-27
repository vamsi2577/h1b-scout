/**
 * Badger registry + shared helpers.
 *
 * Each per-platform badger file calls VisaBadgerUtils.register({...}) to add
 * itself to root.VisaBadgers. The orchestrator (badge-injector.js) picks the
 * first badger whose match(hostname, path) returns true and drives it.
 *
 * Badger interface:
 *   name                     {string}   diagnostic label
 *   match(hostname, path)    {fn->bool} is this badger active on the current page?
 *   getJobCards()            {fn->[]}   unbadged job-card elements to process
 *   getCompanyText(card)     {fn->str}  company/employer name for the card
 *   getBadgeTarget(card)     {fn->El?}  element to append the badge to (may mutate DOM)
 *   getCardId(card)          {fn->str}  OPTIONAL — stable id for element-reuse tracking
 *                                       (LinkedIn/Dice recycle DOM nodes); default "1"
 *   spaNav                   {bool}     OPTIONAL — hook history API to re-scan on SPA nav
 *   observerAttributeFilter  {[str]}    OPTIONAL — MutationObserver attributeFilter
 */
(function attachBadgerCommon(root) {
  const BADGE_ATTR = "data-h1b-badge";

  root.VisaBadgers = root.VisaBadgers || [];

  function register(badger) {
    root.VisaBadgers.push(badger);
  }

  function createBadge(lca, confidence, isCardAppend, trend) {
    const el = document.createElement("span");
    el.className = `h1b-scout-badge h1b-scout-badge--${confidence}`;
    if (isCardAppend) el.classList.add("h1b-scout-badge--top-right");
    const trendArrow = trend === "up" ? " ↑" : trend === "down" ? " ↓" : " →";
    el.title = `H-1B LCA filings — ${confidence} confidence match`;
    el.textContent = `H-1B ${Number(lca).toLocaleString("en-US")}${trendArrow}`;
    return el;
  }

  root.VisaBadgerUtils = { BADGE_ATTR, register, createBadge };
})(typeof globalThis !== "undefined" ? globalThis : window);
