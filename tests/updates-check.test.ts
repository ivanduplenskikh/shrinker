import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkForUpdate,
  compareVersions,
  formatUpdateNotice,
  markUpdateNoticeShown,
  wasUpdateNoticeShown,
} from "../src/updates/check.js";

async function withConfig(contents: string | undefined, body: (configPath: string) => void | Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "shrinker-update-"));
  const configPath = path.join(directory, "config");
  if (contents !== undefined) await writeFile(configPath, contents, "utf8");
  try {
    await body(configPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function releaseFetch(version: string): typeof fetch {
  return async () => new Response(JSON.stringify({
    tag_name: `v${version}`,
    html_url: `https://github.com/ivanduplenskikh/shrinker/releases/tag/v${version}`,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("version comparison handles stable and prerelease values", () => {
  assert.equal(compareVersions("0.5.0", "0.5.1"), -1);
  assert.equal(compareVersions("0.5.1", "0.5.1"), 0);
  assert.equal(compareVersions("0.6.0", "0.5.1"), 1);
  assert.equal(compareVersions("0.5.1-beta", "0.5.1"), -1);
});

test("fresh cache returns cached latest version without fetching", async () => {
  await withConfig(`SHRINKER_LAST_UPDATE_CHECK=1000\nSHRINKER_LATEST_VERSION=0.5.1\n`, async (configPath) => {
    let fetched = false;
    const result = await checkForUpdate({
      currentVersion: "0.5.0",
      configPath,
      now: 1000 + 60_000,
      fetchImpl: async () => {
        fetched = true;
        throw new Error("unexpected fetch");
      },
    });

    assert.equal(fetched, false);
    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, "0.5.1");
    assert.equal(result.checked, false);
  });
});

test("stale cache fetches latest release and records metadata", async () => {
  await withConfig(`SHRINKER_LAST_UPDATE_CHECK=1\nSHRINKER_LATEST_VERSION=0.5.0\n`, async (configPath) => {
    const result = await checkForUpdate({
      currentVersion: "0.5.0",
      configPath,
      now: 1000 * 60 * 60 * 48,
      fetchImpl: releaseFetch("0.5.1"),
    });

    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, "0.5.1");
    assert.equal(result.checked, true);
  });
});

test("disabled update checks do not fetch", async () => {
  await withConfig("SHRINKER_UPDATE_CHECK=0\n", async (configPath) => {
    let fetched = false;
    const result = await checkForUpdate({
      currentVersion: "0.5.0",
      configPath,
      fetchImpl: async () => {
        fetched = true;
        throw new Error("unexpected fetch");
      },
    });

    assert.equal(fetched, false);
    assert.equal(result.updateAvailable, false);
  });
});

test("network failures do not throw or report updates", async () => {
  await withConfig(undefined, async (configPath) => {
    const result = await checkForUpdate({
      currentVersion: "0.5.0",
      configPath,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });

    assert.equal(result.updateAvailable, false);
    assert.equal(result.checked, true);
  });
});

test("update notices include current version latest version and install command", () => {
  const notice = formatUpdateNotice({
    updateAvailable: true,
    currentVersion: "0.5.0",
    latestVersion: "0.5.1",
    releaseUrl: "https://github.com/ivanduplenskikh/shrinker/releases/tag/v0.5.1",
    checked: true,
  });

  assert.match(notice ?? "", /Update available: 0\.5\.0 -> 0\.5\.1/);
  assert.match(notice ?? "", /Install:/);
});

test("shown update notices are remembered by latest version", async () => {
  await withConfig(undefined, (configPath) => {
    assert.equal(wasUpdateNoticeShown("0.5.1", configPath), false);
    markUpdateNoticeShown("0.5.1", configPath);
    assert.equal(wasUpdateNoticeShown("0.5.1", configPath), true);
    assert.equal(wasUpdateNoticeShown("0.5.2", configPath), false);
  });
});
