import { defaultConfigPath, isTruthy, readConfig, resolveSetting, setConfigValue } from "../config.js";

const DEFAULT_REPOSITORY = "ivanduplenskikh/shrinker";
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_TIMEOUT_MS = 750;
const LAST_CHECK_KEY = "SHRINKER_LAST_UPDATE_CHECK";
const LATEST_VERSION_KEY = "SHRINKER_LATEST_VERSION";
const NOTICE_SHOWN_KEY = "SHRINKER_UPDATE_NOTICE_SHOWN";

interface GitHubReleaseResponse {
  tag_name?: unknown;
  html_url?: unknown;
}

export interface UpdateCheckOptions {
  currentVersion?: string;
  repository?: string;
  configPath?: string;
  now?: number;
  intervalHours?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseUrl?: string;
  checked: boolean;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

function normalizeVersion(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^v/, "");
  return normalized && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized) ? normalized : undefined;
}

function parseVersion(value: string | undefined): ParsedVersion | undefined {
  const normalized = normalizeVersion(value);
  if (!normalized) return undefined;
  const [core, suffix] = normalized.split(/[-+]/, 2);
  const parts = core?.split(".").map((part) => Number(part)) ?? [];
  const major = parts[0];
  const minor = parts[1];
  const patch = parts[2];
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) return undefined;
  const parsedMajor = major as number;
  const parsedMinor = minor as number;
  const parsedPatch = patch as number;
  return {
    major: parsedMajor,
    minor: parsedMinor,
    patch: parsedPatch,
    ...(suffix ? { prerelease: suffix } : {}),
  };
}

export function compareVersions(current: string | undefined, latest: string | undefined): number {
  const left = parseVersion(current);
  const right = parseVersion(latest);
  if (!left || !right) return 0;

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  if ((left.prerelease ?? "") < (right.prerelease ?? "")) return -1;
  if ((left.prerelease ?? "") > (right.prerelease ?? "")) return 1;
  return 0;
}

function updateChecksEnabled(configPath: string): boolean {
  const setting = resolveSetting("SHRINKER_UPDATE_CHECK", configPath);
  if (setting === undefined) return true;
  return isTruthy(setting);
}

function intervalHours(configPath: string, fallback: number): number {
  const configured = Number(resolveSetting("SHRINKER_UPDATE_CHECK_INTERVAL_HOURS", configPath));
  return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
}

function cachedResult(currentVersion: string | undefined, latestVersion: string | undefined): UpdateCheckResult {
  const latest = normalizeVersion(latestVersion);
  return {
    updateAvailable: compareVersions(currentVersion, latest) < 0,
    ...(currentVersion ? { currentVersion } : {}),
    ...(latest ? { latestVersion: latest } : {}),
    checked: false,
  };
}

function isCacheFresh(config: Map<string, string>, now: number, maxAgeHours: number): boolean {
  const previous = Number(config.get(LAST_CHECK_KEY));
  if (!Number.isFinite(previous) || previous <= 0) return false;
  return now - previous < maxAgeHours * 60 * 60 * 1000;
}

async function fetchLatestRelease(
  repository: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ version?: string; releaseUrl?: string } | undefined> {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { "Accept": "application/vnd.github+json", "User-Agent": "shrinker-update-check" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return undefined;

  const body = await response.json() as GitHubReleaseResponse;
  const version = normalizeVersion(typeof body.tag_name === "string" ? body.tag_name : undefined);
  if (!version) return undefined;
  return {
    version,
    ...(typeof body.html_url === "string" ? { releaseUrl: body.html_url } : {}),
  };
}

export async function checkForUpdate(options: UpdateCheckOptions = {}): Promise<UpdateCheckResult> {
  const configPath = options.configPath ?? defaultConfigPath();
  const currentVersion = normalizeVersion(options.currentVersion);
  if (!currentVersion || !updateChecksEnabled(configPath)) {
    return { updateAvailable: false, ...(currentVersion ? { currentVersion } : {}), checked: false };
  }

  const now = options.now ?? Date.now();
  const config = readConfig(configPath);
  const maxAgeHours = options.intervalHours ?? intervalHours(configPath, DEFAULT_INTERVAL_HOURS);
  if (isCacheFresh(config, now, maxAgeHours)) {
    return cachedResult(currentVersion, config.get(LATEST_VERSION_KEY));
  }

  try {
    const latest = await fetchLatestRelease(
      options.repository ?? DEFAULT_REPOSITORY,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.fetchImpl ?? fetch,
    );
    if (!latest?.version) return { updateAvailable: false, currentVersion, checked: true };

    setConfigValue(LAST_CHECK_KEY, String(now), configPath);
    setConfigValue(LATEST_VERSION_KEY, latest.version, configPath);
    return {
      updateAvailable: compareVersions(currentVersion, latest.version) < 0,
      currentVersion,
      latestVersion: latest.version,
      ...(latest.releaseUrl ? { releaseUrl: latest.releaseUrl } : {}),
      checked: true,
    };
  } catch {
    return { updateAvailable: false, currentVersion, checked: true };
  }
}

export function formatUpdateNotice(result: UpdateCheckResult): string | undefined {
  if (!result.updateAvailable || !result.currentVersion || !result.latestVersion) return undefined;
  const releaseUrl = result.releaseUrl ?? `https://github.com/${DEFAULT_REPOSITORY}/releases/latest`;
  const installCommand = process.platform === "win32"
    ? `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/${DEFAULT_REPOSITORY}/main/integrations/windows/install.ps1))) -Version ${result.latestVersion}`
    : `curl -fsSL https://raw.githubusercontent.com/${DEFAULT_REPOSITORY}/main/integrations/macos/install.sh | bash -s -- --version ${result.latestVersion}`;
  return [
    `[shrinker] Update available: ${result.currentVersion} -> ${result.latestVersion}`,
    `[shrinker] Release: ${releaseUrl}`,
    `[shrinker] Install: ${installCommand}`,
  ].join("\n");
}

export function markUpdateNoticeShown(latestVersion: string, configPath = defaultConfigPath()): void {
  setConfigValue(NOTICE_SHOWN_KEY, latestVersion, configPath);
}

export function wasUpdateNoticeShown(latestVersion: string, configPath = defaultConfigPath()): boolean {
  return readConfig(configPath).get(NOTICE_SHOWN_KEY) === latestVersion;
}
