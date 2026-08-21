import assert from "node:assert/strict";
import test from "node:test";
import { runCommand } from "../src/execution/run-command.js";
import { applyFilter, detectFilter } from "../src/filters/select-filter.js";

test("command execution captures output and preserves non-zero exit code", async () => {
  const script = "process.stdout.write('visible output'); process.stderr.write('important error'); process.exit(7)";
  const result = await runCommand(process.execPath, ["-e", script]);

  assert.equal(result.exitCode, 7);
  assert.match(result.stdout, /visible output/);
  assert.match(result.stderr, /important error/);
  assert.match(result.combined, /visible output/);
  assert.match(result.combined, /important error/);
});

test("filter detection recognizes supported command families", () => {
  assert.equal(detectFilter(["git", "status"]), "git-status");
  assert.equal(detectFilter(["git", "diff", "--cached"]), "git-diff");
  assert.equal(detectFilter(["npm", "test"]), "test");
  assert.equal(detectFilter(["node", "server.js"]), "log");
});

test("unknown filter formats conservatively return cleaned output", () => {
  const raw = "\u001b[31mplain text\u001b[0m";
  const result = applyFilter(raw, "git-status", [], {
    maxLines: 20,
    perFileLines: 10,
  });

  assert.equal(result.output, "plain text");
  assert.equal(result.omitted, false);
});
