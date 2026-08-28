package execution

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const maxRawFiles = 20

type RawCapture struct {
	ID     string
	Path   string
	Output string
}

func DefaultRawDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".shrinker", "raw")
	}
	return filepath.Join(home, ".shrinker", "raw")
}

func SaveRawOutput(output string, command []string, directory string) (RawCapture, error) {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return RawCapture{}, err
	}
	id, err := captureID()
	if err != nil {
		return RawCapture{}, err
	}
	slug := "output"
	if len(command) > 0 {
		slug = filepath.Base(command[0])
	}
	slug = regexp.MustCompile(`[^a-zA-Z0-9_-]+`).ReplaceAllString(slug, "_")
	slug = strings.Trim(slug, "_")
	if len(slug) > 60 {
		slug = slug[:60]
	}
	if slug == "" {
		slug = "output"
	}
	path := filepath.Join(directory, fmt.Sprintf("%d_%s_%s.log", time.Now().UnixMilli(), id, slug))
	temporary := fmt.Sprintf("%s.%d.tmp", path, os.Getpid())
	if err := os.WriteFile(temporary, []byte(output), 0o600); err != nil {
		return RawCapture{}, err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return RawCapture{}, err
	}
	if err := trimRawFiles(directory, path); err != nil {
		return RawCapture{}, err
	}
	return RawCapture{ID: id, Path: path, Output: output}, nil
}

func GetLatestRawOutput(directory string) (RawCapture, error) {
	captures, err := listRawCaptures(directory)
	if err != nil {
		return RawCapture{}, err
	}
	if len(captures) == 0 {
		return RawCapture{}, os.ErrNotExist
	}
	return readRawCapture(captures[len(captures)-1])
}

func GetRawOutput(id, directory string) (RawCapture, error) {
	if !regexp.MustCompile(`^[a-fA-F0-9]{8}$`).MatchString(id) {
		return RawCapture{}, os.ErrNotExist
	}
	paths, err := listRawCaptures(directory)
	if err != nil {
		return RawCapture{}, err
	}
	for _, path := range paths {
		name := filepath.Base(path)
		parts := strings.SplitN(name, "_", 3)
		if len(parts) >= 2 && strings.EqualFold(parts[1], id) {
			return readRawCapture(path)
		}
	}
	return RawCapture{}, os.ErrNotExist
}

func captureID() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func listRawCaptures(directory string) ([]string, error) {
	entries, err := os.ReadDir(directory)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	type capturePath struct {
		path string
		info os.FileInfo
	}
	captures := make([]capturePath, 0, len(entries))
	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".log") {
			path := filepath.Join(directory, entry.Name())
			info, err := entry.Info()
			if err != nil {
				return nil, err
			}
			captures = append(captures, capturePath{path: path, info: info})
		}
	}
	sort.Slice(captures, func(left, right int) bool {
		if captures[left].info.ModTime().Equal(captures[right].info.ModTime()) {
			return captures[left].path < captures[right].path
		}
		return captures[left].info.ModTime().Before(captures[right].info.ModTime())
	})
	paths := make([]string, len(captures))
	for index, capture := range captures {
		paths[index] = capture.path
	}
	return paths, nil
}

func readRawCapture(path string) (RawCapture, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return RawCapture{}, err
	}
	parts := strings.SplitN(filepath.Base(path), "_", 3)
	if len(parts) < 2 {
		return RawCapture{}, fmt.Errorf("invalid raw capture filename: %s", path)
	}
	return RawCapture{ID: parts[1], Path: path, Output: string(contents)}, nil
}

func trimRawFiles(directory, keep string) error {
	paths, err := listRawCaptures(directory)
	if err != nil {
		return err
	}
	for len(paths) > maxRawFiles {
		if paths[0] != keep {
			if err := os.Remove(paths[0]); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		paths = paths[1:]
	}
	return nil
}
