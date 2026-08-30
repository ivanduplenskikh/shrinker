__shrinker_rules_for() {
  case "$1" in
    git) printf '%s' 'status diff log show reflog branch tag stash' ;;
    npm) printf '%s' 'test t install i ci ls list' ;;
    docker) printf '%s' 'ps logs images compose' ;;
    kubectl) printf '%s' 'get describe logs' ;;
    gh) printf '%s' 'pr issue run' ;;
    rg|find|tail|cat|ls) printf '%s' '*' ;;
  esac
}

__shrinker_value_flag() {
  case "$1:$2" in
    git:-C|git:-c|git:--git-dir|git:--work-tree|git:--namespace|npm:--prefix|npm:--cache|npm:--registry|npm:--workspace|npm:--userconfig|npm:-w|npm:-C|docker:-H|docker:--host|docker:--context|docker:--config|kubectl:-n|kubectl:--namespace|kubectl:-o|kubectl:--output|kubectl:--context|kubectl:--kubeconfig|kubectl:--cluster|kubectl:--user|gh:-R|gh:--repo) return 0 ;;
  esac
  return 1
}

__shrinker_subcommand() {
  local command_name="$1"
  shift
  while [ "$#" -gt 0 ]; do
    if __shrinker_value_flag "$command_name" "$1"; then
      shift 2
      continue
    fi
    case "$1" in
      -*) shift ;;
      *) printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; return ;;
    esac
  done
}

__shrinker_should_route() {
  local command_name="$1" rules subcommand
  shift
  rules="$(__shrinker_rules_for "$command_name")"
  [ -n "$rules" ] || return 1
  [ "$rules" = '*' ] && return 0
  subcommand="$(__shrinker_subcommand "$command_name" "$@")"
  case " $rules " in *" $subcommand "*) return 0 ;; esac
  return 1
}

__shrinker_load_config() {
  local config="${SHRINKER_CONFIG_PATH:-$HOME/.shrinker/config}"
  [ -r "$config" ] || return 0
  SHRINKER_TRACK_UNCOVERED_DEFAULT="$(sed -n 's/^[[:space:]]*SHRINKER_TRACK_UNCOVERED[[:space:]]*=[[:space:]]*\([^#[:space:]]*\).*/\1/p' "$config" | tail -n 1)"
}

__shrinker_tracking_enabled() {
  local value="${SHRINKER_TRACK_UNCOVERED:-$SHRINKER_TRACK_UNCOVERED_DEFAULT}"
  case "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" in 1|true|yes) return 0 ;; esac
  return 1
}

__shrinker_track_uncovered() {
  local command_name="$1" bytes="$2" exit_code="$3" subcommand=""
  shift 3
  __shrinker_tracking_enabled || return
  command -v shrinker >/dev/null 2>&1 || return
  case "$command_name" in git|npm|docker|kubectl|gh) subcommand="$(__shrinker_subcommand "$command_name" "$@")" ;; esac
  if [ -n "$subcommand" ]; then
    (command shrinker track --executable "$command_name" --subcommand "$subcommand" --bytes "$bytes" --exit-code "$exit_code" >/dev/null 2>&1 &)
  else
    (command shrinker track --executable "$command_name" --bytes "$bytes" --exit-code "$exit_code" >/dev/null 2>&1 &)
  fi
}

__shrinker_native() {
  local command_name="$1" capture status_code bytes
  shift
  if __shrinker_tracking_enabled && [ ! -t 1 ]; then
    capture="$(mktemp -t shrinker-track.XXXXXX)" || { command "$command_name" "$@"; return $?; }
    command "$command_name" "$@" | tee "$capture"
    status_code=${PIPESTATUS[0]}
    bytes="$(wc -c < "$capture" | tr -d ' ')"
    rm -f "$capture"
    __shrinker_track_uncovered "$command_name" "${bytes:-0}" "$status_code" "$@"
    return "$status_code"
  fi
  command "$command_name" "$@"
  status_code=$?
  __shrinker_track_uncovered "$command_name" 0 "$status_code" "$@"
  return "$status_code"
}

__shrinker_invoke() {
  local command_name="$1"
  shift
  if __shrinker_should_route "$command_name" "$@" && command -v shrinker >/dev/null 2>&1; then
    command shrinker "$command_name" "$@"
    return $?
  fi
  __shrinker_native "$command_name" "$@"
}

SHRINKER_TRACK_UNCOVERED_DEFAULT=""
__shrinker_load_config
function git { __shrinker_invoke git "$@"; }
function npm { __shrinker_invoke npm "$@"; }
function docker { __shrinker_invoke docker "$@"; }
function kubectl { __shrinker_invoke kubectl "$@"; }
function gh { __shrinker_invoke gh "$@"; }
function rg { __shrinker_invoke rg "$@"; }
function find { __shrinker_invoke find "$@"; }
function tail { __shrinker_invoke tail "$@"; }
function cat { __shrinker_invoke cat "$@"; }
function ls { __shrinker_invoke ls "$@"; }