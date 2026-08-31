package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteChecksum(t *testing.T) {
	path := filepath.Join(t.TempDir(), "shrinker-test.zip")
	if err := os.WriteFile(path, []byte("release payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeChecksum(path); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(path + ".sha256")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Fields(string(contents))
	if len(parts) != 2 || len(parts[0]) != 64 || parts[1] != filepath.Base(path) {
		t.Fatalf("checksum = %q", contents)
	}
}
