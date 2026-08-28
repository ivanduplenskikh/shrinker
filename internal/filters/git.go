package filters

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

var commitPattern = regexp.MustCompile(`(?i)^commit\s+([0-9a-f]{7,40})(?:\s+\(([^)]+)\))?`)
var authorPattern = regexp.MustCompile(`^Author:\s+(.+?)(?:\s+<[^>]+>)?$`)

func applyGitDiff(input string, options Options) Result {
	lines := strings.Split(formatting.CleanText(input), "\n")
	output := []string{}
	files := 0
	for _, line := range lines {
		if strings.HasPrefix(line, "diff --git ") {
			files++
			output = append(output, line)
			continue
		}
		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
			output = append(output, line)
			continue
		}
		if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
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
	return Result{Output: strings.Join(limited, "\n"), Kind: "git-diff", Omitted: omitted > 0 || len(output) < len(lines)}
}

func applyGitLog(input string, options Options) Result {
	cleaned := formatting.CleanText(input)
	lines := strings.Split(cleaned, "\n")
	if strings.Contains(strings.Join(options.Command, " "), "--format") || strings.Contains(cleaned, "diff --git ") {
		limited, omitted := formatting.LimitLines(lines, options.MaxLines)
		return Result{Output: strings.Join(limited, "\n"), Kind: "git-log", Omitted: omitted > 0}
	}
	type commit struct {
		hash, author, date, subject string
		body                        []string
	}
	commits := []commit{}
	current := -1
	for _, line := range lines {
		if match := commitPattern.FindStringSubmatch(line); len(match) > 0 {
			commits = append(commits, commit{hash: match[1]})
			current = len(commits) - 1
			continue
		}
		if current < 0 {
			continue
		}
		if match := authorPattern.FindStringSubmatch(line); len(match) > 0 {
			commits[current].author = strings.TrimSpace(match[1])
			continue
		}
		if strings.HasPrefix(line, "Date:") {
			date := strings.TrimSpace(strings.TrimPrefix(line, "Date:"))
			if parsed, err := time.Parse(time.RFC1123Z, date); err == nil {
				date = parsed.Format("2006-01-02")
			}
			commits[current].date = date
			continue
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if commits[current].subject == "" {
			commits[current].subject = trimmed
		} else if !strings.HasPrefix(trimmed, "Signed-off-by:") && !strings.HasPrefix(trimmed, "Co-authored-by:") {
			commits[current].body = append(commits[current].body, trimmed)
		}
	}
	compact := []string{}
	for _, item := range commits {
		if item.subject == "" {
			continue
		}
		details := []string{}
		if item.author != "" {
			details = append(details, item.author)
		}
		if item.date != "" {
			details = append(details, item.date)
		}
		header := item.hash[:min(10, len(item.hash))] + " " + item.subject
		if len(details) > 0 {
			header += " — " + strings.Join(details, ", ")
		}
		compact = append(compact, header)
		visible := min(3, len(item.body))
		compact = append(compact, item.body[:visible]...)
		if len(item.body) > visible {
			compact = append(compact, "[+"+strconv.Itoa(len(item.body)-visible)+" body lines omitted]")
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
