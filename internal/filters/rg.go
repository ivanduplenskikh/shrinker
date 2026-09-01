package filters

import (
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

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
