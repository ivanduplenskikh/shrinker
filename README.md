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

The platform bootstrap script downloads one of these GitHub Release archives, verifies its SHA-256 sidecar checksum, then delegates installation to the packaged cross-platform Go installer:

- `shrinker-win-x64.zip`
- `shrinker-macos-arm64.tar.gz`
- `shrinker-macos-x64.tar.gz`
- `shrinker-linux-x64.tar.gz`

Network allowlists need access to `raw.githubusercontent.com` for the installer script and `github.com/ivanduplenskikh/shrinker/releases/download/...` for release assets.

After installation, Shrinker starts its local dashboard server at `http://127.0.0.1:4317` in the background.

### Local checkout

Build and install from a checkout:

```powershell
go run ./cmd/installer install
```

The platform scripts are thin bootstrappers; installation, configuration, PATH setup, legacy profile cleanup, and agent rules are handled by the shared Go installer. To uninstall:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\uninstall.ps1
```

```bash
bash ./integrations/macos/uninstall.sh
```

To run the shared installer directly from a checkout:

```powershell
go run ./cmd/installer install
go run ./cmd/installer uninstall
```

The PowerShell bootstrap makes `shrinker` available in the PowerShell session that ran the install. A CMD session cannot be changed by an installer process; open a new CMD window after installation to pick up the persisted user `PATH`.

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
shrinker exec [--raw] [--metrics] [--no-save] [--no-stats] [--kind <kind>] [--max-lines <number>] [--per-file-lines <number>] [--] <command> [args...]
shrinker update-check
shrinker pipe [options]
shrinker stats [--json] [--chart] [--coverage] [--dashboard [--dashboard-server] [--port <number>]]
shrinker last [--path]
shrinker raw <capture-id> [--path]
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

`help`, `stats`, `last`, `raw`, `pipe`, and `exec` are reserved shrinker commands. Every other top-level token starts a wrapped command, so `shrinker git log` is equivalent to `shrinker exec git log`. `pipe` reads existing text from stdin and defaults to the generic log filter unless `--kind` is specified. Shrinker does not override native shell commands: invoke it explicitly for output you want filtered. Install and uninstall remove any legacy managed shell-routing block while preserving other profile content.

## Savings statistics

Filtered runs are recorded locally in `~/.shrinker/stats.db`. The database stores only measurements, filter kind, executable basename, duration, omission state, and exit code. It does **not** store command arguments or command output.

```powershell
shrinker stats
shrinker stats --json
shrinker stats --chart
shrinker stats --dashboard
shrinker stats --dashboard --port 4318
shrinker stats --dashboard --dashboard-server
```

The summary shows all-time and last-seven-day actual savings plus a breakdown by filter. Raw-mode runs are not recorded because no output is reduced. Use `--no-stats` before `--` to opt out for an individual filtered run.

`stats --coverage` lists commands shrinker does not cover yet.
`stats --chart` shows daily runs, estimated tokens saved, reduction percentage, and an activity bar for the last 30 days.
`stats --dashboard` writes a standalone dashboard to `~/.shrinker/dashboard.html`. Add `--dashboard-server` to serve it at `http://127.0.0.1:4317`; use `--port` to choose another port.

The dashboard estimates input API cost saved from the recorded token savings. Set the input price directly in the dashboard; it is retained in that browser. It defaults to `$5.00` per million input tokens, or `SHRINKER_INPUT_COST_PER_MILLION_TOKENS` when set before starting the dashboard:

```powershell
$env:SHRINKER_INPUT_COST_PER_MILLION_TOKENS = "2.50"
shrinker stats --dashboard
```

```powershell
shrinker exec --no-stats -- git log -n 10
```

Detailed per-run measurements are hidden by default so agents do not spend tokens reading telemetry. Enable them for benchmarking or demos:

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

`raw` retrieves the exact capture referenced by a hint; `last` is a convenience for human use. The cache uses atomic publication and best-effort rotation to retain up to 20 recent files. File names contain only the executable name, not command arguments. `shrinker git log` output never creates a recovery file or hint because the full history can be reproduced by rerunning Git; piped Git-log text still gets a recovery hint when meaningful content is omitted. Use `--no-save` for other output that should not be persisted.

For an unbounded `git log`, Shrinker adds `-n 10`, so agents receive a predictable ten-commit result and savings statistics compare that complete raw output with the compact output. Commands with an explicit `-n` or `--max-count` keep their requested limit.

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
