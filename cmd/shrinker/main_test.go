package main

import (
	"io"
	"os"
	"runtime"
	"strings"
	"testing"
)

func TestWithDefaultGitLogLimitAddsTenCommitLimit(t *testing.T) {
	got := withDefaultGitLogLimit([]string{"git", "log"})
	want := []string{"git", "log", "-n", "10"}
	if strings.Join(got, "\x00") != strings.Join(want, "\x00") {
		t.Fatalf("command = %q, want %q", got, want)
	}
}

func TestWithDefaultGitLogLimitPreservesExplicitLimit(t *testing.T) {
	command := []string{"git", "log", "--max-count=40"}
	got := withDefaultGitLogLimit(command)
	if strings.Join(got, "\x00") != strings.Join(command, "\x00") {
		t.Fatalf("command = %q, want %q", got, command)
	}
}

func TestWithNpmColorAddsColorAlways(t *testing.T) {
	got := withNpmColor([]string{"npm", "audit"})
	want := []string{"npm", "audit", "--color=always"}
	if strings.Join(got, "\x00") != strings.Join(want, "\x00") {
		t.Fatalf("command = %q, want %q", got, want)
	}
}

func TestWithNpmColorPreservesUserColorPreference(t *testing.T) {
	command := []string{"npm", "audit", "--no-color"}
	got := withNpmColor(command)
	if strings.Join(got, "\x00") != strings.Join(command, "\x00") {
		t.Fatalf("command = %q, want %q", got, command)
	}
}

func TestRenderPreservesCapturedCommandOutput(t *testing.T) {
	originalStdout := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = writer
	t.Cleanup(func() {
		os.Stdout = originalStdout
		reader.Close()
		writer.Close()
	})

	omitted, _ := render("branch\r\n", false, false, "git-list", 120, 40, 0, []string{"git", "branch", "--show-current"})
	writer.Close()
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if omitted || string(output) != "branch\r\n" {
		t.Fatalf("rendered output = %q, omitted = %t", output, omitted)
	}
}

func TestRenderFiltersCapturedCommandOutput(t *testing.T) {
	originalStdout := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = writer
	t.Cleanup(func() {
		os.Stdout = originalStdout
		reader.Close()
		writer.Close()
	})

	input := strings.Repeat("progress 50%\n", 200)
	omitted, _ := render(input, false, false, "log", 120, 40, 0, []string{"docker", "logs", "api"})
	writer.Close()
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !omitted || len(output) >= len(input) {
		t.Fatalf("captured output was not filtered: %d bytes, omitted = %t", len(output), omitted)
	}
}

func TestRenderRawPreservesCapturedCommandOutput(t *testing.T) {
	originalStdout := os.Stdout
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = writer
	t.Cleanup(func() {
		os.Stdout = originalStdout
		reader.Close()
		writer.Close()
	})

	input := strings.Repeat("progress 50%\n", 200)
	omitted, measurements := render(input, true, false, "log", 120, 40, 0, []string{"docker", "logs", "api"})
	writer.Close()
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if omitted || string(output) != input {
		t.Fatalf("raw output = %d bytes, omitted = %t", len(output), omitted)
	}
	if measurements.EstimatedTokensSaved == 0 {
		t.Fatalf("raw measurements = %#v, want potential savings", measurements)
	}
}

func TestShouldRecordStatsExcludesRawAndOptedOutRuns(t *testing.T) {
	for _, test := range []struct {
		raw, noStats bool
		want         bool
	}{
		{want: true},
		{raw: true},
		{noStats: true},
		{raw: true, noStats: true},
	} {
		if got := shouldRecordStats(test.raw, test.noStats); got != test.want {
			t.Errorf("shouldRecordStats(%t, %t) = %t, want %t", test.raw, test.noStats, got, test.want)
		}
	}
}

func TestVersionLessThan(t *testing.T) {
	if !versionLessThan("0.15.0", "0.16.0") || !versionLessThan("0.15", "0.15.1") || versionLessThan("0.16.0", "0.16.0") || versionLessThan("0.17.0", "0.16.9") {
		t.Fatal("version comparison returned an unexpected result")
	}
}

func TestUpdateCommand(t *testing.T) {
	command := updateCommand()
	if !strings.Contains(command, "raw.githubusercontent.com/ivanduplenskikh/shrinker/main/integrations/") {
		t.Fatalf("update command = %q", command)
	}
	if runtime.GOOS == "windows" && !strings.Contains(command, "install.ps1") {
		t.Fatalf("Windows update command = %q", command)
	}
}

func TestUpdateNoticeIncludesCommandForLegacyNotice(t *testing.T) {
	legacyNotice := "[shrinker] Update available: v0.30.0 (installed: v0.0.0-local)\n"
	message := updateNoticeMessage(legacyNotice)
	if !strings.Contains(message, "[shrinker] Update: "+updateCommand()) {
		t.Fatalf("legacy notice message = %q", message)
	}
	if updateNoticeMessage(message) != message {
		t.Fatal("notice message duplicated the update command")
	}
}

func TestValidDashboardPort(t *testing.T) {
	for _, port := range []int{1, 4317, 65535} {
		if !validDashboardPort(port) {
			t.Errorf("validDashboardPort(%d) = false", port)
		}
	}
	for _, port := range []int{-1, 0, 65536} {
		if validDashboardPort(port) {
			t.Errorf("validDashboardPort(%d) = true", port)
		}
	}
}
