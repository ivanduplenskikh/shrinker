package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type targetSpec struct {
	name      string
	goos      string
	goarch    string
	extension string
}

type manifest struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Target  string `json:"target"`
}

var targets = map[string]targetSpec{
	"win-x64":     {name: "win-x64", goos: "windows", goarch: "amd64", extension: ".zip"},
	"macos-arm64": {name: "macos-arm64", goos: "darwin", goarch: "arm64", extension: ".tar.gz"},
	"macos-x64":   {name: "macos-x64", goos: "darwin", goarch: "amd64", extension: ".tar.gz"},
	"linux-x64":   {name: "linux-x64", goos: "linux", goarch: "amd64", extension: ".tar.gz"},
}

func main() {
	target, version, err := parseArgs(os.Args[1:])
	if err != nil {
		fail(err)
	}
	if err := packageRelease(target, version); err != nil {
		fail(err)
	}
}

func parseArgs(args []string) (targetSpec, string, error) {
	var targetName, version string
	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--target":
			if index+1 >= len(args) || args[index+1] == "" {
				return targetSpec{}, "", errors.New("--target requires a value")
			}
			targetName = args[index+1]
			index++
		case "--version":
			if index+1 >= len(args) || args[index+1] == "" {
				return targetSpec{}, "", errors.New("--version requires a value")
			}
			version = strings.TrimPrefix(args[index+1], "v")
			index++
		default:
			return targetSpec{}, "", fmt.Errorf("unknown option: %s", args[index])
		}
	}
	if targetName == "" {
		return targetSpec{}, "", errors.New("--target is required")
	}
	target, ok := targets[targetName]
	if !ok {
		return targetSpec{}, "", fmt.Errorf("unsupported target %q", targetName)
	}
	if version == "" {
		return targetSpec{}, "", errors.New("--version is required")
	}
	return target, version, nil
}

func packageRelease(target targetSpec, version string) error {
	staging, err := os.MkdirTemp("", "shrinker-release-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)

	binaryName := "shrinker"
	if target.goos == "windows" {
		binaryName += ".exe"
	}
	binaryPath := filepath.Join(staging, "bin", binaryName)
	if err := os.MkdirAll(filepath.Dir(binaryPath), 0o755); err != nil {
		return err
	}
	command := exec.Command("go", "build", "-ldflags=-s -w", "-o", binaryPath, "./cmd/shrinker")
	command.Env = append(os.Environ(), "GOOS="+target.goos, "GOARCH="+target.goarch, "CGO_ENABLED=0")
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("build %s: %w", target.name, err)
	}
	if target.goos != "windows" {
		if err := os.Chmod(binaryPath, 0o755); err != nil {
			return err
		}
	}
	for _, directory := range []string{"integrations", "templates"} {
		if err := copyTree(directory, filepath.Join(staging, directory)); err != nil {
			return err
		}
	}
	manifestBytes, err := json.MarshalIndent(manifest{Name: "shrinker", Version: version, Target: target.name}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(staging, "manifest.json"), append(manifestBytes, '\n'), 0o644); err != nil {
		return err
	}

	output := filepath.Join("release", "shrinker-"+target.name+target.extension)
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		return err
	}
	if err := os.Remove(output); err != nil && !os.IsNotExist(err) {
		return err
	}
	if target.extension == ".zip" {
		err = writeZip(output, staging)
	} else {
		err = writeTarGz(output, staging)
	}
	if err != nil {
		return err
	}
	fmt.Printf("Created %s\n", output)
	return nil
}

func copyTree(source, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if err := os.MkdirAll(destination, info.Mode().Perm()); err != nil {
			return err
		}
		entries, err := os.ReadDir(source)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := copyTree(filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return err
			}
		}
		return nil
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	if _, err := io.Copy(output, input); err != nil {
		output.Close()
		return err
	}
	return output.Close()
}

func filesIn(root string) ([]string, error) {
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)
	return files, err
}

func writeZip(path, root string) error {
	output, err := os.Create(path)
	if err != nil {
		return err
	}
	defer output.Close()
	writer := zip.NewWriter(output)
	files, err := filesIn(root)
	if err != nil {
		return err
	}
	for _, file := range files {
		relative, err := filepath.Rel(root, file)
		if err != nil {
			return err
		}
		entry, err := writer.Create(filepath.ToSlash(relative))
		if err != nil {
			return err
		}
		input, err := os.Open(file)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(entry, input)
		closeErr := input.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return writer.Close()
}

func writeTarGz(path, root string) error {
	output, err := os.Create(path)
	if err != nil {
		return err
	}
	compressed := gzip.NewWriter(output)
	writer := tar.NewWriter(compressed)
	files, err := filesIn(root)
	if err != nil {
		return err
	}
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, file)
		if err != nil {
			return err
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relative)
		if err := writer.WriteHeader(header); err != nil {
			return err
		}
		input, err := os.Open(file)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(writer, input)
		closeErr := input.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}
	if err := compressed.Close(); err != nil {
		return err
	}
	return output.Close()
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(2)
}
