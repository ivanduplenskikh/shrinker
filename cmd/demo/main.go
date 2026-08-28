package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/ivanduplenskikh/shrinker/internal/filters"
	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

func main() {
	path := filepath.Join("tests", "fixtures", "generic-log.txt")
	input, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	result := filters.Apply(string(input), filters.KindLog, filters.Options{MaxLines: 80, PerFileLines: 20})
	output := result.Output
	fmt.Println("=== Noisy log ===")
	fmt.Println(output)
	fmt.Println(metrics.FormatMeasurements(metrics.Measure(string(input), output), nil))
}
