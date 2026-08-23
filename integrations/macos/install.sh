#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="shrinker-ai"
REGISTRY="https://registry.npmjs.org"
VERSION=""
LOCAL=0
SKIP_NPM_INSTALL=0
SKIP_BUILD=0
SKIP_LINK=0
ENABLE_PROFILE_ROUTING=0
SKIP_PROFILE=0
SKIP_AGENT_RULES=0
COPILOT_ONLY=0
CLAUDE_ONLY=0
PROFILE_PATH="${PROFILE_PATH:-$HOME/.zshrc}"
STEP=0

print_message() {
  local emoji="$1"
  local message="$2"
  STEP=$((STEP + 1))
  printf '%d. %s %s\n' "$STEP" "$emoji" "$message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL=1 ;;
    --package-name) PACKAGE_NAME="${2:-}"; shift ;;
    --registry) REGISTRY="${2:-}"; shift ;;
    --version) VERSION="${2:-}"; shift ;;
    --skip-npm-install) SKIP_NPM_INSTALL=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-link) SKIP_LINK=1 ;;
    --enable-profile-routing) ENABLE_PROFILE_ROUTING=1 ;;
    --skip-profile) SKIP_PROFILE=1 ;;
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

if (( LOCAL == 0 )); then
  package_spec="$PACKAGE_NAME"
  [[ -z "$VERSION" ]] || package_spec="$PACKAGE_NAME@$VERSION"
  print_message "📦" "Installing $package_spec from $REGISTRY..."
  npm install --silent --global "$package_spec" "--registry=$REGISTRY"
  package_root="$(npm root --global)/$PACKAGE_NAME"
  entrypoint="$package_root/integrations/macos/install.sh"
  [[ -f "$entrypoint" ]] || { print_message "❌" "Installed package installer not found: $entrypoint" >&2; exit 1; }
  bash "$entrypoint" --local \
    $( (( SKIP_NPM_INSTALL )) && echo --skip-npm-install ) \
    $( (( SKIP_BUILD )) && echo --skip-build ) \
    $( (( SKIP_LINK )) && echo --skip-link ) \
    $( (( ENABLE_PROFILE_ROUTING )) && echo --enable-profile-routing ) \
    $( (( SKIP_PROFILE )) && echo --skip-profile ) \
    $( (( SKIP_AGENT_RULES )) && echo --skip-agent-rules ) \
    $( (( COPILOT_ONLY )) && echo --copilot-only ) \
    $( (( CLAUDE_ONLY )) && echo --claude-only ) \
    --profile-path "$PROFILE_PATH"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_PATH="$REPO_ROOT/templates/agent-rules.md"
INTEGRATION_PATH="$SCRIPT_DIR/shrinker-profile.zsh"
BLOCK_START="<!-- shrinker agent rules start -->"
BLOCK_END="<!-- shrinker agent rules end -->"

node_version_raw="$(node -v 2>/dev/null || true)"
[[ -n "$node_version_raw" ]] || { print_message "❌" "Node.js was not found on PATH. Install Node.js 22.13+ first." >&2; exit 1; }
node_version="${node_version_raw#v}"
IFS='.' read -r node_major node_minor _ <<< "$node_version"
(( node_major > 22 || (node_major == 22 && node_minor >= 13) )) || { print_message "❌" "Node.js 22.13+ is required. Found $node_version_raw" >&2; exit 1; }

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

print_message "📦" "Installing shrinker from: $REPO_ROOT"
pushd "$REPO_ROOT" >/dev/null
if (( SKIP_NPM_INSTALL == 0 )); then
  print_message "📥" "Installing dependencies..."
  npm install --silent
fi
if (( SKIP_BUILD == 0 )); then
  print_message "🏗️" "Building shrinker..."
  npm run build --silent
fi
if (( SKIP_LINK == 0 )); then
  print_message "🔗" "Linking shrinker globally..."
  npm link --silent
fi
popd >/dev/null

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
