import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isTruthy, readConfig, resolveSetting, setConfigValue } from "../src/config.js";

async function withConfig(contents: string | undefined, body: (configPath: string) => void | Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-config-"));
  const configPath = path.join(directory, "config");
  if (contents !== undefined) await writeFile(configPath, contents, "utf8");
  try {
    await body(configPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("config parsing ignores comments, blank lines, and surrounding space", async () => {
  await withConfig("# leading comment\n\n  SHRINKER_TRACK_UNCOVERED = 1   # trailing\nOTHER=value\n", (configPath) => {
    const settings = readConfig(configPath);
    assert.equal(settings.get("SHRINKER_TRACK_UNCOVERED"), "1");
    assert.equal(settings.get("OTHER"), "value");
  });
});

test("a missing config file is treated as empty rather than fatal", async () => {
  await withConfig(undefined, (configPath) => {
    assert.equal(readConfig(configPath).size, 0);
    assert.equal(resolveSetting("SHRINKER_TRACK_UNCOVERED", configPath), undefined);
  });
});

test("the last assignment of a repeated key wins", async () => {
  await withConfig("SHRINKER_TRACK_UNCOVERED=0\nSHRINKER_TRACK_UNCOVERED=1\n", (configPath) => {
    assert.equal(readConfig(configPath).get("SHRINKER_TRACK_UNCOVERED"), "1");
  });
});

test("setting a config value updates the matching key and preserves other lines", async () => {
  await withConfig("# keep me\nSHRINKER_TRACK_UNCOVERED=0\nOTHER=value\n", async (configPath) => {
    setConfigValue("SHRINKER_TRACK_UNCOVERED", "1", configPath);

    assert.equal(readConfig(configPath).get("SHRINKER_TRACK_UNCOVERED"), "1");
    assert.equal(readConfig(configPath).get("OTHER"), "value");
    assert.match(await readFile(configPath, "utf8"), /^# keep me\n/m);
  });
});

test("setting a config value creates the file when it is missing", async () => {
  await withConfig(undefined, (configPath) => {
    setConfigValue("SHRINKER_LAST_UPDATE_CHECK", "123", configPath);

    assert.equal(readConfig(configPath).get("SHRINKER_LAST_UPDATE_CHECK"), "123");
  });
});

test("the environment overrides the config file in both directions", async (context) => {
  const previous = process.env['SHRINKER_TRACK_UNCOVERED'];
  context.after(() => {
    if (previous === undefined) delete process.env['SHRINKER_TRACK_UNCOVERED'];
    else process.env['SHRINKER_TRACK_UNCOVERED'] = previous;
  });

  await withConfig("SHRINKER_TRACK_UNCOVERED=0\n", (configPath) => {
    delete process.env['SHRINKER_TRACK_UNCOVERED'];
    assert.equal(resolveSetting("SHRINKER_TRACK_UNCOVERED", configPath), "0");

    process.env['SHRINKER_TRACK_UNCOVERED'] = "1";
    assert.equal(resolveSetting("SHRINKER_TRACK_UNCOVERED", configPath), "1");

    // An empty variable falls back to the file instead of masking it.
    process.env['SHRINKER_TRACK_UNCOVERED'] = "";
    assert.equal(resolveSetting("SHRINKER_TRACK_UNCOVERED", configPath), "0");
  });
});

test("truthiness accepts the documented spellings only", () => {
  for (const value of ["1", "true", "TRUE", "yes", " Yes "]) assert.equal(isTruthy(value), true, value);
  for (const value of ["0", "false", "no", "", " ", undefined]) assert.equal(isTruthy(value), false, String(value));
});
