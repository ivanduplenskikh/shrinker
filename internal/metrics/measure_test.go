package metrics

import "testing"

func TestMeasureMatchesTokenAndByteSemantics(t *testing.T) {
	result := Measure("😀😀😀😀", "😀")
	if result.RawBytes != 16 || result.OutputBytes != 4 {
		t.Fatalf("byte measurements = %#v", result)
	}
	if result.RawEstimatedTokens != 2 || result.OutputEstimatedTokens != 1 || result.EstimatedTokensSaved != 1 {
		t.Fatalf("token measurements = %#v", result)
	}
}

func TestReductionPercentCapsNonEmptyPerfectReduction(t *testing.T) {
	if got := ReductionPercent(100, 1); got != 99 {
		t.Fatalf("ReductionPercent(100, 1) = %d, want 99", got)
	}
}
