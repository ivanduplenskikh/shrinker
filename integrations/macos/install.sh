#!/usr/bin/env bash
set -euo pipefail

VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

arguments=(install)

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) target=macos-arm64 ;;
  Darwin-x86_64) target=macos-x64 ;;
  Linux-x86_64) target=linux-x64 ;;
  *) echo "Unsupported release platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

asset="shrinker-$target.tar.gz"
if [[ -n "$VERSION" ]]; then url="https://github.com/ivanduplenskikh/shrinker/releases/download/v${VERSION#v}/$asset"
else url="https://github.com/ivanduplenskikh/shrinker/releases/latest/download/$asset"; fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
curl -fL "$url" -o "$temporary/$asset"
curl -fL "$url.sha256" -o "$temporary/$asset.sha256"
expected="$(awk '{print $1}' "$temporary/$asset.sha256")"
if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$temporary/$asset" | awk '{print $1}')"
else
  actual="$(sha256sum "$temporary/$asset" | awk '{print $1}')"
fi
[[ "$expected" =~ ^[[:xdigit:]]{64}$ && "${actual,,}" == "${expected,,}" ]] || { echo "Release archive checksum verification failed" >&2; exit 1; }
tar -xzf "$temporary/$asset" -C "$temporary"
[[ -x "$temporary/bin/installer" ]] || { echo "Release archive is missing bin/installer" >&2; exit 1; }
exec "$temporary/bin/installer" "${arguments[@]}"
