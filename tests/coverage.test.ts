import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detectFilterMatch } from "../src/filters/select-filter.js";
import {
  classifyWrappedRun,
  commandSignature,
  isCoverageTrackingEnabled,
  sanitizeToken,
} from "../src/metrics/coverage.js";
import { measure } from "../src/metrics/measure.js";
import { formatCoverage, getCoverageStats, getStats, recordUncovered } from "../src/metrics/stats-store.js";

function withTracking<T>(enabled: boolean, run: () => T): T {
  const previous = process.env['SHRINKER_TRACK_UNCOVERED'];
  if (enabled) process.env['SHRINKER_TRACK_UNCOVERED'] = "1";
  else delete process.env['SHRINKER_TRACK_UNCOVERED'];
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env['SHRINKER_TRACK_UNCOVERED'];
    else process.env['SHRINKER_TRACK_UNCOVERED'] = previous;
  }
}

test("command signatures keep only the executable and subcommand", () => {
  assert.deepEqual(commandSignature(["git", "blame", "src/cli.ts"]), {
    executable: "git",
    subcommand: "blame",
  });
  assert.deepEqual(commandSignature(["git", "-C", "/tmp/secret-project", "worktree", "list"]), {
    executable: "git",
    subcommand: "worktree",
  });
  assert.deepEqual(commandSignature(["/usr/local/bin/docker.exe", "inspect", "api"]), {
    executable: "docker",
    subcommand: "inspect",
  });
  assert.deepEqual(commandSignature(["kubectl", "-n", "prod", "top", "pods"]), {
    executable: "kubectl",
    subcommand: "top",
  });
  assert.deepEqual(commandSignature(["rg", "--json", "-i"]), { executable: "rg" });
  assert.equal(commandSignature([]), undefined);
});

test("command signatures never surface argument values", () => {
  assert.deepEqual(commandSignature(["curl", "https://example.com/?token=abc123"]), {
    executable: "curl",
  });
  assert.deepEqual(commandSignature(["cat", "/Users/someone/.ssh/id_rsa"]), { executable: "cat" });
});

test("sanitizeToken rejects anything that is not a bare command token", () => {
  assert.equal(sanitizeToken("STATUS"), "status");
  assert.equal(sanitizeToken("docker-compose"), "docker-compose");
  assert.equal(sanitizeToken("/etc/passwd"), undefined);
  assert.equal(sanitizeToken("https://example.com"), undefined);
  assert.equal(sanitizeToken('"quoted"'), undefined);
  assert.equal(sanitizeToken("a".repeat(65)), undefined);
  assert.equal(sanitizeToken(""), undefined);
  assert.equal(sanitizeToken(undefined), undefined);
});

test("detectFilterMatch reports a miss only for the generic fallback", () => {
  assert.deepEqual(detectFilterMatch(["git", "status"]), { kind: "git-status", matched: true });
  assert.deepEqual(detectFilterMatch(["git", "blame"]), { kind: "git-list", matched: true });
  assert.deepEqual(detectFilterMatch(["docker", "inspect"]), { kind: "docker", matched: true });
  assert.deepEqual(detectFilterMatch(["curl", "-sS", "https://example.com"]), {
    kind: "log",
    matched: false,
  });
});

test("wrapped runs are classified as uncovered only when they matter", () => {
  const big = measure("x".repeat(4000), "x".repeat(3900));
  const small = measure("x".repeat(40), "x".repeat(40));

  assert.equal(classifyWrappedRun({ matched: false, kind: "log", measurements: big }), "no-filter");
  assert.equal(
    classifyWrappedRun({ matched: true, kind: "docker", measurements: big }),
    "low-reduction",
  );
  assert.equal(
    classifyWrappedRun({
      matched: true,
      kind: "git-log",
      measurements: measure("x".repeat(4000), "x".repeat(400)),
    }),
    undefined,
  );
  assert.equal(classifyWrappedRun({ matched: false, kind: "log", measurements: small }), undefined);
});

test("uncovered commands are recorded and ranked by estimated tokens", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-coverage-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  withTracking(true, () => {
    recordUncovered(
      {
        source: "wrapped",
        reason: "no-filter",
        executable: "curl",
        rawBytes: 400,
        rawEstimatedTokens: 100,
        exitCode: 0,
      },
      databasePath,
    );
    recordUncovered(
      {
        source: "shell",
        reason: "unlisted-subcommand",
        executable: "docker",
        subcommand: "inspect",
        rawBytes: 4000,
        rawEstimatedTokens: 1000,
        exitCode: 0,
      },
      databasePath,
    );
    recordUncovered(
      {
        source: "wrapped",
        reason: "low-reduction",
        executable: "docker",
        subcommand: "inspect",
        rawBytes: 2000,
        rawEstimatedTokens: 500,
      },
      databasePath,
    );
  });

  const rows = getCoverageStats(databasePath);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.command, "docker inspect");
  assert.equal(rows[0]?.occurrences, 2);
  assert.equal(rows[0]?.estimatedTokens, 1500);
  assert.equal(rows[0]?.averageTokens, 750);
  assert.deepEqual(rows[0]?.reasons, ["low-reduction", "unlisted-subcommand"]);
  assert.deepEqual(rows[0]?.sources, ["shell", "wrapped"]);
  assert.equal(rows[1]?.command, "curl");
  assert.equal(rows[1]?.subcommand, undefined);

  const summary = withTracking(true, () => getStats(databasePath));
  assert.equal(summary.uncoveredTrackingEnabled, true);
  assert.equal(summary.uncovered.length, 2);

  const formatted = formatCoverage(summary);
  assert.match(formatted, /Coverage Gaps/);
  assert.match(formatted, /Tracking: enabled/);
  assert.match(formatted, /docker inspect/);
});

test("nothing is recorded while tracking is opt-out", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-coverage-off-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  withTracking(false, () => {
    assert.equal(isCoverageTrackingEnabled(), false);
    recordUncovered(
      { source: "shell", reason: "unlisted-subcommand", executable: "docker", subcommand: "inspect" },
      databasePath,
    );
  });

  assert.deepEqual(getCoverageStats(databasePath), []);
  const summary = withTracking(false, () => getStats(databasePath));
  assert.equal(summary.uncoveredTrackingEnabled, false);
  assert.match(formatCoverage(summary), /Tracking: disabled/);
  assert.match(formatCoverage(summary), /No uncovered commands recorded yet/);
});

test("unsanitary command tokens are dropped instead of stored", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-coverage-safe-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, "stats.db");

  withTracking(true, () => {
    recordUncovered(
      { source: "shell", reason: "unlisted-subcommand", executable: "/usr/bin/../evil; rm -rf /" },
      databasePath,
    );
    recordUncovered(
      {
        source: "shell",
        reason: "unlisted-subcommand",
        executable: "docker",
        subcommand: "https://example.com/?token=abc",
        rawEstimatedTokens: 10,
      },
      databasePath,
    );
  });

  const rows = getCoverageStats(databasePath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.command, "docker");
  assert.equal(rows[0]?.subcommand, undefined);
});
