package dashboard

import (
	"bytes"
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ivanduplenskikh/shrinker/internal/metrics"
)

//go:embed ui/app.html
var dashboardShell string

//go:embed ui/assets/*
var dashboardAssets embed.FS

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
	output := strings.Replace(dashboardShell, "  </head>", `    <script>window.__SHRINKER_STATS__=`+jsonValue+`;</script>`+"\n  </head>", 1)
	if output == dashboardShell {
		return "", errors.New("dashboard shell is missing head placeholder")
	}
	return output, nil
}

func Serve(getSummary func() (metrics.StatsSummary, error), port int) error {
	token, err := writeShutdownToken()
	if err != nil {
		return err
	}
	defer os.Remove(ShutdownTokenPath())
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port)}
	handler := Handler(getSummary, server, token)
	server.Handler = handler
	err = server.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func ShutdownTokenPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".shrinker", "dashboard-token")
	}
	return filepath.Join(home, ".shrinker", "dashboard-token")
}

func RequestShutdown(endpoint string) {
	token, err := os.ReadFile(ShutdownTokenPath())
	if err != nil || len(token) == 0 {
		return
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, nil)
	if err != nil {
		return
	}
	request.Header.Set("X-Shrinker-Shutdown-Token", string(token))
	response, err := (&http.Client{Timeout: 2 * time.Second}).Do(request)
	if err == nil {
		response.Body.Close()
	}
}

func writeShutdownToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(ShutdownTokenPath()), 0o700); err != nil {
		return "", err
	}
	token := hex.EncodeToString(bytes)
	if err := os.WriteFile(ShutdownTokenPath(), []byte(token), 0o600); err != nil {
		return "", err
	}
	return token, nil
}

func Handler(getSummary func() (metrics.StatsSummary, error), server *http.Server, shutdownToken string) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("X-Frame-Options", "DENY")
		writer.Header().Set("Referrer-Policy", "no-referrer")
		writer.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		if request.Method == http.MethodPost && request.URL.Path == "/__shrinker_shutdown" {
			if shutdownToken == "" || request.Header.Get("X-Shrinker-Shutdown-Token") != shutdownToken {
				http.Error(writer, "unauthorized", http.StatusUnauthorized)
				return
			}
			writer.WriteHeader(http.StatusNoContent)
			go server.Shutdown(context.Background())
			return
		}
		if request.Method == http.MethodGet && strings.HasPrefix(request.URL.Path, "/assets/") {
			assetPath := strings.TrimPrefix(request.URL.Path, "/")
			if !fs.ValidPath(assetPath) {
				http.NotFound(writer, request)
				return
			}
			asset, err := dashboardAssets.ReadFile("ui/" + assetPath)
			if err != nil {
				http.NotFound(writer, request)
				return
			}
			http.ServeContent(writer, request, assetPath, time.Time{}, bytes.NewReader(asset))
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
