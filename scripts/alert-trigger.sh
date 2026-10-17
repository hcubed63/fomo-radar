#!/usr/bin/env bash
# FOMO Radar alert trigger. Runs every minute on an always-on machine.
# pump.fun's API blocks server-side fetches from Vercel, so this fetches the coin list with curl
# and pushes it to /api/telegram, which scores the coins and sends the Telegram alerts.
# It also keeps the "already alerted" list on disk so a coin is never alerted twice.
#
# Needs: curl, jq. Secret is read from a file (never put it in this repo).
#   FOMO_SECRET_FILE  default ~/.secrets/fomo-radar-cron-secret
#   FOMO_ENDPOINT     default https://fomo-radar-blond.vercel.app/api/telegram
#   FOMO_STATE_DIR    default ~/.fomo-radar
# Usage: alert-trigger.sh once | loop
set -uo pipefail

SECRET_FILE="${FOMO_SECRET_FILE:-$HOME/.secrets/fomo-radar-cron-secret}"
ENDPOINT="${FOMO_ENDPOINT:-https://fomo-radar-blond.vercel.app/api/telegram}"
STATE_DIR="${FOMO_STATE_DIR:-$HOME/.fomo-radar}"
SEEN="$STATE_DIR/seen.json"
LOG="$STATE_DIR/trigger.log"
PAGES=4
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

mkdir -p "$STATE_DIR"
[ -s "$SEEN" ] || echo '{}' > "$SEEN"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S %Z') $*" >> "$LOG"; }

run_once() {
  local tmp; tmp="$(mktemp -d)"; chmod 700 "$tmp"
  local i sort
  for sort in created_timestamp last_trade_timestamp; do
    for ((i = 0; i < PAGES; i++)); do
      curl -s --max-time 15 -o "$tmp/$sort-$i.json" \
        -H 'Accept: application/json' -H "User-Agent: $UA" \
        -H 'Origin: https://pump.fun' -H 'Referer: https://pump.fun/' \
        "https://frontend-api-v3.pump.fun/coins?offset=$((i * 50))&limit=50&sort=$sort&order=DESC&includeNsfw=false" &
    done
  done
  wait

  local coins="$tmp/coins.json"
  for f in "$tmp"/*-*.json; do jq -c 'if type == "array" then . else [] end' "$f" 2>/dev/null || echo '[]'; done \
    | jq -cs 'add // [] | unique_by(.mint) | map({mint, symbol, name, image_uri, usd_market_cap, market_cap_usd,
        reply_count, created_timestamp, complete, real_token_reserves, base_decimals, ath_market_cap, ath_market_cap_timestamp})' > "$coins"
  [ -s "$coins" ] || echo '[]' > "$coins"

  # Forget alerts older than 6 hours (coins only alert up to 45 minutes old).
  local now; now="$(date +%s)"
  jq -c --argjson now "$now" 'with_entries(select(.value > $now - 21600))' "$SEEN" > "$SEEN.tmp" && mv "$SEEN.tmp" "$SEEN"

  local body resp code
  jq -cn --slurpfile coins "$coins" --slurpfile seen "$SEEN" '{seen: ($seen[0] | keys), coins: $coins[0]}' > "$tmp/body.json"
  # Secret goes in via a header file so it never shows in the process list.
  printf 'Authorization: Bearer %s\n' "$(cat "$SECRET_FILE")" > "$tmp/auth"
  resp="$(curl -s --max-time 45 -w '\n%{http_code}' -X POST "$ENDPOINT" \
    -H @"$tmp/auth" -H 'Content-Type: application/json' --data-binary @"$tmp/body.json")"
  local ncoins; ncoins="$(jq 'length' "$coins")"
  rm -rf "$tmp"
  code="${resp##*$'\n'}"; resp="${resp%$'\n'*}"

  if [ "$code" = "200" ]; then
    local sent
    sent="$(jq -c '.sentMints // []' <<< "$resp" 2>/dev/null || echo '[]')"
    jq -c --argjson sent "$sent" --argjson now "$now" 'reduce $sent[] as $m (.; .[$m] = $now)' "$SEEN" > "$SEEN.tmp" && mv "$SEEN.tmp" "$SEEN"
  fi
  log "http=$code coins=$ncoins $(jq -c '{ok, source, scanned, candidates, sent, errors}' <<< "$resp" 2>/dev/null || echo "${resp:0:200}")"
  # keep the log small
  if [ "$(wc -l < "$LOG")" -gt 3000 ]; then tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
}

case "${1:-once}" in
  once) run_once ;;
  loop)
    while true; do
      run_once
      sleep $((60 - $(date +%s) % 60))
    done ;;
  *) echo "usage: $0 once|loop" >&2; exit 2 ;;
esac
