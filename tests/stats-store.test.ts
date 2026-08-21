import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { measure } from "../src/metrics/measure.js";
import { formatStats, getStats, recordRun } from "../src/metrics/stats-store.js";

test("SQLite stats persist and aggregate runs by filter", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrink-stats-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  recordRun(
    {
      mode: "exec",
      filterKind: "git-log",
      commandName: "git",
      measurements: measure("x".repeat(400), "x".repeat(100)),
      durationMs: 20,
      omitted: true,
      exitCode: 0,
    },
    databasePath,
  );
  recordRun(
    {
      mode: "pipe",
      filterKind: "log",
      commandName: "stdin",
      measurements: measure("x".repeat(200), "x".repeat(100)),
      omitted: true,
    },
    databasePath,
  );

  const summary = getStats(databasePath);
  assert.equal(summary.total.runs, 2);
  assert.equal(summary.total.rawEstimatedTokens, 150);
  assert.equal(summary.total.outputEstimatedTokens, 50);
  assert.equal(summary.total.estimatedTokensSaved, 100);
  assert.equal(summary.total.reductionPercent, 67);
  assert.equal(summary.last7Days.runs, 2);
  assert.deepEqual(
    summary.byFilter.map((row) => [row.filterKind, row.runs, row.estimatedTokensSaved]),
    [
      ["git-log", 1, 75],
      ["log", 1, 25],
    ],
  );

  const formatted = formatStats(summary);
  assert.match(formatted, /All time: 2 runs \| est\. 100 tokens saved \| -67%/);
  assert.match(formatted, /git-log/);
  assert.match(formatted, /Database:/);
});

test("an empty stats database returns zero totals", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrink-stats-empty-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const summary = getStats(path.join(directory, "stats.db"));

  assert.equal(summary.total.runs, 0);
  assert.equal(summary.total.estimatedTokensSaved, 0);
  assert.equal(summary.total.reductionPercent, 0);
  assert.deepEqual(summary.byFilter, []);
});
