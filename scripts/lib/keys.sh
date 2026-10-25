# shellcheck shell=bash disable=SC2034  # the variables set here are read by the scripts that source this
# Shared helpers for scripts/setup-keys.sh and scripts/check-keys.sh. Sourced, not run.
#
# Each key is found the same way the skills find it: the environment variable first, else the
# macOS Keychain item (service gtmagic-<provider>, account $USER). Keys only ever travel through
# shell variables and stdin pipes, never a command line, so they stay out of `ps`, shell history,
# logs and this terminal. Written for macOS's bash 3.2 (no associative arrays).

KEY_PROVIDERS="tavily openrouter"
SECURITY_BIN=/usr/bin/security
KEY_ACCOUNT="${USER:-$(id -un)}"

# Sets PROVIDER_NAME, KEY_SERVICE, KEY_ENV_VAR, KEY_PREFIX, KEY_CHECK_URL and KEY_HELP_URL for $1.
# KEY_CHECK_URL is a free "who am I" endpoint: checking a key spends no credits.
provider_info() {
  case "$1" in
    tavily)
      PROVIDER_NAME="Tavily"
      KEY_SERVICE="gtmagic-tavily"
      KEY_ENV_VAR="TAVILY_API_KEY"
      KEY_PREFIX="tvly-"
      KEY_CHECK_URL="https://api.tavily.com/usage"
      KEY_HELP_URL="https://app.tavily.com"
      ;;
    openrouter)
      PROVIDER_NAME="OpenRouter"
      KEY_SERVICE="gtmagic-openrouter"
      KEY_ENV_VAR="OPENROUTER_API_KEY"
      KEY_PREFIX="sk-or-"
      KEY_CHECK_URL="https://openrouter.ai/api/v1/key"
      KEY_HELP_URL="https://openrouter.ai/settings/keys"
      ;;
    *)
      echo "Unknown key '$1'. Choose from: $KEY_PROVIDERS" >&2
      return 1
      ;;
  esac
}

has_keychain() {
  [ "$(uname -s)" = "Darwin" ] && [ -x "$SECURITY_BIN" ]
}

trim() {  # strips the spaces and newlines a copy-paste tends to bring along
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

keychain_read() {  # $1 = service. Writes the stored key to stdout for $(...) capture; empty if none.
  has_keychain || return 1
  "$SECURITY_BIN" find-generic-password -s "$1" -a "$KEY_ACCOUNT" -w 2>/dev/null
}

keychain_has() {  # $1 = service. Checks only that the item exists; the key isn't read.
  has_keychain && "$SECURITY_BIN" find-generic-password -s "$1" -a "$KEY_ACCOUNT" >/dev/null 2>&1
}

# $1 = service, $2 = label, $3 = key. The command goes to `security -i` over stdin, so the key never
# appears in argv. -U replaces an existing item. Callers must have checked the key's characters
# (see is_plain_key), since a quote inside it would break the command.
keychain_write() {
  printf 'add-generic-password -U -s "%s" -a "%s" -l "%s" -w "%s"\n' "$1" "$KEY_ACCOUNT" "$2" "$3" |
    "$SECURITY_BIN" -i >/dev/null 2>&1 || return 1
  [ "$(keychain_read "$1")" = "$3" ]  # confirm it really landed
}

is_plain_key() {  # API keys from both providers are letters, digits, dashes and underscores only
  [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]
}

env_key() {  # value of the current provider's environment variable, trimmed; empty if unset
  trim "${!KEY_ENV_VAR:-}"
}

# Sets KEY_VALUE and KEY_SOURCE ("env", "keychain" or "") for the current provider, in the same
# order the skills use: environment variable, then Keychain.
resolve_key() {
  KEY_VALUE="$(env_key)"
  KEY_SOURCE="env"
  if [ -z "$KEY_VALUE" ]; then
    KEY_VALUE="$(trim "$(keychain_read "$KEY_SERVICE" || true)")"
    KEY_SOURCE="keychain"
  fi
  [ -n "$KEY_VALUE" ] || KEY_SOURCE=""
}

key_source_label() {
  case "$KEY_SOURCE" in
    env) echo "\$$KEY_ENV_VAR" ;;
    keychain) echo "Keychain item '$KEY_SERVICE'" ;;
    *) echo "nowhere" ;;
  esac
}

# $1 = key, $2 = file for the response body, $3 = file for curl's error text.
# Prints the HTTP status ("000" when there was no response). The header goes in on stdin (-H @-).
probe_key() {
  printf 'Authorization: Bearer %s\n' "$1" |
    curl -sS -m 20 -o "$2" -w '%{http_code}' -H @- "$KEY_CHECK_URL" 2>"$3" || true
}

# $1 = provider, $2 = response body file. Prints one line, "ok|warn|fail <message>", read from the
# provider's usage numbers. Only derived numbers are printed: OpenRouter's response includes a
# masked copy of the key in "label", so the raw body is never shown.
read_usage() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ok key accepted (install python3 to see credits left)"
    return
  fi
  python3 -I - "$1" "$2" <<'PY' 2>/dev/null || echo "ok key accepted (couldn't read the credit details)"
import json, sys

provider, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    body = json.load(f)

def left(limit, used):
    return None if not isinstance(limit, (int, float)) else limit - (used or 0)

if provider == "tavily":
    key, account = body.get("key") or {}, body.get("account") or {}
    key_left = left(key.get("limit"), key.get("usage"))
    plan_left = left(account.get("plan_limit"), account.get("plan_usage"))
    if key_left is not None and key_left <= 0:
        print("fail this key's own credit limit is used up; raise it at app.tavily.com")
    elif plan_left is not None and plan_left <= 0:
        print("warn this billing cycle's plan credits are used up; searches fail unless pay-as-you-go is on")
    elif plan_left is not None:
        print(f"ok {plan_left:,g} plan credits left this billing cycle")
    else:
        print("ok key accepted")
else:
    data = body.get("data") or {}
    remaining = data.get("limit_remaining")
    if data.get("is_free_tier") is True:
        print("fail no credits bought on this account yet; add some at openrouter.ai/settings/credits")
    elif isinstance(remaining, (int, float)) and remaining <= 0:
        print("fail this key's credit limit is used up; raise it at openrouter.ai/settings/keys")
    elif isinstance(remaining, (int, float)):
        print(f"ok ${remaining:,.2f} left under this key's credit limit")
    else:
        print("ok key accepted (no credit limit set on this key)")
PY
}
