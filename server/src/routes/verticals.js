import { Router } from "express";
import { query, tx, allVerticals, verticalById, verticalAuth } from "../db.js";
import { DEFAULT_STAGES } from "../constants.js";
import { requireOrg } from "../auth.js";
import { validateColumns, mergeTags } from "../columns.js";
import { seal, tidyAppPassword } from "../crypto.js";
import { verify as smtpVerify, send as smtpSend } from "../mail/smtp.js";

export const verticals = Router();

/* Everything here is inside one organization. Creating and deleting a vertical
   is deliberately NOT admin-gated the way organizations are: a vertical is a
   thing inside a tenant, and everything inside a tenant is open — the same
   footing as adding a company or editing a stage. */
verticals.use(requireOrg);

/* Same rule as organization ids, for the same reason: it lands in the URL
   fragment the browser bookmarks. */
const slugify = (s) => String(s ?? "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);

const HEX = /^#[0-9a-f]{6}$/i;
const colour = (v, fallback) => (HEX.test(String(v ?? "")) ? String(v).toUpperCase() : fallback);

const intId = (raw) => { const n = Number(raw); return Number.isInteger(n) && n > 0 ? n : null; };

/* Scripts are HTML from the rich editor now, and a pasted signature image
   arrives as a data: URI inside it — hundreds of KB each. The cap exists so
   a script can't outgrow the request-body limit or bloat every bootstrap
   response past usefulness. */
const MAX_SCRIPT = 1_500_000;

/* ---- list --------------------------------------------------------------
   What the sidebar and the vertical picker read. Counts ride along the same
   way they do on the organization cards, and for the same reason: an empty
   vertical should say so on its card, not after you've clicked into it. */
verticals.get("/", async (req, res, next) => {
  try { res.json({ verticals: await allVerticals(req.orgId) }); }
  catch (e) { next(e); }
});

/* ---- create ------------------------------------------------------------
   A vertical is born un-set-up: it exists, appears in the sidebar, and opening
   it resumes the wizard until setup_done flips. Its funnel is created here —
   the same four defaults a new organization used to get — so there is never a
   vertical whose board has nowhere to put a company. The wizard and the stage
   editor both edit from there. */
verticals.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "The vertical needs a name." });
    if (name.length > 60)
      return res.status(400).json({ error: "That name is too long — 60 characters at most." });

    const slug = slugify(name);
    if (!slug)
      return res.status(400).json({ error: "That name has no letters or numbers to make an id from." });

    const accent = colour(req.body?.accent, "#0ABAB5");

    const created = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO verticals (org_id, slug, name, accent, position)
         VALUES ($1, $2, $3, $4,
                 COALESCE((SELECT max(position) + 1 FROM verticals WHERE org_id = $1), 0))
         ON CONFLICT (org_id, slug) DO NOTHING
         RETURNING id`,
        [req.orgId, slug, name, accent]);
      if (!rows.length) return null;

      for (const [i, s] of DEFAULT_STAGES.entries())
        await client.query(
          `INSERT INTO stages (vertical_id, org_id, id, label, sub, accent, wait, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rows[0].id, req.orgId, s.id, s.label, s.sub, s.accent, s.wait, i]);

      return rows[0].id;
    });

    if (!created)
      return res.status(409).json({ error: `"${name}" already exists in this organization.` });

    res.status(201).json({
      vertical: await verticalById(created, req.orgId),
      verticals: await allVerticals(req.orgId),
    });
  } catch (e) { next(e); }
});

/* ---- one vertical ------------------------------------------------------ */

verticals.get("/:id", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: "That isn't a vertical id." });
    const v = await verticalById(id, req.orgId);
    if (!v) return res.status(404).json({ error: "No such vertical." });
    res.json({ vertical: v, mergeTags: mergeTags(v.columns) });
  } catch (e) { next(e); }
});

/* The wizard's steps and the settings screen both land here: columns, script,
   sending account, name — each optional, so one form can save one thing.

   `setupDone` flips to true only via this route and only when asked, which is
   how "finish setup" is expressed. It never flips back: half-reconfiguring a
   live vertical must not lock its board behind the wizard again. */
verticals.patch("/:id", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: "That isn't a vertical id." });
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) return res.status(400).json({ error: "The vertical needs a name." });
      set("name", name.slice(0, 60));
    }
    if (b.accent !== undefined) set("accent", colour(b.accent, "#0ABAB5"));

    if (b.columns !== undefined) {
      const out = validateColumns(b.columns);
      if (out.error) return res.status(400).json({ error: out.error });
      set("columns", JSON.stringify(out.columns));
    }

    if (b.subject !== undefined) set("subject", String(b.subject).trim().slice(0, 500));
    if (b.body !== undefined) {
      const body = String(b.body ?? "");
      if (body.length > MAX_SCRIPT)
        return res.status(400).json({ error: "That script is too big — likely a pasted image over ~1MB. Use a smaller image." });
      set("body", body);
    }

    if (b.smtpUser !== undefined) {
      const user = String(b.smtpUser).trim().toLowerCase();
      /* Clearing the account clears what hangs off it. */
      if (!user) set("smtp_send_as", "");
      if (user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user))
        return res.status(400).json({ error: "That doesn't look like an email address." });
      set("smtp_user", user);
      /* Clearing the address clears the credential with it — a password for
         no account is a credential with no owner, kept for no reason. */
      if (!user) set("smtp_secret", "");
    }
    /* Which mail server the account signs into. Empty = the Gmail default.
       A hostname, not a URL — and never logged or echoed anywhere secrets
       could ride along. */
    if (b.smtpHost !== undefined) {
      const host = String(b.smtpHost).trim().toLowerCase();
      if (host && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host))
        return res.status(400).json({ error: "That SMTP host doesn't look like a host name (e.g. smtp.stackmail.com)." });
      set("smtp_host", host);
    }
    if (b.smtpPort !== undefined) {
      const port = Number(b.smtpPort) || 0;
      if (port && (!Number.isInteger(port) || port < 1 || port > 65535))
        return res.status(400).json({ error: "That SMTP port isn't a port number." });
      set("smtp_port", port);
    }

    if (b.smtpPassword !== undefined && String(b.smtpPassword) !== "") {
      /* Gmail app passwords are shown as "abcd efgh ijkl mnop" and pasted
         with the spaces — strip them. Any other provider's mailbox password
         is taken exactly as typed: it isn't ours to reshape. */
      const { rows: [cur] } = await query(
        `SELECT smtp_host FROM verticals WHERE id = $1 AND org_id = $2`, [id, req.orgId]);
      const host = b.smtpHost !== undefined
        ? String(b.smtpHost).trim().toLowerCase() : (cur?.smtp_host || "");
      const gmailish = !host || /gmail\.com$/.test(host);
      const pw = gmailish ? tidyAppPassword(b.smtpPassword) : String(b.smtpPassword);
      /* Empty means "leave it" so the settings form can save around it; the
         explicit way to remove a credential is clearing the address above. */
      if (pw) set("smtp_secret", seal(pw));
    }
    if (b.smtpFrom !== undefined) set("smtp_from", String(b.smtpFrom).trim().slice(0, 100));

    /* The Send-As address: a Gmail "Send mail as" alias, NOT a second account
       — it authenticates with nothing and never asks for a password. Empty
       reverts to sending as the auth account. Must at least look like an
       address; Gmail is the real judge (an unverified alias gets its From
       silently rewritten to the auth account, which is a safe failure). */
    if (b.smtpSendAs !== undefined) {
      const sendAs = String(b.smtpSendAs).trim().toLowerCase();
      if (sendAs && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(sendAs))
        return res.status(400).json({ error: "That From address doesn't look like an email address." });
      set("smtp_send_as", sendAs);
    }

    if (b.setupDone === true) set("setup_done", true);

    if (!sets.length) return res.status(400).json({ error: "Nothing to change." });

    vals.push(id, req.orgId);
    const { rowCount } = await query(
      `UPDATE verticals SET ${sets.join(", ")}
        WHERE id = $${vals.length - 1} AND org_id = $${vals.length}`, vals);
    if (!rowCount) return res.status(404).json({ error: "No such vertical." });

    const v = await verticalById(id, req.orgId);
    res.json({
      vertical: v,
      verticals: await allVerticals(req.orgId),
      mergeTags: mergeTags(v.columns),
    });
  } catch (e) { next(e); }
});

/* ---- test the sending account ------------------------------------------
   Two levels. Without `to`: log in and report, nothing sent. With `to`
   (normally the user's own address): actually deliver a line of text, because
   "the login worked" and "mail arrives" are different facts and the second is
   the one that matters. Uses the saved credential — the form saves first, then
   tests — so what is tested is exactly what will be used. */
verticals.post("/:id/test", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: "That isn't a vertical id." });
    const v = await verticalAuth(id, req.orgId);
    if (!v) return res.status(404).json({ error: "No such vertical." });

    const to = String(req.body?.to ?? "").trim();
    try {
      const from = v.smtpSendAs || v.smtpUser;
      if (!to) {
        await smtpVerify(v);
        return res.json({ ok: true, did: "login", user: v.smtpUser });
      }
      await smtpSend(v, {
        to,
        subject: `CRM test — ${v.name} sending account works`,
        text: `This is the test message from your CRM's sending-account settings. Sending works.\n\nFrom address in use: ${from}`,
      });
      res.json({ ok: true, did: "sent", to, from });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  } catch (e) { next(e); }
});

/* ---- delete ------------------------------------------------------------
   Everything on the board goes with it — companies, their threads, the funnel;
   the foreign keys cascade. Asks for the name typed back, exactly like
   deleting an organization, because it destroys data in bulk and a click is
   not consent to that. The last vertical CAN go: an organization with none is
   just back at the "add your first vertical" screen, which is a real state. */
verticals.post("/:id/delete", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (!id) return res.status(400).json({ error: "That isn't a vertical id." });
    const v = await verticalById(id, req.orgId);
    if (!v) return res.status(404).json({ error: "No such vertical." });

    if (String(req.body?.confirm ?? "").trim() !== v.name)
      return res.status(400).json({ error: `Type "${v.name}" to confirm.` });

    await query(`DELETE FROM verticals WHERE id = $1 AND org_id = $2`, [id, req.orgId]);
    res.json({ deleted: id, verticals: await allVerticals(req.orgId) });
  } catch (e) { next(e); }
});
