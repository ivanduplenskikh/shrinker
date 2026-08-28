package dashboard

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

//go:embed ui/app.html
var dashboardShell string

//go:embed ui/assets/app.css
var dashboardCSS string

//go:embed ui/assets/dashboard.js
var dashboardJS string

type payload struct {
	Summary                   metrics.StatsSummary `json:"summary"`
	InputCostPerMillionTokens float64              `json:"inputCostPerMillionTokens"`
}

func Render(summary metrics.StatsSummary) (string, error) {
	encoded, err := json.Marshal(payload{Summary: summary, InputCostPerMillionTokens: 5})
	if err != nil {
		return "", err
	}
	jsonValue := strings.ReplaceAll(string(encoded), "<", "\\u003c")
	output := strings.Replace(dashboardShell, `    <script type="module" crossorigin src="/assets/dashboard.js"></script>`, `<script>window.__SHRINKER_STATS__=`+jsonValue+`;</script><script>window.addEventListener('DOMContentLoaded',()=>{`+dashboardJS+`});</script>`, 1)
	output = strings.Replace(output, `    <link rel="stylesheet" crossorigin href="/assets/app.css">`, `<style>`+dashboardCSS+`</style>`, 1)
	if output == dashboardShell {
		return "", errors.New("dashboard shell is missing asset placeholders")
	}
	return output, nil
}

func Serve(getSummary func() (metrics.StatsSummary, error), port int) error {
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port)}
	handler := Handler(getSummary, server)
	server.Handler = handler
	err := server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func Handler(getSummary func() (metrics.StatsSummary, error), server *http.Server) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodPost && request.URL.Path == "/__shrinker_shutdown" {
			writer.WriteHeader(http.StatusNoContent)
			go server.Shutdown(context.Background())
			return
		}
		if request.URL.Path != "/" {
			http.NotFound(writer, request)
			return
		}
		summary, err := getSummary()
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
		html, err := Render(summary)
		if err != nil {
			http.Error(writer, err.Error(), http.StatusInternalServerError)
			return
		}
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		if _, err := writer.Write([]byte(html)); err != nil {
			return
		}
	})
}
