# Raspberry Pi 5 Sales Deployment Activity Log

Date: 2026-06-18

## Target
- Host: `sarapriyain@192.168.0.64`
- Device: Raspberry Pi 5 (`Splendid-R1`)
- App path: `~/Projects/Sales`
- PM2 process: `sales`
- App port: `3005`
- Public URL: `https://sales.splendidtechnology.co.uk`

## Activities Completed

1. Imported and updated local codebase
- Cloned source from GitHub into local workspace.
- Implemented Sales module architecture, UI, API routes, DB migrations, and sales-first navigation.
- Renamed app branding to Splendid Sales.

2. Published source to GitHub
- Remote changed from old CRM repo to:
  - `https://github.com/sarapriyain09/sales`
- Pushed `main` branch.

3. Deployed app on Raspberry Pi
- Cloned repo on Pi under `~/Projects/Sales`.
- Installed dependencies and built production bundle.
- Started PM2 process:
  - `pm2 start npm --name sales -- run start -- -p 3005`
- Saved PM2 process list.

4. Cloudflare tunnel integration
- Updated ingress in `~/.cloudflared/crm-tunnel.yml`:
  - `sales.splendidtechnology.co.uk -> http://127.0.0.1:3005`
- Restarted tunnel process:
  - `pm2 restart splendid-crm-tunnel`
- DNS route command confirmed configured:
  - `cloudflared tunnel route dns ddbb5dca-9149-4ed5-94ac-ecf57b273371 sales.splendidtechnology.co.uk`

5. Fixed production runtime error
- Symptom: "This page couldn't load" / HTTP 500.
- Root cause: `next-auth` missing `NEXTAUTH_SECRET` in production.
- Resolution: created `~/Projects/Sales/.env.local` with:
  - `NEXTAUTH_URL=https://sales.splendidtechnology.co.uk`
  - `NEXTAUTH_SECRET=<generated>`
  - `NODE_ENV=production`
- Restarted PM2 app with updated env.

## Verification

- PM2 status shows `sales` online.
- Public endpoint check:
  - `https://sales.splendidtechnology.co.uk/login` returns `HTTP 200`.
- Protected routes redirect to login when unauthenticated (expected behavior).

## Runbook (Quick Commands)

```bash
# On Raspberry Pi
cd ~/Projects/Sales
npm install
npm run build
pm2 restart sales --update-env
pm2 save

# Health checks
pm2 describe sales
curl -I http://127.0.0.1:3005
curl -I https://sales.splendidtechnology.co.uk/login
```

## Added Automation Script

- Script created: `scripts/run-rpi5-sales.sh`
- Purpose: idempotent setup/start script for Raspberry Pi 5 deployment and runtime refresh.
