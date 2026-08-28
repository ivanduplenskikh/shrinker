package execution

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// CommandResult mirrors the public process boundary of the TypeScript runtime.
type CommandResult struct {
	Stdout     string
	Stderr     string
	Combined   string
	ExitCode   int
	DurationMs int64
}

func RunCommand(command string, args []string) (CommandResult, error) {
	if result, handled, err := runWindowsAlias(command, args); handled {
		return result, err
	}

	executable := command
	if runtime.GOOS == "windows" {
		executable = resolveWindowsCommand(command)
	}
	result, err := spawnAndCapture(executable, args, false)
	if err == nil || runtime.GOOS != "windows" || result.ExitCode != -1 {
		return result, err
	}
	return spawnAndCapture(executable, args, true)
}

func spawnAndCapture(executable string, args []string, viaCmdProxy bool) (CommandResult, error) {
	started := time.Now()
	program := executable
	programArgs := args
	if viaCmdProxy {
		program = "cmd.exe"
		programArgs = []string{"/d", "/s", "/c", quoteForCmd(executable) + " " + joinQuoted(args)}
	}

	command := exec.Command(program, programArgs...)
	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	result := makeResult(stdout.String(), stderr.String(), exitCode(err), time.Since(started))
	if result.ExitCode == -1 {
		return result, err
	}
	return result, nil
}

func makeResult(stdout, stderr string, exitCode int, duration time.Duration) CommandResult {
	combinedParts := make([]string, 0, 2)
	if stdout != "" {
		combinedParts = append(combinedParts, stdout)
	}
	if stderr != "" {
		combinedParts = append(combinedParts, stderr)
	}
	return CommandResult{
		Stdout: stdout, Stderr: stderr, Combined: strings.Join(combinedParts, "\n"),
		ExitCode: exitCode, DurationMs: duration.Milliseconds(),
	}
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode()
	}
	return -1
}

func resolveWindowsCommand(command string) string {
	if runtime.GOOS != "windows" || filepath.Ext(command) != "" {
		return command
	}
	extensions := strings.Split(os.Getenv("PATHEXT"), ";")
	if len(extensions) == 0 || extensions[0] == "" {
		extensions = []string{".COM", ".EXE", ".BAT", ".CMD"}
	}
	for _, directory := range filepath.SplitList(os.Getenv("PATH")) {
		if directory == "" {
			continue
		}
		for _, extension := range extensions {
			candidate := filepath.Join(directory, command+strings.ToLower(strings.TrimSpace(extension)))
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}
	return command
}

func runWindowsAlias(command string, args []string) (CommandResult, bool, error) {
	if runtime.GOOS != "windows" {
		return CommandResult{}, false, nil
	}
	alias := strings.ToLower(command)
	if alias != "cat" && alias != "ls" && alias != "dir" {
		return CommandResult{}, false, nil
	}
	started := time.Now()
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			return makeResult("", fmt.Sprintf("Unsupported %s option in shrinker alias mode: %s", alias, arg), 2, time.Since(started)), true, nil
		}
	}
	if alias == "cat" {
		if len(args) == 0 {
			return makeResult("", "cat alias requires at least one file path", 2, time.Since(started)), true, nil
		}
		parts := make([]string, 0, len(args))
		for _, target := range args {
			contents, err := os.ReadFile(target)
			if err != nil {
				return makeResult("", err.Error(), 1, time.Since(started)), true, nil
			}
			parts = append(parts, string(contents))
		}
		separator := ""
		if len(parts) > 1 {
			separator = "\n"
		}
		return makeResult(strings.Join(parts, separator), "", 0, time.Since(started)), true, nil
	}

	target := "."
	if len(args) > 0 {
		target = args[0]
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return makeResult("", err.Error(), 1, time.Since(started)), true, nil
	}
	lines := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			name += "/"
		}
		lines = append(lines, name)
	}
	sort.Strings(lines)
	return makeResult(strings.Join(lines, "\n"), "", 0, time.Since(started)), true, nil
}

func quoteForCmd(argument string) string {
	if argument != "" && !strings.ContainsAny(argument, " \"^&|<>") {
		return argument
	}
	return `"` + strings.ReplaceAll(argument, `"`, `""`) + `"`
}

func joinQuoted(args []string) string {
	quoted := make([]string, len(args))
	for index, arg := range args {
		quoted[index] = quoteForCmd(arg)
	}
	return strings.Join(quoted, " ")
}
