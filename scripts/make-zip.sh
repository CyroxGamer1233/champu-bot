#!/usr/bin/env bash
# Build champu-bot.zip (or the name given as $1) without node_modules, data/*, .env, .git.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-champu-bot.zip}"
rm -f "$OUT"
zip -r "$OUT" . -x 'node_modules/*' 'data/*' '.env' '.git/*' '*.zip' >/dev/null
zip "$OUT" data/.gitkeep >/dev/null
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"

