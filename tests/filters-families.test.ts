import assert from "node:assert/strict";
import test from "node:test";
import { applyFilter } from "../src/filters/select-filter.js";

const options = { maxLines: 20, perFileLines: 2 };

test("npm filter keeps errors and summary while collapsing notices", () => {
  const raw = [
    ...Array.from({ length: 40 }, () => "npm notice this is informational"),
    ...Array.from({ length: 25 }, () => "npm timing idealTree"),
    "added 120 packages, and audited 130 packages in 12s",
    "npm WARN deprecated package-x",
    "npm ERR! code ERESOLVE",
  ].join("\n");

  const result = applyFilter(raw, "auto", ["npm", "install"], options);
  assert.equal(result.kind, "npm");
  assert.match(result.output, /ERR! code ERESOLVE/);
  assert.match(result.output, /added 120 packages/);
  assert.doesNotMatch(result.output, /npm timing/);
});

test("find filter summarizes many paths and keeps errors", () => {
  const raw = [
    ...Array.from({ length: 60 }, (_, index) => `./src/module-${index}/file-${index}.ts`),
    "find: './private': Permission denied",
  ].join("\n");

  const result = applyFilter(raw, "auto", ["find", ".", "-name", "*.ts"], options);
  assert.equal(result.kind, "find");
  assert.match(result.output, /paths: 60/);
  assert.match(result.output, /Permission denied/);
});

test("rg filter groups matches per file", () => {
  const raw = [
    ...Array.from({ length: 25 }, (_, index) => `src/cli.ts:${index + 10}:const mode${index} = 'exec'`),
    ...Array.from({ length: 12 }, (_, index) => `src/filters/select-filter.ts:${index + 5}:const FILTER_${index} = {}`),
  ].join("\n");

  const result = applyFilter(raw, "auto", ["rg", "mode", "src"], options);
  assert.equal(result.kind, "rg");
  assert.match(result.output, /matches: 37 in 2 files/);
  assert.match(result.output, /src\/cli.ts \(25\)/);
});

test("docker table output is compacted", () => {
  const raw = [
    "CONTAINER ID   IMAGE         STATUS          NAMES",
    "a1b2c3d4e5f6   nginx:latest  Up 2 hours      web",
    "b1c2d3e4f5a6   redis:alpine  Up 10 minutes   cache",
    "c1d2e3f4a5b6   postgres:16   Up 5 minutes    db",
  ].join("\n");

  const result = applyFilter(raw, "auto", ["docker", "ps"], { ...options, maxLines: 3 });
  assert.equal(result.kind, "docker");
  assert.match(result.output, /CONTAINER ID/);
  assert.match(result.output, /rows omitted|lines omitted/);
});

test("kubectl get table output is compacted", () => {
  const raw = [
    "NAME         READY   STATUS    RESTARTS   AGE",
    "api-7d9c     1/1     Running   0          2d",
    "worker-54a   1/1     Running   1          2d",
    "cache-09f    1/1     Running   0          1d",
  ].join("\n");

  const result = applyFilter(raw, "auto", ["kubectl", "get", "pods"], { ...options, maxLines: 3 });
  assert.equal(result.kind, "kubectl");
  assert.match(result.output, /NAME\s+READY/);
});

test("kubectl json output is preserved", () => {
  const raw = "{\"items\":[{\"metadata\":{\"name\":\"api\"}}]}";
  const result = applyFilter(raw, "auto", ["kubectl", "get", "pods", "-o", "json"], options);
  assert.equal(result.kind, "kubectl");
  assert.equal(result.output, raw);
  assert.equal(result.omitted, false);
});

test("gh structured output is preserved", () => {
  const raw = "[{\"number\":1,\"title\":\"Fix\"}]";
  const result = applyFilter(raw, "auto", ["gh", "pr", "list", "--json", "number,title"], options);
  assert.equal(result.kind, "gh");
  assert.equal(result.output, raw);
});

test("cat filter truncates long content by line limit", () => {
  const raw = Array.from({ length: 120 }, (_, index) => `line ${index} ${"x".repeat(40)}`).join("\n");
  const result = applyFilter(raw, "auto", ["cat", "file.txt"], { ...options, maxLines: 3 });
  assert.equal(result.kind, "cat");
  assert.match(result.output, /lines omitted/);
});

test("tail filter uses generic log collapsing", () => {
  const raw = [
    "health probe ok",
    "health probe ok",
    "health probe ok",
    "ERROR timeout from upstream",
  ].join("\n");

  const result = applyFilter(raw, "auto", ["tail", "-n", "100", "app.log"], options);
  assert.equal(result.kind, "tail");
  assert.match(result.output, /repeated 3x|progress lines collapsed/);
  assert.match(result.output, /ERROR timeout/);
});

test("git catch-all routes to git-list", () => {
  const raw = [
    "* main",
    ...Array.from({ length: 30 }, (_, index) => `  feature/branch-${index}`),
  ].join("\n");
  const result = applyFilter(raw, "auto", ["git", "branch"], options);
  assert.equal(result.kind, "git-list");
  assert.match(result.output, /main/);
});
