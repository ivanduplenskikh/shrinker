# shrinker

A small local CLI proof of concept that removes noise from command output before a coding agent or LLM reads it.

It demonstrates conservative, deterministic filtering without an API key or service.

## What the POC demonstrates

- Explicit cross-agent command wrapping: `shrinker exec -- <command>`.
- Filters for Git status, Git diff, test output, and generic logs.
- Failures, warnings, changed paths, and command exit codes are preserved.
- Omitted raw output is saved locally for recovery.
- Optional per-run metrics report bytes and approximate before/after tokens.
- Local SQLite statistics accumulate savings across runs.
- No command output leaves the machine.

## Quick start

The recommended customer install downloads a platform archive from GitHub Releases. Each archive contains the shrinker binary and the shared Go installer.

Contributor builds and local installs use Go 1.26 or newer. Customer installs use the standalone binary.

### One-command install (macOS zsh)

```bash
curl -fsSL https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/macos/install.sh | bash
```

To pin a version:

```bash
curl -fsSL https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/macos/install.sh | bash -s -- --version 0.4.0
```

### One-command install (Windows PowerShell)

```powershell
irm https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/windows/install.ps1 | iex
```

To pin a version:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/windows/install.ps1))) -Version 0.4.0
```

The platform bootstrap script downloads one of these anonymous GitHub Release archives, then delegates installation to the packaged cross-platform Go installer:

- `shrinker-win-x64.zip`
- `shrinker-macos-arm64.tar.gz`
- `shrinker-macos-x64.tar.gz`
- `shrinker-linux-x64.tar.gz`

Network allowlists need access to `raw.githubusercontent.com` for the installer script and `github.com/ivanduplenskikh/shrinker/releases/download/...` for release assets.

### Local checkout

Install from a checkout:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Local
```

On macOS:

```bash
bash ./integrations/macos/install.sh --local
```

The platform scripts are thin bootstrappers; installation, configuration, profile updates, and agent rules are handled by the shared Go installer. To uninstall:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\uninstall.ps1
```

```bash
bash ./integrations/macos/uninstall.sh
```

To run the shared installer directly from a checkout:

```powershell
go run ./cmd/installer install --local --enable-profile-routing
go run ./cmd/installer uninstall
```

```powershell
go test ./...
go build -o dist\shrinker.exe .\cmd\shrinker
.\dist\shrinker.exe exec -- git status
.\dist\shrinker.exe exec -- git diff
.\dist\shrinker.exe exec -- git log -n 10
Get-Content .\tests\fixtures\generic-log.txt -Raw |
    .\dist\shrinker.exe pipe --kind log
```

To install the `shrinker` command locally:

```powershell
go install .\cmd\shrinker
shrinker git status
shrinker git log -n 10
shrinker npm test
```

## CLI

```text
shrinker <command> [args...]
shrinker exec [options] [--] <command> [args...]
shrinker pipe [options]
shrinker stats [--json]
shrinker last [--path]
shrinker raw <capture-id> [--path]
shrinker track --executable <name> [--subcommand <name>] [--bytes <number>] [--exit-code <number>]
shrinker help

--kind <auto|git-status|git-diff|git-log|test|log>
--max-lines <number>       default: 120
--per-file-lines <number>  default: 40
--raw                      bypass filtering
--metrics                  print per-run savings and duration
--no-save                  do not save omitted raw output
--no-stats                 do not record this run
--coverage                 list commands shrinker does not cover yet
```

`help`, `stats`, `last`, `raw`, `track`, `pipe`, and `exec` are reserved shrinker commands. Every other top-level token starts a wrapped command, so `shrinker git log` is equivalent to `shrinker exec git log`. `pipe` reads existing text from stdin and defaults to the generic log filter unless `--kind` is specified. `track` is used by the shell integrations to record coverage gaps and prints nothing.

## Automatic PowerShell routing

The installer asks whether to enable profile integration, which routes allowlisted commands through `shrinker` and invokes the native executable for everything else. The default answer is yes. Use `-EnableProfileRouting` on Windows or `--enable-profile-routing` on macOS/Linux to enable it without a prompt; use `-SkipProfile` or `--skip-profile` to leave shell profiles unchanged.

```powershell
if (!(Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$integration = (Resolve-Path .\integrations\windows\shrinker-profile.ps1).Path
Add-Content $PROFILE "`n. `"$integration`""
. $PROFILE
```

macOS zsh profile integration:

```bash
echo '' >> ~/.zshrc
echo '# >>> shrinker integration >>>' >> ~/.zshrc
echo 'source "'"$(pwd)/integrations/macos/shrinker-profile.zsh"'"' >> ~/.zshrc
echo '# <<< shrinker integration <<<' >> ~/.zshrc
source ~/.zshrc
```

The default rules are:

```text
git status  -> shrinker git status
git diff    -> shrinker git diff
git log     -> shrinker git log
docker ps   -> shrinker docker ps
kubectl get -> shrinker kubectl get
gh pr list  -> shrinker gh pr list
rg/find/tail/cat/ls/dir -> shrinker <command>

git push, git fetch, and all other commands -> native executable
```

Edit `$global:ShrinkPowerShellRules` in `integrations\windows\shrinker-profile.ps1` to change the allowlist. The router is now option-aware for common global flags, so forms like `git -C <path> log` and `kubectl --context prod get pods` are routed correctly.

## Savings statistics

Filtered runs are recorded locally in `~/.shrinker/stats.db`. The database stores only measurements, filter kind, executable basename, duration, omission state, and exit code. It does **not** store command arguments or command output.

```powershell
shrinker stats
shrinker stats --json
shrinker stats --chart
shrinker stats --dashboard
shrinker stats --dashboard --port 4318
shrinker stats --dashboard --restart
```

The summary shows all-time and last-seven-day savings plus a breakdown by filter. Use `--no-stats` before `--` to opt out for an individual run:

`stats --coverage` lists commands shrinker does not cover yet; see [Coverage gaps](#coverage-gaps).
`stats --chart` shows daily runs, estimated tokens saved, reduction percentage, and an activity bar for the last 30 days.
`stats --dashboard` starts the local dashboard server in the background at `http://127.0.0.1:4317` and opens it in your browser, then returns to the terminal. The page reads the latest local stats whenever it is refreshed; use `--port` to choose another port. The same command also refreshes the standalone copy at `~/.shrinker/dashboard.html`, which can be opened directly without a server running.

Use `stats --dashboard --restart` after rebuilding to replace an already-running dashboard server with the current code.

The dashboard estimates input API cost saved from the recorded token savings. Set the input price directly in the dashboard; it is retained in that browser. It defaults to `$5.00` per million input tokens, or `SHRINKER_INPUT_COST_PER_MILLION_TOKENS` when set before starting the dashboard:

```powershell
$env:SHRINKER_INPUT_COST_PER_MILLION_TOKENS = "2.50"
shrinker stats --dashboard
```

```powershell
shrinker exec --no-stats -- git log -n 10
```

Detailed per-run measurements are hidden by default so agents do not spend tokens reading wrapper telemetry. Enable them for benchmarking or demos:

```powershell
shrinker --metrics git log -n 10
```

When meaningful content is omitted, the full capture is saved under `~/.shrinker/raw` and a compact exact-recovery hint such as `[full: shrinker raw ab12cd34]` is printed instead of an absolute path. Retrieve it only when needed:

```powershell
shrinker raw ab12cd34
shrinker raw ab12cd34 --path
shrinker last
shrinker last --path
```

`raw` retrieves the exact capture referenced by a hint; `last` is a convenience for human use. The cache uses atomic publication and best-effort rotation to retain up to 20 recent files. File names contain only the executable name, not command arguments. Wrapped `git log` output never creates a recovery file or hint because the full history can be reproduced by rerunning Git; piped Git-log text still gets a recovery hint when meaningful content is omitted. Use `--no-save` for other output that should not be persisted.

For an unbounded `git log`, savings statistics count only the first 24 output lines, equivalent to one terminal page. Commands with an explicit `-n` or `--max-count` use their complete output for measurements.

## Coverage gaps

Shrinker only measures what it filters. Coverage tracking answers the opposite question: **which commands does an agent run that shrinker does not cover yet?** It ranks them by the estimated tokens a dedicated filter could have seen, so the top row is the next filter worth writing.

The installer asks whether to enable it and stores the answer in `~/.shrinker/config`:

```text
SHRINKER_TRACK_UNCOVERED=1
```

Pass `--enable-uncovered-tracking` / `--disable-uncovered-tracking` (macOS) or `-EnableUncoveredTracking` / `-DisableUncoveredTracking` (Windows) to answer ahead of time. Non-interactive installs skip the prompt and enable tracking.

The environment variable still wins for a single shell or command, in either direction:

```bash
SHRINKER_TRACK_UNCOVERED=0 shrinker git status   # off for one command
export SHRINKER_TRACK_UNCOVERED=1                # on for this shell
```

```powershell
$env:SHRINKER_TRACK_UNCOVERED = "1"
```

Both the CLI and the shell integration read `~/.shrinker/config`; the shell profile reads it once at load, so change it and restart the shell (or export the variable) to take effect immediately. Set `SHRINKER_CONFIG_PATH` to relocate the file.

Two kinds of gaps are recorded:

- `no-filter` / `low-reduction` — the command ran through shrinker, but no filter matched it, or the matching filter barely reduced the output.
- `unlisted-subcommand` — the shell integration shadows the executable, but the subcommand is outside the routing allowlist, so the native binary ran instead (`git blame`, `docker inspect`).

Read the results with:

```powershell
shrinker stats --coverage
```

```text
Ranked by estimated tokens a dedicated filter could see:
  Command                    Runs        Est. tokens         Avg  Reason                 Source           Last seen
  -------------------------  ----------  -----------  ----------  ---------------------  ---------------  -------------------
  docker inspect                 12 runs      148,204      12,350  unlisted-subcommand    shell            2025-05-14 09:22:41
```

The same data is included in `stats --json` and appears as a "Coverage gaps" panel in the dashboard.

**What is stored:** the executable name and its subcommand only, plus an occurrence count, output size, and exit code — for example `docker inspect`. Command arguments, flag values, paths, and command output are never stored. Tokens that are not bare command names are dropped rather than written, so a misfiring hook cannot leak a path or secret into the database. Everything stays in `~/.shrinker/stats.db` on this machine; nothing is uploaded.

Runs with small outputs (under ~200 estimated tokens) are ignored so the table stays focused on real savings. Adjust the low-reduction threshold with `SHRINKER_LOW_REDUCTION_PERCENT` (default `10`).

Output volume is measured in the shell integration only when stdout is redirected — which is the agent case. Interactive terminal sessions run the native command completely untouched and are recorded with a size of zero, so pagers, colours, and prompts still behave normally.

## Demo

```powershell
go run ./cmd/demo
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

### Workspace layout

The repository is a Go module. The CLI and dashboard server live under `cmd/` and `internal/`.

```text
.
├── cmd/shrinker/               Go CLI
├── internal/                   execution, filters, metrics, dashboard
└── tests/fixtures/             reusable output fixtures
```

The dashboard is rendered as self-contained HTML and served locally when requested.

The dashboard UI is built separately with React and HeroUI during release CI. The production HTML, CSS, and JavaScript are copied into `internal/dashboard/ui/` and embedded into the Go binary, so installed users do not need Node.js.

Release archives include `bin/shrinker`, `bin/installer`, the platform bootstrap scripts, profile integrations, templates, and a manifest. The platform bootstrap only handles downloading and extracting the archive; the Go installer performs the installation.

| Command | Purpose |
| --- | --- |
| `go run ./cmd/shrinker` | Run the CLI from source |
| `go test ./...` | Run Go tests |
| `go vet ./...` | Run static checks |
| `npm ci --prefix packages/dashboard-ui; npm run build --prefix packages/dashboard-ui` | Build the dashboard UI |
| `go run ./cmd/release --target linux-x64 --version 0.12.0` | Build a release archive with shrinker and installer |

Release builds use the Go packager and embed the Go-owned dashboard directly in the binary.

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
go test ./...
```

Tests cover information retention, reduction targets, ANSI cleanup, filter selection, command capture, SQLite persistence, dashboard rendering, and non-zero exit-code propagation.

## Release

Push a version tag such as `v0.12.0`. The release workflow builds and attaches Go archives for Windows, macOS ARM64, macOS x64, and Linux x64.

## Suggested roadmap

1. Validate the POC with real Copilot/Agency workflows and identify the highest-volume commands.
2. Add a GitHub Copilot pre-tool hook for transparent rewriting.
3. Expose the executor and filters through MCP for other agents.
4. Add filters only when measured usage justifies them.
