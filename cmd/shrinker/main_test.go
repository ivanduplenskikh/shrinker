package main

import (
	"io"
	"os"
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

func TestVersionLessThan(t *testing.T) {
	if !versionLessThan("0.15.0", "0.16.0") || !versionLessThan("0.15", "0.15.1") || versionLessThan("0.16.0", "0.16.0") || versionLessThan("0.17.0", "0.16.9") {
		t.Fatal("version comparison returned an unexpected result")
	}
}
