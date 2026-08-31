package metrics

import (
	"strings"
	"testing"
)

func TestRecordRunAndGetStats(t *testing.T) {
	databasePath := t.TempDir() + "/stats.db"
	if err := RecordRun(RunStatistic{
		Mode: "exec", FilterKind: "log", CommandName: "git", CommandSubcommand: "status",
		Measurements: Measure("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "xxxxxxxxxxxxxxxxxxxx"),
		Omitted:      true,
	}, databasePath); err != nil {
		t.Fatal(err)
	}
	summary, err := GetStats(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Total.Runs != 1 || summary.Total.EstimatedTokensSaved != 5 {
		t.Fatalf("total = %#v", summary.Total)
	}
	if len(summary.ByFilter) != 1 || summary.ByFilter[0].FilterKind != "log" {
		t.Fatalf("by filter = %#v", summary.ByFilter)
	}
	if len(summary.Daily) != 1 || len(summary.YearlyDaily) != 1 || len(summary.ByCommand) != 1 {
		t.Fatalf("time or command aggregates = %#v", summary)
	}
	if summary.ByCommand[0].Command != "git status" || summary.ByCommand[0].FilterKind != "log" {
		t.Fatalf("command aggregate = %#v", summary.ByCommand[0])
	}
	if len(summary.CommandRuns) != 1 || summary.CommandRuns[0].Command != "git status" || summary.CommandRuns[0].EstimatedTokensSaved != 5 {
		t.Fatalf("command runs = %#v", summary.CommandRuns)
	}
	if chart := FormatStatsChart(summary); !strings.Contains(chart, "Activity") {
		t.Fatalf("chart = %q", chart)
	}
	if formatted := FormatStats(summary); !strings.Contains(formatted, "Dashboard: http://127.0.0.1:4317") {
		t.Fatalf("stats = %q", formatted)
	}
}

func TestRecordRunOmitsUnsafeSubcommand(t *testing.T) {
	databasePath := t.TempDir() + "/stats.db"
	if err := RecordRun(RunStatistic{
		Mode: "exec", FilterKind: "log", CommandName: "cat", CommandSubcommand: "photo_1.jpg",
		Measurements: Measure("raw", "output"),
	}, databasePath); err != nil {
		t.Fatal(err)
	}
	summary, err := GetStats(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.ByCommand) != 1 || summary.ByCommand[0].Command != "cat" {
		t.Fatalf("command statistics = %#v", summary.ByCommand)
	}
}
