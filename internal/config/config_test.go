package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadAndSetPreserveConfigBehavior(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(path, []byte("# keep me\nTRACK=0\nOTHER=value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := Read(path); got["TRACK"] != "0" || got["OTHER"] != "value" {
		t.Fatalf("settings = %#v", got)
	}
	if err := Set("TRACK", "1", path); err != nil {
		t.Fatal(err)
	}
	if got := Read(path); got["TRACK"] != "1" || got["OTHER"] != "value" {
		t.Fatalf("updated settings = %#v", got)
	}
}

func TestResolveSettingEnvironmentWins(t *testing.T) {
	key := "SHRINKER_TEST_SETTING"
	t.Setenv(key, "from-env")
	path := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(path, []byte(key+"=from-file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := ResolveSetting(key, path); got != "from-env" {
		t.Fatalf("setting = %q", got)
	}
}

func TestIsTruthy(t *testing.T) {
	for _, value := range []string{"1", "true", "TRUE", "yes", " Yes "} {
		if !IsTruthy(value) {
			t.Errorf("IsTruthy(%q) = false", value)
		}
	}
	for _, value := range []string{"0", "false", "no", " "} {
		if IsTruthy(value) {
			t.Errorf("IsTruthy(%q) = true", value)
		}
	}
}
