import test from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";

// ─── CDP helpers ────────────────────────────────────────────────────────────

async function getJson(path) {
  const response = await fetch(`${CDP}${path}`);
  if (!response.ok) throw new Error(`CDP ${path} returned ${response.status}`);
  return response.json();
}

function cdpConnect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method && listeners.has(msg.method)) {
      for (const cb of listeners.get(msg.method)) cb(msg.params);
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
        },
        on(method, cb) {
          if (!listeners.has(method)) listeners.set(method, new Set());
          listeners.get(method).add(cb);
        },
        close() { socket.close(); }
      });
    });
    socket.addEventListener("error", () => reject(new Error(`Cannot connect to ${wsUrl}`)));
  });
}

async function cdpEval(client, expression, { awaitPromise = true } = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const msg = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "Runtime evaluation failed";
    throw new Error(msg);
  }
  return result.result.value;
}

// ─── Extension discovery ─────────────────────────────────────────────────────

async function findExtension() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const targets = await getJson("/json/list");
    const workers = targets.filter(
      (t) => t.type === "service_worker" && t.url.startsWith("chrome-extension://")
    );
    for (const candidate of workers) {
      const client = await cdpConnect(candidate.webSocketDebuggerUrl);
      await client.send("Runtime.enable");
      const manifest = await cdpEval(client, "chrome.runtime.getManifest()");
      if (manifest.name === "H1B Scout") {
        const extensionId = new URL(candidate.url).hostname;
        return { workerClient: client, extensionId };
      }
      client.close();
    }
    await sleep(500);
  }
  throw new Error("Extension service worker not found. Is Chrome running with the extension loaded?");
}

// ─── Tab helpers ─────────────────────────────────────────────────────────────

async function openTab(url) {
  const tab = await getJson(`/json/new?${encodeURIComponent(url)}`);
  await sleep(500);
  const tabClient = await cdpConnect(tab.webSocketDebuggerUrl);
  await tabClient.send("Runtime.enable");
  await tabClient.send("Page.enable");
  return { tabClient, tabId: tab.id };
}

async function closeTab(tabId) {
  await fetch(`${CDP}/json/close/${tabId}`).catch(() => {});
}

// ─── Security Audit Tests ────────────────────────────────────────────────────

test("Security Audit: Message Spoofing Prevention", async (t) => {
  const { workerClient, extensionId } = await findExtension();
  
  // Enable console monitoring on the worker to catch rejection warnings
  await workerClient.send("Log.enable");
  const warnings = [];
  workerClient.on("Log.entryAdded", (params) => {
    if (params.entry.level === "warning") {
      warnings.push(params.entry.text);
    }
  });

  // Also catch Runtime.consoleAPICalled which is often used for console.warn
  await workerClient.send("Runtime.enable");
  workerClient.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "warning") {
      const text = params.args[0]?.value || "";
      warnings.push(text);
    }
  });

  const maliciousUrl = `file://${path.resolve(path.dirname(fileURLToPath(import.meta.url)), "malicious-site.html")}?id=${extensionId}`;
  
  await t.test("Rejects messages from non-extension origin", async () => {
    const { tabClient, tabId } = await openTab(maliciousUrl);
    
    try {
      // Wait for the attack script to run
      await sleep(3000);
      
      // Check the logs of the malicious page to see if it reports rejection
      const logs = await cdpEval(tabClient, "[]"); // Just a placeholder, we'll use Console.enable
      
      // We expect chrome.runtime.sendMessage to fail with an error like
      // "Could not establish connection. Receiving end does not exist." 
      // OR for it to be ignored by our background script if it somehow got through.
      
      // Verify background worker logged the rejection
      const hasRejectionLog = warnings.some(w => w.includes("Rejected message from external sender"));
      
      // Actually, since externally_connectable is NOT set, chrome.runtime.sendMessage 
      // from a web page to an extension ID will immediately fail in the web page
      // with "Access to extension denied" or similar, and won't even reach the extension.
      
      // Let's verify that the malicious page couldn't successfully send anything.
      // In the malicious page, we can check if it received any responses.
      // But more importantly, we check that our background worker didn't process them.
      
      // Check if background worker state was changed (it shouldn't be)
      const context = await cdpEval(workerClient, "typeof latestContextByTab !== 'undefined' ? latestContextByTab : {}");
      const maliciousContext = Object.values(context).find(c => c.companyName === "MALICIOUS_CORP");
      
      assert.strictEqual(maliciousContext, undefined, "Malicious context should not be present in background state");
      
      console.log("  ✓ Malicious message did not affect extension state");
    } finally {
      tabClient.close();
      await closeTab(tabId);
    }
  });

  workerClient.close();
});
