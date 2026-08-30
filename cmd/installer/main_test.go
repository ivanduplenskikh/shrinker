package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestArchiveTargetRejectsTraversal(t *testing.T) {
	destination := t.TempDir()
	for _, name := range []string{"../outside", "/absolute", `..\outside`} {
		if _, err := archiveTarget(destination, name); err == nil {
			t.Fatalf("archiveTarget(%q) accepted unsafe path", name)
		}
	}
	if target, err := archiveTarget(destination, "bin/shrinker"); err != nil || target != filepath.Join(destination, "bin", "shrinker") {
		t.Fatalf("archiveTarget returned %q, %v", target, err)
	}
}

func TestExtractArchiveRejectsTarSymlink(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "malicious.tar.gz")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	compressed := gzip.NewWriter(file)
	writer := tar.NewWriter(compressed)
	if err := writer.WriteHeader(&tar.Header{Name: "outside", Typeflag: tar.TypeSymlink, Linkname: "../../outside"}); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	destination := t.TempDir()
	err = extractArchive(archivePath, destination)
	if err == nil || !strings.Contains(err.Error(), "unsupported archive entry") {
		t.Fatalf("extractArchive returned unexpected error: %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(destination, "outside")); !os.IsNotExist(statErr) {
		t.Fatalf("symlink target was created: %v", statErr)
	}
}

func TestDashboardServerCommandUsesInstalledBinary(t *testing.T) {
	command := dashboardServerCommand("C:/Users/example/.shrinker/bin/shrinker.exe")
	if got, want := command.Args, []string{"C:/Users/example/.shrinker/bin/shrinker.exe", "stats", "--dashboard", "--dashboard-server"}; !sameStrings(got, want) {
		t.Fatalf("command args = %q, want %q", got, want)
	}
	if command.Stdout != io.Discard || command.Stderr != io.Discard {
		t.Fatal("dashboard server command must not hold installer output streams open")
	}
}

func TestBashProfileFile(t *testing.T) {
	if got, want := bashProfileFile(), filepath.Join("integrations", "bash", "shrinker-profile.bash"); got != want {
		t.Fatalf("bash profile file = %q, want %q", got, want)
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

func TestRequestDashboardShutdownPostsToEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/__shrinker_shutdown" {
			t.Fatalf("request = %s %s", request.Method, request.URL.Path)
		}
		writer.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	requestDashboardShutdown(server.URL + "/__shrinker_shutdown")
}

func sameStrings(left, right []string) bool {
	return strings.Join(left, "\x00") == strings.Join(right, "\x00")
}

func TestExtractArchiveRejectsZipTraversal(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "malicious.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	entry, err := writer.Create("../outside")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte("must not escape")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	destination := t.TempDir()
	err = extractArchive(archivePath, destination)
	if err == nil || !strings.Contains(err.Error(), "unsafe archive path") {
		t.Fatalf("extractArchive returned unexpected error: %v", err)
	}
}
