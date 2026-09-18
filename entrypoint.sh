#!/bin/sh
set -eu
mkdir -p "${DATA_DIR:-/data}"
# Optional Xray sidecar-in-container. Disabled by default so the admin UI deploys everywhere.
if [ "${ENABLE_XRAY:-false}" = "true" ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in x86_64) XA=64;; aarch64|arm64) XA=arm64-v8a;; *) XA=64;; esac
  if [ ! -x /tmp/xray ]; then
    curl -fsSL "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${XA}.zip" -o /tmp/xray.zip
    unzip -o /tmp/xray.zip xray -d /tmp >/dev/null && chmod +x /tmp/xray
  fi
  node server.js &
  APP=$!
  sleep 2
  /tmp/xray run -config "${DATA_DIR:-/data}/xray.json" &
  XR=$!
  trap 'kill $APP $XR 2>/dev/null || true' TERM INT
  wait -n $APP $XR
else
  exec node server.js
fi
