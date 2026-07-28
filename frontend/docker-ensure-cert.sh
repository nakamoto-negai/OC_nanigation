#!/bin/sh
# フロントの nginx 起動前に、TLS 証明書が無ければ自己署名証明書を生成する。
# これにより certs/ が未生成でも `docker compose up` が HTTPS(443) 付きで必ず起動する。
#
# 実機（スマホ）テストで LAN IP を SAN に含めたい場合は、ホストで
#   powershell -ExecutionPolicy Bypass -File scripts/gen-local-cert.ps1
# を実行して certs/ を用意すると、そちらが優先して使われる（このスクリプトは生成しない）。
#
# nginx:alpine は /docker-entrypoint.d/*.sh を nginx 起動前に実行するので、ここに置く。
set -e

CERT_DIR=/etc/nginx/certs

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
  echo "[ensure-cert] existing certificate found; using it"
  exit 0
fi

echo "[ensure-cert] no certificate found; generating a self-signed one"
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days 365 \
  -subj "/CN=oc-navigation-local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "[ensure-cert] generated $CERT_DIR/server.crt"
