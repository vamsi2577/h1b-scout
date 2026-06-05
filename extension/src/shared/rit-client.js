/**
 * Pure helpers for the RIT (Resume Intelligence Tracker) backend proxy.
 *
 * The service worker (background.js) talks to the RIT backend on behalf of
 * the side panel. The data-shaping bits — normalising the configured
 * backend URL and turning the résumé-generation response headers into a
 * flat result object — are pure functions with no I/O, extracted here so
 * they can be unit-tested without a browser or a live backend.
 *
 * Dual export (matches the other shared/* modules):
 *   - service worker:  importScripts("shared/rit-client.js") → globalThis.VisaSponsor.RIT
 *   - node tests:       await import(...) with globalThis.VisaSponsor pre-seeded
 */
(function attachRitClient(root) {
  const DEFAULT_BACKEND_URL = "http://localhost:8000";

  // Resolve the backend base URL: a configured value wins, otherwise the
  // local dev default. Trailing slashes are stripped so callers can safely
  // concatenate `${base}/api/v1/...` without producing a double slash.
  function normalizeBackendUrl(configured, fallback = DEFAULT_BACKEND_URL) {
    const raw = (typeof configured === "string" && configured) ? configured : fallback;
    return raw.replace(/\/+$/, "");
  }

  // Merge an optional personal API token into a request's headers as a
  // Bearer credential. RIT honours the bearer token whenever present (even
  // with REQUIRE_AUTH off), so this is how the extension authenticates to the
  // RIT bridge — its chrome-extension:// origin can't carry the session
  // cookie. A blank/absent token leaves the headers untouched (sponsorship
  // features stay account-less).
  function buildAuthHeaders(token, base = {}) {
    const headers = { ...base };
    const t = (typeof token === "string") ? token.trim() : "";
    if (t) headers.Authorization = `Bearer ${t}`;
    return headers;
  }

  // The non-secret leading slug of a token (matches RIT's stored token_prefix),
  // safe to show in the settings UI so the user can tell which token is saved.
  function tokenPrefix(token, len = 12) {
    const t = (typeof token === "string") ? token.trim() : "";
    return t ? t.slice(0, len) : "";
  }

  // Turn the /generate-resume-from-jd response headers into the flat shape
  // the panel consumes. X-Metadata is the canonical source (groups
  // application_id / company_name / job_title / duplicate_warning /
  // filename in one JSON header); the individual X-* headers and the
  // Content-Disposition filename are fallbacks for when it's absent or
  // unparseable.
  //
  // `headers` is anything with a `.get(name)` method (a real Headers
  // object, or a test double).
  function parseGenerateResumeHeaders(headers) {
    const get = (name) => (headers && typeof headers.get === "function" ? headers.get(name) : null);

    const disposition = get("Content-Disposition") || "";
    const dispositionFilename = (disposition.split("filename=")[1] || "")
      .replace(/"/g, "")
      .trim();

    let metadata = null;
    const rawMetadata = get("X-Metadata");
    if (rawMetadata) {
      try {
        metadata = JSON.parse(rawMetadata);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("X-Metadata parse failed:", e);
      }
    }

    return {
      filename: metadata?.filename || dispositionFilename || "Resume.docx",
      applicationId: metadata?.application_id || get("X-Application-Id") || null,
      duplicateWarning:
        typeof metadata?.duplicate_warning === "boolean"
          ? metadata.duplicate_warning
          : get("X-Duplicate-Warning") === "true",
      metadata,
    };
  }

  root.VisaSponsor = {
    ...(root.VisaSponsor || {}),
    RIT: {
      DEFAULT_BACKEND_URL,
      normalizeBackendUrl,
      parseGenerateResumeHeaders,
      buildAuthHeaders,
      tokenPrefix,
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.VisaSponsor;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
