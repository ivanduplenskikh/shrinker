package metrics

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/config"
)

type UncoveredReason string

const (
	ReasonNoFilter           UncoveredReason = "no-filter"
	ReasonLowReduction       UncoveredReason = "low-reduction"
	ReasonUnlistedSubcommand UncoveredReason = "unlisted-subcommand"
)

type CommandSignature struct {
	Executable string
	Subcommand string
}

var tokenPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._+\-]{0,63}$`)

func CoverageEnabled() bool {
	return config.IsTruthy(config.ResolveSetting("SHRINKER_TRACK_UNCOVERED", config.DefaultPath()))
}

func SanitizeToken(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if tokenPattern.MatchString(value) {
		return value
	}
	return ""
}

func CommandSignatureFor(command []string) (CommandSignature, bool) {
	if len(command) == 0 {
		return CommandSignature{}, false
	}
	executable := SanitizeToken(strings.TrimSuffix(filepath.Base(command[0]), filepath.Ext(command[0])))
	if executable == "" {
		return CommandSignature{}, false
	}
	valueFlags := map[string]bool{"-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--prefix": true, "--cache": true, "--registry": true, "--workspace": true, "-w": true, "--dir": true, "--cwd": true, "-H": true, "--host": true, "--context": true, "--config": true, "-n": true, "-o": true, "--output": true, "--kubeconfig": true, "--cluster": true, "--user": true, "-R": true, "--repo": true}
	for index := 1; index < len(command); index++ {
		part := command[index]
		if valueFlags[part] {
			index++
			continue
		}
		if strings.HasPrefix(part, "-") {
			continue
		}
		return CommandSignature{Executable: executable, Subcommand: SanitizeToken(part)}, true
	}
	return CommandSignature{Executable: executable}, true
}

func ClassifyWrapped(matched bool, measurements Measurements) UncoveredReason {
	if measurements.RawEstimatedTokens < 200 {
		return ""
	}
	if !matched {
		return ReasonNoFilter
	}
	threshold := 10
	if value := config.ResolveSetting("SHRINKER_LOW_REDUCTION_PERCENT", config.DefaultPath()); value != "" {
		if _, err := fmt.Sscanf(value, "%d", &threshold); err != nil {
			threshold = 10
		}
	}
	if measurements.ReductionPercent < threshold {
		return ReasonLowReduction
	}
	return ""
}
