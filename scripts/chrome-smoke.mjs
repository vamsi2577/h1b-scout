const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";

async function getJson(path) {
  const response = await fetch(`${CDP}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const requestId = ++id;
          socket.send(JSON.stringify({ id: requestId, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(requestId, { resolve: innerResolve, reject: innerReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", () => reject(new Error(`Unable to connect ${wsUrl}`)));
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed";
    throw new Error(details);
  }
  return result.result.value;
}

async function main() {
  let worker = null;
  let workerClient = null;
  let manifest = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const targets = await getJson("/json/list");
    const workers = targets.filter((target) => target.type === "service_worker" && target.url.startsWith("chrome-extension://"));
    for (const candidate of workers) {
      const candidateClient = await connect(candidate.webSocketDebuggerUrl);
      await candidateClient.send("Runtime.enable");
      const candidateManifest = await evaluate(candidateClient, "chrome.runtime.getManifest()");
      if (candidateManifest.name === "Visa Sponsorship Side Panel") {
        worker = candidate;
        workerClient = candidateClient;
        manifest = candidateManifest;
        break;
      }
      candidateClient.close();
    }
    if (worker) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!worker || !workerClient || !manifest) throw new Error("Visa Sponsorship Side Panel service worker target was not found");

  let extensionId = process.env.EXTENSION_ID || "";
  if (worker) extensionId = new URL(worker.url).hostname;
  if (!extensionId) throw new Error("Extension id was not found. Re-run with EXTENSION_ID=<id>.");

  const dataCheck = await evaluate(
    workerClient,
    `(async () => {
      const response = await fetch("chrome-extension://${extensionId}/data/sponsorship-index.json");
      const json = await response.json();
      return {
        coverage: json.metadata.coverageLabel,
        employers: Object.keys(json.employers || {}).length
      };
    })()`
  );

  if (!dataCheck.employers) throw new Error("Sponsorship index is empty");

  const lookupCheck = await evaluate(
    workerClient,
    `(async () => {
      const indexResponse = await fetch(chrome.runtime.getURL("data/sponsorship-index.json"));
      const index = await indexResponse.json();
      return VisaSponsor.lookupSponsorship(index, "Google", "Software Engineer");
    })()`
  );

  if (!lookupCheck.fiscalYears?.includes(2026) || !lookupCheck.fiscalYears?.includes(2025)) {
    throw new Error("Lookup result did not include FY2026 and FY2025");
  }

  workerClient.close();
  console.log(`Chrome smoke passed: extension=${extensionId}, employers=${dataCheck.employers}, coverage=${dataCheck.coverage}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
