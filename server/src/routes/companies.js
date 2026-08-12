import { Router } from "express";
import { query, tx, allCompanies, companiesByIds, addHistory } from "../db.js";
import { TERMINAL } from "../constants.js";
import { requireOrg, requireVertical } from "../auth.js";
import { cleanData, project, cleanWeb } from "../columns.js";

export const companies = Router();

/* Scoped one level deeper than before: every request names a vertical as well
   as an organization, because a company now lives on one vertical's board and
   is written in that vertical's columns. Handlers read req.orgId and
   req.verticalId, and every statement filters on org — including the ones
   taking ids from the body, because ids are sequential and guessable. */
companies.use(requireOrg, requireVertical);

const ids = (body) => (Array.isArray(body?.ids) ? body.ids : [])
  .map(Number).filter(Number.isInteger);

/* Number("abc") is NaN, and Postgres answers that with "invalid input syntax
   for type integer" — which the error handler logs as a bug and reports as a
   500, when it's really a malformed request. */
const intId = (raw) => { const n = Number(raw); return Number.isInteger(n) ? n : null; };
const badId = (res) => res.status(400).json({ error: "That isn't a company id." });

const stageOrder = async (verticalId, client = { query }) =>
  (await client.query(
    `SELECT id, label FROM stages WHERE vertical_id = $1 ORDER BY position, id`,
    [verticalId])).rows;

/* Every mutation answers with the rows it touched rather than a bare 200, so
   the client merges server truth into its state instead of re-fetching the
   whole table after each click. */
const touched = async (res, orgId, client, changed, extra = {}) =>
  res.json({ companies: await companiesByIds(changed, orgId, client), ...extra });

/* One row, written in the vertical's own columns. `data` is the record; name,
   website, notes and the contact row are projections of whichever columns
   claim those roles — see columns.js. linkedin still has its own column-shaped
   home because the old data had one; a vertical that declares a url column
   named linkedin projects nothing, it is simply data. */
async function insertCompany(client, orgId, vertical, c) {
  const data = cleanData(vertical.columns, c.data);
  const p = project(vertical.columns, data);
  if (!p.name) return null;

  /* companies.linkedin is the COMPANY page chip under the row's name. It is
     deliberately NOT filled from the sheet's LinkedIn columns: those are the
     POCs' personal profiles, and a person's profile chip masquerading as the
     company was exactly the confusion this caused. Only a URL that arrived
     embedded in the company-name cell (extracted by the import) lands here. */
  const { rows: [row] } = await client.query(
    `INSERT INTO companies (org_id, vertical_id, name, data, website, linkedin,
                            stage, stage_since, notes, responded_on, meeting_on, closed_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::date, CURRENT_DATE), $9,$10,$11,$12)
     RETURNING id`,
    [orgId, vertical.id, p.name, JSON.stringify(data), p.website,
     cleanWeb(c.linkedin), c.stage,
     c.stageSince || null, p.notes,
     c.respondedOn || null, c.meetingOn || null, c.closedOn || null]);

  for (const [i, k] of p.contacts.entries())
    await client.query(
      `INSERT INTO contacts (company_id, name, role, email, phone, position)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.id, (k.name || "").trim(), k.role || "",
       (k.email || "").trim().toLowerCase(), k.phone || "", i]);

  for (const h of c.history?.length ? c.history : [{ t: "Entered outreach" }])
    await addHistory(client, row.id, h.t, h.d);

  return row.id;
}

companies.get("/", async (req, res, next) => {
  try { res.json({ companies: await allCompanies(req.orgId, req.verticalId) }); }
  catch (e) { next(e); }
});

companies.post("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    const stages = await stageOrder(req.verticalId);
    if (!stages.length)
      return res.status(409).json({ error: "No pipeline stages exist yet." });

    const id = await tx((client) => insertCompany(client, req.orgId, req.vertical, {
      data: body.data || {}, linkedin: body.linkedin,
      stage: stages[0].id, history: [{ t: "Entered outreach" }],
    }));
    if (id === null)
      return res.status(400).json({ error: "The name column can't be empty." });
    res.status(201).json({ companies: await companiesByIds([id], req.orgId) });
  } catch (e) { next(e); }
});

/* Bulk import from the spreadsheet wizard. The client mapped the sheet's
   headers onto this vertical's columns and flagged duplicates; this writes
   what it was handed, in one transaction so a bad row can't leave half a
   sheet in the database. */
companies.post("/import", async (req, res, next) => {
  try {
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    if (!records.length) return res.status(400).json({ error: "Nothing to import." });

    const stages = await stageOrder(req.verticalId);
    if (!stages.length)
      return res.status(409).json({ error: "No pipeline stages exist yet." });
    const valid = new Set([...stages.map(s => s.id), ...TERMINAL]);

    const { inserted, updated } = await tx(async (client) => {
      const inserted = [], updated = [];
      for (const r of records) {
        /* A record carrying updateId is a company already on this board: the
           sheet's values merge OVER what's stored (a blank cell never erases
           a value), the projections refresh, and — deliberately — the stage,
           the thread and the history stay: re-importing a sheet must never
           knock a lead back to the first stage or lose a conversation. */
        if (r.updateId) {
          const id = Number(r.updateId);
          if (!Number.isInteger(id)) continue;
          const { rows: [old] } = await client.query(
            `SELECT data FROM companies
              WHERE id = $1 AND org_id = $2 AND vertical_id = $3 FOR UPDATE`,
            [id, req.orgId, req.verticalId]);
          if (!old) continue;

          const merged = {};
          for (const [k, v] of Object.entries(old.data || {})) if (v) merged[k] = v;
          for (const [k, v] of Object.entries(r.data || {})) if (v !== "" && v != null) merged[k] = v;
          const data = cleanData(req.vertical.columns, merged);
          const p = project(req.vertical.columns, data);
          if (!p.name) continue;

          await client.query(
            `UPDATE companies
                SET name = $1, data = $2, website = $3, notes = $4, updated_at = now()
              WHERE id = $5`,
            [p.name, JSON.stringify(data), p.website, p.notes, id]);
          await client.query(`DELETE FROM contacts WHERE company_id = $1`, [id]);
          for (const [i, k] of p.contacts.entries())
            await client.query(
              `INSERT INTO contacts (company_id, name, role, email, phone, position)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [id, k.name, k.role, k.email, k.phone, i]);
          await addHistory(client, id, "Refreshed from spreadsheet import");
          updated.push(id);
          continue;
        }

        const id = await insertCompany(client, req.orgId, req.vertical, {
          data: r.data || {}, linkedin: r.linkedin,
          stage: valid.has(r.stage) ? r.stage : stages[0].id,
          stageSince: r.stageSince,
          history: [{ t: "Imported from spreadsheet" }],
        });
        if (id !== null) inserted.push(id);
      }
      return { inserted, updated };
    });

    if (!inserted.length && !updated.length)
      return res.status(400).json({ error: "No rows had anything in the name column." });

    res.status(201).json({
      companies: await companiesByIds([...inserted, ...updated], req.orgId),
      count: inserted.length + updated.length,
      added: inserted.length,
      updated: updated.length,
    });
  } catch (e) { next(e); }
});

/* Edit the record itself — a patch to `data`, in whole or in part. Stage
   changes go through the routes below instead, because each of those also
   writes an activity entry. */
companies.patch("/:id", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return badId(res);
    const b = req.body || {};

    /* Ownership first: everything after this rewrites the row wholesale. */
    const { rows: [own] } = await query(
      `SELECT data FROM companies WHERE id = $1 AND org_id = $2 AND vertical_id = $3`,
      [id, req.orgId, req.verticalId]);
    if (!own) return res.status(404).json({ error: "No such company." });

    /* A partial patch merges over what is there; null clears a field. The
       projections are recomputed from the merged result, so the mirror moves
       in the same UPDATE as its source. */
    const data = cleanData(req.vertical.columns, { ...own.data, ...(b.data || {}) });
    const p = project(req.vertical.columns, data);
    if (!p.name) return res.status(400).json({ error: "The name column can't be empty." });

    await tx(async (client) => {
      const sets = [`data = $1`, `name = $2`, `website = $3`, `notes = $4`, `updated_at = now()`];
      const vals = [JSON.stringify(data), p.name, p.website, p.notes];
      if (b.linkedin !== undefined) { vals.push(cleanWeb(b.linkedin)); sets.push(`linkedin = $${vals.length}`); }
      if (b.meetingOn !== undefined) { vals.push(b.meetingOn || null); sets.push(`meeting_on = $${vals.length}`); }
      vals.push(id, req.orgId);
      await client.query(
        `UPDATE companies SET ${sets.join(", ")}
          WHERE id = $${vals.length - 1} AND org_id = $${vals.length}`, vals);

      await client.query(`DELETE FROM contacts WHERE company_id = $1`, [id]);
      for (const [i, k] of p.contacts.entries())
        await client.query(
          `INSERT INTO contacts (company_id, name, role, email, phone, position)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, (k.name || "").trim(), k.role || "",
           (k.email || "").trim().toLowerCase(), k.phone || "", i]);
    });

    const [row] = await companiesByIds([id], req.orgId);
    res.json({ companies: [row] });
  } catch (e) { next(e); }
});

/* Move to the next funnel stage without sending anything. */
companies.post("/advance", async (req, res, next) => {
  try {
    const want = ids(req.body);
    if (!want.length) return res.status(400).json({ error: "No companies given." });

    const out = await tx(async (client) => {
      const stages = await stageOrder(req.verticalId, client);
      const order = stages.map(s => s.id);
      const { rows } = await client.query(
        `SELECT id, stage FROM companies
          WHERE id = ANY($1::int[]) AND org_id = $2 AND vertical_id = $3 FOR UPDATE`,
        [want, req.orgId, req.verticalId]);

      const moved = [];
      for (const r of rows) {
        const i = order.indexOf(r.stage);
        if (i < 0 || i >= order.length - 1) continue;   // terminal, or already last
        await client.query(
          `UPDATE companies SET stage = $1, stage_since = CURRENT_DATE, updated_at = now()
           WHERE id = $2`, [order[i + 1], r.id]);
        await addHistory(client, r.id, `${stages[i + 1].label} sent`);
        moved.push(r.id);
      }
      return moved;
    });

    if (!out.length)
      return res.status(409).json({ error: "Nothing could move — they're already at the last stage." });
    await touched(res, req.orgId, undefined, out, { moved: out.length });
  } catch (e) { next(e); }
});

/* Drag-and-drop on the board. A correction, not a send: it moves the card and
   says so in the activity log, and never emails anyone. */
companies.post("/:id/move", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return badId(res);
    const to = String(req.body?.stage || "");

    const out = await tx(async (client) => {
      const stages = await stageOrder(req.verticalId, client);
      const target = stages.find(s => s.id === to);
      if (!target) return null;
      const { rowCount } = await client.query(
        `UPDATE companies SET stage = $1, stage_since = CURRENT_DATE, updated_at = now()
         WHERE id = $2 AND org_id = $3 AND vertical_id = $4 AND stage <> $1`,
        [to, id, req.orgId, req.verticalId]);
      if (!rowCount) return null;
      await addHistory(client, id, `Moved to ${target.label}`);
      return target.label;
    });

    if (out === null) return res.status(400).json({ error: "That stage doesn't exist, or nothing changed." });
    await touched(res, req.orgId, undefined, [id], { stageLabel: out });
  } catch (e) { next(e); }
});

const STAMPS = {
  responded: { col: "responded_on", note: "Replied — moved to Responded" },
  meeting:   { col: "meeting_on",   note: "Meeting booked" },
  closed:    { col: "closed_on",    note: "Closed — won" },
};

/* The three lifecycle states the funnel empties into. */
companies.post("/stamp", async (req, res, next) => {
  try {
    const want = ids(req.body);
    const to = String(req.body?.to || "");
    const stamp = STAMPS[to];
    if (!stamp) return res.status(400).json({ error: `Unknown state "${to}".` });
    if (!want.length) return res.status(400).json({ error: "No companies given." });

    const out = await tx(async (client) => {
      const { rows } = await client.query(
        `UPDATE companies
            SET stage = $1, stage_since = CURRENT_DATE,
                ${stamp.col} = CURRENT_DATE, updated_at = now()
          WHERE id = ANY($2::int[]) AND org_id = $3 AND vertical_id = $4
          RETURNING id`, [to, want, req.orgId, req.verticalId]);
      for (const r of rows) await addHistory(client, r.id, stamp.note);
      return rows.map(r => r.id);
    });

    if (!out.length) return res.status(404).json({ error: "No such companies." });
    await touched(res, req.orgId, undefined, out, { stamped: out.length });
  } catch (e) { next(e); }
});

/* Opening a company clears its unread replies. */
companies.post("/:id/read", async (req, res, next) => {
  try {
    const id = intId(req.params.id);
    if (id === null) return badId(res);
    await query(
      `UPDATE emails SET read = true
        WHERE company_id = $1 AND direction = 'in' AND read = false
          AND company_id IN (SELECT id FROM companies WHERE id = $1 AND org_id = $2)`,
      [id, req.orgId]);
    await touched(res, req.orgId, undefined, [id]);
  } catch (e) { next(e); }
});

/* Contacts, emails and history go with them — the FKs cascade. */
companies.post("/delete", async (req, res, next) => {
  try {
    const want = ids(req.body);
    if (!want.length) return res.status(400).json({ error: "No companies given." });
    /* RETURNING rather than trusting `want`: the client removes exactly the
       rows the server actually deleted, so an id belonging to another tenant
       silently does nothing instead of vanishing from the sender's table. */
    const { rows } = await query(
      `DELETE FROM companies
        WHERE id = ANY($1::int[]) AND org_id = $2 AND vertical_id = $3 RETURNING id`,
      [want, req.orgId, req.verticalId]);
    res.json({ deleted: rows.length, ids: rows.map(r => r.id) });
  } catch (e) { next(e); }
});
