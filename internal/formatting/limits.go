package formatting

import "fmt"

func LimitLines(lines []string, maxLines int) ([]string, int) {
	if len(lines) <= maxLines {
		return lines, 0
	}
	headCount := (maxLines*65 + 99) / 100
	tailCount := max(1, maxLines-headCount)
	omitted := len(lines) - headCount - tailCount
	limited := make([]string, 0, maxLines+1)
	limited = append(limited, lines[:headCount]...)
	limited = append(limited, fmt.Sprintf("... %d lines omitted ...", omitted))
	limited = append(limited, lines[len(lines)-tailCount:]...)
	return limited, omitted
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}
