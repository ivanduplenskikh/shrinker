import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_FILES = 20;
const LOCK_STALE_MS = 30_000;

export interface RawCapture {
  id: string;
  path: string;
  output: string;
}

export function defaultRawDirectory(): string {
  return path.join(os.homedir(), ".shrinker", "raw");
}

function safeSlug(command: string[]): string {
  return path
    .basename(command[0] ?? "output")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "output";
}

export async function saveRawOutput(
  output: string,
  command: string[],
  directory = defaultRawDirectory(),
): Promise<RawCapture> {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const id = randomUUID().slice(0, 8);
  const fileName = `${Date.now()}_${id}_${safeSlug(command)}.log`;
  const filePath = path.join(directory, fileName);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  let published = false;
  try {
    await writeFile(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
    published = true;
    const publishedAt = new Date();
    await utimes(filePath, publishedAt, publishedAt);
    await cleanStaleTemporaryFiles(directory);
    const captures = await listCaptures(directory);
    const excess = Math.max(0, captures.length - MAX_FILES);
    const stale = captures.filter((capture) => capture.filePath !== filePath).slice(0, excess);
    for (const capture of stale) {
      await rm(capture.filePath, { force: true });
    }
  } catch (error) {
    if (!published) await rm(temporaryPath, { force: true });
    throw error;
  }

  return { id, path: filePath, output };
}

export async function getLatestRawOutput(
  directory = defaultRawDirectory(),
): Promise<RawCapture | undefined> {
  const captures = await listCaptures(directory);
  for (const capture of captures.reverse()) {
    const result = await readCaptureIfPresent(capture.filePath);
    if (result) return result;
  }
  return undefined;
}

export async function getRawOutput(
  id: string,
  directory = defaultRawDirectory(),
): Promise<RawCapture | undefined> {
  if (!/^[a-f0-9]{8}$/i.test(id)) return undefined;
  const captures = await listCaptures(directory);
  const normalizedId = id.toLowerCase();
  const match = captures.find(
    ({ filePath }) => path.basename(filePath).split("_")[1]?.toLowerCase() === normalizedId,
  );
  return match ? readCaptureIfPresent(match.filePath) : undefined;
}

async function readCapture(filePath: string): Promise<RawCapture> {
  const id = path.basename(filePath).split("_")[1] ?? "";
  return { id, path: filePath, output: await readFile(filePath, "utf8") };
}

async function readCaptureIfPresent(filePath: string): Promise<RawCapture | undefined> {
  try {
    return await readCapture(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function listCaptures(
  directory: string,
): Promise<Array<{ filePath: string; modifiedAt: number }>> {
  let files: string[];
  try {
    files = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const captures = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(directory, file);
      try {
        return { filePath, modifiedAt: (await stat(filePath)).mtimeMs };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    }),
  );
  return captures.filter((capture) => capture !== undefined).sort(
    (left, right) =>
      left.modifiedAt - right.modifiedAt || left.filePath.localeCompare(right.filePath),
  );
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ESRCH" && code !== "EINVAL";
  }
}

async function cleanStaleTemporaryFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tmp"))
      .map(async (entry) => {
        const temporaryPath = path.join(directory, entry.name);
        try {
          const metadata = await stat(temporaryPath);
          const pidMatch = entry.name.match(/\.(\d+)\.tmp$/);
          const ownerPid = pidMatch ? Number.parseInt(pidMatch[1] ?? "", 10) : undefined;
          if (
            Date.now() - metadata.mtimeMs > LOCK_STALE_MS &&
            (!ownerPid || !isProcessAlive(ownerPid))
          ) {
            await rm(temporaryPath, { force: true });
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }),
  );
}
