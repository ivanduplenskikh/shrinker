import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getLatestRawOutput, getRawOutput, saveRawOutput } from "../src/execution/raw-output-store.js";

test("latest raw output returns the newest saved capture", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));

  const first = await saveRawOutput("first", ["git", "log"], directory);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await saveRawOutput("second", ["npm", "test"], directory);
  const latest = await getLatestRawOutput(directory);

  assert.notEqual(first.path, second.path);
  assert.equal(latest?.path, second.path);
  assert.equal(latest?.output, "second");
  assert.equal((await getRawOutput(first.id, directory))?.output, "first");
});

test("exact lookup ignores ID-like text in the command slug", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  await saveRawOutput("wrong", ["tool_deadbeef_build"], directory);

  assert.equal(await getRawOutput("deadbeef", directory), undefined);
});

test("concurrent raw captures use unique file names", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-concurrent-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));

  const captures = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      saveRawOutput(`output ${index}`, ["git", "log"], directory),
    ),
  );
  assert.equal(
    new Set(captures.map(({ path: capturePath }) => capturePath)).size,
    captures.length,
  );
  await Promise.all(captures.map(({ path: capturePath }) => access(capturePath)));
});

test("concurrent rotation retains at most twenty complete captures", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-rotation-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));

  await Promise.all(
    Array.from({ length: 30 }, (_, index) =>
      saveRawOutput(`output ${index}`, ["git", "log"], directory),
    ),
  );
  const entries = await readdir(directory);
  const captures = entries.filter((entry) => entry.endsWith(".log"));
  assert.ok(captures.length > 0 && captures.length <= 20);
  await Promise.all(
    captures.map(async (entry) => assert.match(await readFile(path.join(directory, entry), "utf8"), /^output \d+$/)),
  );
  assert.equal(entries.filter((entry) => entry.endsWith(".tmp")).length, 0);
});

test("latest raw output is absent before the first capture", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-empty-"));
  context.after(async () => await rm(directory, { recursive: true, force: true }));
  assert.equal(await getLatestRawOutput(directory), undefined);
});

test("temporary files from dead writers are recovered", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-raw-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  const temporaryPath = path.join(directory, "orphan.log.999999.tmp");
  await writeFile(temporaryPath, "orphan");
  const stale = new Date(Date.now() - 60_000);
  await utimes(temporaryPath, stale, stale);

  const capture = await saveRawOutput("current", ["git", "log"], directory);

  await access(capture.path);
  await assert.rejects(access(temporaryPath));
});
