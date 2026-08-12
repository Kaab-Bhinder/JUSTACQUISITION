# Deploying to a VPS (Hostinger KVM, or any Ubuntu box)

One server runs everything: Postgres, the API, and the built frontend
(the API serves `web/dist` itself). Nginx sits in front for the domain,
HTTPS, and the access gate.

## 1 · Base packages (once)

```bash
ssh root@YOUR_VPS_IP

apt update && apt install -y curl git nginx postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs

# database + role
sudo -u postgres psql -c "CREATE ROLE crm LOGIN PASSWORD 'PICK_A_DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE bsbw_crm OWNER crm;"
```

## 2 · The app

```bash
mkdir -p /opt && cd /opt
git clone YOUR_REPO_URL bsbw-crm        # or: scp -r the folder up
cd bsbw-crm

cp server/.env.example server/.env
nano server/.env
```

Set in `server/.env`:

```
DATABASE_URL=postgresql://crm:PICK_A_DB_PASSWORD@localhost:5432/bsbw_crm
PORT=4000
ADMIN_EMAIL=you@yourdomain.com
ADMIN_PASSWORD=something-strong
CREDENTIAL_KEY=<run: openssl rand -hex 32>
WEB_ORIGIN=https://crm.yourdomain.com
```

`CREDENTIAL_KEY` seals the per-vertical Gmail app passwords. Set it BEFORE
first use and keep it: lose it and every sending account must be re-entered.

```bash
npm run install:all
npm run build          # builds web/dist — the API serves it
npm run migrate
```

## 3 · Keep it running (systemd)

```bash
cp deploy/bsbw-crm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bsbw-crm
systemctl status bsbw-crm      # should say active (running)
curl -s localhost:4000/api/health   # {"ok":true}
```

## 4 · Domain, HTTPS, and the gate

Point a DNS A-record (e.g. `crm.yourdomain.com`) at the VPS IP, then:

```bash
# the access gate — THE APP HAS NO LOGIN, do not skip this
apt install -y apache2-utils
htpasswd -c /etc/nginx/.crm-users kaab      # prompts for a password; repeat per user

cp deploy/nginx.conf /etc/nginx/sites-available/bsbw-crm
nano /etc/nginx/sites-available/bsbw-crm    # put your real domain in
ln -s /etc/nginx/sites-available/bsbw-crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# free HTTPS
apt install -y certbot python3-certbot-nginx
certbot --nginx -d crm.yourdomain.com
```

## 5 · Updating later

```bash
cd /opt/bsbw-crm && git pull
npm run install:all && npm run build && npm run migrate
systemctl restart bsbw-crm
```

## Backups

```bash
# nightly dump, keeps 14 days — add with: crontab -e
0 3 * * * pg_dump bsbw_crm | gzip > /root/backups/bsbw-crm-$(date +\%F).sql.gz && find /root/backups -mtime +14 -delete
```
