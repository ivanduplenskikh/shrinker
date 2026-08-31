package metrics

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCommandSignatureOmitsFileArguments(t *testing.T) {
	signature, ok := CommandSignatureFor([]string{"cat", "photo_1.jpg"})
	if !ok || signature.Executable != "cat" || signature.Subcommand != "" {
		t.Fatalf("cat signature = %#v, ok = %t", signature, ok)
	}
}

func TestCommandSignatureKeepsKnownSubcommands(t *testing.T) {
	signature, ok := CommandSignatureFor([]string{"git", "status"})
	if !ok || signature.Executable != "git" || signature.Subcommand != "status" {
		t.Fatalf("git signature = %#v, ok = %t", signature, ok)
	}
}

func TestRecordUncoveredIgnoresLegacyTrackingSetting(t *testing.T) {
	t.Setenv("SHRINKER_TRACK_UNCOVERED", "0")
	databasePath := filepath.Join(t.TempDir(), "stats.db")
	if err := RecordUncovered(UncoveredStatistic{
		Source: "wrapped", Reason: ReasonNoFilter, Executable: "git", Subcommand: "blame", RawBytes: 1_000, RawEstimatedTokens: 250,
	}, databasePath); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(databasePath); err != nil {
		t.Fatalf("coverage database was not created: %v", err)
	}
	coverage, err := GetCoverageStats(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	if len(coverage) != 1 || coverage[0].Command != "git blame" {
		t.Fatalf("coverage = %#v", coverage)
	}
}
