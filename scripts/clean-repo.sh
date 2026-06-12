#!/usr/bin/env bash
# Run once to purge secret/build files from git history on the remote.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Removing secret and build artifacts from git tracking..."
git rm -rf --cached netlify.env .env dist netlify-drop "Beer Pressure" 2>/dev/null || true
git rm -rf --cached "**/netlify.env" "**/.env" 2>/dev/null || true

echo "Done. Commit and push:"
echo "  git commit -m 'Remove env files and build artifacts from repo'"
echo "  git push origin main"
