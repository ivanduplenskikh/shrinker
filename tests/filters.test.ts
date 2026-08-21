import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { filterGenericLog } from "../src/filters/generic-log.js";
import { filterGitDiff } from "../src/filters/git-diff.js";
import { filterGitLog } from "../src/filters/git-log.js";
import { filterGitStatus } from "../src/filters/git-status.js";
import { filterTestOutput } from "../src/filters/test-output.js";
import { measure } from "../src/metrics/measure.js";

const fixtures = path.join(process.cwd(), "tests", "fixtures");
const options = { maxLines: 80, perFileLines: 20 };

async function fixture(name: string): Promise<string> {
  return await readFile(path.join(fixtures, name), "utf8");
}

test("git status keeps branch and changed paths while removing guidance", async () => {
  const raw = await fixture("git-status.txt");
  const result = filterGitStatus(raw, options);

  assert.match(result.output, /branch: feature\/token-shrinker/);
  assert.match(result.output, /src\/cli\.ts/);
  assert.match(result.output, /tests\/fixtures\//);
  assert.doesNotMatch(result.output, /use "git add/);
  assert.ok(measure(raw, result.output).reductionPercent >= 40);
});

test("git diff keeps files and changed lines", async () => {
  const raw = await fixture("git-diff.txt");
  const result = filterGitDiff(raw, options);

  assert.match(result.output, /src\/cli\.ts/);
  assert.match(result.output, /applyFilter/);
  assert.match(result.output, /ERROR|compact/);
  assert.doesNotMatch(result.output, /^index /m);
  assert.ok(measure(raw, result.output).reductionPercent >= 25);
});

test("git log keeps commit identity and subjects while removing bodies", async () => {
  const raw = await fixture("git-log.txt");
  const result = filterGitLog(raw, options);

  assert.match(result.output, /7f38b6e2b5 \(HEAD -> feature\/token-shrinker\)/);
  assert.match(result.output, /Add deterministic test output compression/);
  assert.match(result.output, /Ada Developer, 2026-08-21/);
  assert.doesNotMatch(result.output, /Collapse passing test details/);
  assert.ok(measure(raw, result.output).reductionPercent >= 55);
});

test("test output collapses passes and preserves failure details", async () => {
  const raw = await fixture("test-output.txt");
  const result = filterTestOutput(raw, options);

  assert.match(result.output, /passing-detail lines collapsed/);
  assert.match(result.output, /AssertionError/);
  assert.match(result.output, /tests\/token\.test\.ts:42/);
  assert.match(result.output, /1 failed \| 12 passed/);
  assert.ok(measure(raw, result.output).reductionPercent >= 35);
});

test("generic log collapses progress and repeated lines but keeps errors", async () => {
  const raw = await fixture("generic-log.txt");
  const result = filterGenericLog(raw, options);

  assert.match(result.output, /8 progress lines collapsed/);
  assert.match(result.output, /health probe succeeded \[repeated 5x\]/);
  assert.match(result.output, /ERROR timeout/);
  assert.ok(measure(raw, result.output).reductionPercent >= 35);
});
