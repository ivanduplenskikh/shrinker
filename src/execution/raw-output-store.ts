import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_FILES = 20;

function safeSlug(command: string[]): string {
  return path
    .basename(command[0] ?? "output")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "output";
}

export async function saveRawOutput(output: string, command: string[]): Promise<string> {
  const directory = path.join(os.homedir(), ".shrink", "raw");
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const fileName = `${Date.now()}_${safeSlug(command)}.log`;
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, output, { encoding: "utf8", mode: 0o600 });

  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .map((entry) => entry.name)
    .sort();
  for (const stale of files.slice(0, Math.max(0, files.length - MAX_FILES))) {
    await rm(path.join(directory, stale));
  }

  return filePath;
}
