import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  version?: unknown;
}

interface ReleaseManifest {
  version?: unknown;
}

interface PackagedProcess extends NodeJS.Process {
  pkg?: unknown;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
let cachedVersion: string | undefined;

export function isPackagedBinary(): boolean {
  return Boolean((process as PackagedProcess).pkg);
}

function normalizeVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/^v/, "");
  return VERSION_PATTERN.test(normalized) ? normalized : undefined;
}

function readVersionFile(filePath: string): string | undefined {
  try {
    const metadata = JSON.parse(readFileSync(filePath, "utf8")) as PackageMetadata | ReleaseManifest;
    return normalizeVersion(metadata.version);
  } catch {
    return undefined;
  }
}

function findPackageJsonVersion(startDirectory: string): string | undefined {
  let directory = startDirectory;
  while (true) {
    const packagePath = path.join(directory, "package.json");
    const version = readVersionFile(packagePath);
    if (version) return version;

    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function findManifestVersion(): string | undefined {
  const executableDirectory = path.dirname(process.execPath);
  for (const candidate of [
    path.join(executableDirectory, "..", "manifest.json"),
    path.join(executableDirectory, "manifest.json"),
    path.join(process.cwd(), "manifest.json"),
  ]) {
    const resolved = path.resolve(candidate);
    if (!existsSync(resolved)) continue;
    const version = readVersionFile(resolved);
    if (version) return version;
  }
  return undefined;
}

export function getCurrentVersion(): string | undefined {
  if (cachedVersion) return cachedVersion;

  const manifestVersion = findManifestVersion();
  if (manifestVersion) {
    cachedVersion = manifestVersion;
    return cachedVersion;
  }

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  cachedVersion = findPackageJsonVersion(moduleDirectory);
  return cachedVersion;
}
