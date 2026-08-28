# shrinker

A small local CLI proof of concept that removes noise from command output before a coding agent or LLM reads it.

this POC proves that a few conservative, deterministic filters can save useful context without requiring an API key, service, UI, database, or agent-specific integration.

## What the POC demonstrates

- Explicit cross-agent command wrapping: `shrinker exec -- <command>`.
- Filters for Git status, Git diff, test output, and generic logs.
- Failures, warnings, changed paths, and command exit codes are preserved.
- Omitted raw output is saved locally for recovery.
- Optional per-run metrics report bytes and approximate before/after tokens.
- Local SQLite statistics accumulate savings across runs.
- No command output leaves the machine.

## Quick start

The recommended customer install downloads a standalone binary from GitHub Releases. It does not require npm registry access or a local Node.js installation.

Contributor and npm-based installs still require Node.js 22.13 or newer. This is the first Node 22 release where the built-in SQLite module no longer requires an experimental flag.

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

The installer downloads these anonymous GitHub Release assets by default:

- `shrinker-win-x64.zip`
- `shrinker-macos-arm64.tar.gz`
- `shrinker-macos-x64.tar.gz`
- `shrinker-linux-x64.tar.gz`

Network allowlists need access to `raw.githubusercontent.com` for the installer script and `github.com/ivanduplenskikh/shrinker/releases/download/...` for release assets.

### Optional npm package install

Use this only when npm registry access is available or preferred.

Windows PowerShell:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -UseNpm

# Or manually:
npm install --global shrinker-ai --registry=https://registry.npmjs.org
$pkg = Join-Path ((npm root --global).Trim()) "shrinker-ai"
pwsh -ExecutionPolicy Bypass -File (Join-Path $pkg "integrations\\windows\\install.ps1") -Local -SkipNpmInstall -SkipBuild -SkipLink
```

To enable automatic PowerShell routing, add `-EnableProfileRouting` to the final command.

macOS zsh:

```bash
bash ./integrations/macos/install.sh --use-npm

# Or manually:
npm install --global shrinker-ai --registry=https://registry.npmjs.org
pkg="$(npm root --global)/shrinker-ai"
bash "$pkg/integrations/macos/install.sh" --local --skip-npm-install --skip-build --skip-link --enable-profile-routing
```

### Install from local checkout

Windows PowerShell:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Local
```

macOS zsh:

```bash
bash ./integrations/macos/install.sh --local
```

This writes managed guidance blocks globally to:

- `~/.copilot/copilot-instructions.md`
- `~/.claude/CLAUDE.md`

The shared guidance source is `templates/agent-rules.md`; the files above are created in the corresponding global agent directory.

The rules tell agents to prefer `shrinker <command>` for high-volume commands while leaving native commands untouched.

### Uninstall

GitHub Release binary install:

Windows PowerShell:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\uninstall.ps1
```

macOS zsh:

```bash
bash ./integrations/macos/uninstall.sh
```

If you installed from npm, use npm mode:

```bash
npm uninstall --global shrinker-ai --registry=https://registry.npmjs.org
```

If you also installed profile/rules through the package scripts, run the matching local uninstaller from the installed package before uninstalling:

Windows PowerShell:

```powershell
$pkg = Join-Path ((npm root --global).Trim()) "shrinker-ai"
pwsh -ExecutionPolicy Bypass -File (Join-Path $pkg "integrations\\windows\\uninstall.ps1") -SkipUnlink
```

macOS zsh:

```bash
pkg="$(npm root --global)/shrinker-ai"
bash "$pkg/integrations/macos/uninstall.sh" --skip-unlink
```

macOS one-liner uninstall:

```bash
curl -fsSL https://raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/macos/uninstall.sh | bash
```

### Local repo install/uninstall (contributors)

If you cloned this repository and want to run scripts directly from the local path:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Local
```

Or on macOS:

```bash
bash ./integrations/macos/install.sh --local
```

To uninstall:

```powershell
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Uninstall
```

Or on macOS:

```bash
bash ./integrations/macos/install.sh --uninstall
```

Uninstall options:

```powershell
# Keep shrinker command installed, but remove profile integration and managed rules
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Uninstall -SkipUnlink

# Keep managed rules files unchanged while uninstalling command/profile hooks
pwsh -ExecutionPolicy Bypass -File .\integrations\windows\install.ps1 -Uninstall -SkipAgentRules
```

macOS uninstall options:

```bash
# Keep shrinker command installed, but remove profile integration and managed rules
bash ./integrations/macos/install.sh --uninstall --skip-unlink

# Keep managed rules files unchanged while uninstalling command/profile hooks
bash ./integrations/macos/install.sh --uninstall --skip-agent-rules
```

If your current terminal had already loaded `shrinker-profile.ps1` or `shrinker-profile.zsh`, restart terminal (or remove loaded wrapper functions) to fully return to native command behavior.

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

To install the `shrinker` command locally:

```powershell
npm link
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

`help`, `stats`, `last`, `raw`, `track`, `pipe`, and `exec` are reserved shrinker commands. Every other top-level token starts a wrapped command, so `shrinker git log` is equivalent to `shrinker exec git log`. The `--` separator remains optional because npm's PowerShell shim may consume it. `pipe` reads existing text from stdin and defaults to the generic log filter unless `--kind` is specified. `track` is used by the shell integrations to record coverage gaps and prints nothing.

## Automatic PowerShell routing

The optional profile integration routes allowlisted commands through `shrinker` and invokes the native executable for everything else. Install it after `npm link`:

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
npm test    -> shrinker npm test
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
node dist\src\cli.js stats
node dist\src\cli.js stats --json
node dist\src\cli.js stats --chart
node dist\src\cli.js stats --dashboard
node dist\src\cli.js stats --dashboard --port 4318
node dist\src\cli.js stats --dashboard --restart
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
node dist\src\cli.js exec --no-stats -- git log -n 10
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
- `unlisted-subcommand` — the shell integration shadows the executable, but the subcommand is outside the routing allowlist, so the native binary ran instead (`git blame`, `docker inspect`, `npm run build`).

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

### Workspace layout

The repository is an npm workspace. The CLI lives at the root; the stats dashboard is a separate React + HeroUI app.

```text
.
├── src/                        CLI (TypeScript, ESM, zero runtime dependencies)
├── tests/                      node:test suites
└── packages/dashboard-ui/      React + HeroUI dashboard, bundled by Vite
```

`packages/dashboard-ui` builds to a single self-contained HTML file (`vite-plugin-singlefile`), which `scripts/emit-template.mjs` then bakes into `src/metrics/dashboard-template.generated.ts`. The CLI injects the current `StatsSummary` into that template as an embedded JSON blob, so the published package still has no runtime dependencies and the dashboard works from `file://` with no server.

| Command | Purpose |
| --- | --- |
| `npm run dev:ui` | Vite dev server with hot reload (renders empty-state data) |
| `npm run build:ui` | Build the dashboard and regenerate the baked template |
| `npm run build` | `build:ui`, then `tsc` |

`npm run build:ui` is a prerequisite for `tsc`, because the generated template module is a compiled source file. `npm run build`, `npm test`, `npm run demo`, and `npm run pack` all chain it automatically.

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

## Release to npm

A GitHub Actions workflow publishes this CLI to npm:

- Workflow file: `.github/workflows/publish-npm.yml`
- Triggers:
    - Tag push matching `v*` (for example `v0.2.0`)
    - Manual run via workflow_dispatch
- Pipeline steps:
    - `npm ci`
    - `npm test`
    - `npm publish` to `https://registry.npmjs.org`

How to publish:

1. Push your changes to GitHub.
2. Push a version tag (or run the workflow manually):
    - `git tag v0.2.0`
    - `git push origin v0.2.0`
3. After the workflow succeeds, install from npm:
    - `npm install -g shrinker-ai`

## Suggested roadmap

1. Validate the POC with real Copilot/Agency workflows and identify the highest-volume commands.
2. Add a GitHub Copilot pre-tool hook for transparent rewriting.
3. Expose the executor and filters through MCP for other agents.
4. Add filters only when measured usage justifies them.
