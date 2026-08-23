typeset -gA SHRINK_RULES
SHRINK_RULES=(
  git "status diff log show reflog branch tag stash"
  npm "test t install i ci ls list"
  docker "ps logs images compose"
  kubectl "get describe logs"
  gh "pr issue run"
  rg "*"
  find "*"
  tail "*"
  cat "*"
  ls "*"
)

typeset -gA SHRINK_OPTION_VALUE_FLAGS
SHRINK_OPTION_VALUE_FLAGS=(
  git "-C -c --git-dir --work-tree --namespace"
  npm "--prefix --cache --registry --workspace --userconfig -w -C"
  docker "-H --host --context --config"
  kubectl "-n --namespace -o --output --context --kubeconfig --cluster --user"
  gh "-R --repo"
)

_shrink_get_subcommand() {
  local cmd="$1"
  shift

  local -a args
  args=("$@")

  local -a value_flags
  value_flags=(${=SHRINK_OPTION_VALUE_FLAGS[$cmd]})

  local i part
  i=1
  while (( i <= ${#args[@]} )); do
    part="${args[$i]}"
    if [[ -z "$part" ]]; then
      (( i++ ))
      continue
    fi

    if (( ${value_flags[(Ie)$part]} > 0 )); then
      (( i += 2 ))
      continue
    fi

    if [[ "$part" == -* ]]; then
      (( i++ ))
      continue
    fi

    print -r -- "${part:l}"
    return 0
  done

  print -r -- ""
}

_shrink_should_route() {
  local cmd="$1"
  shift

  local rules="${SHRINK_RULES[$cmd]}"
  [[ -z "$rules" ]] && return 1
  [[ "$rules" == *"*"* ]] && return 0

  local subcommand
  subcommand="$(_shrink_get_subcommand "$cmd" "$@")"
  [[ -z "$subcommand" ]] && return 1

  local -a allowlist
  allowlist=(${=rules})
  (( ${allowlist[(Ie)$subcommand]} > 0 ))
}

_shrink_track_uncovered() {
  local cmd="$1"
  local bytes="$2"
  local status_code="$3"
  shift 3

  [[ -z "$SHRINKER_TRACK_UNCOVERED" || "$SHRINKER_TRACK_UNCOVERED" == "0" ]] && return 0
  command -v shrinker >/dev/null 2>&1 || return 0

  local subcommand
  subcommand="$(_shrink_get_subcommand "$cmd" "$@")"

  local -a track_args
  track_args=(track --executable "$cmd" --bytes "$bytes" --exit-code "$status_code")
  [[ -n "$subcommand" ]] && track_args+=(--subcommand "$subcommand")

  (command shrinker "${track_args[@]}" >/dev/null 2>&1 &)
}

_shrink_run_native_tracked() {
  local cmd="$1"
  shift

  if [[ -z "$SHRINKER_TRACK_UNCOVERED" || "$SHRINKER_TRACK_UNCOVERED" == "0" ]]; then
    command "$cmd" "$@"
    return $?
  fi

  # Only measure output volume when stdout is redirected (the agent case). Interactive
  # terminals keep the native command untouched so pagers and prompts still work.
  if [[ -t 1 ]]; then
    command "$cmd" "$@"
    local status_code=$?
    _shrink_track_uncovered "$cmd" 0 "$status_code" "$@"
    return $status_code
  fi

  local capture
  capture="$(mktemp -t shrinker-track)" || { command "$cmd" "$@"; return $?; }
  command "$cmd" "$@" | tee "$capture"
  local status_code=${pipestatus[1]}
  local bytes
  bytes="$(wc -c < "$capture" | tr -d ' ')"
  rm -f "$capture"
  _shrink_track_uncovered "$cmd" "${bytes:-0}" "$status_code" "$@"
  return $status_code
}

_shrink_invoke_or_native() {
  local cmd="$1"
  shift

  if _shrink_should_route "$cmd" "$@" && command -v shrinker >/dev/null 2>&1; then
    command shrinker "$cmd" "$@"
    return $?
  fi

  _shrink_run_native_tracked "$cmd" "$@"
}

git() { _shrink_invoke_or_native git "$@"; }
npm() { _shrink_invoke_or_native npm "$@"; }
docker() { _shrink_invoke_or_native docker "$@"; }
kubectl() { _shrink_invoke_or_native kubectl "$@"; }
gh() { _shrink_invoke_or_native gh "$@"; }
rg() { _shrink_invoke_or_native rg "$@"; }
find() { _shrink_invoke_or_native find "$@"; }
tail() { _shrink_invoke_or_native tail "$@"; }
cat() { _shrink_invoke_or_native cat "$@"; }
ls() { _shrink_invoke_or_native ls "$@"; }
