# Security Audit & Hardening Design: H1B Scout

**Topic:** Comprehensive Security Audit and Hardening (Approach 2)
**Date:** 2026-05-14
**Status:** Draft (Pending User Review)

## 1. Goal
The primary goal is to ensure H1B Scout remains secure and private. While the sponsorship data it displays is public, the extension must not leak user context (like which jobs they are viewing) to malicious websites, nor should it provide a vector for cross-site scripting (XSS) or data exfiltration.

## 2. Architecture & Components

### A. Dependency Remediation
- **Target:** `xlsx` (SheetJS)
- **Action:** Investigate if `xlsx` is used in the extension itself or just the data pipeline. If in the pipeline, update to a safe version. If unused, remove it.

### B. Manifest Hardening
- **CSP (Content Security Policy):** Define a strict `extension_pages` CSP in `manifest.json` to prevent inline scripts and restrict script sources to the extension package itself.
- **Permission Review:** Maintain `<all_urls>` (due to custom ATS domains) but ensure `content_scripts` are narrowly scoped where possible.

### C. Message Passing Security
- **Origin Validation:** Update `background.js` to strictly validate `sender.url` and `sender.id` for all `onMessage` listeners.
- **Payload Sanitization:** Ensure data extracted from the page (company, title) is treated as untrusted and sanitized before being stored or displayed in the UI.

### D. UI/UX Protection
- **XSS Prevention:** Audit `panel.js` to ensure `textContent` is used exclusively (verified in initial scan, but needs a formal check).

## 3. Attack Simulation (The "Red Team" Test)
We will create a `test/security/malicious-site.html` that attempts to:
1.  Send messages to the extension's background script to "probe" for company data.
2.  Infect the side panel's data storage via message spoofing.
3.  Expose any weaknesses in the `all_urls` permission by seeing if the extension's logic triggers on non-ATS sites.

## 4. Verification Plan
- **Automated:** Run `npm audit` after fixes.
- **Functional:** Ensure the extension still correctly detects jobs on Greenhouse, LinkedIn, etc.
- **Security:** The malicious site test must fail to communicate with or influence the extension.

## 5. Success Criteria
- [ ] `npm audit` reports 0 vulnerabilities.
- [ ] Background script rejects messages from non-extension/non-content-script origins.
- [ ] Side panel only renders text content, no HTML from external sources.
- [ ] Security test suite passes.
