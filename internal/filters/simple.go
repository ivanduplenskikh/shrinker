package filters

import (
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

var findErrorPattern = regexp.MustCompile(`(?i)permission denied|no such file|cannot access|find:`)

func Apply(input string, requested Kind, options Options) Result {
	kind := requested
	if kind == KindAuto {
		kind = Detect(options.Command)
	}
	switch kind {
	case "cat":
		return lineLimited(input, kind, options)
	case "tail":
		return applyGenericLog(input, kind, options)
	case "find":
		return applyFind(input, options)
	case "rg":
		return applyRg(input, options)
	case "git-list":
		return applyGitList(input, options)
	default:
		result := applyGenericLog(input, kind, options)
		result.Kind = kind
		return result
	}
}

func Detect(command []string) Kind {
	if len(command) == 0 {
		return KindLog
	}
	executable := strings.ToLower(strings.TrimSuffix(filepath.Base(command[0]), ".exe"))
	if executable == "git" {
		for index := 1; index < len(command); index++ {
			part := command[index]
			if part == "-C" || part == "-c" || part == "--git-dir" || part == "--work-tree" || part == "--namespace" {
				index++
				continue
			}
			if strings.HasPrefix(part, "-") {
				continue
			}
			switch strings.ToLower(part) {
			case "status":
				return "git-status"
			case "log", "reflog":
				return "git-log"
			case "diff", "show":
				return "git-diff"
			default:
				return "git-list"
			}
		}
	}
	switch executable {
	case "tail":
		return "tail"
	case "find":
		return "find"
	case "rg", "ripgrep":
		return "rg"
	case "cat":
		return "cat"
	}
	return KindLog
}

func lineLimited(input string, kind Kind, options Options) Result {
	lines := strings.Split(formatting.CleanText(input), "\n")
	limited, omitted := formatting.LimitLines(lines, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: kind, Omitted: omitted > 0}
}

func applyGitList(input string, options Options) Result {
	lines := strings.Split(formatting.CleanText(input), "\n")
	nonEmpty := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			nonEmpty = append(nonEmpty, strings.Replace(line, "* ", "current: ", 1))
		}
	}
	if len(nonEmpty) == 0 {
		return Result{Output: formatting.CleanText(input), Kind: "git-list"}
	}
	limited, omitted := formatting.LimitLines(nonEmpty, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "git-list", Omitted: omitted > 0}
}

func applyFind(input string, options Options) Result {
	lines := strings.Split(formatting.CleanText(input), "\n")
	paths, errs := []string{}, []string{}
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if findErrorPattern.MatchString(line) {
			errs = append(errs, line)
		} else {
			paths = append(paths, line)
		}
	}
	if len(paths) == 0 && len(errs) == 0 {
		return Result{Kind: "find"}
	}
	counts := map[string]int{}
	for _, name := range paths {
		directory := filepath.ToSlash(filepath.Dir(name))
		if directory == "." || directory == "" {
			directory = "."
		}
		counts[directory]++
	}
	type pair struct {
		name  string
		count int
	}
	top := make([]pair, 0, len(counts))
	for name, count := range counts {
		top = append(top, pair{name, count})
	}
	sort.Slice(top, func(i, j int) bool {
		return top[i].count > top[j].count || (top[i].count == top[j].count && top[i].name < top[j].name)
	})
	if len(top) > 8 {
		top = top[:8]
	}
	output := []string{"paths: " + strconv.Itoa(len(paths))}
	if len(top) > 0 {
		output = append(output, "top directories:")
		for _, item := range top {
			output = append(output, "  "+item.name+" ("+strconv.Itoa(item.count)+")")
		}
	}
	if len(errs) > 0 {
		output = append(output, "errors: "+strconv.Itoa(len(errs)))
		visible := min(len(errs), max(1, options.PerFileLines))
		for _, line := range errs[:visible] {
			output = append(output, "  "+line)
		}
		if visible < len(errs) {
			output = append(output, "  ... "+strconv.Itoa(len(errs)-visible)+" error lines omitted ...")
		}
	}
	output = append(output, "sample paths:")
	visible := min(len(paths), max(1, options.PerFileLines))
	for _, name := range paths[:visible] {
		output = append(output, "  "+name)
	}
	if visible < len(paths) {
		output = append(output, "  ... "+strconv.Itoa(len(paths)-visible)+" paths omitted ...")
	}
	limited, lineOmitted := formatting.LimitLines(output, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "find", Omitted: len(paths) > options.PerFileLines || len(errs) > options.PerFileLines || lineOmitted > 0}
}

func applyRg(input string, options Options) Result {
	cleaned := formatting.CleanText(input)
	if hasStructuredOption(options.Command) {
		return Result{Output: cleaned, Kind: "rg"}
	}
	pattern := regexp.MustCompile(`^(.+?):(\d+):(.*)$`)
	type match struct {
		line int
		text string
	}
	byFile := map[string][]match{}
	parseable := 0
	for _, line := range strings.Split(cleaned, "\n") {
		parts := pattern.FindStringSubmatch(line)
		if len(parts) != 4 {
			continue
		}
		lineNumber, err := strconv.Atoi(parts[2])
		if err != nil || lineNumber <= 0 {
			continue
		}
		byFile[parts[1]] = append(byFile[parts[1]], match{lineNumber, strings.TrimSpace(parts[3])})
		parseable++
	}
	if parseable == 0 {
		return Result{Output: cleaned, Kind: "rg"}
	}
	files := make([]string, 0, len(byFile))
	for name := range byFile {
		files = append(files, name)
	}
	sort.Slice(files, func(i, j int) bool { return len(byFile[files[i]]) > len(byFile[files[j]]) })
	output := []string{"matches: " + strconv.Itoa(parseable) + " in " + strconv.Itoa(len(files)) + " files"}
	omitted := 0
	for _, name := range files {
		matches := byFile[name]
		output = append(output, name+" ("+strconv.Itoa(len(matches))+")")
		visible := min(len(matches), max(1, options.PerFileLines))
		for _, item := range matches[:visible] {
			output = append(output, "  "+strconv.Itoa(item.line)+": "+item.text)
		}
		if visible < len(matches) {
			hidden := len(matches) - visible
			omitted += hidden
			output = append(output, "  ... "+strconv.Itoa(hidden)+" matches omitted ...")
		}
	}
	limited, lineOmitted := formatting.LimitLines(output, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "rg", Omitted: omitted > 0 || lineOmitted > 0}
}

func hasStructuredOption(command []string) bool {
	for _, part := range command {
		if part == "--json" || strings.HasPrefix(part, "--json=") {
			return true
		}
	}
	return false
}
func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}
func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}
