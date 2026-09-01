package filters

import (
	"path/filepath"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

func Apply(input string, requested Kind, options Options) Result {
	kind := requested
	if kind == KindAuto {
		kind = Detect(options.Command)
	}
	switch kind {
	case "git-status":
		return applyGitStatus(input, options)
	case "git-diff":
		return applyGitDiff(input, options)
	case "git-log":
		return applyGitLog(input, options)
	case "npm":
		return applyNpm(input, options)
	case "docker", "kubectl", "gh":
		return applyStructuredFamily(input, options, kind)
	case "test":
		return applyTest(input, options)
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
	case "npm", "pnpm", "yarn":
		for _, part := range command[1:] {
			if strings.EqualFold(part, "test") {
				return "test"
			}
		}
		return "npm"
	case "tail":
		return "tail"
	case "find":
		return "find"
	case "rg", "ripgrep":
		return "rg"
	case "cat":
		return "cat"
	case "docker":
		return "docker"
	case "kubectl":
		return "kubectl"
	case "gh":
		return "gh"
	}
	if strings.Contains(strings.ToLower(strings.Join(command, " ")), "test") {
		return "test"
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
