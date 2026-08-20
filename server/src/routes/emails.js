import { Router } from "express";
import { query, tx, companiesByIds, verticalAuth, addHistory } from "../db.js";
import { fillMerge, recipientsFor } from "../columns.js";
import { fileInbound } from "../inbound.js";
import { requireOrg, requireVertical } from "../auth.js";
import { send as smtpSend, fromAddressFor } from "../mail/smtp.js";
import { findSentToMany } from "../mail/imap.js";
import { open as openSecret } from "../crypto.js";

export const emails = Router();

/* Scripts from the rich editor are HTML; older ones are plain text. HTML
   sends carry a text/plain twin — multipart with an alternative reads far
   better to spam filters than HTML alone. */
const looksHtml = (s) => /<([a-z][a-z0-9]*)\b[^>]*>/i.test(String(s ?? ""));

const htmlToText = (html) => String(html ?? "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
  .replace(/<li\b[^>]*>/gi, "· ")
  .replace(/<img\b[^>]*>/gi, "")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

/* ----------------------------------------------------------------------
   Outbound

   The CRM sends now. Each vertical carries its own sending account — a Gmail
   address and an app password, sealed at rest — and its own script, so a
   40-row selection goes out as 40 personalised messages from the right
   mailbox without 40 tabs.

   What was true of the compose-link era is kept where it mattered:

     · merge tags are re-filled HERE, against the record as it stands at the
       moment of sending — the server never trusts already-merged text a
       browser posted;
     · the composer previews every message before anything is sent, so a
       human still reads what goes out;
     · each send is recorded on the company's thread and advances the funnel
       stage if asked, exactly as recording a Gmail send used to.

   Failures are per-recipient: one dead address must not stop the other 39.
   The response says which sent and which didn't, and only the ones that sent
   are recorded and advanced.
---------------------------------------------------------------------- */
emails.post("/send", requireOrg, requireVertical, async (req, res, next) => {
  try {
    const want = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(Number.isInteger);
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "");
    const advance = !!req.body?.advance;
    /* Aim at one email column: the board's per-column Send buttons name the
       column they sit in, so "send Email 2 for this row" sends exactly that
       one address. Absent, every filled email column sends. */
    const colKey = String(req.body?.colKey || "").trim();
    /* Which script this send is — '' / 'script' = first touch, 'fu1'/'fu2' =
       follow-ups. Recorded on every message: it is what makes sent-state
       per-script, so a follow-up can go to an address the first touch
       already reached, but never twice itself. */
    const kind = /^[a-z0-9_-]{0,16}$/.test(String(req.body?.kind ?? ""))
      ? String(req.body?.kind ?? "") : "";

    if (!want.length) return res.status(400).json({ error: "Nobody to send to." });
    if (!body.trim())
      return res.status(400).json({ error: "A message is required." });
    /* Follow-ups may ship subjectless on purpose - the per-recipient logic
       below fills "Re: <the earlier email's subject>" so they thread. Only
       the first touch, which has nothing to Re:, must bring its own. */
    if (!subject && (!kind || kind === "script"))
      return res.status(400).json({ error: "A subject is required for the first-touch script." });

    /* The auth-bearing read: includes the sealed credential smtp.js opens. */
    const v = await verticalAuth(req.verticalId, req.orgId);
    if (!v?.smtpUser)
      return res.status(409).json({ error: "This vertical has no sending account yet. Add one in its settings." });

    const targets = (await companiesByIds(want, req.orgId))
      .filter(c => c.verticalId === req.verticalId);
    if (!targets.length) return res.status(404).json({ error: "No such companies." });

    const { rows: [org] } = await query(
      `SELECT id, name, sender_name AS "senderName" FROM organizations WHERE id = $1`,
      [req.orgId]);

    /* One message per email a row carries, each greeted by the name its
       column is linked to — a row with three filled email columns sends
       three personalised messages. */
    const sent = [], failed = [], skipped = [];
    let dead = false;
    for (const c of targets) {
      if (dead) break;
      const recipients = recipientsFor(v.columns, c.data)
        .filter(r => !colKey || r.colKey === colKey);
      if (!recipients.length) {
        skipped.push({ id: c.id, name: c.name, why: "no email address on file" });
        continue;
      }
      for (const r of recipients) {
        const ctx = { columns: v.columns, data: c.data, vertical: v, org, recipient: r };
        const filled = fillMerge(body, ctx);
        const isHtml = looksHtml(filled);

        /* Threading: a follow-up references the earlier touches to the SAME
           address, so the recipient's mailbox stacks it into one
           conversation. References carries the chain, In-Reply-To the last
           link. A blank follow-up subject becomes "Re: <the first one>". */
        const chain = (c.emails || []).filter(m =>
          m.dir === "out" && m.messageId &&
          String(m.to || "").toLowerCase() === r.email);
        const prev = chain[chain.length - 1] || null;
        let subj = fillMerge(subject, ctx).trim();
        if (!subj && prev) subj = /^re:/i.test(prev.subject) ? prev.subject : `Re: ${prev.subject}`;
        /* No prior CRM send to hang a "Re:" on — the first touch happened
           outside the CRM (marked, not sent). Fall back to Re: the
           first-touch script's subject: it reads as the follow-up it is, and
           if the manual mail used the same subject line, Gmail may even
           thread them by subject. Never an empty subject. */
        if (!subj) {
          const first = fillMerge(v.subject || "", ctx).trim();
          subj = first ? (/^re:/i.test(first) ? first : `Re: ${first}`) : "Following up";
        }

        const draft = {
          to: r.email,
          subject: subj,
          text: isHtml ? htmlToText(filled) : filled,
          ...(isHtml ? { html: filled } : {}),
          ...(prev ? {
            inReplyTo: prev.messageId,
            references: chain.map(m => m.messageId).join(" "),
          } : {}),
        };
        try {
          const info = await smtpSend(v, draft);
          sent.push({ company: c, ...draft, body: filled, messageId: info?.messageId || null });
        } catch (e) {
          failed.push({ id: c.id, name: c.name, to: r.email, why: e.message });
          /* An auth failure will fail every remaining message the same way;
             one report reads better than the same sentence forty times. */
          if (/refused that sign-in|app password/i.test(e.message)) { dead = true; break; }
        }
      }
    }

    if (!sent.length) {
      const why = failed[0]?.why ||
        (skipped.length ? "None of those companies have an email address." : "Nothing went out.");
      return res.status(400).json({ error: why, failed, skipped });
    }

    await tx(async (client) => {
      const { rows: stages } = await client.query(
        `SELECT id, label FROM stages WHERE vertical_id = $1 ORDER BY position, id`,
        [req.verticalId]);
      const order = stages.map(s => s.id);

      /* Every message lands on the thread; the stage moves once per company,
         not once per address. */
      const advanced = new Set();
      for (const d of sent) {
        /* The body recorded is the body sent — HTML when the script was
           HTML — so the thread shows the styled message, images included. */
        await client.query(
          `INSERT INTO emails (company_id, direction, at, addr, subject, body, read, message_id, kind, thread_id)
           VALUES ($1,'out',CURRENT_DATE,$2,$3,$4,true,$5,$6,$7)
           ON CONFLICT (message_id) DO NOTHING`,
          [d.company.id, d.to, d.subject, d.body, d.messageId, kind,
           d.references ? d.references.split(" ")[0] : d.messageId]);

        const i = order.indexOf(d.company.stage);
        if (advance && i > -1 && i < order.length - 1 && !advanced.has(d.company.id)) {
          advanced.add(d.company.id);
          await client.query(
            `UPDATE companies SET stage = $1, stage_since = CURRENT_DATE, updated_at = now()
              WHERE id = $2`, [order[i + 1], d.company.id]);
          await addHistory(client, d.company.id,
            `Emailed ${d.to} — moved to ${stages[i + 1].label}`);
        } else {
          await addHistory(client, d.company.id, `Emailed ${d.to}: ${d.subject.slice(0, 40)}`);
        }
      }
    });

    res.json({
      companies: await companiesByIds([...new Set(sent.map(d => d.company.id))], req.orgId),
      sent: sent.length,
      failed,
      skipped,
    });
  } catch (e) { next(e); }
});

/* Fill a script's merge tags against real rows without sending — the
   composer's preview. Kept on the server so the preview and the send resolve
   tags with the same code and can never drift. */
emails.post("/preview", requireOrg, requireVertical, async (req, res, next) => {
  try {
    const want = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(Number.isInteger);
    if (!want.length) return res.status(400).json({ error: "Nobody to preview." });

    const v = await verticalAuth(req.verticalId, req.orgId);
    const { rows: [org] } = await query(
      `SELECT id, name, sender_name AS "senderName" FROM organizations WHERE id = $1`,
      [req.orgId]);

    const targets = (await companiesByIds(want, req.orgId))
      .filter(c => c.verticalId === req.verticalId);

    const subject = String(req.body?.subject ?? v.subject ?? "");
    const body = String(req.body?.body ?? v.body ?? "");

    /* One preview per generated message — a row with two filled email
       columns previews twice, once per recipient, exactly as it will send. */
    res.json({
      previews: targets.flatMap(c =>
        recipientsFor(v.columns, c.data).map(r => ({
          id: c.id, name: c.name,
          to: r.email, toName: r.name, column: r.colLabel,
          subject: fillMerge(subject, { columns: v.columns, data: c.data, vertical: v, org, recipient: r }),
          body: fillMerge(body, { columns: v.columns, data: c.data, vertical: v, org, recipient: r }),
        }))),
    });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------------
   Adopt sent history — learn what the mailbox already knows.

   For leads first contacted OUTSIDE the CRM: the original mails usually sit
   in the mailbox (migrated or native) with their Message-IDs intact. This
   searches All Mail for outbound mail to each selected lead's addresses and
   files the hits as real outbound records — real ids included — so
   follow-ups thread into those ORIGINAL conversations, and Contacted /
   sent-state reflect mailbox truth instead of guesswork. Idempotent:
   message_id is unique, re-running adopts nothing twice. Callers send small
   batches of ids; each request is one IMAP session.
---------------------------------------------------------------------- */
emails.post("/adopt-history", requireOrg, requireVertical, async (req, res, next) => {
  try {
    const want = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(Number.isInteger).slice(0, 30);
    if (!want.length) return res.status(400).json({ error: "Nobody given." });

    const v = await verticalAuth(req.verticalId, req.orgId);
    const pass = v?.smtpSecret ? openSecret(v.smtpSecret) : null;
    if (!v?.smtpUser || !pass)
      return res.status(409).json({ error: "This vertical has no sending account — the mailbox to scan is its account. Add it in settings first." });

    const custom = v.smtpHost && !/gmail\.com$/i.test(v.smtpHost);
    if (custom)
      return res.status(409).json({ error: "History adoption reads Gmail/Workspace mailboxes (All Mail). This vertical sends through a custom host." });

    const targets = (await companiesByIds(want, req.orgId))
      .filter(c => c.verticalId === req.verticalId);
    if (!targets.length) return res.status(404).json({ error: "No such companies." });

    /* Only addresses that don't already have a real-id outbound: a CRM-sent
       or previously adopted mail already threads; searching again buys
       nothing. Mark-as-emailed rows (no id) DO get searched — adoption
       upgrades the guess to the real thing. */
    const jobs = [];
    for (const c of targets) {
      for (const r of recipientsFor(req.vertical.columns, c.data)) {
        const hasReal = (c.emails || []).some(m =>
          m.dir === "out" && m.messageId &&
          String(m.to || "").toLowerCase() === r.email);
        if (!hasReal) jobs.push({ c, email: r.email });
      }
    }
    if (!jobs.length)
      return res.json({ companies: targets, adopted: 0, checked: 0 });

    const account = { user: v.smtpUser, pass };
    const found = await findSentToMany(account, {
      from: fromAddressFor(v),
      tos: [...new Set(jobs.map(j => j.email))],
    });

    let adopted = 0;
    const touched = new Set();
    await tx(async (client) => {
      for (const { c, email } of jobs) {
        for (const h of found[email] || []) {
          const at = h.at ? new Date(h.at).toISOString().slice(0, 10) : null;
          const { rowCount } = await client.query(
            `INSERT INTO emails (company_id, direction, at, addr, subject, body,
                                 read, message_id, kind, thread_id)
             VALUES ($1,'out', COALESCE($2::date, CURRENT_DATE), $3, $4, '', true, $5, 'script', $5)
             ON CONFLICT (message_id) DO NOTHING`,
            [c.id, at, email, h.subject, h.messageId]);
          if (rowCount) { adopted++; touched.add(c.id); }
        }
      }
      for (const id of touched)
        await addHistory(client, id, "Adopted earlier emails from the mailbox");
    });

    res.json({
      companies: await companiesByIds(targets.map(c => c.id), req.orgId),
      adopted,
      checked: jobs.length,
    });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------------
   Mark as already emailed — record without sending.

   For leads contacted OUTSIDE the CRM (an earlier campaign, another tool):
   the CRM can only know what it sent itself, so this writes the missing
   fact. Every unsent address on each lead gets an outbound record with no
   body, the cells flip to Sent, and bulk sending skips them forever.
   Idempotent: addresses that already have an outbound record are left
   alone, so running it twice changes nothing.
---------------------------------------------------------------------- */
emails.post("/mark-sent", requireOrg, requireVertical, async (req, res, next) => {
  try {
    const want = (Array.isArray(req.body?.ids) ? req.body.ids : [])
      .map(Number).filter(Number.isInteger);
    if (!want.length) return res.status(400).json({ error: "Nobody given." });

    const targets = await companiesByIds(want, req.orgId);
    const mine = targets.filter(c => c.verticalId === req.verticalId);
    if (!mine.length) return res.status(404).json({ error: "No such companies." });

    let marked = 0;
    await tx(async (client) => {
      for (const c of mine) {
        const already = new Set((c.emails || [])
          .filter(m => m.dir === "out")
          .map(m => String(m.to || "").toLowerCase()));
        const missing = recipientsFor(req.vertical.columns, c.data)
          .filter(r => !already.has(r.email));
        for (const r of missing) {
          await client.query(
            `INSERT INTO emails (company_id, direction, at, addr, subject, body, read, kind)
             VALUES ($1,'out',CURRENT_DATE,$2,$3,'',true,'script')`,
            [c.id, r.email, "Marked as already emailed (outside the CRM)"]);
          marked++;
        }
        if (missing.length)
          await addHistory(client, c.id, "Marked as already emailed (outside the CRM)");
      }
    });

    res.json({
      companies: await companiesByIds(mine.map(c => c.id), req.orgId),
      marked,
    });
  } catch (e) { next(e); }
});

/* "Log a reply" — record an inbound message by hand. Same filing path as the
   IMAP poller and the webhook, so it moves the company to Responded in exactly
   the same way. Constrained to the caller's organization: this is a person
   acting inside one tenant, not the shared mailbox speaking for all of them. */
emails.post("/log", requireOrg, async (req, res, next) => {
  try {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Which company?" });

    const { rows: [k] } = await query(
      `SELECT k.email FROM contacts k JOIN companies c ON c.id = k.company_id
        WHERE k.company_id = $1 AND c.org_id = $2
        ORDER BY k.position, k.id LIMIT 1`, [id, req.orgId]);
    /* Extracted, not trusted: a contact stored before validation can carry
       two stacked addresses in one field. One clean address or nothing. */
    const addr = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(k?.email || "")?.[0];
    if (!addr)
      return res.status(400).json({ error: "That company has no contact email to file the reply against." });

    const hit = await fileInbound({
      from: addr,
      subject: String(req.body?.subject || "").trim() || "(no subject)",
      body: String(req.body?.body || ""),
      read: true,                                  // you just read it, you typed it in
      orgId: req.orgId,
    });
    if (!hit) return res.status(409).json({ error: "That reply was already filed." });

    res.json({ companies: await companiesByIds([hit], req.orgId) });
  } catch (e) { next(e); }
});

/* ----------------------------------------------------------------------
   Inbound webhook
   Optional — the IMAP poller already files replies. This is for anyone routing
   mail through a provider's inbound parse instead: point it at
   POST /api/emails/inbound. Set INBOUND_SECRET and send it as ?token= or
   X-Webhook-Token, otherwise anyone who finds the URL can write into your
   pipeline.

   Deliberately open: a mail provider has no session. It is a machine-to-machine
   endpoint guarded by its own shared secret, and it files across every
   organization because the mailbox it speaks for is shared.
---------------------------------------------------------------------- */
emails.post("/inbound", async (req, res, next) => {
  try {
    const secret = process.env.INBOUND_SECRET;
    if (secret) {
      const given = req.get("x-webhook-token") || req.query.token;
      if (given !== secret) return res.status(401).json({ error: "bad token" });
    }

    const b = req.body || {};

    /* Without an id there is nothing for ON CONFLICT (message_id) to catch —
       NULL never conflicts — so a provider that retries a delivery would file
       the same reply a second time. They all pass the RFC Message-ID; they
       just disagree about how to spell the key. */
    const messageId = b.messageId || b["message-id"] || b["Message-Id"] ||
      b["Message-ID"] || b.MessageID || null;

    const hit = await fileInbound({
      from: b.from || b.sender || b.envelope?.from,
      subject: b.subject,
      body: b.text || b.body || b.plain || "",
      messageId,
    });

    /* 200 either way. A provider that gets a 4xx will retry forever over a
       message we have no company for, which is not worth retrying. */
    res.json({ filed: !!hit, companyId: hit });
  } catch (e) { next(e); }
});
