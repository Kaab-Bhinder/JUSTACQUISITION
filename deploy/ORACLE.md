# Backend on an Oracle Always Free VM (Oracle Linux, user `opc`)

Migrates ONLY the API. Vercel keeps the frontend, Neon keeps the data,
Render keeps running untouched as the instant rollback. The cutover is one
env-var flip on Vercel at the very end.

Why a domain + HTTPS are not optional: the frontend is served over https,
and browsers refuse to let an https page call a plain-http API. So the VM
needs a hostname (e.g. `api.justacquisition.com`) and a certificate before
the frontend can use it.

---

## 0 · You provide (nothing else in this file works without these)

| Item | Where it goes |
|---|---|
| VM public IP, SSH working (`ssh opc@IP`) | everything below |
| DNS A-record `api.justacquisition.com` → VM IP | Hostinger DNS panel; do it FIRST, certbot needs it resolving |
| `DATABASE_URL` — the same Neon pooled string Render uses | `server/.env` |
| `CREDENTIAL_KEY` — **the exact value from Render** | `server/.env`. A different key cannot open the sealed Gmail app passwords; every vertical would need its password re-entered |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` — same as Render | `server/.env` |
| `APP_USER` / `APP_PASSWORD` — same as Render | `server/.env` |
| GitHub access from the VM (repo is private): a fine-grained read-only token, used once in the clone URL | step 2 |

Copy the values out of Render → bsbw-crm → Environment.

---

## 1 · System packages (run on the VM)

```bash
sudo dnf -y update
sudo dnf -y install git nginx
# Node 22 (NodeSource works on Oracle Linux 8/9)
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf -y install nodejs
node -v    # v22.x

# certbot (EPEL)
sudo dnf -y install oracle-epel-release-el$(rpm -E %rhel) || sudo dnf -y install epel-release
sudo dnf -y install certbot python3-certbot-nginx
```

**Oracle-specific — the firewall has TWO layers, both must open 80/443:**

```bash
# layer 1: the VM's own firewalld
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

Layer 2 is in the **OCI web console**, not on the VM: Networking → your VCN
→ the subnet's **Security List** → Add Ingress Rules: source `0.0.0.0/0`,
TCP, destination ports `80` and `443`. Without this the VM is unreachable
no matter what firewalld says.

**SELinux** (enforcing on Oracle Linux): nginx needs permission to proxy to
the Node process:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

## 2 · The app

```bash
sudo mkdir -p /opt/bsbw-crm && sudo chown opc:opc /opt/bsbw-crm
git clone https://<TOKEN>@github.com/Kaab-Bhinder/JUSTACQUISITION.git /opt/bsbw-crm
cd /opt/bsbw-crm
npm --prefix server install --omit=dev

cp server/.env.example server/.env
chmod 600 server/.env
nano server/.env
```

Set in `server/.env` (values from section 0):

```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
PORT=4000
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
APP_USER=...
APP_PASSWORD=...
CREDENTIAL_KEY=<same as Render>
WEB_ORIGIN=https://justacquisition.com,https://www.justacquisition.com,https://justacquisition.vercel.app
```

Secrets live only in that root-unreadable-to-others file; nothing is passed
on command lines or written into unit files.

(The frontend build is NOT needed here — Vercel serves it. Skipping
`npm run build` keeps the VM lean; the API serves JSON only.)

## 3 · One idempotent migrate

```bash
cd /opt/bsbw-crm && npm run migrate
```

Same Neon database Render uses; this is the app's own additive migration
(no-ops where everything already exists). No manual schema work.

## 4 · Keep it alive (systemd)

```bash
sudo cp deploy/bsbw-crm-oracle.service /etc/systemd/system/bsbw-crm.service
sudo systemctl daemon-reload
sudo systemctl enable --now bsbw-crm
systemctl status bsbw-crm --no-pager
curl -s localhost:4000/api/health     # {"ok":true}
```

Survives SSH disconnects, crashes (Restart=always) and reboots (enabled).
Logs: `journalctl -u bsbw-crm -f`.

## 5 · HTTPS front door (nginx + certbot)

```bash
sudo cp deploy/nginx-oracle.conf /etc/nginx/conf.d/bsbw-crm.conf
sudo nano /etc/nginx/conf.d/bsbw-crm.conf     # set the real api hostname
sudo nginx -t && sudo systemctl enable --now nginx
sudo certbot --nginx -d api.justacquisition.com
```

NOTE: no basic-auth in nginx — the app's own APP_USER gate handles auth,
and it uses the same Authorization header nginx basic-auth would steal.

## 6 · Verify before cutover (from anywhere)

```bash
curl -s https://api.justacquisition.com/api/health          # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.justacquisition.com/api/orgs                  # 401 = gate on
# CORS grant for the frontend origin:
curl -s -X OPTIONS -D- -o /dev/null \
  -H "Origin: https://justacquisition.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,x-org-id" \
  https://api.justacquisition.com/api/orgs | grep -i access-control-allow-origin
```

Then the real prize — prove the sealed Gmail credential decrypts and SMTP
flows from this VM: open `https://api.justacquisition.com` is JSON-only, so
instead call the test endpoint with your app login:

```bash
curl -s -u "$APP_USER:$APP_PASSWORD" -X POST \
  -H "X-Org-Id: ccm" -H "Content-Type: application/json" \
  -d '{"to":"YOUR_GMAIL_HERE"}' \
  https://api.justacquisition.com/api/verticals/<VERTICAL_ID>/test
# {"ok":true,"did":"sent",...} and a test mail in the inbox = fully proven
```

## 7 · Cutover (the only change anywhere else)

Vercel → project → Settings → Environment Variables →
`VITE_API_BASE` = `https://api.justacquisition.com/api` → **Redeploy**.

Render stays up, untouched: rollback is flipping that env var back.
Both backends may poll the same inbox meanwhile — harmless, replies
de-duplicate by message id in the shared database.

## 8 · Later, when confident (NOT now)

Suspend or delete the Render service, and remove its UptimeRobot monitor.
Add a monitor on `https://api.justacquisition.com/api/health` (the VM never
sleeps; this is for alerting, not keep-alive).

## Updating the app later

```bash
cd /opt/bsbw-crm && git pull && npm --prefix server install --omit=dev
npm run migrate && sudo systemctl restart bsbw-crm
```
