#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

const targets = {
  "win-x64": { pkg: "node22-win-x64", archive: "zip", binary: "shrinker.exe" },
  "macos-arm64": { pkg: "node22-macos-arm64", archive: "tar.gz", binary: "shrinker" },
  "macos-x64": { pkg: "node22-macos-x64", archive: "tar.gz", binary: "shrinker" },
  "linux-x64": { pkg: "node22-linux-x64", archive: "tar.gz", binary: "shrinker" },
};

function currentTarget() {
  if (process.platform === "win32" && process.arch === "x64") return "win-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "macos-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "macos-x64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  throw new Error(`No default release target for ${process.platform}-${process.arch}. Pass --target explicitly.`);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readTarget() {
  const explicit = readOption("--target");
  if (explicit) return explicit;
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  return positional ?? currentTarget();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function copySupportFiles(stageDir) {
  await cp(
    path.join(repoRoot, "integrations", "windows", "shrinker-profile.ps1"),
    path.join(stageDir, "integrations", "windows", "shrinker-profile.ps1"),
    { recursive: true },
  );
  await cp(
    path.join(repoRoot, "integrations", "macos", "shrinker-profile.zsh"),
    path.join(stageDir, "integrations", "macos", "shrinker-profile.zsh"),
    { recursive: true },
  );
  await cp(
    path.join(repoRoot, "templates", "agent-rules.md"),
    path.join(stageDir, "templates", "agent-rules.md"),
    { recursive: true },
  );
}

async function createArchive(stageDir, archivePath, archiveType) {
  await rm(archivePath, { force: true });
  if (archiveType === "zip") {
    const expression = [
      "$ErrorActionPreference = 'Stop'",
      `$source = Join-Path '${stageDir.replaceAll("'", "''")}' '*'`,
      `Compress-Archive -Path $source -DestinationPath '${archivePath.replaceAll("'", "''")}' -Force`,
    ].join("; ");
    run("pwsh", ["-NoProfile", "-Command", expression]);
    return;
  }

  run("tar", ["-czf", archivePath, "-C", stageDir, "."]);
}

const targetName = readTarget();
const version = readOption("--version") ?? packageJson.version;
const target = targets[targetName];
if (!target) {
  throw new Error(`Unsupported target '${targetName}'. Supported targets: ${Object.keys(targets).join(", ")}`);
}

const entrypoint = path.join(repoRoot, "dist", "src", "cli.js");
if (!existsSync(entrypoint)) {
  throw new Error("Missing dist/src/cli.js. Run npm run build before packaging.");
}

const releaseDir = path.join(repoRoot, "release");
const stageDir = path.join(repoRoot, ".shrinker", "package", targetName);
const binaryPath = path.join(stageDir, "bin", target.binary);
const archiveName = `shrinker-${targetName}.${target.archive === "zip" ? "zip" : "tar.gz"}`;
const archivePath = path.join(releaseDir, archiveName);

await rm(stageDir, { recursive: true, force: true });
await mkdir(path.dirname(binaryPath), { recursive: true });
await mkdir(releaseDir, { recursive: true });

run(process.execPath, [path.join(repoRoot, "node_modules", "@yao-pkg", "pkg", "lib-es5", "bin.js"), entrypoint, "--targets", target.pkg, "--output", binaryPath]);
await copySupportFiles(stageDir);
await writeFile(
  path.join(stageDir, "manifest.json"),
  `${JSON.stringify({ name: packageJson.name, version, target: targetName, binary: `bin/${target.binary}` }, null, 2)}\n`,
  "utf8",
);

await createArchive(stageDir, archivePath, target.archive);
console.log(`Created ${path.relative(repoRoot, archivePath)}`);
