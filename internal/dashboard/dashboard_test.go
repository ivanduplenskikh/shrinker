package dashboard

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

func TestRenderEscapesScriptPayload(t *testing.T) {
	summary := metrics.StatsSummary{
		DatabasePath: "</script><script>alert(1)</script>",
		ByCommand:    []metrics.CommandStatsRow{{Command: "git status", FilterKind: "git-status", Calls: 2}},
	}
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
	if !strings.Contains(html, "Top commands") || !strings.Contains(html, "git status") || !strings.Contains(html, "git-status") {
		t.Fatal("combined command statistics are missing")
	}
	if !strings.Contains(html, "fillText('Date'") || !strings.Contains(html, "fillText('Tokens saved'") {
		t.Fatal("chart axis labels are missing")
	}
}

func TestHandlerServesAndShutsDown(t *testing.T) {
	server := &http.Server{}
	handler := Handler(func() (metrics.StatsSummary, error) {
		return metrics.StatsSummary{DatabasePath: "test.db"}, nil
	}, server)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	record := httptest.NewRecorder()
	handler.ServeHTTP(record, request)
	if record.Code != http.StatusOK {
		t.Fatalf("status = %d", record.Code)
	}
	body, _ := io.ReadAll(record.Result().Body)
	if !strings.Contains(string(body), "Shrinker stats") {
		t.Fatal("dashboard body missing title")
	}

	shutdown := httptest.NewRecorder()
	handler.ServeHTTP(shutdown, httptest.NewRequest(http.MethodPost, "/__shrinker_shutdown", nil))
	if shutdown.Code != http.StatusNoContent {
		t.Fatalf("shutdown status = %d", shutdown.Code)
	}
}
