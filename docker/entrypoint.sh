#!/bin/sh
set -eu

APP_USER="${Z7PDF_APP_USER:-node}"
DATA_DIR="${DATA_DIR:-/app/data}"
TMP_DIR="${Z7PDF_TMP_DIR:-/tmp/z7pdf}"

mkdir -p "$DATA_DIR" "$TMP_DIR"

if [ "$(id -u)" -eq 0 ]; then
  chown -R "$APP_USER:$APP_USER" "$TMP_DIR" 2>/dev/null || true

  if ! chown -R "$APP_USER:$APP_USER" "$DATA_DIR" 2>/dev/null; then
    echo "z7pdf: warning: unable to update ownership for $DATA_DIR, continuing anyway" >&2
  fi

  exec gosu "$APP_USER:$APP_USER" "$@"
fi

exec "$@"
