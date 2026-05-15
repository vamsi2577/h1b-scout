# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hardened security for H1B Scout by remediating vulnerabilities, restricting permissions, and validating message origins.

**Architecture:**
- Remove unused/vulnerable `xlsx` dependency.
- Add strict Content Security Policy (CSP) to `manifest.json`.
- Implement sender validation in `background.js` to prevent message spoofing.
- Add text sanitization for page-extracted data.
- Verify with a new security test suite including an attack simulation.

**Tech Stack:** JavaScript (Chrome MV3), Node.js (test runner).

---

### Task 1: Dependency Remediation

**Files:**
- Modify: `package.json`
- Modify: `scripts/prepare-data.mjs`

- [ ] **Step 1: Remove `xlsx` from `package.json`**

```json
{
  "optionalDependencies": {
    "xlsx": "^0.18.5" // REMOVE THIS LINE
  }
}
```

- [ ] **Step 2: Update `prepare-data.mjs` to remove `xlsx` references**

Remove mentions of the `xlsx` package in comments and help text since `exceljs` is now the sole provider for XLSX/XLS files.

- [ ] **Step 3: Run `npm install` and verify audit**

Run: `npm install && npm audit`
Expected: 0 vulnerabilities.

- [ ] **Step 4: Commit remediation**

```bash
git add package.json package-lock.json scripts/prepare-data.mjs
git commit -m "security: remove vulnerable xlsx dependency"
```

### Task 2: Manifest Hardening

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Add Content Security Policy (CSP)**

Modify `extension/manifest.json` to include:
```json
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none';"
  },
```

- [ ] **Step 2: Verify manifest**

Run: `npm run smoke:chrome`
Expected: Extension loads without manifest errors.

- [ ] **Step 3: Commit manifest changes**

```bash
git add extension/manifest.json
git commit -m "security: add strict content security policy"
```

### Task 3: Message Origin Validation

**Files:**
- Modify: `extension/src/background.js`

- [ ] **Step 1: Implement origin validation in `background.js`**

Add a check at the start of the `chrome.runtime.onMessage.addListener` callback:
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is the extension itself
  if (sender.id !== chrome.runtime.id) {
    console.warn("Rejected message from external sender:", sender.id);
    return;
  }
  // ... rest of logic
});
```

- [ ] **Step 2: Run smoke tests**

Run: `npm run smoke:chrome` and `npm run smoke:e2e`
Expected: Extension still works correctly on supported sites.

- [ ] **Step 3: Commit validation**

```bash
git add extension/src/background.js
git commit -m "security: validate message sender origin"
```

### Task 4: Content Sanitization & XSS Prevention

**Files:**
- Modify: `extension/src/sidepanel/panel.js`

- [ ] **Step 1: Audit and reinforce `textContent` usage**

Review `panel.js` and ensure NO `innerHTML` or `insertAdjacentHTML` is used for external data. (Verified previously, but add a comment to enforce this).

- [ ] **Step 2: Add length limits to extracted fields**

In `panel.js`, ensure `company` and `title` fields are truncated to a reasonable length (e.g., 200 chars) before display to prevent UI breakage or memory issues from extremely large maliciously-injected strings.

- [ ] **Step 3: Commit sanitization**

```bash
git add extension/src/sidepanel/panel.js
git commit -m "security: truncate and sanitize external data in sidepanel"
```

### Task 5: Security Attack Simulation

**Files:**
- Create: `test/security/malicious-site.html`
- Create: `test/security/security-audit.test.mjs`

- [ ] **Step 1: Create a malicious simulation page**

Create `test/security/malicious-site.html` that attempts to send a message to the extension.

- [ ] **Step 2: Create security test runner**

Create `test/security/security-audit.test.mjs` using the existing CDP smoke test infrastructure to:
1. Load the malicious page in Chrome.
2. Attempt to trigger a message to the extension.
3. Verify the background worker rejects it (by checking logs or sidepanel state).

- [ ] **Step 3: Run all tests**

Run: `node --test test/security/security-audit.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit security tests**

```bash
git add test/security/
git commit -m "test: add security audit and attack simulation"
```
