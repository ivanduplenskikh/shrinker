package config

import (
	"os"
	"path/filepath"
	"strings"
)

func DefaultPath() string {
	if configured := os.Getenv("SHRINKER_CONFIG_PATH"); configured != "" {
		return configured
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".shrinker", "config")
	}
	return filepath.Join(home, ".shrinker", "config")
}

func Read(path string) map[string]string {
	settings := make(map[string]string)
	contents, err := os.ReadFile(path)
	if err != nil {
		return settings
	}
	for _, line := range strings.Split(string(contents), "\n") {
		withoutComment := strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		separator := strings.IndexByte(withoutComment, '=')
		if separator <= 0 {
			continue
		}
		key := strings.TrimSpace(withoutComment[:separator])
		if key != "" {
			settings[key] = strings.TrimSpace(withoutComment[separator+1:])
		}
	}
	return settings
}

func ResolveSetting(key, path string) string {
	if value, ok := os.LookupEnv(key); ok && strings.TrimSpace(value) != "" {
		return value
	}
	return Read(path)[key]
}

func Set(key, value, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	contents, _ := os.ReadFile(path)
	lines := strings.Split(string(contents), "\n")
	replaced := false
	next := make([]string, 0, len(lines)+1)
	for _, line := range lines {
		withoutComment := strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		separator := strings.IndexByte(withoutComment, '=')
		existingKey := ""
		if separator > 0 {
			existingKey = strings.TrimSpace(withoutComment[:separator])
		}
		if existingKey == key {
			replaced = true
			next = append(next, key+"="+value)
		} else if line != "" || len(lines) > 1 {
			next = append(next, line)
		}
	}
	if !replaced {
		next = append(next, key+"="+value)
	}
	return os.WriteFile(path, []byte(strings.Join(next, "\n")+"\n"), 0o600)
}

func IsTruthy(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}
