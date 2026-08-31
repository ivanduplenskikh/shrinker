package filters

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

func fixture(t *testing.T, name string) string {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join("..", "..", "tests", "fixtures", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(contents)
}

func TestRepresentativeFilterFixtures(t *testing.T) {
	tests := []struct {
		name, file string
		kind       Kind
		command    []string
	}{
		{"status", "git-status.txt", "git-status", []string{"git", "status"}},
		{"diff", "git-diff.txt", "git-diff", []string{"git", "diff"}},
		{"log", "git-log.txt", "git-log", []string{"git", "log"}},
		{"test", "test-output.txt", "test", []string{"npm", "test"}},
		{"generic log", "generic-log.txt", "log", nil},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			raw := fixture(t, testCase.file)
			result := Apply(raw, testCase.kind, Options{MaxLines: 80, PerFileLines: 20, Command: testCase.command})
			if result.Output == "" {
				t.Fatal("filter returned empty output")
			}
			if result.Kind != testCase.kind {
				t.Fatalf("kind = %q, want %q", result.Kind, testCase.kind)
			}
		})
	}
}

func TestGitLogPreservesUsefulCommitContext(t *testing.T) {
	result := Apply(fixture(t, "git-log.txt"), "git-log", Options{MaxLines: 80, PerFileLines: 20, Command: []string{"git", "log"}})
	for _, expected := range []string{"Add deterministic test output compression", "Ada Developer", "Collapse passing test details", "body lines omitted"} {
		if !strings.Contains(result.Output, expected) {
			t.Errorf("git log output missing %q:\n%s", expected, result.Output)
		}
	}
}

func TestNpmPreservesVulnerabilityAuditSummary(t *testing.T) {
	raw := "npm install\nadded 515 packages, and audited 516 packages in 20s\n141 packages are looking for funding\n7 vulnerabilities (2 moderate, 5 high)\n"
	result := Apply(raw, "npm", Options{MaxLines: 20, Command: []string{"npm", "install"}})

	for _, expected := range []string{"added 515 packages, and audited 516 packages in 20s", "7 vulnerabilities (2 moderate, 5 high)"} {
		if !strings.Contains(result.Output, expected) {
			t.Errorf("npm output missing %q:\n%s", expected, result.Output)
		}
	}
}

func TestAutoDetectionCoversCommandFamilies(t *testing.T) {
	tests := map[string]Kind{
		"git status":  Detect([]string{"git", "status"}),
		"git branch":  Detect([]string{"git", "branch"}),
		"npm install": Detect([]string{"npm", "install"}),
		"npm test":    Detect([]string{"npm", "test"}),
		"go test":     Detect([]string{"go", "test", "./..."}),
		"docker ps":   Detect([]string{"docker", "ps"}),
		"kubectl get": Detect([]string{"kubectl", "get", "pods"}),
		"gh pr":       Detect([]string{"gh", "pr", "list"}),
		"rg":          Detect([]string{"rg", "TODO", "src"}),
	}
	want := map[string]Kind{"git status": "git-status", "git branch": "git-list", "npm install": "npm", "npm test": "test", "go test": "test", "docker ps": "docker", "kubectl get": "kubectl", "gh pr": "gh", "rg": "rg"}
	for name, got := range tests {
		if got != want[name] {
			t.Errorf("%s = %q, want %q", name, got, want[name])
		}
	}
}

func TestFiltersNeverClaimSavingsWhenOutputGrows(t *testing.T) {
	raw := "short"
	result := Apply(raw, "log", Options{MaxLines: 20})
	if measurement := metrics.Measure(raw, result.Output); measurement.OutputBytes > measurement.RawBytes {
		t.Fatalf("output grew: %#v", measurement)
	}
	if !strings.Contains(result.Output, "short") {
		t.Fatalf("output = %q", result.Output)
	}
}
