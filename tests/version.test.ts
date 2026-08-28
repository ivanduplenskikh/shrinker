import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentVersion, isPackagedBinary } from "../src/version.js";

test("current version is discoverable in development", () => {
  assert.match(getCurrentVersion() ?? "", /^\d+\.\d+\.\d+/);
});

test("packaged binary detection returns a boolean", () => {
  assert.equal(typeof isPackagedBinary(), "boolean");
});
