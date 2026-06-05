(function attachPanelSettings(root) {
  const { elements, setStatus } = root.PanelUI;

  function updateLocalShardsStatus(localLetters) {
    const el = elements.localShardsStatus;
    if (!localLetters?.length) {
      el.textContent = "No local files stored.";
    } else {
      const sorted = [...localLetters].sort();
      el.textContent = `${sorted.length} letter${sorted.length !== 1 ? "s" : ""} stored locally: ${sorted.join(", ")}`;
    }
  }

  function loadSettings() {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (!response?.ok) return;
      elements.customUrlInput.value = response.customBaseUrl || "";
      updateLocalShardsStatus(response.localLetters || []);
    });
    chrome.runtime.sendMessage({ type: "RIT_GET_BACKEND_URL" }, (response) => {
      if (!response?.ok) return;
      elements.ritBackendUrlInput.value = response.isDefault ? "" : response.url;
    });
    chrome.runtime.sendMessage({ type: "RIT_GET_TOKEN" }, (response) => {
      if (!response?.ok) return;
      renderTokenStatus(response.hasToken, response.prefix);
    });
  }

  // Show whether a token is saved (and its non-secret prefix) without ever
  // echoing the secret back into the input.
  function renderTokenStatus(hasToken, prefix) {
    const el = elements.ritTokenStatus;
    if (!el) return;
    el.textContent = hasToken
      ? `A token is saved (${prefix}…). Paste a new one to replace it.`
      : "No token saved — résumé generation and tracker sync are disabled.";
  }

  function shardFullIndex(data) {
    const buckets = new Map();
    for (const [key, employer] of Object.entries(data.employers || {})) {
      const first = key[0]?.toUpperCase() || "0";
      const letter = /[A-Z]/.test(first) ? first : "0";
      if (!buckets.has(letter)) {
        buckets.set(letter, { metadata: data.metadata, employers: {}, aliases: {} });
      }
      buckets.get(letter).employers[key] = employer;
    }
    for (const [aliasKey, targetKey] of Object.entries(data.aliases || {})) {
      const first = aliasKey[0]?.toUpperCase() || "0";
      const letter = /[A-Z]/.test(first) ? first : "0";
      const bucket = buckets.get(letter);
      if (bucket) bucket.aliases[aliasKey] = targetKey;
    }
    return buckets;
  }

  function init() {
    let settingsOpen = false;

    elements.settingsBtn.addEventListener("click", () => {
      settingsOpen = !settingsOpen;
      elements.settingsDrawer.hidden = !settingsOpen;
      elements.settingsBtn.setAttribute("aria-expanded", String(settingsOpen));
      elements.settingsBtn.classList.toggle("active", settingsOpen);
      if (settingsOpen) loadSettings();
    });

    elements.saveUrlBtn.addEventListener("click", () => {
      const url = elements.customUrlInput.value.trim();
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", customBaseUrl: url }, (response) => {
        if (response?.ok) {
          setStatus(url ? `Custom URL saved. Data will reload on next lookup.` : "URL reset to default.", "info");
        }
      });
    });

    elements.resetUrlBtn.addEventListener("click", () => {
      elements.customUrlInput.value = "";
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", customBaseUrl: "" }, (response) => {
        if (response?.ok) setStatus("URL reset to built-in default.", "info");
      });
    });

    function showFeedback(text, isError = false) {
      const fb = elements.ritBackendFeedback;
      if (!fb) return;
      fb.textContent = text;
      fb.style.color = isError ? "var(--danger, #d33)" : "var(--accent-dark, #0d5148)";
      fb.hidden = false;
    }

    elements.saveRitBackendBtn.addEventListener("click", () => {
      const url = elements.ritBackendUrlInput.value.trim();
      const btn = elements.saveRitBackendBtn;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving...";
      showFeedback("");

      chrome.runtime.sendMessage({ type: "RIT_SET_BACKEND_URL", url }, (response) => {
        btn.disabled = false;
        btn.textContent = originalText;
        if (response?.ok) {
          showFeedback("Saved ✓");
          setStatus(url ? `RIT backend URL saved.` : "RIT backend URL reset to default.", "info");
          setTimeout(() => {
            if (elements.ritBackendFeedback.textContent === "Saved ✓") {
              elements.ritBackendFeedback.hidden = true;
            }
          }, 2500);
          if (window.H1B_CARDS && typeof window.H1B_CARDS.refreshBackendStatus === "function") {
            window.H1B_CARDS.refreshBackendStatus();
          }
        } else {
          showFeedback(`Error: ${response?.error || "unknown error"}`, true);
          setStatus(`Failed to save backend URL: ${response?.error || "unknown error"}.`, "warning");
        }
      });
    });

    elements.resetRitBackendBtn.addEventListener("click", () => {
      const btn = elements.resetRitBackendBtn;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Resetting...";
      showFeedback("");
      elements.ritBackendUrlInput.value = "";

      chrome.runtime.sendMessage({ type: "RIT_SET_BACKEND_URL", url: "" }, (response) => {
        btn.disabled = false;
        btn.textContent = originalText;
        if (response?.ok) {
          showFeedback("Reset ✓");
          setStatus("RIT backend URL reset to default.", "info");
          setTimeout(() => {
            if (elements.ritBackendFeedback.textContent === "Reset ✓") {
              elements.ritBackendFeedback.hidden = true;
            }
          }, 2500);
          if (window.H1B_CARDS && typeof window.H1B_CARDS.refreshBackendStatus === "function") {
            window.H1B_CARDS.refreshBackendStatus();
          }
        } else {
          showFeedback("Reset failed", true);
        }
      });
    });

    function showTokenFeedback(text, isError = false) {
      const fb = elements.ritTokenFeedback;
      if (!fb) return;
      fb.textContent = text;
      fb.style.color = isError ? "var(--danger, #d33)" : "var(--accent-dark, #0d5148)";
      fb.hidden = false;
    }

    elements.saveRitTokenBtn.addEventListener("click", () => {
      const token = elements.ritApiTokenInput.value.trim();
      if (!token) {
        showTokenFeedback("Paste a token first, or use Remove.", true);
        return;
      }
      const btn = elements.saveRitTokenBtn;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving...";
      showTokenFeedback("");

      chrome.runtime.sendMessage({ type: "RIT_SET_TOKEN", token }, (response) => {
        btn.disabled = false;
        btn.textContent = originalText;
        if (response?.ok) {
          // Don't keep the secret in the DOM — clear it and refresh the status.
          elements.ritApiTokenInput.value = "";
          showTokenFeedback("Saved ✓");
          setStatus("RIT API token saved.", "info");
          chrome.runtime.sendMessage({ type: "RIT_GET_TOKEN" }, (r) => {
            if (r?.ok) renderTokenStatus(r.hasToken, r.prefix);
          });
          setTimeout(() => {
            if (elements.ritTokenFeedback.textContent === "Saved ✓") {
              elements.ritTokenFeedback.hidden = true;
            }
          }, 2500);
        } else {
          showTokenFeedback(`Error: ${response?.error || "unknown error"}`, true);
        }
      });
    });

    elements.resetRitTokenBtn.addEventListener("click", () => {
      elements.ritApiTokenInput.value = "";
      chrome.runtime.sendMessage({ type: "RIT_SET_TOKEN", token: "" }, (response) => {
        if (response?.ok) {
          showTokenFeedback("Removed ✓");
          setStatus("RIT API token removed.", "info");
          renderTokenStatus(false, "");
          setTimeout(() => {
            if (elements.ritTokenFeedback.textContent === "Removed ✓") {
              elements.ritTokenFeedback.hidden = true;
            }
          }, 2500);
        } else {
          showTokenFeedback("Remove failed", true);
        }
      });
    });

    elements.shardFileInput.addEventListener("change", async () => {
      const files = elements.shardFileInput.files;
      if (!files.length) return;

      const uploaded = [];
      const failed = [];

      for (const file of files) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data.employers) { failed.push(file.name); continue; }

          const isFullIndex = /sponsorship-index\.json$/i.test(file.name);
          if (isFullIndex) {
            const buckets = shardFullIndex(data);
            for (const [letter, shard] of buckets) {
              await LocalShardDB.set(letter, shard);
              uploaded.push(letter);
            }
          } else {
            const match = file.name.match(/sponsorship-([A-Z0])/i);
            let letter = match ? match[1].toUpperCase() : null;
            if (!letter) {
              const firstKey = Object.keys(data.employers)[0] || "";
              const firstChar = firstKey[0]?.toUpperCase() || "";
              letter = /[A-Z]/.test(firstChar) ? firstChar : (firstChar ? "0" : null);
            }
            if (!letter) { failed.push(file.name); continue; }
            await LocalShardDB.set(letter, data);
            uploaded.push(letter);
          }
        } catch {
          failed.push(file.name);
        }
      }

      if (uploaded.length) {
        chrome.runtime.sendMessage({ type: "CLEAR_SHARD_CACHE", letters: uploaded });
      }

      const msg = [
        uploaded.length ? `Stored locally: ${[...new Set(uploaded)].sort().join(", ")}.` : "",
        failed.length ? `Failed to read: ${failed.join(", ")}.` : ""
      ].filter(Boolean).join(" ");
      setStatus(msg || "No valid shard files found.", uploaded.length ? "info" : "warning");

      elements.shardFileInput.value = "";
      loadSettings();
    });

    elements.clearShardsBtn.addEventListener("click", async () => {
      await LocalShardDB.clear();
      const ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0".split("");
      chrome.runtime.sendMessage({ type: "CLEAR_SHARD_CACHE", letters: ALL_LETTERS });
      updateLocalShardsStatus([]);
      setStatus("Local shard files cleared. Data will be fetched from the remote URL on next lookup.", "info");
    });
  }

  root.PanelSettings = { init, loadSettings };
})(window);
