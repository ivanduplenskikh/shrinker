#!/usr/bin/env bash
set -euo pipefail

LOCAL=0
VERSION=""
RELEASE_REPO="ivanduplenskikh/shrinker"
ASSET_BASE_URL=""
INSTALL_DIR="${SHRINKER_INSTALL_DIR:-$HOME/.shrinker}"
ENABLE_PROFILE_ROUTING=0
SKIP_PROFILE=0
SKIP_AGENT_RULES=0
COPILOT_ONLY=0
CLAUDE_ONLY=0
TRACK_UNCOVERED=""
PROFILE_PATH="${PROFILE_PATH:-$HOME/.zshrc}"
CONFIG_PATH="${SHRINKER_CONFIG_PATH:-$HOME/.shrinker/config}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL=1 ;;
    --version) VERSION="${2:-}"; shift ;;
    --release-repo) RELEASE_REPO="${2:-}"; shift ;;
    --asset-base-url) ASSET_BASE_URL="${2:-}"; shift ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift ;;
    --enable-profile-routing) ENABLE_PROFILE_ROUTING=1 ;;
    --skip-profile) SKIP_PROFILE=1 ;;
    --skip-agent-rules) SKIP_AGENT_RULES=1 ;;
    --copilot-only) COPILOT_ONLY=1 ;;
    --claude-only) CLAUDE_ONLY=1 ;;
    --enable-uncovered-tracking) TRACK_UNCOVERED=true ;;
    --disable-uncovered-tracking) TRACK_UNCOVERED=false ;;
    --profile-path) PROFILE_PATH="${2:-}"; shift ;;
    --config-path) CONFIG_PATH="${2:-}"; shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

if (( ENABLE_PROFILE_ROUTING && SKIP_PROFILE )); then echo "Use either --enable-profile-routing or --skip-profile, not both." >&2; exit 1; fi
if (( COPILOT_ONLY && CLAUDE_ONLY )); then echo "Use either --copilot-only or --claude-only, not both." >&2; exit 1; fi

arguments=(install)
(( LOCAL )) && arguments+=(--local)
(( ENABLE_PROFILE_ROUTING )) && arguments+=(--enable-profile-routing)
(( SKIP_PROFILE )) && arguments+=(--skip-profile)
(( SKIP_AGENT_RULES )) && arguments+=(--skip-agent-rules)
(( COPILOT_ONLY )) && arguments+=(--copilot-only)
(( CLAUDE_ONLY )) && arguments+=(--claude-only)
[[ -n "$TRACK_UNCOVERED" ]] && arguments+=(--track-uncovered="$TRACK_UNCOVERED")
[[ -n "$VERSION" ]] && arguments+=(--version "$VERSION")
arguments+=(--install-dir "$INSTALL_DIR" --profile-path "$PROFILE_PATH" --config-path "$CONFIG_PATH")

if (( LOCAL )); then
  cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  exec go run ./cmd/installer "${arguments[@]}"
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) target=macos-arm64 ;;
  Darwin-x86_64) target=macos-x64 ;;
  Linux-x86_64) target=linux-x64 ;;
  *) echo "Unsupported release platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

asset="shrinker-$target.tar.gz"
if [[ -n "$ASSET_BASE_URL" ]]; then url="${ASSET_BASE_URL%/}/$asset"
elif [[ -n "$VERSION" ]]; then url="https://github.com/$RELEASE_REPO/releases/download/v${VERSION#v}/$asset"
else url="https://github.com/$RELEASE_REPO/releases/latest/download/$asset"; fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
curl -fL "$url" -o "$temporary/$asset"
tar -xzf "$temporary/$asset" -C "$temporary"
[[ -x "$temporary/bin/installer" ]] || { echo "Release archive is missing bin/installer" >&2; exit 1; }
exec "$temporary/bin/installer" "${arguments[@]}" --archive "$temporary/$asset"
