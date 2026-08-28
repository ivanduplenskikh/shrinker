import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { runCommand } from "../src/execution/run-command.js";
import { applyFilter, detectFilter } from "../src/filters/select-filter.js";
import { formatMeasurements, measure } from "../src/metrics/measure.js";

const filterOptions = { maxLines: 20, perFileLines: 10 };

test("command execution captures output and preserves non-zero exit code", async () => {
  const script = "process.stdout.write('visible output'); process.stderr.write('important error'); process.exit(7)";
  const result = await runCommand(process.execPath, ["-e", script]);

  assert.equal(result.exitCode, 7);
  assert.match(result.stdout, /visible output/);
  assert.match(result.stderr, /important error/);
  assert.match(result.combined, /visible output/);
  assert.match(result.combined, /important error/);
});

test("Windows alias fallback supports cat and ls", async () => {
  if (process.platform !== "win32") return;

  const catResult = await runCommand("cat", ["package.json"]);
  assert.equal(catResult.exitCode, 0, catResult.stderr);
  assert.match(catResult.stdout, /"name"\s*:\s*"shrinker-ai"/);

  const lsResult = await runCommand("ls", ["src"]);
  assert.equal(lsResult.exitCode, 0, lsResult.stderr);
  assert.match(lsResult.stdout, /filters\//);
});

test("filter detection recognizes supported command families", () => {
  assert.equal(detectFilter(["git", "status"]), "git-status");
  assert.equal(detectFilter(["git", "diff", "--cached"]), "git-diff");
  assert.equal(detectFilter(["git", "log", "-n", "10"]), "git-log");
  assert.equal(detectFilter(["git", "--no-pager", "log", "-n", "10"]), "git-log");
  assert.equal(detectFilter(["git", "-C", "repo", "log"]), "git-log");
  assert.equal(detectFilter(["git", "branch", "-vv"]), "git-list");
  assert.equal(detectFilter(["npm", "test"]), "test");
  assert.equal(detectFilter(["npm", "install"]), "npm");
  assert.equal(detectFilter(["tail", "-n", "200", "app.log"]), "tail");
  assert.equal(detectFilter(["find", ".", "-name", "*.ts"]), "find");
  assert.equal(detectFilter(["rg", "TODO", "src"]), "rg");
  assert.equal(detectFilter(["docker", "ps"]), "docker");
  assert.equal(detectFilter(["kubectl", "get", "pods"]), "kubectl");
  assert.equal(detectFilter(["cat", "README.md"]), "cat");
  assert.equal(detectFilter(["gh", "pr", "list"]), "gh");
  assert.equal(detectFilter(["node", "server.js"]), "log");
});

test("unknown filter formats conservatively return cleaned output", () => {
  const raw = "\u001b[31mplain text\u001b[0m";
  const result = applyFilter(raw, "git-status", [], {
    ...filterOptions,
  });

  assert.equal(result.output, "plain text");
  assert.equal(result.omitted, false);
});

test("git log preserves explicit patch and custom format output", () => {
  const patch = "commit abcdef1234567890\nAuthor: A <a@example.com>\n\n    Subject\n\ndiff --git a/a b/a\n+line";
  const patchResult = applyFilter(patch, "auto", ["git", "log", "-p"], filterOptions);
  assert.equal(patchResult.output, patch);
  assert.equal(patchResult.omitted, false);

  const custom = "abcdef1|Subject|A Developer";
  const customResult = applyFilter(
    custom,
    "auto",
    ["git", "log", "--format=%h|%s|%an"],
    filterOptions,
  );
  assert.equal(customResult.output, custom);
  assert.equal(customResult.omitted, false);
});

test("git log applies the global line cap even when preserving explicit formats", () => {
  const raw = Array.from({ length: 200 }, (_, index) => `abcdef${index} Subject ${index}`).join("\n");
  const result = applyFilter(
    raw,
    "auto",
    ["git", "log", "--format=%h %s"],
    { ...filterOptions, maxLines: 20 },
  );

  assert.equal(result.kind, "git-log");
  assert.equal(result.omitted, true);
  assert.match(result.output, /lines omitted/);
  assert.ok(result.output.split("\n").length < raw.split("\n").length);
});

test("git log preserves every tested diff-producing form", () => {
  const patch = "commit abcdef1234567890\n\n    Subject\n\ndiff --git a/a b/a\n+line";
  for (const args of [
    ["-L", "1,5:file.ts"],
    ["-c"],
    ["--cc"],
    ["--remerge-diff"],
  ]) {
    const result = applyFilter(patch, "auto", ["git", "log", ...args], filterOptions);
    assert.equal(result.output, patch, args.join(" "));
    assert.equal(result.omitted, false, args.join(" "));
  }
});

test("git log preserves requested signature verification", () => {
  const signed =
    "commit abcdef1234567890\ngpg: Signature made Thu Aug 21 12:30:00 2026\ngpg: Good signature from \"A Developer\"\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Subject";
  const result = applyFilter(
    signed,
    "auto",
    ["git", "log", "--show-signature"],
    filterOptions,
  );
  assert.equal(result.output, signed);
  assert.equal(result.omitted, false);
});

test("git log conservatively preserves unknown output-shaping flags", () => {
  const shaped = "commit abcdef1234567890\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Subject\nlog size 42";
  for (const flag of ["--compact-summary", "--stat-width=20", "--source", "--log-size"]) {
    const result = applyFilter(shaped, "auto", ["git", "log", flag], filterOptions);
    assert.equal(result.output, shaped, flag);
    assert.equal(result.omitted, false, flag);
  }
});

test("piped Git stat and name-list shapes are preserved without command metadata", () => {
  const stat =
    "commit abcdef1234567890\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Subject\n\n file.ts | 4 +++-\n 1 file changed, 3 insertions(+), 1 deletion(-)";
  const names =
    "commit abcdef1234567890\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Subject\n\nREADME.md\nsrc/file.ts";

  for (const shaped of [stat, names]) {
    const result = applyFilter(shaped, "git-log", [], filterOptions);
    assert.equal(result.output, shaped);
    assert.equal(result.omitted, false);
  }
});

test("git log does not mistake a flag-like grep value for a patch request", () => {
  const raw = "commit abcdef1234567890\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Subject";
  const result = applyFilter(raw, "auto", ["git", "log", "--grep", "-p"], filterOptions);
  assert.equal(result.output, "abcdef1234 Subject — A, 2026-08-21");
  assert.equal(result.omitted, true);
});

test("git log retains merge commits rather than imposing a hidden history policy", () => {
  const raw = "commit abcdef1234567890\nMerge: 1111111 2222222\nAuthor: A <a@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Merge feature branch";
  const result = applyFilter(raw, "auto", ["git", "log"], filterOptions);
  assert.match(result.output, /Merge feature branch/);
});

test("never-worse selection returns cleaned raw output", () => {
  const raw = "\u001b[31mabcdef1 Subject\u001b[0m";
  const result = applyFilter(raw, "git-log", [], filterOptions);
  assert.equal(result.output, "abcdef1 Subject");
  assert.equal(result.omitted, false);
});

test("never-worse selection rejects byte savings that increase estimated tokens", () => {
  const raw = "😀\n😀\n😀\n😀";
  const result = applyFilter(raw, "log", [], filterOptions);
  assert.equal(result.output, raw);
  assert.equal(result.omitted, false);
});

test("metrics show absolute savings and label small gains", () => {
  const formatted = formatMeasurements(measure("x".repeat(151), "x".repeat(48)));
  assert.match(formatted, /26 saved, small absolute gain/);
  assert.match(formatted, /-68%/);
});

test("CLI accepts an exec command when a PowerShell shim consumes the separator", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "exec",
      "--no-stats",
      "--no-save",
      process.execPath,
      "-e",
      "process.stdout.write('wrapped successfully')",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /wrapped successfully/);
});

test("CLI treats non-keyword top-level input as the command to wrap", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--no-stats",
      "--no-save",
      process.execPath,
      "-e",
      "process.stdout.write('shorthand works')",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /shorthand works/);
  assert.doesNotMatch(result.stderr, /\[shrinker\]/);
});

test("CLI prints per-run measurements only when requested", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--metrics",
      "--no-stats",
      "--no-save",
      process.execPath,
      "-e",
      "process.stdout.write('measure me')",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /\[shrinker\].*est\. tokens/);
});

test("CLI does not emit recovery hints for Git metadata-only compaction", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const input = Array.from(
    { length: 8 },
    (_, index) =>
      `commit ${String(index).padStart(40, "a")}\nAuthor: Developer <developer@example.com>\nDate: Thu Aug 21 12:30:00 2026 +0200\n\n    Commit ${index}`,
  ).join("\n\n");
  const result = spawnSync(
    process.execPath,
    [cli, "pipe", "--kind", "git-log", "--no-stats"],
    { encoding: "utf8", input },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /\[full: shrinker raw/);
});

test("CLI does not emit recovery hints for reproducible wrapped Git history", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const result = spawnSync(
    process.execPath,
    [cli, "--no-stats", "git", "log", "-n", "10"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /\[full: shrinker raw/);
});

test("CLI help is a successful reserved command", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  for (const help of [["help"], ["--help"], []]) {
    const result = spawnSync(process.execPath, [cli, ...help], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /shrinker <command> \[args\.\.\.\]/);
    assert.match(result.stdout, /shrinker stats/);
    assert.match(result.stdout, /shrinker last/);
    assert.match(result.stdout, /shrinker raw/);
    assert.match(result.stdout, /--metrics/);
    assert.match(result.stdout, /--restart/);
  }
});

test("CLI rejects dashboard restart without the dashboard option", () => {
  const cli = path.join(process.cwd(), "dist", "src", "cli.js");
  const result = spawnSync(process.execPath, [cli, "stats", "--restart"], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--restart requires stats --dashboard/);
});
