package filters

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

var importantOutput = regexp.MustCompile(`(?i)\b(error|failed|failure|fatal|warning?|exception|panic)\b`)
var tableHeaderPattern = regexp.MustCompile(`\S\s{2,}\S`)
var npmImportantPattern = regexp.MustCompile(`(?i)\b(added|removed|changed|audited|vulnerabilit|packages?|dependencies|found 0 vulnerabilities)\b`)
var npmNoisePattern = regexp.MustCompile(`(?i)^(npm\s+(notice|timing|http|verb)\s+|[|/\\-]+$|\d+%$)`)
var testFailurePattern = regexp.MustCompile(`(?i)\b(expected|received|assert(?:ion)?|not ok)\b`)
var testPassingPattern = regexp.MustCompile(`(?i)^\s*(✓|✔|ok\b|pass(?:ed)?\b|\.{2,})`)
var testSummaryPattern = regexp.MustCompile(`(?i)\b(tests?|suites?|passed|failed|skipped|duration|time|snapshots?|collected)\b`)
var gitStatusPattern = regexp.MustCompile(`(?i)^(modified|new file|deleted|renamed|copied|both modified|added by us|deleted by them):\s+(.+)$`)

func compactTable(input string, options Options, kind Kind) Result {
	lines := nonEmptyLines(input)
	if len(lines) < 2 || !tableHeaderPattern.MatchString(lines[0]) {
		return Result{Output: formatting.CleanText(input), Kind: kind}
	}
	rowLimit := max(1, options.MaxLines-2)
	visible := lines[1:]
	omitted := 0
	if len(visible) > rowLimit {
		omitted = len(visible) - rowLimit
		visible = visible[:rowLimit]
	}
	output := append([]string{lines[0]}, visible...)
	if omitted > 0 {
		output = append(output, "... "+strconv.Itoa(omitted)+" rows omitted ...")
	}
	return Result{Output: strings.Join(output, "\n"), Kind: kind, Omitted: omitted > 0}
}

func applyNpm(input string, options Options) Result {
	noise := 0
	kept := []string{}
	for _, line := range nonEmptyLines(input) {
		lower := strings.ToLower(line)
		if importantOutput.MatchString(line) || npmImportantPattern.MatchString(line) {
			kept = append(kept, line)
			continue
		}
		if npmNoisePattern.MatchString(lower) {
			noise++
			continue
		}
	}
	if noise > 0 {
		kept = append([]string{"[" + strconv.Itoa(noise) + " npm noise lines collapsed]"}, kept...)
	}
	if len(kept) == 0 {
		return Result{Output: formatting.CleanText(input), Kind: "npm"}
	}
	limited, lineOmitted := formatting.LimitLines(kept, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "npm", Omitted: noise > 0 || lineOmitted > 0 || len(kept) < len(nonEmptyLines(input))}
}

func applyTest(input string, options Options) Result {
	passing := 0
	kept := []string{}
	inFailure, context := false, 0
	for _, line := range strings.Split(formatting.CleanText(input), "\n") {
		if importantOutput.MatchString(line) || testFailurePattern.MatchString(line) {
			inFailure = true
			context = 8
			kept = append(kept, line)
			continue
		}
		if inFailure && context > 0 {
			if strings.TrimSpace(line) != "" || context >= 6 {
				kept = append(kept, line)
			}
			context--
			if context == 0 {
				inFailure = false
			}
			continue
		}
		if testPassingPattern.MatchString(line) {
			passing++
			continue
		}
		if testSummaryPattern.MatchString(line) {
			kept = append(kept, line)
		}
	}
	if passing > 0 {
		kept = append([]string{"[" + strconv.Itoa(passing) + " passing-detail lines collapsed]"}, kept...)
	}
	if len(kept) == 0 {
		return Result{Output: formatting.CleanText(input), Kind: "test"}
	}
	limited, lineOmitted := formatting.LimitLines(kept, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "test", Omitted: passing > 0 || lineOmitted > 0}
}

func applyGitStatus(input string, options Options) Result {
	sections := map[string][]string{}
	branch := []string{}
	section := ""
	for _, raw := range strings.Split(formatting.CleanText(input), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "(") || strings.HasPrefix(line, "no changes added") || strings.HasPrefix(line, "nothing to commit") {
			continue
		}
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "changes to be committed:"):
			section = "staged"
		case strings.HasPrefix(lower, "changes not staged for commit:"):
			section = "unstaged"
		case strings.HasPrefix(lower, "untracked files:"):
			section = "untracked"
		case strings.HasPrefix(lower, "unmerged paths:"):
			section = "conflicts"
		case strings.HasPrefix(line, "On branch "):
			branch = append(branch, strings.Replace(line, "On branch ", "branch: ", 1))
		case strings.HasPrefix(line, "Your branch "), strings.HasPrefix(line, "HEAD detached"):
			branch = append(branch, line)
		default:
			if gitStatusPattern.MatchString(line) {
				sections[sectionOrChanged(section)] = append(sections[sectionOrChanged(section)], line)
			} else if section == "untracked" {
				sections[section] = append(sections[section], line)
			}
		}
	}
	output := append([]string{}, branch...)
	for _, name := range []string{"staged", "unstaged", "untracked", "conflicts", "changed"} {
		if files := sections[name]; len(files) > 0 {
			output = append(output, name+" ("+strconv.Itoa(len(files))+"):")
			for _, file := range files {
				output = append(output, "  "+file)
			}
		}
	}
	if len(output) == 0 {
		return Result{Output: formatting.CleanText(input), Kind: "git-status"}
	}
	limited, omitted := formatting.LimitLines(output, options.MaxLines)
	return Result{Output: strings.Join(limited, "\n"), Kind: "git-status", Omitted: omitted > 0}
}

func sectionOrChanged(section string) string {
	if section == "" {
		return "changed"
	}
	return section
}
func nonEmptyLines(input string) []string {
	result := []string{}
	for _, line := range strings.Split(formatting.CleanText(input), "\n") {
		if strings.TrimSpace(line) != "" {
			result = append(result, line)
		}
	}
	return result
}
