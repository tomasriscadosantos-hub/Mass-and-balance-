#!/usr/bin/env bash
# Deploys the weather relay (worker/index.mjs + worker/weather.mjs) to
# Cloudflare Workers and prints its address, which goes in WEATHER_RELAY in
# web/js/data.js.
#
#   CLOUDFLARE_API_TOKEN=... worker/deploy.sh
#
# The token is an API token made with Cloudflare's "Edit Cloudflare Workers"
# template. CLOUDFLARE_ACCOUNT_ID is optional (the token's first account).
set -euo pipefail
cd "$(dirname "$0")"

NAME=lppm-weather
API=https://api.cloudflare.com/client/v4
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

call() { # method path [curl args...]: prints the JSON result, fails on an API error
  local method=$1 path=$2
  shift 2
  local out
  out=$(curl -sS -X "$method" -H "$AUTH" "$API$path" "$@")
  if ! python3 -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1]).get("success") else 1)' "$out"; then
    echo "Cloudflare refused $method $path: $out" >&2
    exit 1
  fi
  printf '%s' "$out"
}
field() { python3 -c 'import json,sys; r=json.loads(sys.argv[1])["result"]; print(eval(sys.argv[2]) or "")' "$1" "$2"; }

ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-$(field "$(call GET /accounts)" 'r[0]["id"]')}

# The account's workers.dev subdomain (Cloudflare creates it the first time
# Workers is opened in the dashboard).
SUB=$(field "$(call GET "/accounts/$ACCOUNT_ID/workers/subdomain")" 'r.get("subdomain")')
if [ -z "$SUB" ]; then
  echo "This account has no workers.dev subdomain yet: open Workers & Pages in the Cloudflare dashboard once." >&2
  exit 1
fi

META=$(mktemp)
trap 'rm -f "$META"' EXIT
printf '{"main_module":"index.mjs","compatibility_date":"2025-01-01"}' > "$META"
call PUT "/accounts/$ACCOUNT_ID/workers/scripts/$NAME" \
  -F "metadata=@$META;type=application/json" \
  -F "index.mjs=@index.mjs;type=application/javascript+module" \
  -F "weather.mjs=@weather.mjs;type=application/javascript+module" > /dev/null
call POST "/accounts/$ACCOUNT_ID/workers/scripts/$NAME/subdomain" \
  -H "Content-Type: application/json" --data '{"enabled":true,"previews_enabled":false}' > /dev/null

echo "https://$NAME.$SUB.workers.dev/"
