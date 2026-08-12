import { Router } from "express";
import { companiesByIds } from "../db.js";
import { verifyImap, describeImapError } from "../mail/imap.js";
import { syncMail, mailState, mailAccounts, POLL_MS } from "../sync.js";

import { requireOrg } from "../auth.js";

export const mail = Router();

/* Reply reading spans every mailbox the installation knows: each vertical's
   sending account (the same app password reads and sends), plus the optional
   IMAP_USER pair in server/.env. A reply is filed against whichever
   organization has the sender on file, so the status is installation-wide —
   but a sync only ever answers with the caller's own tenant's rows. */
mail.use(requireOrg);

mail.get("/status", async (_req, res, next) => {
  try {
    const [st, accounts] = await Promise.all([mailState(), mailAccounts()]);
    res.json({
      configured: accounts.length > 0,
      user: accounts.map(a => a.user).join(", ") || null,
      lastSync: st.last_sync,
      lastFiled: st.last_filed,
      error: st.last_error,
      pollSeconds: Math.round(POLL_MS / 1000),
    });
  } catch (e) { next(e); }
});

/* "Test connection" — logs into each mailbox, reports per account, changes
   nothing. Worth having so a revoked app password surfaces here instead of
   failing quietly in the background every 90 seconds. */
mail.post("/test", async (_req, res) => {
  const accounts = await mailAccounts().catch(() => []);
  if (!accounts.length)
    return res.status(409).json({
      ok: false,
      error: "No mailbox to read. Save a sending account on a vertical (its app password reads replies too), or set IMAP_USER in server/.env.",
    });

  const results = [];
  for (const a of accounts) {
    try {
      const info = await verifyImap(a);
      results.push({ user: a.user, ok: true, messages: info.messages });
    } catch (e) {
      results.push({ user: a.user, ok: false, error: describeImapError(e) });
    }
  }
  const allOk = results.every(r => r.ok);
  res.json({
    ok: allOk,
    user: results.map(r => r.user).join(", "),
    results,
    ...(allOk ? {} : { error: results.filter(r => !r.ok).map(r => `${r.user}: ${r.error}`).join(" · ") }),
  });
});

mail.post("/sync", async (req, res) => {
  try {
    const { filed, companyIds = [], skipped, ...rest } = await syncMail();
    if (skipped === "unconfigured")
      return res.status(409).json({
        error: "No mailbox to read. Save a sending account on a vertical, or set IMAP_USER in server/.env.",
      });

    /* `filed` counts everything the run put away, across every organization.
       `companies` is narrowed to the caller's tenant — rows from elsewhere
       would be both meaningless and a leak. */
    const companies = await companiesByIds(companyIds, req.orgId);
    res.json({ ...rest, filed, mine: companies.length, companies });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
