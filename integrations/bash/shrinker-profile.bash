_shrinker_rules_for() {
  case "$1" in
    git) printf '%s' 'status diff log show reflog branch tag stash' ;;
    npm) printf '%s' 'test t install i ci ls list' ;;
    docker) printf '%s' 'ps logs images compose' ;;
    kubectl) printf '%s' 'get describe logs' ;;
    gh) printf '%s' 'pr issue run' ;;
    rg|find|tail|cat|ls) printf '%s' '*' ;;
  esac
}

_shrinker_value_flag() {
  case "$1:$2" in
    git:-C|git:-c|git:--git-dir|git:--work-tree|git:--namespace|npm:--prefix|npm:--cache|npm:--registry|npm:--workspace|npm:--userconfig|npm:-w|npm:-C|docker:-H|docker:--host|docker:--context|docker:--config|kubectl:-n|kubectl:--namespace|kubectl:-o|kubectl:--output|kubectl:--context|kubectl:--kubeconfig|kubectl:--cluster|kubectl:--user|gh:-R|gh:--repo) return 0 ;;
  esac
  return 1
}

_shrinker_subcommand() {
  local command_name="$1"
  shift
  while [ "$#" -gt 0 ]; do
    if _shrinker_value_flag "$command_name" "$1"; then
      shift 2
      continue
    fi
    case "$1" in
      -*) shift ;;
      *) printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; return ;;
    esac
  done
}

_shrinker_should_route() {
  local command_name="$1" rules subcommand
  shift
  rules="$(_shrinker_rules_for "$command_name")"
  [ -n "$rules" ] || return 1
  [ "$rules" = '*' ] && return 0
  subcommand="$(_shrinker_subcommand "$command_name" "$@")"
  case " $rules " in *" $subcommand "*) return 0 ;; esac
  return 1
}

_shrinker_load_config() {
  local config="${SHRINKER_CONFIG_PATH:-$HOME/.shrinker/config}"
  [ -r "$config" ] || return
  SHRINKER_TRACK_UNCOVERED_DEFAULT="$(sed -n 's/^[[:space:]]*SHRINKER_TRACK_UNCOVERED[[:space:]]*=[[:space:]]*\([^#[:space:]]*\).*/\1/p' "$config" | tail -n 1)"
}

_shrinker_tracking_enabled() {
  local value="${SHRINKER_TRACK_UNCOVERED:-$SHRINKER_TRACK_UNCOVERED_DEFAULT}"
  case "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" in 1|true|yes) return 0 ;; esac
  return 1
}

_shrinker_track_uncovered() {
  local command_name="$1" bytes="$2" exit_code="$3" subcommand=""
  shift 3
  _shrinker_tracking_enabled || return
  command -v shrinker >/dev/null 2>&1 || return
  case "$command_name" in git|npm|docker|kubectl|gh) subcommand="$(_shrinker_subcommand "$command_name" "$@")" ;; esac
  if [ -n "$subcommand" ]; then
    (command shrinker track --executable "$command_name" --subcommand "$subcommand" --bytes "$bytes" --exit-code "$exit_code" >/dev/null 2>&1 &)
  else
    (command shrinker track --executable "$command_name" --bytes "$bytes" --exit-code "$exit_code" >/dev/null 2>&1 &)
  fi
}

_shrinker_native() {
  local command_name="$1" capture status_code bytes
  shift
  if _shrinker_tracking_enabled && [ ! -t 1 ]; then
    capture="$(mktemp -t shrinker-track)" || { command "$command_name" "$@"; return $?; }
    command "$command_name" "$@" | tee "$capture"
    status_code=${PIPESTATUS[0]}
    bytes="$(wc -c < "$capture" | tr -d ' ')"
    rm -f "$capture"
    _shrinker_track_uncovered "$command_name" "${bytes:-0}" "$status_code" "$@"
    return "$status_code"
  fi
  command "$command_name" "$@"
  status_code=$?
  _shrinker_track_uncovered "$command_name" 0 "$status_code" "$@"
  return "$status_code"
}

_shrinker_invoke() {
  local command_name="$1"
  shift
  if _shrinker_should_route "$command_name" "$@" && command -v shrinker >/dev/null 2>&1; then
    command shrinker "$command_name" "$@"
    return $?
  fi
  _shrinker_native "$command_name" "$@"
}

SHRINKER_TRACK_UNCOVERED_DEFAULT=""
_shrinker_load_config
git() { _shrinker_invoke git "$@"; }
npm() { _shrinker_invoke npm "$@"; }
docker() { _shrinker_invoke docker "$@"; }
kubectl() { _shrinker_invoke kubectl "$@"; }
gh() { _shrinker_invoke gh "$@"; }
rg() { _shrinker_invoke rg "$@"; }
find() { _shrinker_invoke find "$@"; }
tail() { _shrinker_invoke tail "$@"; }
cat() { _shrinker_invoke cat "$@"; }
ls() { _shrinker_invoke ls "$@"; }