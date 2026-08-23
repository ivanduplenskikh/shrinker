import { access } from "node:fs/promises";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
  durationMs: number;
}

function quoteForCmd(argument: string): string {
  if (argument.length === 0) return "\"\"";
  if (!/[\s"^&|<>]/.test(argument)) return argument;
  return `"${argument.replace(/"/g, '""')}"`;
}

async function resolveWindowsCommand(command: string): Promise<string> {
  if (process.platform !== "win32" || path.extname(command)) return command;

  const pathEntries = (process.env['PATH'] ?? "").split(path.delimiter);
  const executableExtensions = new Set([".com", ".exe", ".bat", ".cmd"]);
  const extensions = (process.env['PATHEXT'] ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => executableExtensions.has(extension));
  for (const directory of pathEntries) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
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

function parseAliasArgs(args: string[]): { paths: string[]; unsupportedOption?: string } {
  const paths: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) return { paths, unsupportedOption: arg };
    paths.push(arg);
  }
  return { paths };
}

async function runWindowsAlias(command: string, args: string[]): Promise<CommandResult | undefined> {
  if (process.platform !== "win32") return undefined;

  const alias = command.toLowerCase();
  if (alias !== "cat" && alias !== "ls" && alias !== "dir") return undefined;

  const started = performance.now();
  const parsed = parseAliasArgs(args);
  if (parsed.unsupportedOption) {
    return {
      stdout: "",
      stderr: `Unsupported ${alias} option in shrinker alias mode: ${parsed.unsupportedOption}`,
      combined: `Unsupported ${alias} option in shrinker alias mode: ${parsed.unsupportedOption}`,
      exitCode: 2,
      durationMs: Math.round(performance.now() - started),
    };
  }

  if (alias === "cat") {
    const targets = parsed.paths.length > 0 ? parsed.paths : ["-"];
    if (targets.includes("-")) {
      return {
        stdout: "",
        stderr: "cat alias requires at least one file path",
        combined: "cat alias requires at least one file path",
        exitCode: 2,
        durationMs: Math.round(performance.now() - started),
      };
    }

    const parts: string[] = [];
    for (const target of targets) {
      try {
        parts.push(await readFile(target, "utf8"));
      } catch (error) {
        const message = (error as NodeJS.ErrnoException).message;
        return {
          stdout: "",
          stderr: message,
          combined: message,
          exitCode: 1,
          durationMs: Math.round(performance.now() - started),
        };
      }
    }

    const stdout = parts.join(parts.length > 1 ? "\n" : "");
    return {
      stdout,
      stderr: "",
      combined: stdout,
      exitCode: 0,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const targetPath = parsed.paths[0] ?? ".";
  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const lines = entries
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort((left, right) => left.localeCompare(right));
    const stdout = lines.join("\n");
    return {
      stdout,
      stderr: "",
      combined: stdout,
      exitCode: 0,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const message = (error as NodeJS.ErrnoException).message;
    return {
      stdout: "",
      stderr: message,
      combined: message,
      exitCode: 1,
      durationMs: Math.round(performance.now() - started),
    };
  }
}

async function spawnAndCapture(
  executable: string,
  args: string[],
  viaCmdProxy: boolean,
): Promise<CommandResult> {
  const started = performance.now();

  return await new Promise<CommandResult>((resolve, reject) => {
    const spawnCommand = viaCmdProxy ? "cmd.exe" : executable;
    const spawnArgs = viaCmdProxy
      ? ["/d", "/s", "/c", `${quoteForCmd(executable)} ${args.map(quoteForCmd).join(" ")}`]
      : args;

    const child = spawn(spawnCommand, spawnArgs, {
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

export async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  const aliasResult = await runWindowsAlias(command, args);
  if (aliasResult) return aliasResult;

  const executable = await resolveWindowsCommand(command);

  try {
    return await spawnAndCapture(executable, args, false);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === "win32" && (code === "EFTYPE" || code === "EINVAL")) {
      return await spawnAndCapture(executable, args, true);
    }
    throw error;
  }
}
