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
