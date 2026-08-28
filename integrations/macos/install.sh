#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="shrinker-ai"
REGISTRY="https://registry.npmjs.org"
VERSION=""
USE_NPM=0
RELEASE_REPO="ivanduplenskikh/shrinker"
ASSET_BASE_URL=""
LOCAL=0
SKIP_NPM_INSTALL=0
SKIP_BUILD=0
SKIP_LINK=0
ENABLE_PROFILE_ROUTING=0
SKIP_PROFILE=0
SKIP_AGENT_RULES=0
COPILOT_ONLY=0
CLAUDE_ONLY=0
TRACK_UNCOVERED=""
PROFILE_PATH="${PROFILE_PATH:-$HOME/.zshrc}"
CONFIG_PATH="${SHRINKER_CONFIG_PATH:-$HOME/.shrinker/config}"
INSTALL_DIR="${SHRINKER_INSTALL_DIR:-$HOME/.shrinker}"
STEP="${SHRINKER_STEP_OFFSET:-0}"

print_message() {
  local emoji="$1"
  local message="$2"
  STEP=$((STEP + 1))
  printf '%d. %s %s\n' "$STEP" "$emoji" "$message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL=1 ;;
    --use-npm) USE_NPM=1 ;;
    --package-name) PACKAGE_NAME="${2:-}"; shift ;;
    --registry) REGISTRY="${2:-}"; shift ;;
    --version) VERSION="${2:-}"; shift ;;
    --release-repo) RELEASE_REPO="${2:-}"; shift ;;
    --asset-base-url) ASSET_BASE_URL="${2:-}"; shift ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift ;;
    --skip-npm-install) SKIP_NPM_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-link) SKIP_LINK=1 ;;
    --enable-profile-routing) ENABLE_PROFILE_ROUTING=1 ;;
    --skip-profile) SKIP_PROFILE=1 ;;
    --enable-uncovered-tracking) TRACK_UNCOVERED=1 ;;
    --disable-uncovered-tracking) TRACK_UNCOVERED=0 ;;
    --skip-agent-rules) SKIP_AGENT_RULES=1 ;;
    --copilot-only) COPILOT_ONLY=1 ;;
    --claude-only) CLAUDE_ONLY=1 ;;
    --profile-path) PROFILE_PATH="${2:-}"; shift ;;
    *) print_message "❌" "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if (( ENABLE_PROFILE_ROUTING == 1 && SKIP_PROFILE == 1 )); then print_message "❌" "Use either --enable-profile-routing or --skip-profile, not both." >&2; exit 1; fi
if (( COPILOT_ONLY == 1 && CLAUDE_ONLY == 1 )); then print_message "❌" "Use either --copilot-only or --claude-only, not both." >&2; exit 1; fi

# Prompt only on a TTY; non-interactive installs keep tracking on and leave the shell profile alone.
prompt_yes_no() {
  local question="$1"
  local default_answer="$2"
  local reply
  local hint="[y/N]"
  [[ "$default_answer" == "1" ]] && hint="[Y/n]"
  printf '   %s %s ' "$question" "$hint" > /dev/tty
  IFS= read -r reply < /dev/tty || reply=""
  case "$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')" in
    y|yes) echo 1 ;;
    n|no) echo 0 ;;
    *) echo "$default_answer" ;;
  esac
}

interactive=0
[[ -t 0 && -r /dev/tty ]] && interactive=1

if [[ -z "$TRACK_UNCOVERED" ]]; then
  if (( interactive )); then
    print_message "❓" "Track uncovered commands? Records which unfiltered commands cost the most tokens."
    TRACK_UNCOVERED="$(prompt_yes_no "Enable uncovered-command tracking?" 1)"
  else
    TRACK_UNCOVERED=1
  fi
fi

if (( interactive && SKIP_PROFILE == 0 && ENABLE_PROFILE_ROUTING == 0 )); then
  print_message "❓" "Route wrapped commands through shrinker automatically? Adds a source line to $PROFILE_PATH."
  ENABLE_PROFILE_ROUTING="$(prompt_yes_no "Enable automatic shell routing?" 0)"
fi

if (( LOCAL == 0 && USE_NPM == 1 )); then
  package_spec="$PACKAGE_NAME"
  [[ -z "$VERSION" ]] || package_spec="$PACKAGE_NAME@$VERSION"
  print_message "📦" "Installing $package_spec from $REGISTRY..."
  npm install --silent --global "$package_spec" "--registry=$REGISTRY"
  package_root="$(npm root --global)/$PACKAGE_NAME"
  entrypoint="$package_root/integrations/macos/install.sh"
  [[ -f "$entrypoint" ]] || { print_message "❌" "Installed package installer not found: $entrypoint" >&2; exit 1; }
  SHRINKER_STEP_OFFSET="$STEP" bash "$entrypoint" --local --skip-npm-install --skip-build --skip-link \
    $( (( ENABLE_PROFILE_ROUTING )) && echo --enable-profile-routing ) \
    $( (( SKIP_PROFILE )) && echo --skip-profile ) \
    $( (( SKIP_AGENT_RULES )) && echo --skip-agent-rules ) \
    $( (( COPILOT_ONLY )) && echo --copilot-only ) \
    $( (( CLAUDE_ONLY )) && echo --claude-only ) \
    $( (( TRACK_UNCOVERED )) && echo --enable-uncovered-tracking || echo --disable-uncovered-tracking ) \
    --profile-path "$PROFILE_PATH"
  if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
  fi
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_PATH="$REPO_ROOT/templates/agent-rules.md"
INTEGRATION_PATH="$SCRIPT_DIR/shrinker-profile.zsh"
BLOCK_START="<!-- shrinker agent rules start -->"
BLOCK_END="<!-- shrinker agent rules end -->"

if (( LOCAL == 1 )); then
  node_version_raw="$(node -v 2>/dev/null || true)"
  [[ -n "$node_version_raw" ]] || { print_message "❌" "Node.js was not found on PATH. Install Node.js 22.13+ first." >&2; exit 1; }
  node_version="${node_version_raw#v}"
  IFS='.' read -r node_major node_minor _ <<< "$node_version"
  (( node_major > 22 || (node_major == 22 && node_minor >= 13) )) || { print_message "❌" "Node.js 22.13+ is required. Found $node_version_raw" >&2; exit 1; }
fi

set_agent_rules() {
  local target="$1"
  local body="$2"
  local block="$BLOCK_START"$'\n'"$body"$'\n'"$BLOCK_END"
  mkdir -p "$(dirname "$target")"
  if [[ -f "$target" ]] && grep -Fq "$BLOCK_START" "$target" && grep -Fq "$BLOCK_END" "$target"; then
    local block_file
    block_file="$(mktemp "$(dirname "$target")/.shrinker-rules.XXXXXX")"
    printf '%s\n' "$block" > "$block_file"
    awk -v start="$BLOCK_START" -v end="$BLOCK_END" -v block_file="$block_file" '
      function print_block(line) {
        while ((getline line < block_file) > 0) print line
        close(block_file)
      }
      {
        if (index($0, start) > 0) {
          if (!replaced) print_block()
          replaced = 1
          inblock = 1
          next
        }
        if (inblock && index($0, end) > 0) {
          inblock = 0
          next
        }
        if (!inblock) print
      }
    ' "$target" > "$target.tmp"
    rm -f "$block_file"
    mv "$target.tmp" "$target"
  elif [[ -f "$target" ]]; then printf '\n%s\n' "$block" >> "$target"
  else printf '%s\n' "$block" > "$target"; fi
  print_message "📄" "Installed managed rules in: $target"
}

add_profile_integration() {
  local profile_file="$1"
  mkdir -p "$(dirname "$profile_file")"; touch "$profile_file"
  if ! grep -Fq '# >>> shrinker integration >>>' "$profile_file"; then
    printf '\n# >>> shrinker integration >>>\nsource "%s"\n# <<< shrinker integration <<<\n\n' "$INTEGRATION_PATH" >> "$profile_file"
  fi
}

add_path_integration() {
  local profile_file="$1"
  mkdir -p "$(dirname "$profile_file")"; touch "$profile_file"
  if ! grep -Fq '# >>> shrinker path >>>' "$profile_file"; then
    printf '\n# >>> shrinker path >>>\nexport PATH="%s/bin:$PATH"\n# <<< shrinker path <<<\n\n' "$INSTALL_DIR" >> "$profile_file"
    print_message "🧭" "Added shrinker to PATH in profile: $profile_file"
  fi
  case ":$PATH:" in
    *":$INSTALL_DIR/bin:"*) ;;
    *) export PATH="$INSTALL_DIR/bin:$PATH" ;;
  esac
}

set_config_value() {
  local key="$1"
  local value="$2"
  mkdir -p "$(dirname "$CONFIG_PATH")"
  chmod 700 "$(dirname "$CONFIG_PATH")" 2>/dev/null || true
  touch "$CONFIG_PATH"
  if grep -Eq "^[[:space:]]*$key[[:space:]]*=" "$CONFIG_PATH"; then
    grep -Ev "^[[:space:]]*$key[[:space:]]*=" "$CONFIG_PATH" > "$CONFIG_PATH.tmp" || true
    mv "$CONFIG_PATH.tmp" "$CONFIG_PATH"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$CONFIG_PATH"
  print_message "⚙️" "Set $key=$value in: $CONFIG_PATH"
}

release_target() {
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) printf '%s' "macos-arm64" ;;
    Darwin-x86_64) printf '%s' "macos-x64" ;;
    Linux-x86_64) printf '%s' "linux-x64" ;;
    *) print_message "❌" "Unsupported release platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
}

release_asset_url() {
  local target asset tag
  target="$(release_target)"
  asset="shrinker-$target.tar.gz"
  if [[ -n "$ASSET_BASE_URL" ]]; then
    printf '%s/%s' "${ASSET_BASE_URL%/}" "$asset"
  elif [[ -n "$VERSION" ]]; then
    tag="$VERSION"
    [[ "$tag" == v* ]] || tag="v$tag"
    printf 'https://github.com/%s/releases/download/%s/%s' "$RELEASE_REPO" "$tag" "$asset"
  else
    printf 'https://github.com/%s/releases/latest/download/%s' "$RELEASE_REPO" "$asset"
  fi
}

install_release_package() {
  local asset_url archive extract_dir name
  asset_url="$(release_asset_url)"
  archive="$(mktemp -t shrinker-release.XXXXXX).tar.gz"
  extract_dir="$(mktemp -d -t shrinker-install.XXXXXX)"
  trap 'rm -f "$archive"; rm -rf "$extract_dir"' RETURN

  print_message "📦" "Downloading shrinker from: $asset_url"
  curl -fL "$asset_url" -o "$archive"
  tar -xzf "$archive" -C "$extract_dir"
  mkdir -p "$INSTALL_DIR"
  for name in bin integrations templates; do
    [[ -d "$extract_dir/$name" ]] || { print_message "❌" "Release archive is missing: $name" >&2; exit 1; }
    rm -rf "$INSTALL_DIR/$name"
    cp -R "$extract_dir/$name" "$INSTALL_DIR/"
  done
  [[ -f "$extract_dir/manifest.json" ]] && cp "$extract_dir/manifest.json" "$INSTALL_DIR/manifest.json"
  [[ -x "$INSTALL_DIR/bin/shrinker" ]] || chmod +x "$INSTALL_DIR/bin/shrinker"
  [[ -x "$INSTALL_DIR/bin/shrinker" ]] || { print_message "❌" "Installed executable not found: $INSTALL_DIR/bin/shrinker" >&2; exit 1; }

  add_path_integration "$PROFILE_PATH"
  set_config_value "SHRINKER_TRACK_UNCOVERED" "$TRACK_UNCOVERED"
  if (( SKIP_PROFILE == 0 && ENABLE_PROFILE_ROUTING == 1 )); then add_profile_integration "$PROFILE_PATH"; fi
  if (( SKIP_AGENT_RULES == 0 )); then
    [[ -f "$INSTALL_DIR/templates/agent-rules.md" ]] || { print_message "❌" "Agent rules template not found: $INSTALL_DIR/templates/agent-rules.md" >&2; exit 1; }
    rules_body="$(cat "$INSTALL_DIR/templates/agent-rules.md")"
    (( CLAUDE_ONLY )) || set_agent_rules "$HOME/.copilot/copilot-instructions.md" "$rules_body"
    (( COPILOT_ONLY )) || set_agent_rules "$HOME/.claude/CLAUDE.md" "$rules_body"
  fi

  print_message "✅" "Install complete."
  echo ""
  echo "💡 Try: shrinker help"
}

if (( LOCAL == 0 )); then
  install_release_package
  if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
  fi
  exit 0
fi

print_message "📦" "Installing shrinker from: $REPO_ROOT"
pushd "$REPO_ROOT" >/dev/null
if (( SKIP_NPM_INSTALL == 0 )); then
  print_message "📥" "Installing dependencies..."
  npm install --silent
fi
if (( SKIP_BUILD == 0 )); then
  print_message "🏗️" "Building shrinker..."
  SHRINKER_BUILD_QUIET=1 npm run build --silent
fi
if (( SKIP_LINK == 0 )); then
  print_message "🔗" "Linking shrinker globally..."
  npm link --silent
fi
popd >/dev/null

set_config_value "SHRINKER_TRACK_UNCOVERED" "$TRACK_UNCOVERED"
if (( SKIP_PROFILE == 0 && ENABLE_PROFILE_ROUTING == 1 )); then add_profile_integration "$PROFILE_PATH"; fi
if (( SKIP_AGENT_RULES == 0 )); then
  [[ -f "$TEMPLATE_PATH" ]] || { print_message "❌" "Agent rules template not found: $TEMPLATE_PATH" >&2; exit 1; }
  rules_body="$(cat "$TEMPLATE_PATH")"
  (( CLAUDE_ONLY )) || set_agent_rules "$HOME/.copilot/copilot-instructions.md" "$rules_body"
  (( COPILOT_ONLY )) || set_agent_rules "$HOME/.claude/CLAUDE.md" "$rules_body"
fi

print_message "✅" "Install complete."
echo ""
echo "💡 Try: shrinker help"
