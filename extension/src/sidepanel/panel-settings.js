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
