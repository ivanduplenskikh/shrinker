# shrinker

A small local CLI proof of concept that removes noise from command output before a coding agent or LLM reads it.

this POC proves that a few conservative, deterministic filters can save useful context without requiring an API key, service, UI, database, or agent-specific integration.

## What the POC demonstrates

- Explicit cross-agent command wrapping: `shrink exec -- <command>`.
- Filters for Git status, Git diff, test output, and generic logs.
- Failures, warnings, changed paths, and command exit codes are preserved.
- Omitted raw output is saved locally for recovery.
- Every filtered run reports bytes and approximate before/after tokens.
- No command output leaves the machine.

## Quick start

Requires Node.js 22 or newer.

```powershell
npm install
npm run build
node dist\src\cli.js exec -- git status
node dist\src\cli.js exec -- git diff
node dist\src\cli.js exec -- git log -n 10
node dist\src\cli.js exec -- npm test
Get-Content .\tests\fixtures\generic-log.txt -Raw |
  node dist\src\cli.js pipe --kind log
```

To install the `shrink` command locally:

```powershell
npm link
shrink exec -- git status
```

## CLI

```text
shrink exec [options] -- <command> [args...]
shrink pipe [options]

--kind <auto|git-status|git-diff|git-log|test|log>
--max-lines <number>       default: 120
--per-file-lines <number>  default: 40
--raw                      bypass filtering
--no-save                  do not save omitted raw output
```

`exec` automatically selects a filter from the command. `pipe` defaults to the generic log filter unless `--kind` is specified.

When content is omitted, the full capture is saved under `~/.shrink/raw`. The cache is limited to 20 files. File names contain only the executable name, not command arguments. Use `--no-save` for output that should not be persisted.

## Demo

```powershell
npm run demo
```

Current representative fixtures:

| Output | Estimated token reduction |
|---|---:|
| Git status | 62% |
| Git diff | 26% |
| Git log | 70% |
| Test failure | 51% |
| Noisy log | 39% |
| **Average** | **50%** |

The token estimate uses `ceil(characters / 4)`. It is suitable for relative before/after comparisons, not billing claims. Byte counts are also reported.

## Architecture

```text
command/stdin
    |
    v
capture output + exit code
    |
    v
select deterministic filter
    |
    +--> git status: group files by state
    +--> git diff: retain changed lines, drop metadata/context
    +--> git log: retain short hash, refs, subject, author, and date
    +--> tests: collapse passes, retain failures and summaries
    +--> logs: collapse progress and repeated lines
    |
    v
compact output + savings line + optional raw recovery file
```

Filters are pure functions, so the same pipeline can later sit behind a GitHub Copilot hook or MCP server without rewriting the compression logic.

## Safety and limitations

- The tool does not execute through a shell. Compound shell expressions and interactive commands are out of scope.
- Stdout and stderr are captured separately and presented as stdout followed by stderr; exact interleaving is not preserved.
- Filtering is conservative, but any lossy transform can hide useful context. The recovery file and `--raw` are escape hatches.
- This measures command-output reduction, not total Copilot usage, total conversation context, or billing.
- Streaming, agent hooks, MCP, telemetry, dashboards, custom configuration, and a broad command registry are deliberately deferred.

## Validation

```powershell
npm test
```

Tests cover information retention, reduction targets, ANSI cleanup, filter selection, command capture, and non-zero exit-code propagation.

## Suggested roadmap

1. Validate the POC with real Copilot/Agency workflows and identify the highest-volume commands.
2. Add a GitHub Copilot pre-tool hook for transparent rewriting.
3. Expose the executor and filters through MCP for other agents.
4. Add filters only when measured usage justifies them.
