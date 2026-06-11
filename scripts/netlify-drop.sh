#!/usr/bin/env bash
# Builds the app and copies dist → netlify-drop for Netlify manual deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill in Firebase config first."
  exit 1
fi

npm run build
rm -rf netlify-drop
mkdir -p netlify-drop
cp -R dist/. netlify-drop/

echo ""
echo "Ready: drag the netlify-drop folder onto Netlify → Deploys → drag and drop."
echo "Path: $(pwd)/netlify-drop"
