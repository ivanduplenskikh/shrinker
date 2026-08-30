package main

import (
	"strings"
	"testing"
)

func TestRenderCapsUnboundedGitLogMeasurementToFirstPage(t *testing.T) {
	input := strings.Repeat("commit detail\n", 40)
	_, measurement := render(input, false, false, "git-log", 120, 40, 0, []string{"git", "log"})
	wantInput := firstLines(input, 24)
	if measurement.RawBytes != len([]byte(wantInput)) {
		t.Fatalf("raw bytes = %d, want %d", measurement.RawBytes, len([]byte(wantInput)))
	}
}

func TestRenderMeasuresExplicitlyBoundedGitLogInFull(t *testing.T) {
	input := strings.Repeat("commit detail\n", 40)
	_, measurement := render(input, false, false, "git-log", 120, 40, 0, []string{"git", "log", "-n", "40"})
	if measurement.RawBytes != len([]byte(input)) {
		t.Fatalf("raw bytes = %d, want %d", measurement.RawBytes, len([]byte(input)))
	}
}
