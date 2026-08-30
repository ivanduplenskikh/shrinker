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
	if !strings.Contains(html, `src="/assets/dashboard.js"`) || !strings.Contains(html, `href="/assets/index.css"`) {
		t.Fatal("dashboard asset references are missing")
	}
	if !strings.Contains(html, `window.__SHRINKER_STATS__=`) || !strings.Contains(html, `"command":"git status"`) {
		t.Fatal("dashboard statistics payload is missing")
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

	for assetPath, contentTypeFragment := range map[string]string{
		"/assets/dashboard.js":        "javascript",
		"/assets/rolldown-runtime.js": "javascript",
		"/assets/vendor.js":           "javascript",
		"/assets/charts.js":           "javascript",
		"/assets/index.css":           "text/css",
	} {
		asset := httptest.NewRecorder()
		handler.ServeHTTP(asset, httptest.NewRequest(http.MethodGet, assetPath, nil))
		if asset.Code != http.StatusOK {
			t.Fatalf("%s status = %d", assetPath, asset.Code)
		}
		if !strings.Contains(asset.Header().Get("Content-Type"), contentTypeFragment) {
			t.Fatalf("%s content type = %q", assetPath, asset.Header().Get("Content-Type"))
		}
	}

	shutdown := httptest.NewRecorder()
	handler.ServeHTTP(shutdown, httptest.NewRequest(http.MethodPost, "/__shrinker_shutdown", nil))
	if shutdown.Code != http.StatusNoContent {
		t.Fatalf("shutdown status = %d", shutdown.Code)
	}
}
