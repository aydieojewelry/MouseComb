#!/usr/bin/env bash
# Install REA and the rebuild-app skill into your global (user-level) Claude Code.
#
#   ./install.sh          show REA's setup plan and ask before applying it
#   ./install.sh --yes    apply without prompting (for cloud setup scripts)
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="${HOME}/.claude/skills"
approve=""
[[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]] && approve="--yes"

# REA needs Node ^22.19, ^24.11 or >=26.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.19+ is required: https://nodejs.org" >&2
  exit 1
fi
node -e '
  const [maj, min] = process.versions.node.split(".").map(Number);
  const ok = (maj === 22 && min >= 19) || (maj === 24 && min >= 11) || maj >= 26;
  if (!ok) { console.error(`Node ${process.versions.node} is too old for REA; install 22.19+ or 24.11+.`); process.exit(1); }
'

echo "==> Registering the REA MCP server and skill with Claude Code (user scope)"
if [[ -n "$approve" ]]; then
  npx -y rea-agents@latest setup --client claude_code --yes
else
  npx -y rea-agents@latest setup --client claude_code --dry-run
  read -r -p "Apply this plan? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Skipped REA setup."; exit 0; }
  npx -y rea-agents@latest setup --client claude_code --yes
fi

echo "==> Installing the rebuild-app skill to ${skills_dir}/rebuild-app"
mkdir -p "$skills_dir"
rm -rf "${skills_dir}/rebuild-app"
cp -R "${repo_dir}/.claude/skills/rebuild-app" "${skills_dir}/rebuild-app"

echo "==> Verifying"
npx -y rea-agents@latest mcp doctor | grep -E '^healthy:'
test -f "${skills_dir}/reverse-engineer-anything/SKILL.md" && echo "skill: reverse-engineer-anything installed"
test -f "${skills_dir}/rebuild-app/SKILL.md" && echo "skill: rebuild-app installed"
echo "Done. Restart Claude Code so the REA tools load."
