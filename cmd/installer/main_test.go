package main

import (
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDashboardServerCommandUsesInstalledBinary(t *testing.T) {
	command := dashboardServerCommand("C:/Users/example/.shrinker/bin/shrinker.exe")
	if got, want := command.Args, []string{"C:/Users/example/.shrinker/bin/shrinker.exe", "stats", "--dashboard", "--dashboard-server"}; !sameStrings(got, want) {
		t.Fatalf("command args = %q, want %q", got, want)
	}
	if command.Stdout != io.Discard || command.Stderr != io.Discard {
		t.Fatal("dashboard server command must not hold installer output streams open")
	}
}

func TestAgentRulesRequireShrinkerForLimitedGitLog(t *testing.T) {
	_, sourcePath, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not determine test source path")
	}
	path := filepath.Join(filepath.Dir(sourcePath), "..", "..", "templates", "agent-rules.md")
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "Do not run the raw command directly, including when its arguments appear to limit output (for example, `git log -n 1`).") {
		t.Fatal("agent rules must require shrinker for output-limited git log commands")
	}
}

func TestRemoveBlockRemovesLegacyProfileIntegration(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "profile.ps1")
	secondPath := filepath.Join(directory, "bashrc")
	contents := "\n\nbefore\n" + blockStart + "\n. shrinker-profile.ps1\n" + blockEnd + "\nmiddle\n" + blockStart + "\n. shrinker-profile.ps1\n" + blockEnd + "\n" + pathBlockStart() + "\nPATH\n" + pathBlockEnd() + "\nafter\n"
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secondPath, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := removeLegacyProfileIntegrations([]string{path, secondPath, filepath.Join(directory, "missing")}); err != nil {
		t.Fatal(err)
	}
	for _, profilePath := range []string{path, secondPath} {
		updated, err := os.ReadFile(profilePath)
		if err != nil {
			t.Fatal(err)
		}
		text := string(updated)
		if strings.Contains(text, blockStart) || strings.Contains(text, blockEnd) {
			t.Fatalf("legacy integration remained: %q", text)
		}
		if !strings.Contains(text, pathBlockStart()) || !strings.Contains(text, "before") || !strings.Contains(text, "after") {
			t.Fatalf("unexpected profile contents: %q", text)
		}
		if !strings.HasPrefix(text, "\n\n") || !strings.Contains(text, "middle") {
			t.Fatalf("profile formatting was not preserved: %q", text)
		}
	}
	if err := removeLegacyProfileIntegrations([]string{path, secondPath}); err != nil {
		t.Fatal(err)
	}
}

func TestUniquePathsRetainsRedirectedPowerShellProfile(t *testing.T) {
	redirected := `C:\Users\example\OneDrive\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`
	paths := uniquePaths([]string{
		redirected,
		`C:\Users\example\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`,
		redirected,
		"",
	})
	if got, want := paths, []string{
		redirected,
		`C:\Users\example\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`,
	}; !sameStrings(got, want) {
		t.Fatalf("unique paths = %q, want %q", got, want)
	}
}

func TestInstalledManifestVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "manifest.json")
	if err := os.WriteFile(path, []byte(`{"name":"shrinker","version":"0.15.0","target":"win-x64"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	version, err := installedManifestVersion(path)
	if err != nil {
		t.Fatal(err)
	}
	if version != "v0.15.0" {
		t.Fatalf("version = %q, want v0.15.0", version)
	}
}

func TestRemoveAllWithRetryRemovesDirectory(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "bin")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := removeAllWithRetry(path); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("bin directory still exists: %v", err)
	}
}

func TestCopyFileWithRetryCopiesFile(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "source.txt")
	destination := filepath.Join(directory, "nested", "destination.txt")
	if err := os.WriteFile(source, []byte("replacement"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := copyFileWithRetry(source, destination); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "replacement" {
		t.Fatalf("contents = %q, want replacement", contents)
	}
}

func sameStrings(left, right []string) bool {
	return strings.Join(left, "\x00") == strings.Join(right, "\x00")
}
