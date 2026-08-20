import pg from "pg";

/* DATE columns come back as bare 'YYYY-MM-DD' strings rather than JS Dates.
   The UI treats every date as a plain day with no timezone, and letting node-pg
   build a Date here would shift stage_since across midnight for anyone west of
   UTC. TIMESTAMPTZ (OID 1184) is left alone — those genuinely are instants. */
pg.types.setTypeParser(1082, (v) => v);
/* int8 -> Number. Only used for count(*), which never approaches 2^53. */
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
});

pool.on("error", (err) => console.error("[db] idle client error:", err.message));

export const query = (text, params) => pool.query(text, params);

/* Run a set of statements in one transaction, rolling back on any throw. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* ----------------------------------------------------------------------
   Serialisation
   The frontend was written against a nested shape (company.contacts[],
   .emails[], .history[]) and there's no reason to make it learn a flat one.
   So the read path assembles that shape in Postgres with json_agg and hands
   back exactly what the UI already expects — camelCase keys included.

   Every function here takes an orgId and every query filters on it. That is
   the tenancy boundary: a route that forgets to pass one gets a syntax error
   from its own call, not another tenant's data.
---------------------------------------------------------------------- */

const COMPANY_SELECT = `
  SELECT c.id, c.name, c.vertical_id AS "verticalId", c.data,
         c.website, c.linkedin, c.stage,
         c.stage_since      AS "stageSince",
         c.notes,
         c.responded_on     AS "respondedOn",
         c.meeting_on       AS "meetingOn",
         c.closed_on        AS "closedOn",
         COALESCE((
           SELECT json_agg(json_build_object(
                    'name', k.name, 'role', k.role,
                    'email', k.email, 'phone', k.phone)
                  ORDER BY k.position, k.id)
           FROM contacts k WHERE k.company_id = c.id
         ), '[]'::json) AS contacts,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', e.id::text,
                    'dir', e.direction,
                    'at', e.at,
                    'subject', e.subject,
                    'body', e.body,
                    'read', e.read,
                    'kind', e.kind,
                    'threadId', e.thread_id,
                    'messageId', e.message_id,
                    -- the UI reads .to on outbound and .from on inbound
                    'to', CASE WHEN e.direction = 'out' THEN e.addr END,
                    'from', CASE WHEN e.direction = 'in'  THEN e.addr END)
                  ORDER BY e.at, e.id)
           FROM emails e WHERE e.company_id = c.id
         ), '[]'::json) AS emails,
         COALESCE((
           SELECT json_agg(json_build_object('d', h.d, 't', h.t) ORDER BY h.d, h.id)
           FROM history h WHERE h.company_id = c.id
         ), '[]'::json) AS history
  FROM companies c`;

/* A vertical's board. The org filter rides along even though the vertical id
   implies it — a crafted X-Vertical-Id must not read another tenant's rows. */
export async function allCompanies(orgId, verticalId, client = pool) {
  const { rows } = await client.query(
    `${COMPANY_SELECT} WHERE c.org_id = $1 AND c.vertical_id = $2 ORDER BY c.id`,
    [orgId, verticalId]);
  return rows;
}

/* Used by every mutation to return the rows it touched, so the client can merge
   server truth into its state instead of re-fetching the whole table.

   The org filter is not redundant with the id list: it is what stops a crafted
   `ids` array from reading rows out of a tenant the caller can see nothing else
   of. Ids are sequential across all organizations, so guessing them is trivial. */
export async function companiesByIds(ids, orgId, client = pool) {
  if (!ids?.length) return [];
  const { rows } = await client.query(
    `${COMPANY_SELECT} WHERE c.id = ANY($1::int[]) AND c.org_id = $2 ORDER BY c.id`,
    [ids, orgId]);
  return rows;
}

export async function allStages(verticalId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, label, sub, accent, wait FROM stages
      WHERE vertical_id = $1 ORDER BY position, id`, [verticalId]);
  return rows;
}

/* ----------------------------------------------------------------------
   Verticals

   The sealed SMTP secret never leaves this module in a readable form: the
   list/read shape carries `smtpConfigured` instead, and the secret itself is
   selected only by verticalAuth(), which the send path uses.
---------------------------------------------------------------------- */

const VERTICAL_LIST = `
  SELECT v.id, v.org_id AS "orgId", v.slug, v.name, v.accent,
         v.columns, v.subject, v.body,
         v.smtp_user AS "smtpUser", v.smtp_from AS "smtpFrom",
         v.smtp_send_as AS "smtpSendAs",
         v.smtp_host AS "smtpHost", v.smtp_port AS "smtpPort",
         v.replied_stage AS "repliedStage",
         v.followups,
         (v.smtp_secret <> '') AS "smtpConfigured",
         v.setup_done AS "setupDone",
         v.position, v.created_at AS "createdAt",
         (SELECT count(*)::int FROM companies c WHERE c.vertical_id = v.id) AS companies,
         (SELECT count(*)::int FROM companies c
           WHERE c.vertical_id = v.id
             AND c.stage NOT IN ('responded', 'meeting', 'closed')) AS open,
         (SELECT count(*)::int FROM companies c
           WHERE c.vertical_id = v.id AND c.stage = 'closed') AS won,
         (SELECT count(*)::int FROM emails e JOIN companies c ON c.id = e.company_id
           WHERE c.vertical_id = v.id AND e.direction = 'in' AND NOT e.read) AS unread
    FROM verticals v`;

export async function allVerticals(orgId, client = pool) {
  const { rows } = await client.query(
    `${VERTICAL_LIST} WHERE v.org_id = $1 ORDER BY v.position, v.id`, [orgId]);
  return rows;
}

export async function verticalById(id, orgId, client = pool) {
  const { rows } = await client.query(
    `${VERTICAL_LIST} WHERE v.id = $1 AND v.org_id = $2`, [id, orgId]);
  return rows[0] || null;
}

/* The one read that includes the sealed credential, for the send path. */
export async function verticalAuth(id, orgId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, name, smtp_user AS "smtpUser", smtp_from AS "smtpFrom",
            smtp_send_as AS "smtpSendAs",
            smtp_host AS "smtpHost", smtp_port AS "smtpPort",
            smtp_secret AS "smtpSecret", columns, subject, body
       FROM verticals WHERE id = $1 AND org_id = $2`, [id, orgId]);
  return rows[0] || null;
}

export const addHistory = (client, companyId, text, on) =>
  client.query(
    `INSERT INTO history (company_id, d, t) VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)`,
    [companyId, on || null, text]);

/* ----------------------------------------------------------------------
   Organizations

   What the landing page reads. Every organization, in creation order — there
   are no accounts and so nothing to filter by. The counts come back with the
   list rather than from a second round trip per card, because the picker shows
   them all at once and a tenant with nothing in it should say so on the card,
   not after you've already clicked into it.
---------------------------------------------------------------------- */

/* The unread count is its own subquery rather than a FILTER alongside the
   others: it counts emails, not companies, so it can't share their grouping. */
const ORG_LIST = `
  SELECT o.id, o.name,
         o.full_name    AS "fullName",
         o.mark, o.tagline, o.accent, o.logo, o.verticals,
         o.sender_name  AS "senderName",
         o.sender_email AS "senderEmail",
         o.created_at   AS "createdAt",
         (SELECT count(*)::int FROM companies c WHERE c.org_id = o.id) AS companies,
         (SELECT count(*)::int FROM companies c
           WHERE c.org_id = o.id
             AND c.stage NOT IN ('responded', 'meeting', 'closed')) AS open,
         (SELECT count(*)::int FROM companies c
           WHERE c.org_id = o.id AND c.stage = 'closed') AS won,
         (SELECT count(*)::int FROM emails e JOIN companies c ON c.id = e.company_id
           WHERE c.org_id = o.id AND e.direction = 'in' AND NOT e.read) AS unread
    FROM organizations o`;

export async function allOrgs(client = pool) {
  const { rows } = await client.query(`${ORG_LIST} ORDER BY o.created_at, o.id`);
  return rows;
}

export async function orgById(orgId, client = pool) {
  const { rows } = await client.query(`${ORG_LIST} WHERE o.id = $1`, [orgId]);
  return rows[0] || null;
}
