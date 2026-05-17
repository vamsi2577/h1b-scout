(function attachSignalsExtractor(root) {
  if (root.VisaSponsor && root.VisaSponsor.extractSignals) return;
  // Ordered list of selectors to find the job description text.
  // First match wins; falls back to document.body.
  const DESCRIPTION_SELECTORS = [
    '[data-automation-id="jobPostingDescription"]', // Workday
    '#content',                                      // Greenhouse
    '.job__description',                             // Greenhouse alt
    '.posting-requirements',                         // Lever
    '.section-wrapper',                              // Lever alt
    '[data-testid="job-description"]',               // Ashby
    '[class*="jobDescription"]',
    '[class*="job-description"]',
    'article',
    'main'
  ];

  const SIGNAL_PATTERNS = [
    // ── No sponsorship ──────────────────────────────────────────────────────
    {
      type: "no_sponsorship",
      label: "No visa sponsorship",
      severity: "high",
      patterns: [
        /\bno\b.{0,30}\bvisa\s+sponsorship\b/i,
        /\bno\b.{0,30}\bwork\s+(visa|permit)\s+sponsorship\b/i,
        /\bwill\s+not\s+((provide|offer|consider|support)\b.{0,30}\b)?sponsor(ship)?\b/i,
        /\bnot\s+(able|going)\s+to\s+sponsor\b/i,
        /\bcannot\s+sponsor\b/i,
        /\bunable\s+to\s+(provide\s+)?sponsor(ship)?\b/i,
        /\bsponsorship\s+(is\s+)?(not|unavailable|not\s+available|not\s+provided|not\s+offered)\b/i,
        /\bsponsorship\b.{0,120}\bis\s+not\s+(available|provided|offered)\b/i,
        /\b(no|not\s+offer(ing)?|not\s+provid(ing)?)\b.{0,60}\bimmigration.{0,40}\bsupport\b/i,
        /\bdoes\s+not\s+sponsor\b/i,
        // "does/do not offer/provide/support sponsorship" — covers phrasings like
        // "Toyota does not offer sponsorship of job applicants for employment-based visas"
        /\b(do|does)\s+not\s+(offer|provide|support)\b.{0,50}\bsponsor(ship)?\b/i
      ]
    },

    // ── Citizenship / GC required ────────────────────────────────────────────
    {
      type: "citizenship_required",
      label: "Citizenship required",
      severity: "high",
      patterns: [
        /\b(must\s+be\s+|requires?\s+)(a\s+)?(us|u\.s\.)\s+citizen\b/i,
        /\b(us|u\.s\.)\s+citizen(ship)?\s+(only|required|is\s+required|mandatory)\b/i,
        /\b(green\s*card|gc|permanent\s+resident)\s+(holder\s+)?(or|and|\/)\s+(us\s+)?citizen/i,
        /\bcitizen(s)?\s+(and|or)\s+(permanent\s+residents?|green\s*card\s*holders?)\s+only\b/i,
        /\bonly\s+(us|u\.s\.)\s+citizens?\b/i
      ]
    },

    // ── Work authorization required (softer — EAD may qualify) ──────────────
    {
      type: "work_auth_required",
      label: "Work authorization required",
      severity: "medium",
      patterns: [
        /\bmust\s+be\s+(legally\s+)?(authorized|eligible)\s+to\s+work\b/i,
        /\bauthorized\s+to\s+work\s+(in\s+the\s+(us|u\.s\.)|without\s+(visa\s+)?sponsorship)\b/i,
        /\bwork\s+authorization\s+(is\s+)?(required|needed|mandatory)\b/i,
        /\blegally\s+authorized\s+to\s+work\b/i,
        /\bright\s+to\s+work\s+(in\s+the\s+)?(us|u\.s\.)\b/i
      ]
    },

    // ── Security clearance required ──────────────────────────────────────────
    {
      type: "clearance_required",
      label: "Security clearance required",
      severity: "high",
      patterns: [
        /\b(ts|top\s*secret)\s*[/-]\s*sci\b/i,
        /\btop\s+secret\s+clearance\b/i,
        /\b(active|current|valid)\s+(us\s+)?(secret|top\s+secret)\s+clearance\b/i,
        /\bsecret\s+clearance\s+(is\s+)?(required|needed|mandatory)\b/i,
        /\b(dod|department\s+of\s+defense)\s+(security\s+)?clearance\b/i,
        /\bmust\s+(hold|have|possess|maintain)\s+.{0,30}\b(security\s+)?clearance\b/i,
        /\bsecurity\s+clearance\s+(is\s+)?(required|mandatory|needed)\b/i,
        /\bpolygraph\s+(required|test|examination)\b/i,
        /\bscif\s+(access|clearance|required)\b/i,
        /\bsap\s+(clearance|access|program)\b/i
      ]
    },

    // ── Clearance preferred / eligible (softer signal) ───────────────────────
    {
      type: "clearance_preferred",
      label: "Clearance preferred",
      severity: "medium",
      patterns: [
        /\bclearance\s+(is\s+)?(preferred|a\s+(big\s+)?plus|nice\s+to\s+have|desirable)\b/i,
        /\bclearance\s+eligible\b/i,
        /\b(secret|top\s+secret|ts)\s+clearance\s+(preferred|eligible|a\s+plus)\b/i,
        /\b(preferred|bonus|nice)\s+.{0,40}\bclearance\b/i
      ]
    },

    // ── Sponsorship available (positive) ─────────────────────────────────────
    {
      type: "sponsorship_available",
      label: "Visa sponsorship available",
      severity: "positive",
      patterns: [
        /\bvisa\s+sponsorship\s+(is\s+)?(available|provided|offered)\b/i,
        /\bwill\s+sponsor\b/i,
        /\bsponsorship\s+provided\b/i,
        /\bwe\s+sponsor\b/i,
        /\bh[-‑]?1b\s+sponsor(ship)?\b/i,
        /\bh1b\s+sponsor(ship)?\b/i
      ]
    },

    // ── OPT / CPT welcome (positive) ─────────────────────────────────────────
    {
      type: "opt_cpt_welcome",
      label: "OPT/CPT welcome",
      severity: "positive",
      patterns: [
        /\bOPT\s+welcome\b/i,
        /\bCPT\s+welcome\b/i,
        /\bOPT\s*\/\s*CPT\b/i,
        /\bSTEM\s+OPT\b/i,
        /\bOPT\s+eligible\b/i
      ]
    },

    // ── E-Verify enrolled (info) ──────────────────────────────────────────────
    {
      type: "everify_enrolled",
      label: "E-Verify participant",
      severity: "info",
      patterns: [
        /\bE[-‑]Verify\b/i,
        /\beverify\b/i
      ]
    },

    // ── No C2C / W2 only ─────────────────────────────────────────────────────
    // Relevant for H-1B holders placed by staffing firms: "no C2C" means the
    // client will only hire direct W2 employees, excluding corp-to-corp contractors.
    {
      type: "no_c2c",
      label: "No C2C / W2 only",
      severity: "medium",
      patterns: [
        /\bno\s+c2c\b/i,
        /\bno\s+corp[\s-]?to[\s-]?corp\b/i,
        /\bcorp[\s-]?to[\s-]?corp\s+(not\s+)?(accepted|allowed|considered|eligible|permitted)\b/i,
        /\bw[-]?2\s+only\b/i,
        /\bmust\s+be\s+(on\s+)?w[-]?2\b/i,
        /\bdirect\s+(w[-]?2\s+)?hire\s+only\b/i
      ]
    }
  ];

  function getDescriptionText() {
    for (const selector of DESCRIPTION_SELECTORS) {
      const el = document.querySelector(selector);
      if (el?.innerText?.trim()) return el.innerText.slice(0, 10000);
    }
    return document.body?.innerText?.slice(0, 10000) || "";
  }

  // Extract the full sentence(s) surrounding a regex match so the user sees
  // the complete requirement, e.g. "Must have Active DoD secret clearance
  // verified in DISS. Top Secret preferred." rather than just the matched token.
  function extractSentenceContext(text, matchIndex, matchLength) {
    // Walk backward to the nearest sentence boundary
    let start = matchIndex;
    while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;

    // Walk forward through up to 2 sentence ends (or 400 chars max) so that
    // a trailing qualifier on the next sentence ("Top Secret preferred.") is included.
    let end = matchIndex + matchLength;
    let sentenceEnds = 0;
    while (end < text.length && sentenceEnds < 2 && end - start < 400) {
      if (/[.!?]/.test(text[end])) sentenceEnds++;
      end++;
    }

    return text.slice(start, end).replace(/[ \t]+/g, " ").trim();
  }

  function extractSignals() {
    const text = getDescriptionText();
    if (!text) return [];

    const signals = [];
    for (const def of SIGNAL_PATTERNS) {
      for (const pattern of def.patterns) {
        const match = text.match(pattern);
        if (match) {
          signals.push({
            type: def.type,
            label: def.label,
            severity: def.severity,
            quote: extractSentenceContext(text, match.index, match[0].length)
          });
          break; // one match per category is enough
        }
      }
    }
    return signals;
  }

  // Listen for scroll-to requests from the side panel
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "SCROLL_TO_SIGNAL" && message.text) {
        // window.find highlights and scrolls to the text natively in Chrome
        window.find(message.text, false /* case */, false /* backwards */, true /* wrap */);
      }
    });
  }

  root.VisaSponsor = {
    ...(root.VisaSponsor || {}),
    extractSignals
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
