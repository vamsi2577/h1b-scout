import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.VisaSponsor = {};
await import("../extension/src/shared/normalization.js");
await import("../extension/src/shared/lookup.js");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexPath = path.join(root, "extension", "data", "sponsorship-index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

const checks = [
  ["Google", "Software Engineer"],
  ["Microsoft", "Software Engineer"],
  ["Amazon", "Software Development Engineer"],
  ["Vercel", "Software Engineer"]
];

const results = checks.map(([company, title]) => {
  const lookup = VisaSponsor.lookupSponsorship(index, company, title);
  return {
    company,
    title,
    match: lookup.employerMatch,
    confidence: lookup.confidence,
    lca: lookup.combined.lca.employerTotal,
    lcaTitle: lookup.combined.lca.titleTotal,
    perm: lookup.combined.perm.employerTotal,
    permTitle: lookup.combined.perm.titleTotal
  };
});

const anyHit = results.some((result) => result.lca > 0 || result.perm > 0);
console.table(results);
if (!anyHit) {
  throw new Error("Generated index loaded, but smoke employers returned no LCA/PERM data.");
}
