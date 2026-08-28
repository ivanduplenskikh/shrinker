package execution

import (
	"os"
	"testing"
)

func TestRawOutputSaveAndRetrieve(t *testing.T) {
	directory := t.TempDir()
	capture, err := SaveRawOutput("full output", []string{"git"}, directory)
	if err != nil {
		t.Fatal(err)
	}
	latest, err := GetLatestRawOutput(directory)
	if err != nil || latest.ID != capture.ID || latest.Output != "full output" {
		t.Fatalf("latest = %#v, err = %v", latest, err)
	}
	byID, err := GetRawOutput(capture.ID, directory)
	if err != nil || byID.Path != capture.Path {
		t.Fatalf("by ID = %#v, err = %v", byID, err)
	}
}

func TestRawOutputKeepsTwentyFiles(t *testing.T) {
	directory := t.TempDir()
	for index := 0; index < 21; index++ {
		if _, err := SaveRawOutput(string(rune('a'+index)), []string{"demo"}, directory); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	logs := 0
	for _, entry := range entries {
		if entry.Name()[len(entry.Name())-4:] == ".log" {
			logs++
		}
	}
	if logs != 20 {
		t.Fatalf("log files = %d, want 20", logs)
	}
}
