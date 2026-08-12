# Deploying on Render (free) + Neon (free database)

The pairing: Render runs the app (web service, free tier), Neon holds the
data. Render's own free Postgres expires after 30 days — Neon's free tier
doesn't, and it carries automatic backups.

## 1 · Neon — the database (5 minutes)

1. neon.tech → sign up → **New project** (`bsbw-crm`, latest Postgres,
   region nearest you).
2. Copy the **pooled** connection string:
   `postgresql://...-pooler....neon.tech/neondb?sslmode=require`
3. That's your `DATABASE_URL`. Nothing else to do — the app's `migrate`
   creates the whole schema on first boot.

## 2 · GitHub — Render deploys from a repo

```bash
# from the project root (the repo is already initialised and committed)
git remote add origin https://github.com/YOURNAME/bsbw-crm.git
git push -u origin main
```

Keep the repo **private** — it's your CRM.

## 3 · Render — the service

1. render.com → **New +** → **Blueprint** → connect the GitHub repo.
   Render reads `render.yaml` and proposes the `bsbw-crm` web service.
2. Fill the env vars it asks for:

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled string from step 1 |
   | `CREDENTIAL_KEY` | run `openssl rand -hex 32`, paste. **Save it** — it seals the Gmail app passwords; lose it and they must be re-entered |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your choice — gates creating/deleting organizations |
   | `APP_USER` / `APP_PASSWORD` | **the front door.** The browser asks for these before showing anything. Do not skip: without them the CRM is public |

3. Deploy. First build takes a few minutes; the URL is
   `https://bsbw-crm.onrender.com` (rename the service to taste).

## 4 · Keep it awake

Free Render services sleep after ~15 idle minutes; asleep means the reply
poller isn't polling and the first visitor waits ~50s. Any free pinger fixes
it:

1. uptimerobot.com (free) → **Add monitor** → type HTTP(s) →
   URL `https://YOUR-SERVICE.onrender.com/api/health` → interval **5 minutes**.
2. That endpoint is deliberately outside the password gate, and the free
   750 instance-hours/month cover one service running 24/7.

(cron-job.org works the same if you prefer it.)

## 5 · First run

Open the URL → browser asks for `APP_USER` / `APP_PASSWORD` → landing page
with BSBW and CCM, empty. Create a vertical, drop the Excel sheet on the
format step, and in Vertical settings → Sending account re-enter the Gmail
app password (sealed under the new `CREDENTIAL_KEY`). Send a test.

## Updating later

`git push` — Render redeploys automatically, `migrate` runs on boot.

## Notes

- Outbound SMTP (465) and IMAP (993) work from Render; port 25 is blocked,
  which the app never uses.
- `WEB_ORIGIN` is unnecessary here: the API serves the frontend itself, so
  every request is same-origin.
- If Neon's free compute allowance ever pinches (the poller keeps the DB
  warm), either set `MAIL_POLL_MS=300000` (5-minute polls) on Render, or
  take Neon's smallest paid plan.
