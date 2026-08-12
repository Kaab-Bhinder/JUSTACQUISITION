import { tx } from "./db.js";

/* ----------------------------------------------------------------------
   Filing an inbound reply

   Three doors lead here — the IMAP poller, an optional provider webhook, and
   "Log a reply" typed by hand — and all three want identical behaviour, so
   they share this one function. It is the only place a reply becomes a CRM
   record, which is why the tests point straight at it.

   A message whose sender isn't a contact on any company is left alone rather
   than guessed at. Returning null tells the caller nothing was filed.

   ---- on tenancy --------------------------------------------------------

   There is one mailbox for the whole installation, so the poller and the
   webhook file across every organization: a reply belongs to whichever tenant
   has the sender on file. `orgId` narrows that to a single tenant and is
   passed by "Log a reply", which is a person acting inside one organization
   and must not be able to write a row into another.

   Where two tenants both list the same contact address, the lowest company id
   wins. That is arbitrary but stable, and the alternative — filing the same
   reply into both — would show each of them a message that wasn't theirs.
---------------------------------------------------------------------- */
export async function fileInbound({
  from, subject, body, at, messageId, threadId, read = false, orgId = null,
}) {
  const addr = String(from || "").trim().toLowerCase();
  if (!addr) return null;

  return tx(async (client) => {
    const { rows: [hit] } = await client.query(
      `SELECT c.id, c.stage, c.org_id
         FROM companies c
         JOIN contacts k ON k.company_id = c.id
        WHERE lower(k.email) = $1
          AND ($2::text IS NULL OR c.org_id = $2)
        ORDER BY c.id
        LIMIT 1`, [addr, orgId]);
    if (!hit) return null;

    /* message_id is UNIQUE, so a reply the poller sees twice — across restarts,
       overlapping ticks, or an inbox where the lookback window still covers it
       — files exactly once. DO NOTHING returns no row, which is the signal. */
    const { rows: [msg] } = await client.query(
      `INSERT INTO emails (company_id, message_id, thread_id, direction, at,
                           addr, subject, body, read)
       VALUES ($1,$2,$3,'in', COALESCE($4::date, CURRENT_DATE), $5,$6,$7,$8)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [hit.id, messageId || null, threadId || null, at || null,
       addr, subject || "(no subject)", body || "", read]);
    if (!msg) return null;                       // already filed

    /* Only a company still working through the funnel gets promoted. One that
       already reached Meeting or Closed must not be dragged backwards by a
       stray reply — a "thanks, talk soon" after signing shouldn't reopen the
       deal. It's still filed on the thread either way.

       The stage lookup is scoped to the company's own organization: 'fu2' is
       a stage in most tenants, and asking globally would call a company in the
       funnel when its own tenant has no such stage. */
    const { rows: [inFunnel] } = await client.query(
      `SELECT 1 FROM stages WHERE id = $1 AND org_id = $2`, [hit.stage, hit.org_id]);

    if (inFunnel) {
      await client.query(
        `UPDATE companies
            SET stage = 'responded',
                stage_since  = COALESCE($1::date, CURRENT_DATE),
                responded_on = COALESCE($1::date, CURRENT_DATE),
                updated_at = now()
          WHERE id = $2`, [at || null, hit.id]);
    }

    await client.query(
      `INSERT INTO history (company_id, d, t) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)`,
      [hit.id, at || null,
       inFunnel ? "Replied — moved to Responded" : "Reply received"]);

    return hit.id;
  });
}
