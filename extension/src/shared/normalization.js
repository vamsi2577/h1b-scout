(function attachNormalization(root) {
  const LEGAL_SUFFIXES = new Set([
    "INC",
    "INCORPORATED",
    "LLC",
    "L L C",
    "LTD",
    "LIMITED",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
    "LP",
    "LLP",
    "PLC",
    "USA",
    "US"
  ]);

  const STOP_WORDS = new Set([
    "A",
    "AN",
    "AND",
    "ASSOCIATE",
    "ASSOCIATES",
    "ENGINEER",
    "I",
    "II",
    "III",
    "INTERN",
    "LEAD",
    "MANAGER",
    "OF",
    "PRINCIPAL",
    "SENIOR",
    "SR",
    "STAFF",
    "THE"
  ]);

  function normalizeText(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/&/g, " AND ")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeEmployer(value) {
    const tokens = normalizeText(value).split(" ").filter(Boolean);
    while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    return tokens.join(" ");
  }

  function normalizeTitle(value) {
    return normalizeText(value);
  }

  function titleTokens(value) {
    return normalizeTitle(value)
      .split(" ")
      .filter((token) => token && !STOP_WORDS.has(token));
  }

  function titleSimilarity(left, right) {
    const leftTokens = new Set(titleTokens(left));
    const rightTokens = new Set(titleTokens(right));
    if (!leftTokens.size || !rightTokens.size) return 0;
    let overlap = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) overlap += 1;
    }
    return overlap / Math.max(leftTokens.size, rightTokens.size);
  }

  function confidenceForEmployer(query, matched) {
    const normalizedQuery = normalizeEmployer(query);
    const normalizedMatch = normalizeEmployer(matched);
    if (!normalizedQuery || !normalizedMatch) return "none";
    if (normalizedQuery === normalizedMatch) return "high";
    if (normalizedQuery.includes(normalizedMatch) || normalizedMatch.includes(normalizedQuery)) return "medium";
    return "low";
  }

  root.VisaSponsor = {
    ...(root.VisaSponsor || {}),
    normalizeText,
    normalizeEmployer,
    normalizeTitle,
    titleTokens,
    titleSimilarity,
    confidenceForEmployer
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.VisaSponsor;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
