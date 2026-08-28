package dashboard

import (
	"strings"
	"testing"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

func TestRenderEscapesScriptPayload(t *testing.T) {
	summary := metrics.StatsSummary{DatabasePath: "</script><script>alert(1)</script>"}
	html, err := Render(summary)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(html, "</script><script>alert(1)") {
		t.Fatal("dashboard payload can break out of its script element")
	}
	if !strings.Contains(html, `name="generator" content="shrinker-dashboard"`) {
		t.Fatal("dashboard marker is missing")
	}
}
