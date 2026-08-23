# shrinker

A small local CLI proof of concept that removes noise from command output before a coding agent or LLM reads it.

this POC proves that a few conservative, deterministic filters can save useful context without requiring an API key, service, UI, database, or agent-specific integration.

## What the POC demonstrates

- Explicit cross-agent command wrapping: `shrink exec -- <command>`.
- Filters for Git status, Git diff, test output, and generic logs.
- Failures, warnings, changed paths, and command exit codes are preserved.
- Omitted raw output is saved locally for recovery.
- Optional per-run metrics report bytes and approximate before/after tokens.
- Local SQLite statistics accumulate savings across runs.
- No command output leaves the machine.

## Quick start

Requires Node.js 22.13 or newer. This is the first Node 22 release where the built-in SQLite module no longer requires an experimental flag.

### One-command install (Windows PowerShell)

Quick one-liner:

```powershell
irm https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/install.ps1 | iex
```

### Remote bootstrap install (raw GitHub)

Use this when you want to install directly from a `raw.githubusercontent.com` script.
This is automatically published by GitHub whenever the file is pushed to your branch/tag (no separate publish step required).

Install with download-then-run mode:

```powershell
$tmp = Join-Path $env:TEMP "install-shrink.ps1"
Invoke-WebRequest "https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/install.ps1" -OutFile $tmp
pwsh -ExecutionPolicy Bypass -File $tmp
```

This bootstrap script downloads the repository archive, runs `integrations/install-shrink.ps1`, and installs Copilot/Claude rules by default.

To enable automatic PowerShell routing (so `git log` routes through `shrink`), opt in explicitly:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\install-shrink.ps1 -SkipNpmInstall -SkipBuild -SkipLink -EnableProfileRouting
```

If you want a non-invasive setup (do not override original shell commands), install agent rules instead of PowerShell routing:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\install-shrink.ps1
pwsh -ExecutionPolicy Bypass -File .\integrations\install-agent-rules.ps1
```

This writes managed guidance blocks to:

- `.copilot-instructions.md`
- `CLAUDE.md`

The shared guidance source is `templates/agent-rules.md`; the two files above are generated in the target project.

The rules tell agents to prefer `shrink <command>` for high-volume commands while leaving native commands untouched.

### Remote uninstall (raw GitHub)

Quick one-liner:

```powershell
irm https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/uninstall.ps1 | iex
```

Uninstall with download-then-run mode:

```powershell
$tmp = Join-Path $env:TEMP "uninstall-shrink.ps1"
Invoke-WebRequest "https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/uninstall.ps1" -OutFile $tmp
pwsh -ExecutionPolicy Bypass -File $tmp
```

### Local repo install/uninstall (contributors)

If you cloned this repository and want to run scripts directly from the local path:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\install-shrink.ps1
```

To uninstall:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\uninstall-shrink.ps1
pwsh -ExecutionPolicy Bypass -File .\integrations\uninstall-agent-rules.ps1
```

Uninstall options:

```powershell
# Remove only profile routing, keep shrink command installed
pwsh -ExecutionPolicy Bypass -File .\integrations\uninstall-shrink.ps1 -SkipUnlink

# Remove managed Copilot/Claude rules block only
pwsh -ExecutionPolicy Bypass -File .\integrations\uninstall-agent-rules.ps1
```

If your current terminal had already loaded `shrink-profile.ps1`, restart terminal (or remove loaded wrapper functions) to fully return to native command behavior.

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
shrink git status
shrink git log -n 10
shrink npm test
```

## CLI

```text
shrink <command> [args...]
shrink exec [options] [--] <command> [args...]
shrink pipe [options]
shrink stats [--json]
shrink last [--path]
shrink raw <capture-id> [--path]
shrink help

--kind <auto|git-status|git-diff|git-log|test|log>
--max-lines <number>       default: 120
--per-file-lines <number>  default: 40
--raw                      bypass filtering
--metrics                  print per-run savings and duration
--no-save                  do not save omitted raw output
--no-stats                 do not record this run
```

`help`, `stats`, `last`, `raw`, `pipe`, and `exec` are reserved shrink commands. Every other top-level token starts a wrapped command, so `shrink git log` is equivalent to `shrink exec git log`. The `--` separator remains optional because npm's PowerShell shim may consume it. `pipe` reads existing text from stdin and defaults to the generic log filter unless `--kind` is specified.

## Automatic PowerShell routing

The optional profile integration routes allowlisted commands through `shrink` and invokes the native executable for everything else. Install it after `npm link`:

```powershell
if (!(Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$integration = (Resolve-Path .\integrations\shrink-profile.ps1).Path
Add-Content $PROFILE "`n. `"$integration`""
. $PROFILE
```

The default rules are:

```text
git status  -> shrink git status
git diff    -> shrink git diff
git log     -> shrink git log
npm test    -> shrink npm test
docker ps   -> shrink docker ps
kubectl get -> shrink kubectl get
gh pr list  -> shrink gh pr list
rg/find/tail/cat/ls/dir -> shrink <command>

git push, git fetch, and all other commands -> native executable
```

Edit `$global:ShrinkPowerShellRules` in `integrations\shrink-profile.ps1` to change the allowlist. The router is now option-aware for common global flags, so forms like `git -C <path> log` and `kubectl --context prod get pods` are routed correctly.

## Savings statistics

Filtered runs are recorded locally in `~/.shrink/stats.db`. The database stores only measurements, filter kind, executable basename, duration, omission state, and exit code. It does **not** store command arguments or command output.

```powershell
node dist\src\cli.js stats
node dist\src\cli.js stats --json
```

The summary shows all-time and last-seven-day savings plus a breakdown by filter. Use `--no-stats` before `--` to opt out for an individual run:

```powershell
node dist\src\cli.js exec --no-stats -- git log -n 10
```

Detailed per-run measurements are hidden by default so agents do not spend tokens reading wrapper telemetry. Enable them for benchmarking or demos:

```powershell
shrink --metrics git log -n 10
```

When meaningful content is omitted, the full capture is saved under `~/.shrink/raw` and a compact exact-recovery hint such as `[full: shrink raw ab12cd34]` is printed instead of an absolute path. Retrieve it only when needed:

```powershell
shrink raw ab12cd34
shrink raw ab12cd34 --path
shrink last
shrink last --path
```

`raw` retrieves the exact capture referenced by a hint; `last` is a convenience for human use. The cache uses atomic publication and best-effort rotation to retain up to 20 recent files. File names contain only the executable name, not command arguments. Wrapped `git log` output never creates a recovery file or hint because the full history can be reproduced by rerunning Git; piped Git-log text still gets a recovery hint when meaningful content is omitted. Use `--no-save` for other output that should not be persisted.

## Demo

```powershell
npm run demo
```

Current representative fixtures:

| Output | Estimated token reduction |
|---|---:|
| Git status | 62% |
| Git diff | 26% |
| Git log with commit bodies | 39% |
| Git log with one short commit | 69%, but only 27 estimated tokens |
| Test failure | 51% |
| Noisy log | 39% |
| **Average** | **48%** |

The token estimate uses `ceil(characters / 4)`. It is suitable for relative before/after comparisons, not billing claims. Byte counts and absolute estimated tokens saved are also reported; gains below 50 tokens are labeled as small.

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
    +--> git log: retain short hash, refs, subject, author, date,
    |             and up to three useful body lines
    +--> tests: collapse passes, retain failures and summaries
    +--> logs: collapse progress and repeated lines
    |
    v
compact output + optional metrics + meaningful-omission recovery hint
```

Filters are pure functions, so the same pipeline can later sit behind a GitHub Copilot hook or MCP server without rewriting the compression logic.

## Safety and limitations

- The tool does not execute through a shell. Compound shell expressions and interactive commands are out of scope.
- Stdout and stderr are captured separately and presented as stdout followed by stderr; exact interleaving is not preserved.
- Filtering is conservative, but any lossy transform can hide useful context. The recovery file and `--raw` are escape hatches.
- Git log patch/stat/name-list flags and explicit custom formats are preserved rather than destructively reinterpreted.
- Git log does not impose hidden commit limits or suppress merge commits.
- This measures command-output reduction, not total Copilot usage, total conversation context, or billing.
- Streaming, agent hooks, MCP, telemetry, dashboards, custom configuration, and a broad command registry are deliberately deferred.

## Validation

```powershell
npm test
```

Tests cover information retention, reduction targets, ANSI cleanup, filter selection, command capture, and non-zero exit-code propagation.

## Release to GitHub Packages

A GitHub Actions workflow publishes this CLI to GitHub Packages:

- Workflow file: `.github/workflows/publish-github-packages.yml`
- Triggers:
    - Tag push matching `v*` (for example `v0.2.0`)
    - Manual run via workflow_dispatch
- Pipeline steps:
    - `npm ci`
    - `npm test`
    - set package name to `@ivanduplenskikh/shrinker` in CI
    - `npm publish` to `https://npm.pkg.github.com` with `GITHUB_TOKEN`

How to publish:

1. Push your changes to GitHub.
2. Push a version tag (or run the workflow manually):
    - `git tag v0.2.0`
    - `git push origin v0.2.0`
3. After the workflow succeeds, install from GitHub Packages:
    - `npm install -g @ivanduplenskikh/shrinker --registry=https://npm.pkg.github.com`

## Suggested roadmap

1. Validate the POC with real Copilot/Agency workflows and identify the highest-volume commands.
2. Add a GitHub Copilot pre-tool hook for transparent rewriting.
3. Expose the executor and filters through MCP for other agents.
4. Add filters only when measured usage justifies them.
