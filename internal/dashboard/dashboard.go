package dashboard

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"os/exec"
	"runtime"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

const marker = `name="generator" content="shrinker-dashboard"`

var page = template.Must(template.New("dashboard").Parse(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="generator" content="shrinker-dashboard"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shrinker stats</title>
<style>body{font:15px system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:32px;color:#17202a;background:#f5f8fa}h1{font-size:42px;margin:0 0 8px}h2{font-size:18px;margin-bottom:6px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.card,section{background:white;border:1px solid #dce3e8;border-radius:8px;padding:22px;margin:14px 0}.value{font-size:28px;font-weight:700}.muted{color:#66727f}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #edf1f4}canvas{width:100%;height:240px} @media(max-width:600px){body{padding:18px}h1{font-size:30px}}</style></head>
<body><p class="muted">Local activity</p><h1>Shrinker stats</h1><p class="muted">{{.Summary.DatabasePath}}</p>
<div class="grid"><div class="card"><div class="muted">Runs</div><div class="value">{{.Summary.Total.Runs}}</div></div><div class="card"><div class="muted">Tokens saved</div><div class="value">{{.Summary.Total.EstimatedTokensSaved}}</div></div><div class="card"><div class="muted">Reduction</div><div class="value">{{.Summary.Total.ReductionPercent}}%</div></div><div class="card"><div class="muted">Last 7 days</div><div class="value">{{.Summary.Last7Days.EstimatedTokensSaved}}</div></div></div>
<section><h2>Tokens saved over time</h2><canvas id="trend" width="960" height="240"></canvas></section>
<section><h2>By filter</h2><table><tr><th>Filter</th><th>Runs</th><th>Saved</th><th>Reduction</th></tr>{{range .Summary.ByFilter}}<tr><td>{{.FilterKind}}</td><td>{{.Runs}}</td><td>{{.EstimatedTokensSaved}}</td><td>{{.ReductionPercent}}%</td></tr>{{else}}<tr><td colspan="4">No filter data yet.</td></tr>{{end}}</table></section>
<script id="shrinker-stats" type="application/json">{{.JSON}}</script><script>const p=JSON.parse(document.getElementById('shrinker-stats').textContent),c=document.getElementById('trend'),x=c.getContext('2d'),d=p.summary.daily,m=Math.max(1,...d.map(r=>r.estimatedTokensSaved));x.strokeStyle='#2774d9';x.lineWidth=3;x.beginPath();d.forEach((r,i)=>{const px=d.length===1?480:40+i*880/(d.length-1),py=210-r.estimatedTokensSaved/m*180;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();</script></body></html>`))

type payload struct {
	Summary                   metrics.StatsSummary `json:"summary"`
	InputCostPerMillionTokens float64              `json:"inputCostPerMillionTokens"`
}
type viewModel struct {
	Summary metrics.StatsSummary
	JSON    template.JS
}

func Render(summary metrics.StatsSummary) (string, error) {
	encoded, err := json.Marshal(payload{Summary: summary, InputCostPerMillionTokens: 5})
	if err != nil {
		return "", err
	}
	encoded = []byte(strings.ReplaceAll(string(encoded), "<", "\\u003c"))
	var output strings.Builder
	if err := page.Execute(&output, viewModel{Summary: summary, JSON: template.JS(encoded)}); err != nil {
		return "", err
	}
	return output.String(), nil
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
		_, _ = writer.Write([]byte(html))
	})
}

func Open(url string) {
	var command string
	var args []string
	switch runtime.GOOS {
	case "windows":
		command = "cmd.exe"
		args = []string{"/c", "start", "", url}
	case "darwin":
		command = "open"
		args = []string{url}
	default:
		command = "xdg-open"
		args = []string{url}
	}
	_ = exec.Command(command, args...).Start()
}
