#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/.shrinker-src"
REMOVE_INSTALL_DIR=0
SKIP_UNLINK=0
SKIP_AGENT_RULES=0
COPILOT_ONLY=0
CLAUDE_ONLY=0
PROFILE_PATH="${PROFILE_PATH:-$HOME/.zshrc}"
UNINSTALL_STEP=0

print_step() {
  local emoji="$1" message="$2"
  UNINSTALL_STEP=$((UNINSTALL_STEP + 1))
  printf '%d. %s %s\n' "$UNINSTALL_STEP" "$emoji" "$message"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-unlink) SKIP_UNLINK=1 ;;
    --skip-agent-rules) SKIP_AGENT_RULES=1 ;;
    --copilot-only) COPILOT_ONLY=1 ;;
    --claude-only) CLAUDE_ONLY=1 ;;
    --profile-path) PROFILE_PATH="${2:-}"; shift ;;
    --install-dir) INSTALL_DIR="${2:-}"; shift ;;
    --remove-install-dir) REMOVE_INSTALL_DIR=1 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if (( COPILOT_ONLY == 1 && CLAUDE_ONLY == 1 )); then echo "Use either --copilot-only or --claude-only, not both." >&2; exit 1; fi
BLOCK_START="<!-- shrinker agent rules start -->"
BLOCK_END="<!-- shrinker agent rules end -->"

remove_agent_rules() {
  local target="$1"
  [[ -f "$target" ]] || return 0
  awk -v start="$BLOCK_START" -v end="$BLOCK_END" 'BEGIN{inblock=0} {if(index($0,start)>0){inblock=1;next} if(inblock&&index($0,end)>0){inblock=0;next} if(!inblock)print}' "$target" > "$target.tmp"
  mv "$target.tmp" "$target"
}

remove_profile_integration() {
  local profile_file="$1"
  [[ -f "$profile_file" ]] || return 0
  awk -v start='# >>> shrinker integration >>>' -v end='# <<< shrinker integration <<<' 'BEGIN{inblock=0} {if(index($0,start)>0){inblock=1;next} if(inblock&&index($0,end)>0){inblock=0;next} if(!inblock)print}' "$profile_file" > "$profile_file.tmp"
  mv "$profile_file.tmp" "$profile_file"
}

if (( SKIP_UNLINK == 0 )); then
  print_step "🔗" "Unlinking shrinker globally..."
  npm unlink --silent --global shrinker-ai
else
  print_step "⏭️" "Skipped global npm unlink."
fi
print_step "🔧" "Removing shell profile integration..."
remove_profile_integration "$PROFILE_PATH"
if (( SKIP_AGENT_RULES == 0 )); then
  (( CLAUDE_ONLY )) || remove_agent_rules "$HOME/.copilot/copilot-instructions.md"
  (( COPILOT_ONLY )) || remove_agent_rules "$HOME/.claude/CLAUDE.md"
else
  print_step "⏭️" "Skipped managed agent rules."
fi
print_step "✅" "Uninstall complete."

if (( REMOVE_INSTALL_DIR == 1 )) && [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  print_step "🧹" "Removed install directory: $INSTALL_DIR"
fi
