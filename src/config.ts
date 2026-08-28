import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultConfigPath(): string {
  return process.env['SHRINKER_CONFIG_PATH'] ?? path.join(os.homedir(), ".shrinker", "config");
}

// `KEY=value` lines; `#` starts a comment. Unknown keys are ignored so older CLIs tolerate newer files.
export function readConfig(configPath = defaultConfigPath()): Map<string, string> {
  const settings = new Map<string, string>();
  let contents: string;
  try {
    contents = readFileSync(configPath, "utf8");
  } catch {
    return settings;
  }

  for (const line of contents.split(/\r?\n/)) {
    const withoutComment = line.split("#")[0]?.trim();
    if (!withoutComment) continue;
    const separator = withoutComment.indexOf("=");
    if (separator <= 0) continue;
    const key = withoutComment.slice(0, separator).trim();
    const value = withoutComment.slice(separator + 1).trim();
    if (key) settings.set(key, value);
  }

  return settings;
}

// Environment wins so a single command can override the persisted choice.
export function resolveSetting(key: string, configPath?: string): string | undefined {
  const fromEnvironment = process.env[key];
  if (fromEnvironment !== undefined && fromEnvironment.trim() !== "") return fromEnvironment;
  return readConfig(configPath).get(key);
}

export function setConfigValue(key: string, value: string, configPath = defaultConfigPath()): void {
  const directory = path.dirname(configPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  let lines: string[] = [];
  try {
    lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  } catch {}

  let replaced = false;
  const nextLines = lines.map((line) => {
    const withoutComment = line.split("#")[0]?.trim() ?? "";
    const separator = withoutComment.indexOf("=");
    const existingKey = separator > 0 ? withoutComment.slice(0, separator).trim() : "";
    if (existingKey !== key) return line;
    replaced = true;
    return `${key}=${value}`;
  }).filter((line, index, array) => line !== "" || index < array.length - 1);

  if (!replaced) nextLines.push(`${key}=${value}`);
  writeFileSync(configPath, `${nextLines.join("\n")}\n`, "utf8");
}

export function isTruthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
