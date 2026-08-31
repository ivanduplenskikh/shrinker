package metrics

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/ivanduplenskikh/shrinker/internal/config"
	_ "modernc.org/sqlite"
)

type RunStatistic struct {
	Mode              string
	FilterKind        string
	CommandName       string
	CommandSubcommand string
	Measurements      Measurements
	DurationMs        int64
	Omitted           bool
	ExitCode          *int
}

type StatsRow struct {
	FilterKind                 string  `json:"filterKind"`
	Runs                       int     `json:"runs"`
	RawEstimatedTokens         int     `json:"rawEstimatedTokens"`
	OutputEstimatedTokens      int     `json:"outputEstimatedTokens"`
	EstimatedTokensSaved       int     `json:"estimatedTokensSaved"`
	EstimatedInputCostSavedUsd float64 `json:"estimatedInputCostSavedUsd"`
	ReductionPercent           int     `json:"reductionPercent"`
}

type StatsSummary struct {
	DatabasePath             string            `json:"databasePath"`
	Total                    StatsRow          `json:"total"`
	Last7Days                StatsRow          `json:"last7Days"`
	ByFilter                 []StatsRow        `json:"byFilter"`
	UncoveredTrackingEnabled bool              `json:"uncoveredTrackingEnabled"`
	Uncovered                []UncoveredRow    `json:"uncovered"`
	Daily                    []DailyStatsRow   `json:"daily"`
	YearlyDaily              []DailyStatsRow   `json:"yearlyDaily"`
	ByCommand                []CommandStatsRow `json:"byCommand"`
	CommandRuns              []CommandRunRow   `json:"commandRuns"`
}

type DailyStatsRow struct {
	Date                 string `json:"date"`
	Runs                 int    `json:"runs"`
	EstimatedTokensSaved int    `json:"estimatedTokensSaved"`
	ReductionPercent     int    `json:"reductionPercent"`
}
type CommandStatsRow struct {
	Command              string `json:"command"`
	FilterKind           string `json:"filterKind"`
	Calls                int    `json:"calls"`
	RawEstimatedTokens   int    `json:"rawEstimatedTokens"`
	EstimatedTokensSaved int    `json:"estimatedTokensSaved"`
	ReductionPercent     int    `json:"reductionPercent"`
}
type CommandRunRow struct {
	Command               string `json:"command"`
	CreatedAt             string `json:"createdAt"`
	RawEstimatedTokens    int    `json:"rawEstimatedTokens"`
	OutputEstimatedTokens int    `json:"outputEstimatedTokens"`
	EstimatedTokensSaved  int    `json:"estimatedTokensSaved"`
	Status                string `json:"status"`
}

type UncoveredStatistic struct {
	Source             string
	Reason             UncoveredReason
	Executable         string
	Subcommand         string
	RawBytes           int
	RawEstimatedTokens int
	ExitCode           *int
}
type UncoveredRow struct {
	Command         string   `json:"command"`
	Executable      string   `json:"executable"`
	Subcommand      string   `json:"subcommand,omitempty"`
	Occurrences     int      `json:"occurrences"`
	EstimatedTokens int      `json:"estimatedTokens"`
	AverageTokens   int      `json:"averageTokens"`
	Reasons         []string `json:"reasons"`
	Sources         []string `json:"sources"`
	LastSeen        string   `json:"lastSeen"`
}

func DefaultStatsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".shrinker", "stats.db")
	}
	return filepath.Join(home, ".shrinker", "stats.db")
}

func openDatabase(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	database, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	_, err = database.Exec(`
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 2000;
CREATE TABLE IF NOT EXISTS runs (
 id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 mode TEXT NOT NULL, filter_kind TEXT NOT NULL, command_name TEXT NOT NULL,
 command_subcommand TEXT, raw_bytes INTEGER NOT NULL, output_bytes INTEGER NOT NULL,
 raw_estimated_tokens INTEGER NOT NULL, output_estimated_tokens INTEGER NOT NULL,
 estimated_tokens_saved INTEGER NOT NULL, reduction_percent INTEGER NOT NULL,
 duration_ms INTEGER, omitted INTEGER NOT NULL, exit_code INTEGER
);
CREATE INDEX IF NOT EXISTS runs_created_at_idx ON runs(created_at);
CREATE INDEX IF NOT EXISTS runs_filter_kind_idx ON runs(filter_kind);
CREATE TABLE IF NOT EXISTS uncovered_commands (
 id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 source TEXT NOT NULL, reason TEXT NOT NULL, executable TEXT NOT NULL,
 subcommand TEXT, raw_bytes INTEGER NOT NULL DEFAULT 0,
 raw_estimated_tokens INTEGER NOT NULL DEFAULT 0, exit_code INTEGER
);
CREATE INDEX IF NOT EXISTS uncovered_created_at_idx ON uncovered_commands(created_at);
CREATE INDEX IF NOT EXISTS uncovered_command_idx ON uncovered_commands(executable, subcommand);
UPDATE runs SET command_subcommand = NULL WHERE command_name NOT IN ('git', 'npm', 'docker', 'kubectl', 'gh');
UPDATE uncovered_commands SET subcommand = NULL WHERE executable NOT IN ('git', 'npm', 'docker', 'kubectl', 'gh');
`)
	if err != nil {
		database.Close()
		return nil, err
	}
	return database, nil
}

func RecordRun(stat RunStatistic, databasePath string) error {
	commandName := SanitizeToken(stat.CommandName)
	if commandName == "" {
		return nil
	}
	database, err := openDatabase(databasePath)
	if err != nil {
		return err
	}
	defer database.Close()
	_, err = database.Exec(`INSERT INTO runs (mode, filter_kind, command_name, command_subcommand, raw_bytes, output_bytes, raw_estimated_tokens, output_estimated_tokens, estimated_tokens_saved, reduction_percent, duration_ms, omitted, exit_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		stat.Mode, stat.FilterKind, commandName, nullable(SanitizeSubcommand(commandName, stat.CommandSubcommand)), stat.Measurements.RawBytes, stat.Measurements.OutputBytes,
		stat.Measurements.RawEstimatedTokens, stat.Measurements.OutputEstimatedTokens, stat.Measurements.EstimatedTokensSaved,
		stat.Measurements.ReductionPercent, stat.DurationMs, boolInt(stat.Omitted), stat.ExitCode)
	return err
}

func RecordUncovered(stat UncoveredStatistic, databasePath string) error {
	executable := SanitizeToken(stat.Executable)
	if executable == "" {
		return nil
	}
	database, err := openDatabase(databasePath)
	if err != nil {
		return err
	}
	defer database.Close()
	_, err = database.Exec(`INSERT INTO uncovered_commands (source, reason, executable, subcommand, raw_bytes, raw_estimated_tokens, exit_code) VALUES (?, ?, ?, ?, ?, ?, ?)`, stat.Source, stat.Reason, executable, nullable(SanitizeSubcommand(executable, stat.Subcommand)), max(0, stat.RawBytes), max(0, stat.RawEstimatedTokens), stat.ExitCode)
	return err
}

func GetCoverageStats(databasePath string) ([]UncoveredRow, error) {
	database, err := openDatabase(databasePath)
	if err != nil {
		return nil, err
	}
	defer database.Close()
	rows, err := database.Query(`SELECT executable, COALESCE(subcommand,''), COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(GROUP_CONCAT(DISTINCT reason),''), COALESCE(GROUP_CONCAT(DISTINCT source),''), COALESCE(MAX(created_at),'') FROM uncovered_commands GROUP BY executable, subcommand ORDER BY SUM(raw_estimated_tokens) DESC, COUNT(*) DESC, executable ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []UncoveredRow{}
	for rows.Next() {
		var executable, subcommand, reasons, sources, last string
		var occurrences, estimated int
		if err := rows.Scan(&executable, &subcommand, &occurrences, &estimated, &reasons, &sources, &last); err != nil {
			return nil, err
		}
		row := UncoveredRow{Executable: executable, Occurrences: occurrences, EstimatedTokens: estimated, AverageTokens: (estimated + occurrences/2) / occurrences, Reasons: sortedParts(reasons), Sources: sortedParts(sources), LastSeen: last, Command: executable}
		if subcommand != "" {
			row.Subcommand = subcommand
			row.Command += " " + subcommand
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func GetStats(databasePath string) (StatsSummary, error) {
	database, err := openDatabase(databasePath)
	if err != nil {
		return StatsSummary{}, err
	}
	defer database.Close()
	result := StatsSummary{DatabasePath: databasePath, ByFilter: []StatsRow{}, UncoveredTrackingEnabled: true}
	result.Uncovered, err = GetCoverageStats(databasePath)
	if err != nil {
		return result, err
	}
	result.Total, err = aggregate(database, "SELECT COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(SUM(output_estimated_tokens),0), COALESCE(SUM(estimated_tokens_saved),0) FROM runs", "all")
	if err != nil {
		return result, err
	}
	result.Last7Days, err = aggregate(database, "SELECT COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(SUM(output_estimated_tokens),0), COALESCE(SUM(estimated_tokens_saved),0) FROM runs WHERE created_at >= datetime('now', '-7 days')", "all")
	if err != nil {
		return result, err
	}
	rows, err := database.Query("SELECT filter_kind, COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(SUM(output_estimated_tokens),0), COALESCE(SUM(estimated_tokens_saved),0) FROM runs GROUP BY filter_kind ORDER BY SUM(estimated_tokens_saved) DESC, filter_kind ASC")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var row StatsRow
		var raw, output, saved int
		if err := rows.Scan(&kind, &row.Runs, &raw, &output, &saved); err != nil {
			return result, err
		}
		row = makeStatsRow(kind, row.Runs, raw, output, saved)
		result.ByFilter = append(result.ByFilter, row)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	result.Daily, err = getDailyStats(database, "30 days")
	if err != nil {
		return result, err
	}
	result.YearlyDaily, err = getDailyStats(database, "365 days")
	if err != nil {
		return result, err
	}
	result.ByCommand, err = getCommandStats(database)
	if err != nil {
		return result, err
	}
	result.CommandRuns, err = getCommandRuns(database)
	return result, err
}

func getDailyStats(database *sql.DB, interval string) ([]DailyStatsRow, error) {
	rows, err := database.Query("SELECT substr(created_at,1,10), COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(SUM(output_estimated_tokens),0), COALESCE(SUM(estimated_tokens_saved),0) FROM runs WHERE created_at >= datetime('now', ?) GROUP BY substr(created_at,1,10) ORDER BY substr(created_at,1,10) ASC", "-"+interval)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []DailyStatsRow{}
	for rows.Next() {
		var date string
		var runs, raw, output, saved int
		if err := rows.Scan(&date, &runs, &raw, &output, &saved); err != nil {
			return nil, err
		}
		result = append(result, DailyStatsRow{Date: date, Runs: runs, EstimatedTokensSaved: saved, ReductionPercent: ReductionPercent(raw, output)})
	}
	return result, rows.Err()
}

func getCommandStats(database *sql.DB) ([]CommandStatsRow, error) {
	rows, err := database.Query("SELECT command_name, COALESCE(command_subcommand,''), filter_kind, COUNT(*), COALESCE(SUM(raw_estimated_tokens),0), COALESCE(SUM(output_estimated_tokens),0), COALESCE(SUM(estimated_tokens_saved),0) FROM runs GROUP BY command_name, command_subcommand, filter_kind ORDER BY COUNT(*) DESC, SUM(estimated_tokens_saved) DESC, command_name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []CommandStatsRow{}
	for rows.Next() {
		var name, subcommand, filterKind string
		var runs, raw, output, saved int
		if err := rows.Scan(&name, &subcommand, &filterKind, &runs, &raw, &output, &saved); err != nil {
			return nil, err
		}
		command := name
		if subcommand != "" {
			command += " " + subcommand
		}
		result = append(result, CommandStatsRow{Command: command, FilterKind: filterKind, Calls: runs, RawEstimatedTokens: raw, EstimatedTokensSaved: saved, ReductionPercent: ReductionPercent(raw, output)})
	}
	return result, rows.Err()
}

func getCommandRuns(database *sql.DB) ([]CommandRunRow, error) {
	rows, err := database.Query(`SELECT created_at, command, raw_estimated_tokens, output_estimated_tokens, estimated_tokens_saved, status FROM (
		SELECT created_at, command_name || CASE WHEN command_subcommand IS NULL OR command_subcommand = '' THEN '' ELSE ' ' || command_subcommand END AS command, raw_estimated_tokens, output_estimated_tokens, estimated_tokens_saved, 'Captured' AS status FROM runs
		UNION ALL
		SELECT created_at, executable || CASE WHEN subcommand IS NULL OR subcommand = '' THEN '' ELSE ' ' || subcommand END AS command, raw_estimated_tokens, raw_estimated_tokens AS output_estimated_tokens, 0 AS estimated_tokens_saved, 'Needs filter' AS status FROM uncovered_commands
	) ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []CommandRunRow{}
	for rows.Next() {
		var row CommandRunRow
		if err := rows.Scan(&row.CreatedAt, &row.Command, &row.RawEstimatedTokens, &row.OutputEstimatedTokens, &row.EstimatedTokensSaved, &row.Status); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func aggregate(database *sql.DB, query, kind string) (StatsRow, error) {
	var runs, raw, output, saved int
	if err := database.QueryRow(query).Scan(&runs, &raw, &output, &saved); err != nil {
		return StatsRow{}, err
	}
	return makeStatsRow(kind, runs, raw, output, saved), nil
}

func makeStatsRow(kind string, runs, raw, output, saved int) StatsRow {
	rate := 5.0
	if configured := config.ResolveSetting("SHRINKER_INPUT_COST_PER_MILLION_TOKENS", config.DefaultPath()); configured != "" {
		fmt.Sscan(configured, &rate)
	}
	return StatsRow{FilterKind: kind, Runs: runs, RawEstimatedTokens: raw, OutputEstimatedTokens: output, EstimatedTokensSaved: saved, EstimatedInputCostSavedUsd: float64(saved) * rate / 1000000, ReductionPercent: ReductionPercent(raw, output)}
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
func sortedParts(value string) []string {
	if value == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	sort.Strings(parts)
	return parts
}
func FormatStats(summary StatsSummary) string {
	return fmt.Sprintf("Shrinker Token Savings Dashboard\n\nAll time: %d runs | est. %d tokens saved | -%d%%\nLast 7 days: %d runs | est. %d tokens saved | -%d%%\n\nDatabase: %s", summary.Total.Runs, summary.Total.EstimatedTokensSaved, summary.Total.ReductionPercent, summary.Last7Days.Runs, summary.Last7Days.EstimatedTokensSaved, summary.Last7Days.ReductionPercent, summary.DatabasePath)
}
func FormatStatsJSON(summary StatsSummary) (string, error) {
	encoded, err := json.MarshalIndent(summary, "", "  ")
	return string(encoded), err
}

func FormatCoverage(summary StatsSummary) string {
	state := "disabled"
	if summary.UncoveredTrackingEnabled {
		state = "enabled"
	}
	return fmt.Sprintf("Shrinker Coverage Gaps\n\nTracking: %s\nUncovered commands: %d\n\nDatabase: %s", state, len(summary.Uncovered), summary.DatabasePath)
}

func FormatStatsChart(summary StatsSummary) string {
	lines := []string{"Shrinker Token Savings - Last 30 Days", "====================================="}
	if len(summary.Daily) == 0 {
		return strings.Join(append(lines, "No recorded runs in the last 30 days."), "\n")
	}
	maxSaved := 1
	for _, row := range summary.Daily {
		if row.EstimatedTokensSaved > maxSaved {
			maxSaved = row.EstimatedTokensSaved
		}
	}
	lines = append(lines, "Date         Runs   Saved   Reduction  Activity")
	for _, row := range summary.Daily {
		width := int(float64(row.EstimatedTokensSaved) / float64(maxSaved) * 30)
		if row.EstimatedTokensSaved > 0 && width == 0 {
			width = 1
		}
		lines = append(lines, fmt.Sprintf("%-10s  %5d  %6d  %8d%%  %s%s", row.Date, row.Runs, row.EstimatedTokensSaved, row.ReductionPercent, strings.Repeat("#", width), strings.Repeat("-", 30-width)))
	}
	return strings.Join(lines, "\n")
}
