package filters

import (
	"regexp"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

func applyGitDiff(input string, options Options) Result {
	lines := strings.Split(formatting.CleanText(input), "\n")
	output := []string{}
	files, additions, deletions := 0, 0, 0
	for _, line := range lines {
		if strings.HasPrefix(line, "diff --git ") {
			files++
			output = append(output, line)
			continue
		}
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			additions++
			output = append(output, line)
			continue
		}
		if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
			deletions++
			output = append(output, line)
			continue
		}
		if strings.HasPrefix(line, "@@") {
			output = append(output, line)
		}
	}
	if files == 0 {
		return Result{Output: strings.Join(lines, "\n"), Kind: "git-diff"}
	}
	limited, omitted := formatting.LimitLines(output, options.MaxLines)
	_ = additions
	_ = deletions
	return Result{Output: strings.Join(limited, "\n"), Kind: "git-diff", Omitted: omitted > 0 || len(output) < len(lines)}
}

func applyGitLog(input string, options Options) Result {
	cleaned := formatting.CleanText(input)
	lines := strings.Split(cleaned, "\n")
	if strings.Contains(strings.Join(options.Command, " "), "--format") || strings.Contains(cleaned, "diff --git ") {
		limited, omitted := formatting.LimitLines(lines, options.MaxLines)
		return Result{Output: strings.Join(limited, "\n"), Kind: "git-log", Omitted: omitted > 0}
	}
	compact := []string{}
	current := ""
	for _, line := range lines {
		if match := regexp.MustCompile(`(?i)^commit\s+([0-9a-f]{7,40})`).FindStringSubmatch(line); len(match) > 0 {
			current = match[1]
			continue
		}
		if current != "" && strings.HasPrefix(line, "Author:") {
			continue
		}
		if current != "" && strings.HasPrefix(line, "Date:") {
			continue
		}
		trimmed := strings.TrimSpace(line)
		if current != "" && trimmed != "" {
			compact = append(compact, current[:min(10, len(current))]+" "+trimmed)
			current = ""
		}
	}
	if len(compact) == 0 {
		limited, omitted := formatting.LimitLines(lines, options.MaxLines)
		return Result{Output: strings.Join(limited, "\n"), Kind: "git-log", Omitted: omitted > 0}
	}
	limited, omitted := formatting.LimitLines(compact, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "git-log", Omitted: omitted > 0 || len(compact) < len(lines)}
}

func applyStructuredFamily(input string, options Options, kind Kind) Result {
	command := strings.Join(options.Command, " ")
	if strings.Contains(command, "--format") || strings.Contains(command, "--json") || strings.Contains(command, "--template") || strings.Contains(command, "--jq") || strings.Contains(command, "-o json") || strings.Contains(command, "-o yaml") {
		return Result{Output: formatting.CleanText(input), Kind: kind}
	}
	if kind == "docker" || kind == "gh" || strings.Contains(command, " get ") {
		table := compactTable(input, options, kind)
		if strings.Contains(table.Output, "\n") {
			return table
		}
	}
	result := applyGenericLog(input, kind, options)
	result.Kind = kind
	return result
}
