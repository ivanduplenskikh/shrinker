import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
  durationMs: number;
}

async function resolveWindowsCommand(command: string): Promise<string> {
  if (process.platform !== "win32" || path.extname(command)) return command;

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter);
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";");
  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension.toLowerCase()}`);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  return command;
}

export async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  const executable = await resolveWindowsCommand(command);
  const started = performance.now();

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: stdoutText,
        stderr: stderrText,
        combined: [stdoutText, stderrText].filter(Boolean).join("\n"),
        exitCode: code ?? 1,
        durationMs: Math.round(performance.now() - started),
      });
    });
  });
}
