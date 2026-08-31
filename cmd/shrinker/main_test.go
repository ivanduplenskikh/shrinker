package main

import (
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

func TestVersionLessThan(t *testing.T) {
	if !versionLessThan("0.15.0", "0.16.0") || !versionLessThan("0.15", "0.15.1") || versionLessThan("0.16.0", "0.16.0") || versionLessThan("0.17.0", "0.16.9") {
		t.Fatal("version comparison returned an unexpected result")
	}
}
