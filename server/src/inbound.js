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

    /* Where does a replying lead go? To the stage its own vertical marked as
       "replies land here" — and only FORWARD. A lead already at or past that
       stage (in a Meeting, Won) stays exactly where it is: a second reply, a
       "thanks, talk soon" after signing, none of it can drag a deal
       backwards. No marked stage means replies file and flag but never move
       anything. Positions come from the vertical's own pipeline, so every
       tenant's own ordering is the law. */
    const { rows: [move] } = await client.query(
      `SELECT t.id AS "toStage", t.label AS "toLabel",
              cur.position AS "curPos", t.position AS "toPos"
         FROM companies c
         JOIN verticals v ON v.id = c.vertical_id
         JOIN stages t   ON t.vertical_id = v.id AND t.id = v.replied_stage
         LEFT JOIN stages cur ON cur.vertical_id = v.id AND cur.id = c.stage
        WHERE c.id = $1`, [hit.id]);

    const promote = !!move && move.curPos !== null && move.curPos < move.toPos;
    if (promote) {
      await client.query(
        `UPDATE companies
            SET stage = $1,
                stage_since  = COALESCE($2::date, CURRENT_DATE),
                responded_on = COALESCE(responded_on, COALESCE($2::date, CURRENT_DATE)),
                updated_at = now()
          WHERE id = $3`, [move.toStage, at || null, hit.id]);
    } else {
      /* The fact of the first reply is still worth stamping. */
      await client.query(
        `UPDATE companies SET responded_on = COALESCE(responded_on, COALESCE($1::date, CURRENT_DATE)),
                updated_at = now() WHERE id = $2`, [at || null, hit.id]);
    }

    await client.query(
      `INSERT INTO history (company_id, d, t) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)`,
      [hit.id, at || null,
       promote ? `Replied — moved to ${move.toLabel}` : "Reply received"]);

    return hit.id;
  });
}
