import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndex } from "../scripts/prepare-data.mjs";

test("builds a two-year index and combines source rows by employer/title", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca2026 = path.join(temp, "LCA_Disclosure_Data_FY2026_Q1.csv");
  const lca2025 = path.join(temp, "LCA_Disclosure_Data_FY2025_Q4.csv");
  const perm2025 = path.join(temp, "PERM_Disclosure_Data_FY2025.csv");

  fs.writeFileSync(
    lca2026,
    "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nAcme Inc,Software Engineer,Certified,50,60,Hour\n"
  );
  fs.writeFileSync(
    lca2025,
    "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nAcme LLC,Senior Software Engineer,Denied,100000,120000,Year\n"
  );
  fs.writeFileSync(
    perm2025,
    "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS\nAcme Corporation,Software Engineer,Certified\n"
  );

  const index = await buildIndex({ lca: [lca2026, lca2025], perm: [perm2025] });
  assert.deepEqual(index.metadata.fiscalYears, [2026, 2025]);
  assert.equal(index.employers.ACME.years["2026"].summary.lca.employerTotal, 1);
  assert.equal(index.employers.ACME.years["2025"].summary.lca.denied, 1);
  assert.equal(index.employers.ACME.years["2025"].summary.perm.certified, 1);
  assert.equal(index.employers.ACME.years["2026"].summary.lca.minWage, 114400);
});

test("fiscalYears includes years discovered from filenames, sorted descending", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca2024 = path.join(temp, "LCA_FY2024.csv");
  const lca2025 = path.join(temp, "LCA_FY2025.csv");
  fs.writeFileSync(lca2024, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,80000,100000,Year\n");
  fs.writeFileSync(lca2025, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,90000,110000,Year\n");

  const index = await buildIndex({ lca: [lca2024, lca2025], perm: [] });
  assert.deepEqual(index.metadata.fiscalYears, [2025, 2024]);
  assert.ok(index.employers.FOO.years["2024"], "FY2024 data should be present");
  assert.ok(index.employers.FOO.years["2025"], "FY2025 data should be present");
});

test("partialYear defaults to the most recent fiscal year", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca2025 = path.join(temp, "LCA_FY2025.csv");
  fs.writeFileSync(lca2025, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,90000,110000,Year\n");

  const index = await buildIndex({ lca: [lca2025], perm: [] });
  assert.equal(index.metadata.partialYear, 2025);
});

test("explicit --partial-year overrides the default", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca2026 = path.join(temp, "LCA_FY2026.csv");
  const lca2025 = path.join(temp, "LCA_FY2025.csv");
  fs.writeFileSync(lca2026, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,90000,110000,Year\n");
  fs.writeFileSync(lca2025, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,80000,100000,Year\n");

  const index = await buildIndex({ lca: [lca2026, lca2025], perm: [], partialYear: 2026 });
  assert.equal(index.metadata.partialYear, 2026);
});

test("annualWage converts biweekly wages to annual", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca = path.join(temp, "LCA_FY2026.csv");
  fs.writeFileSync(lca, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,3000,4000,Bi-Weekly\n");
  const index = await buildIndex({ lca: [lca], perm: [] });
  const minWage = index.employers.FOO.years["2026"].summary.lca.minWage;
  assert.equal(minWage, Math.round(3500 * 26));
});

test("annualWage converts monthly wages to annual", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca = path.join(temp, "LCA_FY2026.csv");
  fs.writeFileSync(lca, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,6000,8000,Month\n");
  const index = await buildIndex({ lca: [lca], perm: [] });
  const minWage = index.employers.FOO.years["2026"].summary.lca.minWage;
  assert.equal(minWage, Math.round(7000 * 12));
});

test("annualWage uses only from-value when to is missing", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "visa-sponsor-"));
  const lca = path.join(temp, "LCA_FY2026.csv");
  fs.writeFileSync(lca, "EMPLOYER_NAME,JOB_TITLE,CASE_STATUS,WAGE_RATE_OF_PAY_FROM,WAGE_RATE_OF_PAY_TO,WAGE_UNIT_OF_PAY\nFoo Inc,Engineer,Certified,80000,,Year\n");
  const index = await buildIndex({ lca: [lca], perm: [] });
  const minWage = index.employers.FOO.years["2026"].summary.lca.minWage;
  assert.equal(minWage, 80000);
});
