package filters

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/formatting"
)

var progressPattern = regexp.MustCompile(`(?i)^(?:\s*\d{1,3}%|progress\b|downloading\b|uploading\b|building\b|compiling\b|waiting\b|\.{3,}|[=\-#>.]{8,})`)
var importantPattern = regexp.MustCompile(`(?i)\b(error|failed|failure|fatal|warning?|exception|panic)\b`)

func Apply(input string, requested Kind, options Options) Result {
	cleaned := formatting.CleanText(input)
	lines := strings.Split(cleaned, "\n")
	compact := make([]string, 0, len(lines))
	progressLines := 0
	for index := 0; index < len(lines); {
		line := lines[index]
		count := 1
		for index+count < len(lines) && lines[index+count] == line {
			count++
		}
		if progressPattern.MatchString(line) && !importantPattern.MatchString(line) {
			progressLines += count
		} else if count >= 3 {
			compact = append(compact, line+" [repeated "+itoa(count)+"x]")
		} else {
			compact = append(compact, lines[index:index+count]...)
		}
		index += count
	}
	if progressLines > 0 {
		compact = append([]string{"[" + itoa(progressLines) + " progress lines collapsed]"}, compact...)
	}
	limited, omitted := formatting.LimitLines(compact, options.MaxLines)
	wasOmitted := progressLines > 0 || omitted > 0 || len(compact) < len(lines)
	result := Result{Output: strings.Join(limited, "\n"), Kind: KindLog, Omitted: wasOmitted, Matched: requested != KindAuto}
	if progressLines > 0 {
		result.Notes = []string{"collapsed " + itoa(progressLines) + " progress lines"}
	}
	return result
}

func itoa(value int) string {
	return strconv.Itoa(value)
}
