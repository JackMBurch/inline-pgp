#!/usr/bin/env bash

set -euo pipefail

# Determine script directory so the script can be run from anywhere
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

USERSCRIPT_FILE="userscript.js"

if [[ ! -f "$USERSCRIPT_FILE" ]]; then
  echo "Error: '$USERSCRIPT_FILE' not found next to configure.sh." >&2
  exit 1
fi

if ! grep -q "<domain>" "$USERSCRIPT_FILE"; then
  echo "Warning: No '<domain>' placeholder found in $USERSCRIPT_FILE."
  echo "Nothing to replace."
  exit 0
fi

read -r -p "Enter domain (e.g. example.com): " DOMAIN

if [[ -z "${DOMAIN}" ]]; then
  echo "Error: Domain cannot be empty." >&2
  exit 1
fi

# Escape '&' for sed replacement
ESCAPED_DOMAIN=${DOMAIN//&/\\&}

sed -i "s|<domain>|${ESCAPED_DOMAIN}|g" "$USERSCRIPT_FILE"

echo "Updated $USERSCRIPT_FILE with domain '${DOMAIN}'."
