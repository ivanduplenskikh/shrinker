package main

import (
	"fmt"
	"os"

	"github.com/ivanduplenskikh/shrinker/internal/execution"
)

const usage = `Usage:
  shrinker <command> [args...]
  shrinker exec [--] <command> [args...]
  shrinker help
`

func main() {
	args := os.Args[1:]
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Print(usage)
		return
	}

	if args[0] == "exec" {
		args = args[1:]
		if len(args) > 0 && args[0] == "--" {
			args = args[1:]
		}
	}
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "shrinker: exec requires a command")
		os.Exit(2)
	}

	result, err := execution.RunCommand(args[0], args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if result.Stdout != "" {
		fmt.Fprint(os.Stdout, result.Stdout)
	}
	if result.Stderr != "" {
		fmt.Fprint(os.Stderr, result.Stderr)
	}
	if result.ExitCode != 0 {
		os.Exit(result.ExitCode)
	}
}
