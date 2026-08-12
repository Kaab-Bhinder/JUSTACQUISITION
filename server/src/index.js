import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool, allCompanies, allStages, allVerticals, orgById } from "./db.js";
import { senderFor } from "./constants.js";
import { mergeTags } from "./columns.js";
import { keySource } from "./crypto.js";
import { requireOrg, requireVertical, adminEmail, usingDefaultAdmin, sameSecret } from "./auth.js";
import { startPoller, mailState, mailAccounts, POLL_MS } from "./sync.js";
import { orgs } from "./routes/orgs.js";
import { verticals } from "./routes/verticals.js";
import { companies } from "./routes/companies.js";
import { stages } from "./routes/stages.js";
import { emails } from "./routes/emails.js";
import { mail } from "./routes/mail.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

/* Named origins rather than `*`. No cookie travels — there are no sessions —
   but naming origins still keeps a stray page on another host from driving
   this API. WEB_ORIGIN takes a comma-separated list, so a Vercel frontend
   and the Render URL can both be first-class:
     WEB_ORIGIN=https://app.vercel.app,https://bsbw-crm.onrender.com
   In dev, Vite proxies /api so the browser stays same-origin and none of
   this comes into play. */
const ORIGINS = (process.env.WEB_ORIGIN || "http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: ORIGINS.length === 1 ? ORIGINS[0] : ORIGINS }));
/* Pasted email bodies are the biggest thing that arrives here, and a long
   quoted chain clears the 100kb default. */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

/* ---- the deployment gate -----------------------------------------------
   The app has no user accounts, so on a public host EVERYTHING sits behind
   this: set APP_USER and APP_PASSWORD in the environment and every request —
   pages and API alike — needs the browser's basic-auth prompt answered once.

   Unset (local dev), the gate doesn't exist. Two paths stay open regardless:
   /api/health, which uptime pingers hit to keep a free-tier host awake, and
   the inbound-mail webhook, which authenticates with its own shared secret.

   Registered here, after /api/health above, before every data route below —
   Express order is the allowlist. */
const APP_USER = process.env.APP_USER || "";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (APP_USER && APP_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === "/api/emails/inbound") return next();
    const [scheme, b64] = String(req.get("authorization") || "").split(" ");
    if (scheme === "Basic" && b64) {
      const [user, ...rest] = Buffer.from(b64, "base64").toString("utf8").split(":");
      if (sameSecret(user, APP_USER) && sameSecret(rest.join(":"), APP_PASSWORD))
        return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="BSBW CRM", charset="UTF-8"');
    res.status(401).send("Authentication required.");
  });
}

app.use("/api/orgs", orgs);
app.use("/api/verticals", verticals);

/* One request on load: the vertical's board — companies, stages, script,
   columns — plus the organization around it and what the environment can do.
   Saves the UI three round trips before it can render anything.

   Scoped by X-Org-Id and X-Vertical-Id together, so switching either in the
   browser is one re-fetch of this endpoint and no page reload. */
app.get("/api/bootstrap", requireOrg, requireVertical, async (req, res, next) => {
  try {
    const [org, verts, c, s, st, accounts] = await Promise.all([
      orgById(req.orgId),
      allVerticals(req.orgId),
      allCompanies(req.orgId, req.verticalId),
      allStages(req.verticalId),
      mailState(),
      mailAccounts(),
    ]);
    const vertical = verts.find(v => v.id === req.verticalId) || null;
    res.json({
      org,
      vertical,
      /* The whole list rides along for the sidebar's vertical switcher. */
      verticals: verts,
      mergeTags: mergeTags(vertical?.columns),
      companies: c,
      stages: s,
      sender: senderFor(org),
      /* Outbound goes through the vertical's own SMTP account, reported on
         `vertical`. This block is about reading replies — which happens
         through those same accounts, so saving one turns this on. */
      mail: {
        configured: accounts.length > 0,
        user: accounts.map(a => a.user).join(", ") || null,
        lastSync: st.last_sync,
        lastFiled: st.last_filed,
        error: st.last_error,
        pollSeconds: Math.round(POLL_MS / 1000),
      },
    });
  } catch (e) { next(e); }
});

app.use("/api/companies", companies);
app.use("/api/stages", stages);
app.use("/api/emails", emails);
app.use("/api/mail", mail);

app.use("/api", (_req, res) => res.status(404).json({ error: "No such endpoint." }));

/* ---- production: one service serves everything -------------------------
   When web/dist exists (npm run build), the API serves it: one deploy, one
   port, one URL — the shape Railway/Render/a VPS wants. The frontend routes
   by URL fragment, so index.html for unknown paths is all the routing the
   server owes it. In dev this block is idle: Vite serves the frontend and
   proxies /api here. */
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "..", "web", "dist");
if (existsSync(join(dist, "index.html"))) {
  app.use(express.static(dist, { maxAge: "1h", index: "index.html" }));
  app.get("*", (_req, res) => res.sendFile(join(dist, "index.html")));
}

/* Anything that reaches here is a bug, not a user error. Log the stack, hand
   back the message — these are our own strings, not driver internals. */
app.use((err, _req, res, _next) => {
  console.error("[api]", err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
});

/* Last-resort guards. The mail poller talks to remote servers on a timer;
   a stray socket error surfacing outside any await must be logged, never
   allowed to bring the CRM down with it. */
process.on("uncaughtException", (e) => console.error("[fatal-caught]", e?.message || e));
process.on("unhandledRejection", (e) => console.error("[rejection-caught]", e?.message || e));

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }
  try {
    await pool.query("SELECT 1 FROM organizations LIMIT 1");
  } catch {
    console.error("Database isn't ready. Run `npm run migrate` in server/ first.");
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`CRM API on http://localhost:${PORT}`);
    /* ASCII only in console output: the Windows console defaults to a legacy
       codepage and renders anything else as mojibake. */
    console.log("  tenancy  : multi-org, no accounts - every request carries an X-Org-Id");
    console.log(`  admin    : ${adminEmail()}${usingDefaultAdmin()
      ? "  <- SHIPPED DEFAULT, set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env"
      : ""}`);
    console.log("  mail out : SMTP per vertical - each vertical's own Gmail + app password");
    console.log(`  secrets  : sealed with ${keySource || "the credential key"}`);
    console.log("  mail in  : reads each vertical's sending account over IMAP - replies file themselves");
  });
  startPoller();
}

start();
