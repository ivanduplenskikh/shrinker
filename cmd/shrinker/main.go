package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/ivanduplenskikh/shrinker/internal/dashboard"
	"github.com/ivanduplenskikh/shrinker/internal/execution"
	"github.com/ivanduplenskikh/shrinker/internal/filters"
	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

const usage = `Usage:
  shrinker <command> [args...]
  shrinker exec [--] <command> [args...]
  shrinker update-check
  shrinker pipe [--kind log] [--max-lines <number>]
  shrinker stats [--json] [--chart] --dashboard [--dashboard-server] [--port <number>]
  shrinker track --executable <name> [--subcommand <name>] [--bytes <number>] [--exit-code <number>]
  shrinker last
  shrinker raw <capture-id>
  shrinker help
`

func main() {
	args := os.Args[1:]
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Print(usage)
		return
	}
	if args[0] == "update-check" {
		if len(args) != 1 {
			fail("update-check does not accept arguments")
		}
		checkForUpdate()
		return
	}

	mode := "exec"
	if args[0] == "last" || args[0] == "raw" || args[0] == "track" {
		mode = args[0]
		args = args[1:]
	} else if args[0] == "stats" {
		mode = "stats"
		args = args[1:]
	} else if args[0] == "pipe" {
		mode = "pipe"
		args = args[1:]
	} else if args[0] == "exec" {
		args = args[1:]
	}
	raw := false
	showMetrics := false
	jsonOutput := false
	chartOutput := false
	dashboardOutput, dashboardServer := false, false
	dashboardPort := 4317
	showPath := false
	noStats := false
	noSave := false
	coverage := false
	dashboardRestart := false
	trackExecutable, trackSubcommand := "", ""
	trackBytes, trackExitCode := 0, 0
	hasTrackBytes, hasTrackExitCode := false, false
	kind := filters.KindAuto
	maxLines := 120
	perFileLines := 40
	for len(args) > 0 && args[0] != "--" {
		switch args[0] {
		case "--json":
			if mode != "stats" {
				fail("--json is only supported by stats")
			}
			jsonOutput = true
			args = args[1:]
		case "--chart":
			if mode != "stats" {
				fail("--chart is only supported by stats")
			}
			chartOutput = true
			args = args[1:]
		case "--dashboard":
			if mode != "stats" {
				fail("--dashboard is only supported by stats")
			}
			dashboardOutput = true
			args = args[1:]
		case "--dashboard-server":
			if mode != "stats" {
				fail("--dashboard-server is only supported by stats")
			}
			dashboardServer = true
			args = args[1:]
		case "--restart":
			if mode != "stats" {
				fail("--restart is only supported by stats")
			}
			dashboardRestart = true
			args = args[1:]
		case "--port":
			if mode != "stats" || len(args) < 2 {
				fail("--port requires a value")
			}
			parsed, err := strconv.Atoi(args[1])
			if err != nil || parsed <= 0 {
				fail("--port requires a positive integer")
			}
			dashboardPort, args = parsed, args[2:]
		case "--path":
			if mode != "last" && mode != "raw" {
				fail("--path is only supported by last or raw")
			}
			showPath = true
			args = args[1:]
		case "--raw":
			raw = true
			args = args[1:]
		case "--no-stats":
			noStats = true
			args = args[1:]
		case "--no-save":
			noSave = true
			args = args[1:]
		case "--coverage":
			if mode != "stats" {
				fail("--coverage is only supported by stats")
			}
			coverage = true
			args = args[1:]
		case "--executable":
			if mode != "track" || len(args) < 2 {
				fail("--executable requires a value")
			}
			trackExecutable, args = args[1], args[2:]
		case "--subcommand":
			if mode != "track" || len(args) < 2 {
				fail("--subcommand requires a value")
			}
			trackSubcommand, args = args[1], args[2:]
		case "--bytes":
			if mode != "track" || len(args) < 2 {
				fail("--bytes requires a value")
			}
			parsed, err := strconv.Atoi(args[1])
			if err != nil || parsed < 0 {
				fail("--bytes requires a non-negative integer")
			}
			trackBytes, hasTrackBytes, args = parsed, true, args[2:]
		case "--exit-code":
			if mode != "track" || len(args) < 2 {
				fail("--exit-code requires a value")
			}
			parsed, err := strconv.Atoi(args[1])
			if err != nil {
				fail("--exit-code requires an integer")
			}
			trackExitCode, hasTrackExitCode, args = parsed, true, args[2:]
		case "--metrics":
			showMetrics = true
			args = args[1:]
		case "--kind":
			if len(args) < 2 {
				fail("--kind requires a value")
			}
			kind = filters.Kind(args[1])
			args = args[2:]
		case "--max-lines":
			if len(args) < 2 {
				fail("--max-lines requires a value")
			}
			parsed, err := strconv.Atoi(args[1])
			if err != nil || parsed <= 0 {
				fail("--max-lines requires a positive integer")
			}
			maxLines = parsed
			args = args[2:]
		case "--per-file-lines":
			if len(args) < 2 {
				fail("--per-file-lines requires a value")
			}
			parsed, err := strconv.Atoi(args[1])
			if err != nil || parsed <= 0 {
				fail("--per-file-lines requires a positive integer")
			}
			perFileLines = parsed
			args = args[2:]
		default:
			if (mode == "exec" || mode == "raw") && !startsOption(args[0]) {
				goto optionsDone
			}
			fail("unknown option: " + args[0])
		}
	}
optionsDone:
	if mode == "track" {
		if trackExecutable == "" || len(args) != 0 {
			fail("track requires --executable")
		}
		var exitCode *int
		if hasTrackExitCode {
			exitCode = &trackExitCode
		}
		rawTokens := 0
		if hasTrackBytes {
			rawTokens = (trackBytes + 3) / 4
		}
		if err := metrics.RecordUncovered(metrics.UncoveredStatistic{Source: "shell", Reason: metrics.ReasonUnlistedSubcommand, Executable: trackExecutable, Subcommand: trackSubcommand, RawBytes: trackBytes, RawEstimatedTokens: rawTokens, ExitCode: exitCode}, metrics.DefaultStatsPath()); err != nil {
			fail(err.Error())
		}
		return
	}
	if mode == "last" || mode == "raw" {
		if len(args) > 1 || (mode == "raw" && len(args) == 0) || (mode == "last" && len(args) != 0) {
			fail(mode + " has invalid arguments")
		}
		var capture execution.RawCapture
		var err error
		if mode == "last" {
			capture, err = execution.GetLatestRawOutput(execution.DefaultRawDirectory())
		} else {
			capture, err = execution.GetRawOutput(args[0], execution.DefaultRawDirectory())
		}
		if err != nil {
			fail("raw capture not found")
		}
		if showPath {
			fmt.Println(capture.Path)
		} else {
			fmt.Fprint(os.Stdout, capture.Output)
		}
		return
	}
	if mode == "stats" {
		if dashboardRestart && !dashboardOutput {
			fail("--restart requires --dashboard")
		}
		if len(args) != 0 {
			fail("stats does not accept command arguments")
		}
		summary, err := metrics.GetStats(metrics.DefaultStatsPath())
		if err != nil {
			fail(err.Error())
		}
		if dashboardOutput {
			html, err := dashboard.Render(summary)
			if err != nil {
				fail(err.Error())
			}
			path := filepath.Join(filepath.Dir(summary.DatabasePath), "dashboard.html")
			if err := os.WriteFile(path, []byte(html), 0o600); err != nil {
				fail(err.Error())
			}
			fmt.Printf("Dashboard written to %s\n", path)
			if dashboardServer {
				fmt.Printf("Dashboard server running at http://127.0.0.1:%d\n", dashboardPort)
				if err := dashboard.Serve(func() (metrics.StatsSummary, error) { return metrics.GetStats(metrics.DefaultStatsPath()) }, dashboardPort); err != nil {
					fail(err.Error())
				}
			}
		} else if coverage {
			fmt.Println(metrics.FormatCoverage(summary))
		} else if chartOutput {
			fmt.Println(metrics.FormatStatsChart(summary))
		} else if jsonOutput {
			output, err := metrics.FormatStatsJSON(summary)
			if err != nil {
				fail(err.Error())
			}
			fmt.Println(output)
		} else {
			fmt.Println(metrics.FormatStats(summary))
		}
		return
	}
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	if mode == "pipe" {
		renderPipe(raw, showMetrics, kind, maxLines, perFileLines, noStats)
		return
	}
	if len(args) == 0 {
		fail("shrinker: exec requires a command")
	}
	args = withDefaultGitLogLimit(args)
	args = withNpmColor(args)

	result, err := execution.RunCommand(args[0], args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	omitted, measurements := render(result.Combined, raw, showMetrics, kind, maxLines, perFileLines, result.DurationMs, args)
	filterKind := kind
	if filterKind == filters.KindAuto {
		filterKind = filters.Detect(args)
	}
	if !noStats {
		commandSubcommand := ""
		if signature, ok := metrics.CommandSignatureFor(args); ok {
			commandSubcommand = signature.Subcommand
		}
		if err := metrics.RecordRun(metrics.RunStatistic{
			Mode: "exec", FilterKind: string(filterKind), CommandName: filepath.Base(args[0]), CommandSubcommand: commandSubcommand,
			Measurements: measurements, DurationMs: result.DurationMs, Omitted: omitted,
			ExitCode: &result.ExitCode,
		}, metrics.DefaultStatsPath()); err != nil {
			fmt.Fprintf(os.Stderr, "[shrinker] could not record stats: %v\n", err)
		}
		if metrics.CoverageEnabled() {
			matched := kind != filters.KindAuto || filters.Detect(args) != filters.KindLog
			if reason := metrics.ClassifyWrapped(matched, measurements); reason != "" {
				if signature, ok := metrics.CommandSignatureFor(args); ok {
					if err := metrics.RecordUncovered(metrics.UncoveredStatistic{Source: "wrapped", Reason: reason, Executable: signature.Executable, Subcommand: signature.Subcommand, RawBytes: measurements.RawBytes, RawEstimatedTokens: measurements.RawEstimatedTokens, ExitCode: &result.ExitCode}, metrics.DefaultStatsPath()); err != nil {
						fmt.Fprintf(os.Stderr, "[shrinker] could not record uncovered command: %v\n", err)
					}
				}
			}
		}
	}
	if omitted && !raw && !noSave {
		capture, err := execution.SaveRawOutput(result.Combined, args, execution.DefaultRawDirectory())
		if err == nil {
			fmt.Fprintf(os.Stderr, "[full: shrinker raw %s]\n", capture.ID)
		}
	}
	if result.ExitCode != 0 {
		os.Exit(result.ExitCode)
	}
}

func renderPipe(raw, showMetrics bool, kind filters.Kind, maxLines, perFileLines int, noStats bool) {
	input, err := readInput()
	if err != nil {
		fail(err.Error())
	}
	_, measurements := render(input, raw, showMetrics, kind, maxLines, perFileLines, 0, nil)
	if !noStats {
		filterKind := kind
		if filterKind == filters.KindAuto {
			filterKind = filters.KindLog
		}
		if err := metrics.RecordRun(metrics.RunStatistic{Mode: "pipe", FilterKind: string(filterKind), CommandName: "stdin", Measurements: measurements}, metrics.DefaultStatsPath()); err != nil {
			fmt.Fprintf(os.Stderr, "[shrinker] could not record stats: %v\n", err)
		}
	}
}

func render(input string, raw, showMetrics bool, kind filters.Kind, maxLines, perFileLines int, durationMs int64, command []string) (bool, metrics.Measurements) {
	output := input
	omitted := false
	if !raw && (len(command) == 0 || stdoutIsTerminal()) {
		result := filters.Apply(input, kind, filters.Options{MaxLines: maxLines, PerFileLines: perFileLines, Command: command})
		omitted = result.Omitted
		comparison := metrics.Measure(input, result.Output)
		if comparison.OutputBytes < comparison.RawBytes && comparison.OutputEstimatedTokens < comparison.RawEstimatedTokens {
			output = result.Output
		}
	}
	measurements := metrics.Measure(input, output)
	if showMetrics {
		fmt.Fprintln(os.Stderr, metrics.FormatMeasurements(measurements, &durationMs))
	}
	fmt.Fprint(os.Stdout, output)
	return omitted && output != input, measurements
}

func stdoutIsTerminal() bool {
	info, err := os.Stdout.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

func withDefaultGitLogLimit(command []string) []string {
	if filters.Detect(command) != "git-log" || gitLogHasExplicitLimit(command) {
		return command
	}
	limited := append([]string{}, command...)
	return append(limited, "-n", "10")
}

func withNpmColor(command []string) []string {
	if filters.Detect(command) != "npm" {
		return command
	}
	for _, argument := range command[1:] {
		if argument == "--color" || strings.HasPrefix(argument, "--color=") || argument == "--no-color" {
			return command
		}
	}
	colored := append([]string{}, command...)
	return append(colored, "--color=always")
}

const updateCheckInterval = 24 * time.Hour

type installedManifest struct {
	Version string `json:"version"`
}

type updateCheckState struct {
	CheckedAt       time.Time `json:"checkedAt"`
	NotifiedVersion string    `json:"notifiedVersion"`
}

func checkForUpdate() {
	version, installDir, ok := installedVersion()
	if !ok {
		return
	}
	statePath := filepath.Join(installDir, "update-check.json")
	state := readUpdateCheckState(statePath)
	if time.Since(state.CheckedAt) < updateCheckInterval {
		return
	}
	latest, ok := latestReleaseVersion()
	state.CheckedAt = time.Now()
	if !ok {
		writeUpdateCheckState(statePath, state)
		return
	}
	if versionLessThan(version, latest) && state.NotifiedVersion != latest {
		_ = os.WriteFile(filepath.Join(installDir, "update-notice"), []byte(fmt.Sprintf("[shrinker] Update available: v%s (installed: v%s)\n", latest, version)), 0o600)
		state.NotifiedVersion = latest
	}
	writeUpdateCheckState(statePath, state)
}

func installedVersion() (string, string, bool) {
	executable, err := os.Executable()
	if err != nil {
		return "", "", false
	}
	installDir := filepath.Dir(filepath.Dir(executable))
	contents, err := os.ReadFile(filepath.Join(installDir, "manifest.json"))
	if err != nil {
		return "", "", false
	}
	var manifest installedManifest
	if json.Unmarshal(contents, &manifest) != nil || manifest.Version == "" {
		return "", "", false
	}
	return strings.TrimPrefix(manifest.Version, "v"), installDir, true
}

func latestReleaseVersion() (string, bool) {
	request, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/ivanduplenskikh/shrinker/releases/latest", nil)
	if err != nil {
		return "", false
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "shrinker-update-check")
	response, err := (&http.Client{Timeout: 2 * time.Second}).Do(request)
	if err != nil || response.StatusCode != http.StatusOK {
		if response != nil {
			response.Body.Close()
		}
		return "", false
	}
	defer response.Body.Close()
	var release struct {
		TagName string `json:"tag_name"`
	}
	if json.NewDecoder(response.Body).Decode(&release) != nil || release.TagName == "" {
		return "", false
	}
	return strings.TrimPrefix(release.TagName, "v"), true
}

func readUpdateCheckState(path string) updateCheckState {
	contents, err := os.ReadFile(path)
	if err != nil {
		return updateCheckState{}
	}
	var state updateCheckState
	if json.Unmarshal(contents, &state) != nil {
		return updateCheckState{}
	}
	return state
}

func writeUpdateCheckState(path string, state updateCheckState) {
	contents, err := json.Marshal(state)
	if err == nil {
		_ = os.WriteFile(path, contents, 0o600)
	}
}

func versionLessThan(current, latest string) bool {
	parse := func(version string) [3]int {
		var result [3]int
		for component, value := range strings.Split(strings.SplitN(version, "-", 2)[0], ".") {
			if component >= len(result) {
				break
			}
			result[component], _ = strconv.Atoi(value)
		}
		return result
	}
	left, right := parse(current), parse(latest)
	for index := range left {
		if left[index] != right[index] {
			return left[index] < right[index]
		}
	}
	return false
}

func gitLogHasExplicitLimit(command []string) bool {
	for index, argument := range command {
		if argument == "-n" || argument == "--max-count" {
			return index+1 < len(command)
		}
		if (strings.HasPrefix(argument, "-n") && len(argument) > 2) || strings.HasPrefix(argument, "--max-count=") {
			return true
		}
	}
	return false
}

func readInput() (string, error) {
	contents, err := io.ReadAll(os.Stdin)
	return string(contents), err
}

func startsOption(value string) bool {
	return len(value) > 0 && value[0] == '-'
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(2)
}
