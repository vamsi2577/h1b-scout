/**
 * Card deck wiring for the H1B Scout side panel.
 *
 * Owns:
 *   - the horizontal scroll-snap deck nav (dots + scroll observer)
 *   - the Generate-Résumé card (forwards JD to the RIT backend via the
 *     background service worker, downloads the returned DOCX)
 *   - the Tracker card (fetches recent applications for the current
 *     company from the RIT backend)
 *
 * Talks to the backend only via chrome.runtime.sendMessage so the
 * service-worker origin owns the host permission (host_permissions in
 * manifest.json). The side panel itself never `fetch`es the backend.
 */
(function () {
  const deck = document.getElementById("cardDeck");
  const dots = Array.from(document.querySelectorAll(".card-nav__dot"));
  if (!deck || dots.length === 0) return;

  // ── Deck navigation ──────────────────────────────────────────────
  function scrollToCard(name) {
    const card = deck.querySelector(`[data-card="${name}"]`);
    if (!card) return;
    deck.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
  }
  dots.forEach((dot) => {
    dot.addEventListener("click", () => scrollToCard(dot.dataset.card));
  });
  // Sync dot state to whichever card is most visible.
  const cards = Array.from(deck.querySelectorAll(".card"));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.intersectionRatio < 0.5) return;
      const name = e.target.dataset.card;
      dots.forEach((d) => {
        const active = d.dataset.card === name;
        d.classList.toggle("card-nav__dot--active", active);
        d.setAttribute("aria-selected", active ? "true" : "false");
      });
    });
  }, { root: deck, threshold: [0.5] });
  cards.forEach((c) => observer.observe(c));

  // Arrow-key navigation when the deck has focus.
  deck.tabIndex = 0;
  deck.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const order = ["sponsorship", "resume", "tracker"];
    const active = dots.findIndex((d) => d.classList.contains("card-nav__dot--active"));
    const next = Math.max(0, Math.min(order.length - 1, active + (e.key === "ArrowRight" ? 1 : -1)));
    scrollToCard(order[next]);
    e.preventDefault();
  });

  // ── Shared: latest job context from the Sponsorship card ─────────
  let currentContext = { companyName: "", jobTitle: "", jobDescription: "" };

  function applyContext(ctx) {
    currentContext = ctx || currentContext;
    // Mirror onto résumé header
    document.getElementById("resumeCompanyHeading").textContent =
      ctx?.companyName || "No job detected";
    document.getElementById("resumeTitleHeading").textContent =
      ctx?.jobTitle || "Open a job post to tailor a résumé.";
    // JD preview + editable textarea
    const jd = ctx?.jobDescription || "";
    document.getElementById("resumeJdSummary").textContent = jd
      ? jd.slice(0, 220).replace(/\s+/g, " ") + (jd.length > 220 ? "…" : "")
      : "No description captured yet. Paste below.";
    document.getElementById("resumeJdInput").value = jd;
    // Tracker header
    document.getElementById("trackerCompanyHeading").textContent =
      ctx?.companyName || "No company";
  }

  // ── Backend status check ─────────────────────────────────────────
  // Pulls the URL + a one-shot /health probe in a single message.
  // Renders an env badge (DEV / E2E / PROD) so you can never confuse
  // a dev write for a prod write.
  const ENV_STYLES = {
    development: { bg: "#dbeafe", fg: "#1d4ed8", label: "DEV" },
    e2e:         { bg: "#fef3c7", fg: "#a16207", label: "E2E" },
    staging:     { bg: "#fde68a", fg: "#92400e", label: "STAGING" },
    production:  { bg: "#fee2e2", fg: "#b91c1c", label: "PROD" },
    test:        { bg: "#e5e7eb", fg: "#374151", label: "TEST" },
    unknown:     { bg: "#e5e7eb", fg: "#374151", label: "?" }
  };

  function renderBackendStatus(resp) {
    const el = document.getElementById("resumeBackendStatus");
    el.replaceChildren();
    if (!resp?.ok) { el.textContent = "Backend URL not configured."; return; }

    const url = document.createElement("code");
    url.textContent = resp.url;
    el.appendChild(url);

    if (resp.reachable) {
      const env = resp.env || "unknown";
      const style = ENV_STYLES[env] || ENV_STYLES.unknown;
      const badge = document.createElement("span");
      badge.textContent = " " + style.label + " ";
      badge.title = `Backend reports APP_ENV=${env}. Don't generate against prod by accident.`;
      Object.assign(badge.style, {
        background: style.bg,
        color: style.fg,
        fontSize: "10px",
        fontWeight: "700",
        padding: "1px 6px",
        borderRadius: "999px",
        marginLeft: "6px",
        letterSpacing: "0.5px"
      });
      el.appendChild(badge);
    } else {
      const offline = document.createElement("span");
      offline.textContent = " unreachable";
      offline.style.color = "var(--danger, #d33)";
      offline.style.marginLeft = "6px";
      el.appendChild(offline);
    }
  }

  chrome.runtime.sendMessage({ type: "RIT_GET_BACKEND_URL" }, renderBackendStatus);

  // ── Generate Résumé button ───────────────────────────────────────
  const genBtn = document.getElementById("generateResumeBtn");
  const genStatus = document.getElementById("resumeGenStatus");
  function setGenStatus(text, isError = false) {
    genStatus.hidden = !text;
    genStatus.textContent = text || "";
    genStatus.style.color = isError ? "var(--danger, #d33)" : "";
  }
  genBtn.addEventListener("click", () => {
    const jd = document.getElementById("resumeJdInput").value.trim();
    if (jd.length < 20) {
      setGenStatus("Paste a job description (≥20 chars) first.", true);
      return;
    }
    genBtn.disabled = true;
    setGenStatus("Tailoring résumé… this can take 30–60 s on a local model.");
    chrome.runtime.sendMessage({
      type: "RIT_GENERATE_RESUME",
      body: {
        job_description: jd,
        target_company: currentContext.companyName || undefined,
        job_title: currentContext.jobTitle || undefined
      }
    }, (resp) => {
      genBtn.disabled = false;
      if (!resp?.ok) {
        setGenStatus(`✗ ${resp?.error || "Generation failed"}`, true);
        return;
      }
      // Trigger download via chrome.downloads (the service worker handed us
      // a data: URL; the API doesn't accept blob: URLs for downloads).
      chrome.downloads.download({
        url: resp.dataUrl,
        filename: resp.filename,
        saveAs: false
      });
      // Prefer the X-Metadata fields when available — they're the
      // canonical company / title the backend logged, even when the JD
      // contained a different name.
      const meta = resp.metadata || {};
      const loggedAs = meta.company_name && meta.job_title
        ? `${meta.company_name} · ${meta.job_title}`
        : (resp.applicationId?.slice(0, 8) || "?");
      const dupHint = resp.duplicateWarning ? " ⚠ duplicate" : "";
      setGenStatus(`✓ ${resp.filename} downloaded. Logged as ${loggedAs}${dupHint}.`);
      // Refresh tracker so the new entry shows up.
      loadTracker();
    });
  });

  // ── Tracker card ─────────────────────────────────────────────────
  const trackerList = document.getElementById("trackerList");
  const trackerStatus = document.getElementById("trackerStatus");

  function renderTracker(rows) {
    trackerList.replaceChildren();
    if (!rows.length) {
      trackerStatus.textContent = "No applications yet.";
      return;
    }
    trackerStatus.textContent = `${rows.length} application${rows.length === 1 ? "" : "s"}.`;
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tracker-row";
      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "tracker-row__title";
      title.textContent = r.job_title || "Untitled role";
      const meta = document.createElement("div");
      meta.className = "tracker-row__meta";
      meta.textContent = `${r.company_name || ""} · ${r.status || ""} · ${r.applied_date || ""}`;
      left.appendChild(title); left.appendChild(meta);
      row.appendChild(left);
      trackerList.appendChild(row);
    }
  }

  function loadTracker() {
    const company = currentContext.companyName;
    if (!company) {
      trackerStatus.textContent = "Open a job post to filter the tracker.";
      trackerList.replaceChildren();
      return;
    }
    trackerStatus.textContent = "Loading…";
    chrome.runtime.sendMessage({
      type: "RIT_FETCH_APPLICATIONS",
      params: { company, limit: 10, sort_by: "applied_date", sort_dir: "desc" }
    }, (resp) => {
      if (!resp?.ok) {
        trackerStatus.textContent = `Backend unreachable — ${resp?.error || "unknown error"}`;
        return;
      }
      renderTracker(resp.payload?.data || []);
    });
  }
  document.getElementById("trackerReloadBtn").addEventListener("click", loadTracker);

  // ── Exposed for panel.js to push fresh context after each render ─
  window.H1B_CARDS = { applyContext, loadTracker };
})();
