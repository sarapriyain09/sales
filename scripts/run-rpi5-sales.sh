#!/usr/bin/env bash
set -euo pipefail

# Splendid Sales one-command runner for Raspberry Pi 5.
# - Syncs repo (clone/pull)
# - Installs dependencies
# - Builds app
# - Ensures production auth env
# - Starts/restarts PM2 process
# - Optionally maps Cloudflare tunnel ingress

REPO_URL="${REPO_URL:-https://github.com/sarapriyain09/sales}"
APP_DIR="${APP_DIR:-$HOME/Projects/Sales}"
APP_PORT="${APP_PORT:-3005}"
PM2_NAME="${PM2_NAME:-sales}"
SALES_HOST="${SALES_HOST:-sales.splendidtechnology.co.uk}"

NEXTAUTH_URL="${NEXTAUTH_URL:-https://${SALES_HOST}}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-}"

# Existing CRM tunnel used in this environment.
TUNNEL_NAME="${TUNNEL_NAME:-splendid-crm-tunnel}"
TUNNEL_CONFIG="${TUNNEL_CONFIG:-$HOME/.cloudflared/crm-tunnel.yml}"
ENABLE_TUNNEL_UPDATE="${ENABLE_TUNNEL_UPDATE:-1}"

echo "[1/7] Prepare app directory: ${APP_DIR}"
mkdir -p "${APP_DIR}"

echo "[2/7] Sync repository: ${REPO_URL}"
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch origin
  git -C "${APP_DIR}" pull --ff-only origin main
else
  git clone "${REPO_URL}" "${APP_DIR}"
fi

echo "[3/7] Install dependencies"
npm --prefix "${APP_DIR}" install

echo "[4/7] Build production app"
npm --prefix "${APP_DIR}" run build

echo "[5/7] Ensure .env.local"
if [[ -z "${NEXTAUTH_SECRET}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    NEXTAUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  else
    NEXTAUTH_SECRET="sales-$(date +%s)-change-me"
  fi
fi

cat > "${APP_DIR}/.env.local" <<EOF
NEXTAUTH_URL=${NEXTAUTH_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=production
EOF

echo "[6/7] Start/restart PM2 app: ${PM2_NAME} on port ${APP_PORT}"
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}" --update-env
else
  pm2 start npm --name "${PM2_NAME}" --cwd "${APP_DIR}" -- run start -- -p "${APP_PORT}"
fi
pm2 save

echo "[7/7] Optional Cloudflare tunnel ingress update"
if [[ "${ENABLE_TUNNEL_UPDATE}" == "1" && -f "${TUNNEL_CONFIG}" ]]; then
  if ! grep -q "hostname: ${SALES_HOST}" "${TUNNEL_CONFIG}"; then
    cp "${TUNNEL_CONFIG}" "${TUNNEL_CONFIG}.bak-$(date +%Y%m%d%H%M%S)"
    awk -v host="${SALES_HOST}" -v port="${APP_PORT}" '
      {
        if ($0 ~ /^  - service: http_status:404$/ && added == 0) {
          print "  - hostname: " host
          print "    service: http://127.0.0.1:" port
          added = 1
        }
        print
      }
    ' "${TUNNEL_CONFIG}" > "${TUNNEL_CONFIG}.tmp"
    mv "${TUNNEL_CONFIG}.tmp" "${TUNNEL_CONFIG}"
    echo "Added ingress for ${SALES_HOST} -> 127.0.0.1:${APP_PORT}"
  else
    echo "Ingress already exists for ${SALES_HOST}"
  fi

  if pm2 describe "${TUNNEL_NAME}" >/dev/null 2>&1; then
    pm2 restart "${TUNNEL_NAME}"
  fi
fi

echo
echo "Done. Quick checks:"
echo "  pm2 describe ${PM2_NAME}"
echo "  curl -I http://127.0.0.1:${APP_PORT}"
echo "  curl -I https://${SALES_HOST}/login"
