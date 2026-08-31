package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const blockStart = "# >>> shrinker integration >>>"
const blockEnd = "# <<< shrinker integration <<<"
const rulesStart = "<!-- shrinker agent rules start -->"
const rulesEnd = "<!-- shrinker agent rules end -->"

func main() {
	if len(os.Args) < 2 {
		usage()
		return
	}
	switch os.Args[1] {
	case "install":
		install(os.Args[2:])
	case "uninstall":
		uninstall(os.Args[2:])
	case "help", "--help", "-h":
		usage()
	default:
		fail("unknown installer command: " + os.Args[1])
	}
}

func install(args []string) {
	flags := flag.NewFlagSet("install", flag.ExitOnError)
	local := flags.Bool("local", false, "build from the current checkout")
	version := flags.String("version", "", "release version")
	releaseRepo := flags.String("release-repo", "ivanduplenskikh/shrinker", "GitHub repository")
	assetBaseURL := flags.String("asset-base-url", "", "release asset base URL")
	archivePath := flags.String("archive", "", "use a downloaded release archive")
	_ = flags.Parse(args)
	root, err := os.Getwd()
	if err != nil {
		fail(err.Error())
	}
	installDir := defaultInstallDir()
	binDir := filepath.Join(installDir, "bin")
	installedVersion := "local build"
	if err := os.MkdirAll(binDir, 0o700); err != nil {
		fail(err.Error())
	}
	binary := filepath.Join(binDir, "shrinker")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	if !*local {
		archive := *archivePath
		if archive == "" {
			archive, err = downloadRelease(*releaseRepo, *version, *assetBaseURL)
			if err != nil {
				fail(err.Error())
			}
			defer os.Remove(archive)
		}
		staging, err := os.MkdirTemp("", "shrinker-install-")
		if err != nil {
			fail(err.Error())
		}
		defer os.RemoveAll(staging)
		if err := extractArchive(archive, staging); err != nil {
			fail(err.Error())
		}
		stopDashboardServer()
		if err := copyFileWithRetry(filepath.Join(staging, "bin", filepath.Base(binary)), binary); err != nil {
			fail(err.Error())
		}
		for _, relative := range []string{"integrations", "templates", "manifest.json"} {
			source := filepath.Join(staging, relative)
			if fileExists(source) {
				if err := copyTree(source, filepath.Join(installDir, relative)); err != nil {
					fail(err.Error())
				}
			}
		}
		root = installDir
		if version, err := installedManifestVersion(filepath.Join(installDir, "manifest.json")); err == nil {
			installedVersion = version
		}
	}
	if *local {
		if !fileExists(filepath.Join(root, "go.mod")) {
			fail("local installation must be run from a Go checkout")
		}
		command := exec.Command("go", "build", "-ldflags=-s -w", "-o", binary, "./cmd/shrinker")
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr
		if err := command.Run(); err != nil {
			fail("Go build failed: " + err.Error())
		}
	}
	if err := removeLegacyProfileIntegrations(profilePaths()); err != nil {
		fail(err.Error())
	}
	if err := addUserPath(binDir); err != nil {
		fail(err.Error())
	}
	if runtime.GOOS != "windows" {
		if err := addPath(defaultProfile(), binDir); err != nil {
			fail(err.Error())
		}
	}
	body, err := os.ReadFile(filepath.Join(root, "templates", "agent-rules.md"))
	if err != nil {
		fail(err.Error())
	}
	if err := installRules(string(body)); err != nil {
		fail(err.Error())
	}
	fmt.Printf("Installed shrinker %s at %s\n", installedVersion, binary)
	if err := startDashboard(binary); err != nil {
		fmt.Fprintf(os.Stderr, "[shrinker] could not start dashboard server: %v\n", err)
		return
	}
	fmt.Println("Dashboard server running at http://127.0.0.1:4317")
}

func startDashboard(binary string) error {
	command := dashboardServerCommand(binary)
	return command.Start()
}

func dashboardServerCommand(binary string) *exec.Cmd {
	command := exec.Command(binary, "stats", "--dashboard", "--dashboard-server")
	command.Stdin = nil
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	return command
}

func installedManifestVersion(path string) (string, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var release struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(contents, &release); err != nil {
		return "", err
	}
	if release.Version == "" {
		return "", errors.New("release manifest is missing a version")
	}
	return "v" + strings.TrimPrefix(release.Version, "v"), nil
}

func uninstall(args []string) {
	flags := flag.NewFlagSet("uninstall", flag.ExitOnError)
	flags.Parse(args)
	binDir := filepath.Join(defaultInstallDir(), "bin")
	for _, profilePath := range profilePaths() {
		if err := removeBlock(profilePath, pathBlockStart(), pathBlockEnd()); err != nil {
			fail(err.Error())
		}
		if err := removeBlock(profilePath, blockStart, blockEnd); err != nil {
			fail(err.Error())
		}
	}
	stopDashboardServer()
	if err := removeAllWithRetry(binDir); err != nil {
		fail(err.Error())
	}
	fmt.Printf("Removed shrinker from %s\n", binDir)
}

func stopDashboardServer() {
	requestDashboardShutdown("http://127.0.0.1:4317/__shrinker_shutdown")
}

func requestDashboardShutdown(endpoint string) {
	request, err := http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		return
	}
	response, err := (&http.Client{Timeout: 2 * time.Second}).Do(request)
	if err == nil {
		response.Body.Close()
	}
}

func removeAllWithRetry(path string) error {
	var err error
	for attempt := 0; attempt < 20; attempt++ {
		err = os.RemoveAll(path)
		if err == nil || !errors.Is(err, fs.ErrPermission) {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return err
}

func installRules(body string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	for _, path := range []string{filepath.Join(home, ".copilot", "copilot-instructions.md"), filepath.Join(home, ".claude", "CLAUDE.md")} {
		if err := replaceBlock(path, rulesStart, rulesEnd, rulesStart+"\n"+body+"\n"+rulesEnd); err != nil {
			return err
		}
	}
	return nil
}

func addPath(path, directory string) error {
	return replaceBlock(path, pathBlockStart(), pathBlockEnd(), pathBlockStart()+"\n"+pathExport(directory)+"\n"+pathBlockEnd())
}
func replaceBlock(path, start, end, block string) error {
	contents, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	text := string(contents)
	if i := strings.Index(text, start); i >= 0 {
		if j := strings.Index(text[i:], end); j >= 0 {
			text = text[:i] + block + text[i+j+len(end):]
		}
	}
	if !strings.Contains(text, block) {
		text = strings.TrimRight(text, "\n") + "\n\n" + block + "\n"
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(text), 0o600)
}
func removeBlock(path, start, end string) error {
	contents, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	text := string(contents)
	for {
		i := strings.Index(text, start)
		if i < 0 {
			break
		}
		j := strings.Index(text[i:], end)
		if j < 0 {
			break
		}
		text = text[:i] + text[i+j+len(end):]
	}
	return os.WriteFile(path, []byte(strings.TrimLeft(text, "\n")), 0o600)
}
func removeLegacyProfileIntegrations(paths []string) error {
	for _, path := range paths {
		if err := removeBlock(path, blockStart, blockEnd); err != nil {
			return err
		}
	}
	return nil
}
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o700); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func copyFileWithRetry(src, dst string) error {
	var err error
	for attempt := 0; attempt < 20; attempt++ {
		err = copyFile(src, dst)
		if err == nil || runtime.GOOS != "windows" || !errors.Is(err, fs.ErrPermission) {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return err
}

func downloadRelease(repo, version, base string) (string, error) {
	target := "linux-x64"
	if runtime.GOOS == "windows" {
		target = "win-x64"
	} else if runtime.GOOS == "darwin" {
		if runtime.GOARCH == "arm64" {
			target = "macos-arm64"
		} else {
			target = "macos-x64"
		}
	}
	extension := ".tar.gz"
	if runtime.GOOS == "windows" {
		extension = ".zip"
	}
	asset := "shrinker-" + target + extension
	url := strings.TrimRight(base, "/") + "/" + asset
	if base == "" {
		url = "https://github.com/" + repo + "/releases/latest/download/" + asset
		if version != "" {
			url = "https://github.com/" + repo + "/releases/download/v" + strings.TrimPrefix(version, "v") + "/" + asset
		}
	}
	client := &http.Client{Timeout: 2 * time.Minute}
	response, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("release download failed: %s", response.Status)
	}
	output, err := os.CreateTemp("", "shrinker-"+target+"-*"+extension)
	if err != nil {
		return "", err
	}
	path := output.Name()
	defer output.Close()
	if _, err = io.Copy(output, response.Body); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

func archiveTarget(destination, name string) (string, error) {
	normalizedName := strings.ReplaceAll(name, `\`, "/")
	cleanName := filepath.Clean(filepath.FromSlash(normalizedName))
	if cleanName == "." || filepath.IsAbs(cleanName) || strings.HasPrefix(normalizedName, "/") {
		return "", fmt.Errorf("unsafe archive path: %s", name)
	}
	target := filepath.Join(destination, cleanName)
	relative, err := filepath.Rel(destination, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("unsafe archive path: %s", name)
	}
	return target, nil
}

func extractArchive(path, destination string) error {
	if strings.HasSuffix(path, ".zip") {
		archive, err := zip.OpenReader(path)
		if err != nil {
			return err
		}
		defer archive.Close()
		for _, entry := range archive.File {
			if entry.Mode()&os.ModeSymlink != 0 || entry.Mode()&os.ModeNamedPipe != 0 || entry.Mode()&os.ModeSocket != 0 || entry.Mode()&os.ModeDevice != 0 {
				return fmt.Errorf("unsupported archive entry: %s", entry.Name)
			}
			target, err := archiveTarget(destination, entry.Name)
			if err != nil {
				return err
			}
			if entry.FileInfo().IsDir() {
				if err := os.MkdirAll(target, 0o700); err != nil {
					return err
				}
				continue
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				return err
			}
			input, err := entry.Open()
			if err != nil {
				return err
			}
			output, err := os.Create(target)
			if err == nil {
				_, err = io.Copy(output, input)
				output.Close()
			}
			input.Close()
			if err != nil {
				return err
			}
		}
		return nil
	}
	input, err := os.Open(path)
	if err != nil {
		return err
	}
	defer input.Close()
	compressed, err := gzip.NewReader(input)
	if err != nil {
		return err
	}
	defer compressed.Close()
	archive := tar.NewReader(compressed)
	for {
		header, err := archive.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA && header.Typeflag != tar.TypeDir {
			return fmt.Errorf("unsupported archive entry: %s", header.Name)
		}
		target, err := archiveTarget(destination, header.Name)
		if err != nil {
			return err
		}
		if header.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o700); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(header.Mode)&0o777)
		if err != nil {
			return err
		}
		_, err = io.Copy(output, archive)
		output.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func copyTree(source, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if err := os.MkdirAll(destination, 0o700); err != nil {
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
	return copyFile(source, destination)
}
func fileExists(path string) bool { _, err := os.Stat(path); return err == nil }
func defaultInstallDir() string   { home, _ := os.UserHomeDir(); return filepath.Join(home, ".shrinker") }
func defaultProfile() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		if profile := powerShellProfile("powershell"); profile != "" {
			return profile
		}
		if value := os.Getenv("PROFILE"); value != "" {
			return value
		}
		return filepath.Join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
	}
	return filepath.Join(home, ".zshrc")
}
func profilePaths() []string {
	paths := []string{defaultProfile(), bashProfilePath()}
	if runtime.GOOS == "windows" {
		home, _ := os.UserHomeDir()
		paths = append(paths,
			powerShellProfile("powershell"),
			powerShellProfile("pwsh"),
			filepath.Join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
			filepath.Join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
		)
	}
	return uniquePaths(paths)
}
func powerShellProfile(executable string) string {
	output, err := exec.Command(executable, "-NoProfile", "-Command", "$PROFILE").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}
func uniquePaths(paths []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, path := range paths {
		if path != "" && !seen[path] {
			seen[path] = true
			result = append(result, path)
		}
	}
	return result
}
func bashProfilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".bashrc")
}
func pathBlockStart() string { return "# >>> shrinker path >>>" }
func pathBlockEnd() string   { return "# <<< shrinker path <<<" }
func pathExport(directory string) string {
	if runtime.GOOS == "windows" {
		return "$env:Path = \"" + directory + ";\" + $env:Path"
	}
	return "export PATH=\"" + directory + ":$PATH\""
}

func addUserPath(directory string) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	current := os.Getenv("Path")
	for _, entry := range strings.Split(current, string(os.PathListSeparator)) {
		if strings.EqualFold(entry, directory) {
			return nil
		}
	}
	userPath, err := exec.Command("powershell", "-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('Path','User')").Output()
	if err != nil {
		return err
	}
	entries := strings.Split(strings.TrimSpace(string(userPath)), string(os.PathListSeparator))
	for _, entry := range entries {
		if strings.EqualFold(entry, directory) {
			os.Setenv("Path", directory+string(os.PathListSeparator)+current)
			return nil
		}
	}
	entries = append([]string{directory}, entries...)
	command := exec.Command("powershell", "-NoProfile", "-Command", "$p="+quotePowerShell(strings.Join(entries, string(os.PathListSeparator)))+"; [Environment]::SetEnvironmentVariable('Path',$p,'User')")
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("could not update user PATH: %s", strings.TrimSpace(string(output)))
	}
	os.Setenv("Path", directory+string(os.PathListSeparator)+current)
	return nil
}

func quotePowerShell(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }
func usage() {
	fmt.Println("Usage: installer install [--local | --archive <path>] | installer uninstall\n\nOptions: --version --archive")
}
func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
