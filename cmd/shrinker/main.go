package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/ivanduplenskikh/shrinker/internal/execution"
	"github.com/ivanduplenskikh/shrinker/internal/filters"
	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

const usage = `Usage:
  shrinker <command> [args...]
  shrinker exec [--] <command> [args...]
	shrinker pipe [--kind log] [--max-lines <number>]
  shrinker help
`

func main() {
	args := os.Args[1:]
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Print(usage)
		return
	}

	mode := "exec"
	if args[0] == "pipe" {
		mode = "pipe"
		args = args[1:]
	} else if args[0] == "exec" {
		args = args[1:]
	}
	raw := false
	showMetrics := false
	kind := filters.KindAuto
	maxLines := 120
	for len(args) > 0 && args[0] != "--" {
		switch args[0] {
		case "--raw":
			raw = true
			args = args[1:]
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
		default:
			if mode == "exec" && !startsOption(args[0]) {
				goto optionsDone
			}
			fail("unknown option: " + args[0])
		}
	}
optionsDone:
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	if mode == "pipe" {
		renderPipe(raw, showMetrics, kind, maxLines)
		return
	}
	if len(args) == 0 {
		fail("shrinker: exec requires a command")
	}

	result, err := execution.RunCommand(args[0], args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	render(result.Combined, raw, showMetrics, kind, maxLines, result.DurationMs)
	if result.ExitCode != 0 {
		os.Exit(result.ExitCode)
	}
}

func renderPipe(raw, showMetrics bool, kind filters.Kind, maxLines int) {
	input, err := readInput()
	if err != nil {
		fail(err.Error())
	}
	render(input, raw, showMetrics, kind, maxLines, 0)
}

func render(input string, raw, showMetrics bool, kind filters.Kind, maxLines int, durationMs int64) {
	output := input
	if !raw {
		result := filters.Apply(input, kind, filters.Options{MaxLines: maxLines})
		comparison := metrics.Measure(input, result.Output)
		if comparison.OutputBytes < comparison.RawBytes && comparison.OutputEstimatedTokens < comparison.RawEstimatedTokens {
			output = result.Output
		}
		if showMetrics {
			fmt.Fprintln(os.Stderr, metrics.FormatMeasurements(metrics.Measure(input, output), &durationMs))
		}
	}
	fmt.Fprintln(os.Stdout, output)
}

func readInput() (string, error) {
	contents, err := os.ReadFile("/dev/stdin")
	if err == nil {
		return string(contents), nil
	}
	return readAll(os.Stdin)
}

func readAll(file *os.File) (string, error) {
	contents, err := io.ReadAll(file)
	return string(contents), err
}

func startsOption(value string) bool {
	return len(value) > 0 && value[0] == '-'
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(2)
}
