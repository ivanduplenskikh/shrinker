package filters

type Kind string

const (
	KindAuto Kind = "auto"
	KindLog  Kind = "log"
)

type Options struct {
	MaxLines     int
	PerFileLines int
	Command      []string
}

type Result struct {
	Output  string
	Kind    Kind
	Omitted bool
	Notes   []string
	Matched bool
}
