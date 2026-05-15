/**
 * End-to-end smoke test for the H1B Scout extension.
 *
 * Requires Chrome already running with:
 *   --remote-debugging-port=9222
 *   --load-extension=<absolute path to extension/>
 *
 * Usage:
 *   node scripts/e2e-smoke.mjs [--greenhouse-url <url>] [--workday-url <url>]
 *
 * Defaults to public job boards known to work with Greenhouse/Workday detection.
 * Set --greenhouse-url or --workday-url to skip a platform test.
 */

import { setTimeout as sleep } from "node:timers/promises";

const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";

// Well-known stable public job board URLs for smoke testing.
// Both resolved to active listings at time of writing; swap if they expire.
const DEFAULT_GREENHOUSE_URL = "https://boards.greenhouse.io/vercel/jobs/5370875004";
const DEFAULT_WORKDAY_URL    = "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-Software-Engineer_JR1978323";

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
  for (let attempt = 0; attempt < 20; attempt++) {
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
    await sleep(250);
  }
  throw new Error(
    "Extension service worker not found. Is Chrome running with the extension loaded?\n" +
    "Run: node scripts/launch-chrome.mjs  (or see README for manual steps)"
  );
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

async function waitForLoad(tabClient, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Page load timed out")),
      timeoutMs
    );
    tabClient.on("Page.loadEventFired", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function closeTab(tabId) {
  await fetch(`${CDP}/json/close/${tabId}`).catch(() => {});
}

// ─── Test: index integrity ───────────────────────────────────────────────────

async function testIndexIntegrity(workerClient, extensionId) {
  process.stdout.write("  [index] sponsorship-index.json loads and is non-empty ... ");
  const result = await cdpEval(
    workerClient,
    `(async () => {
      const r = await fetch("chrome-extension://${extensionId}/data/sponsorship-index.json");
      const json = await r.json();
      return { employers: Object.keys(json.employers || {}).length, coverage: json.metadata?.coverageLabel };
    })()`
  );
  if (!result.employers) throw new Error("Index has 0 employers — did you run prepare-data?");
  console.log(`OK (${result.employers} employers, ${result.coverage})`);
  return result;
}

// ─── Test: lookupSponsorship for known employer ──────────────────────────────

async function testKnownLookup(workerClient) {
  process.stdout.write("  [lookup] Google / Software Engineer returns high confidence ... ");
  const result = await cdpEval(
    workerClient,
    `(async () => {
      const r = await fetch(chrome.runtime.getURL("data/sponsorship-index.json"));
      const index = await r.json();
      return VisaSponsor.lookupSponsorship(index, "Google LLC", "Software Engineer");
    })()`
  );
  if (result.confidence === "none") {
    throw new Error("Google not found in index — index may be empty or stub-only");
  }
  if (!result.fiscalYears?.length) throw new Error("No fiscal years returned");
  console.log(`OK (confidence=${result.confidence}, lca=${result.combined.lca.employerTotal})`);
}

// ─── Test: content script detects job on page ────────────────────────────────

async function testJobDetection(workerClient, extensionId, label, url, expectedSource) {
  process.stdout.write(`  [detect][${label}] content script fires on real job page ... `);
  const { tabClient, tabId } = await openTab(url);

  try {
    await waitForLoad(tabClient, 20000);
    await sleep(4000); // allow 1s + 3s debounce timers to fire

    const context = await cdpEval(
      workerClient,
      `(async () => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.url?.includes(${JSON.stringify(new URL(url).hostname)}));
        if (!tab) return null;
        // Read latestContextByTab from the service worker module scope
        // by sending a synthetic GET_PANEL_DATA message
        return new Promise(resolve => {
          chrome.runtime.sendMessage({ type: "GET_PANEL_DATA", tabId: tab.id }, result => resolve(result));
        });
      })()`
    );

    if (!context?.context?.companyName && !context?.context?.jobTitle) {
      throw new Error(
        `Content script did not detect a job context on ${label}.\n` +
        `  URL: ${url}\n` +
        `  Got: ${JSON.stringify(context?.context)}\n` +
        `  The page may have been redesigned or the listing may be closed.`
      );
    }

    const { companyName, jobTitle, source } = context.context;
    if (expectedSource && source !== expectedSource) {
      throw new Error(`Expected source="${expectedSource}" but got "${source}"`);
    }
    console.log(`OK (company="${companyName}", title="${jobTitle}", source="${source}")`);
    return context;
  } finally {
    tabClient.close();
    await closeTab(tabId);
    await sleep(500);
  }
}

// ─── Test: manual override ────────────────────────────────────────────────────

async function testManualOverride(workerClient) {
  process.stdout.write("  [override] LOOKUP_OVERRIDE returns valid result ... ");
  const result = await cdpEval(
    workerClient,
    `(async () => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: "LOOKUP_OVERRIDE",
          companyName: "Microsoft",
          jobTitle: "Software Engineer",
          source: "manual",
          url: ""
        }, resolve);
      });
    })()`
  );
  if (!result?.ok) throw new Error(`LOOKUP_OVERRIDE failed: ${result?.error}`);
  if (!result.lookup?.fiscalYears?.length) throw new Error("No fiscal years in override result");
  const { confidence, combined } = result.lookup;
  console.log(`OK (confidence=${confidence}, lca=${combined.lca.employerTotal})`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    greenhouseUrl: DEFAULT_GREENHOUSE_URL,
    workdayUrl: DEFAULT_WORKDAY_URL,
    skipGreenhouse: false,
    skipWorkday: false
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--greenhouse-url") args.greenhouseUrl = argv[++i];
    else if (argv[i] === "--workday-url") args.workdayUrl = argv[++i];
    else if (argv[i] === "--skip-greenhouse") args.skipGreenhouse = true;
    else if (argv[i] === "--skip-workday") args.skipWorkday = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const passed = [];
  const failed = [];

  console.log("H1B Scout — E2E Smoke Test");
  console.log("─".repeat(52));

  console.log("\nConnecting to extension service worker...");
  const { workerClient, extensionId } = await findExtension();
  console.log(`  Found extension: ${extensionId}`);

  const runTest = async (name, fn) => {
    try {
      await fn();
      passed.push(name);
    } catch (err) {
      console.log(`FAIL\n    ${err.message}`);
      failed.push({ name, error: err.message });
    }
  };

  console.log("\nCore tests:");
  await runTest("index-integrity", () => testIndexIntegrity(workerClient, extensionId));
  await runTest("known-lookup", () => testKnownLookup(workerClient));
  await runTest("manual-override", () => testManualOverride(workerClient));

  console.log("\nEnd-to-end job detection:");
  if (!args.skipGreenhouse) {
    console.log(`  Greenhouse URL: ${args.greenhouseUrl}`);
    await runTest("greenhouse-detection", () =>
      testJobDetection(workerClient, extensionId, "greenhouse", args.greenhouseUrl, "greenhouse")
    );
  }
  if (!args.skipWorkday) {
    console.log(`  Workday URL: ${args.workdayUrl}`);
    await runTest("workday-detection", () =>
      testJobDetection(workerClient, extensionId, "workday", args.workdayUrl, "workday")
    );
  }

  workerClient.close();

  console.log("\n" + "─".repeat(52));
  console.log(`Results: ${passed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.error}`);
    process.exit(1);
  } else {
    console.log("All tests passed.");
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
