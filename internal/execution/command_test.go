package execution

import (
	"runtime"
	"strings"
	"testing"
)

func TestRunCommandCapturesOutputAndExitCode(t *testing.T) {
	var command string
	var args []string
	if runtime.GOOS == "windows" {
		command = "cmd.exe"
		args = []string{"/d", "/c", "echo visible output & echo important error 1>&2 & exit /b 7"}
	} else {
		command = "sh"
		args = []string{"-c", "printf 'visible'; printf 'important error' >&2; exit 7"}
	}

	result, err := RunCommand(command, args)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 7 {
		t.Fatalf("exit code = %d, want 7", result.ExitCode)
	}
	if !strings.Contains(result.Stdout, "visible") || !strings.Contains(result.Stderr, "important error") {
		t.Fatalf("captured stdout/stderr = %q / %q", result.Stdout, result.Stderr)
	}
}

func TestCombinedOutputSeparatesStreams(t *testing.T) {
	result := makeResult("out", "err", 0, 0)
	if result.Combined != "out\nerr" {
		t.Fatalf("combined = %q, want %q", result.Combined, "out\nerr")
	}
}
