#!/usr/bin/env bash
# Send a message to Discord via webhook. The webhook URL is read from the
# agent-state volume (notify.env), which is NEVER committed to this public repo.
#
# Usage: notify.sh "message text"
set -euo pipefail

STATE_DIR="${AGENT_STATE_DIR:-$HOME/.claude/projects/-workspace/agent-state}"
ENV_FILE="$STATE_DIR/notify.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "notify: $ENV_FILE not found; skipping notification" >&2
  exit 0
fi
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${DISCORD_WEBHOOK_URL:?notify: DISCORD_WEBHOOK_URL missing from notify.env}"

msg="${1:-(no message)}"
# Build the JSON body with python so the message is escaped safely.
payload=$(python3 -c 'import json,sys; print(json.dumps({"content": sys.argv[1]}))' "$msg")

code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Content-Type: application/json" -d "$payload" "$DISCORD_WEBHOOK_URL")
case "$code" in
  2*) echo "notify: sent (HTTP $code)" ;;
  *)  echo "notify: FAILED (HTTP $code)" >&2; exit 1 ;;
esac
