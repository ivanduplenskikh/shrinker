package metrics

import (
	"fmt"
	"unicode/utf16"
)

type Measurements struct {
	RawBytes              int
	OutputBytes           int
	RawEstimatedTokens    int
	OutputEstimatedTokens int
	EstimatedTokensSaved  int
	ReductionPercent      int
}

func Measure(raw, output string) Measurements {
	rawTokens := estimatedTokens(raw)
	outputTokens := estimatedTokens(output)
	return Measurements{
		RawBytes: rawBytes(raw), OutputBytes: rawBytes(output),
		RawEstimatedTokens: rawTokens, OutputEstimatedTokens: outputTokens,
		EstimatedTokensSaved: max(0, rawTokens-outputTokens),
		ReductionPercent:     ReductionPercent(rawTokens, outputTokens),
	}
}

func ReductionPercent(rawEstimatedTokens, outputEstimatedTokens int) int {
	if rawEstimatedTokens == 0 {
		return 0
	}
	rounded := int((1-float64(outputEstimatedTokens)/float64(rawEstimatedTokens))*100 + 0.5)
	if outputEstimatedTokens > 0 && rounded == 100 {
		return 99
	}
	return max(0, rounded)
}

func FormatMeasurements(measurements Measurements, durationMs *int64) string {
	duration := ""
	if durationMs != nil {
		duration = fmt.Sprintf(" | %dms", *durationMs)
	}
	gain := fmt.Sprintf("%d saved", measurements.EstimatedTokensSaved)
	if measurements.EstimatedTokensSaved > 0 && measurements.EstimatedTokensSaved < 50 {
		gain += ", small absolute gain"
	}
	return fmt.Sprintf("[shrinker] %dB -> %dB | est. tokens %d -> %d (%s) | -%d%%%s",
		measurements.RawBytes, measurements.OutputBytes,
		measurements.RawEstimatedTokens, measurements.OutputEstimatedTokens,
		gain, measurements.ReductionPercent, duration)
}

func estimatedTokens(text string) int {
	utf16Length := len(utf16.Encode([]rune(text)))
	return (utf16Length + 3) / 4
}

func rawBytes(text string) int {
	return len([]byte(text))
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}
