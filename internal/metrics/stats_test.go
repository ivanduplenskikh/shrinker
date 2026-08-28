package metrics

import (
	"strings"
	"testing"
)

func TestRecordRunAndGetStats(t *testing.T) {
	databasePath := t.TempDir() + "/stats.db"
	if err := RecordRun(RunStatistic{
		Mode: "exec", FilterKind: "log", CommandName: "demo",
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
	if chart := FormatStatsChart(summary); !strings.Contains(chart, "Activity") {
		t.Fatalf("chart = %q", chart)
	}
}
