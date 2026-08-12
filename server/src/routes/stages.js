import { Router } from "express";
import { tx, allStages, allCompanies, addHistory } from "../db.js";
import { requireOrg, requireVertical } from "../auth.js";

export const stages = Router();

/* A funnel belongs to one vertical now — MVA and pest control in the same
   organization can run different pipelines — so every request names one. */
stages.use(requireOrg, requireVertical);

stages.get("/", async (req, res, next) => {
  try { res.json({ stages: await allStages(req.verticalId) }); }
  catch (e) { next(e); }
});

/* Save the whole pipeline at once.

   `remap` says where companies from a deleted stage should land — the editor
   collects that answer before it lets you delete a stage that still has
   companies in it, so by the time this runs nobody can be orphaned. The order
   below matters: remap first, then delete, or the FK-less stage text on
   companies would point at a row that no longer exists.

   Every statement is scoped to one vertical. Stages are keyed on
   (vertical_id, id), so every vertical can have an 'outreach' — which is what
   they will all call their first stage. */
stages.put("/", async (req, res, next) => {
  try {
    const next_ = Array.isArray(req.body?.stages) ? req.body.stages : [];
    const remap = req.body?.remap && typeof req.body.remap === "object" ? req.body.remap : {};

    if (!next_.length)
      return res.status(400).json({ error: "A pipeline needs at least one stage." });
    if (next_.some(s => !String(s.label || "").trim()))
      return res.status(400).json({ error: "Every stage needs a name." });

    const keep = new Set(next_.map(s => String(s.id)));
    for (const [from, to] of Object.entries(remap)) {
      if (!keep.has(String(to)))
        return res.status(400).json({ error: `Cannot move companies from "${from}" into a stage that's also being deleted.` });
    }
    /* The other half of the same check. A remap keyed on a stage that survives
       the save would empty it out and write "Stage removed" against every
       company in it, which never happened. */
    for (const from of Object.keys(remap)) {
      if (keep.has(String(from)))
        return res.status(400).json({ error: `"${from}" isn't being deleted, so there are no companies to move out of it.` });
    }

    await tx(async (client) => {
      const labels = Object.fromEntries(next_.map(s => [String(s.id), s.label.trim()]));

      for (const [from, to] of Object.entries(remap)) {
        const { rows } = await client.query(
          `UPDATE companies SET stage = $1, stage_since = CURRENT_DATE, updated_at = now()
            WHERE stage = $2 AND org_id = $3 AND vertical_id = $4 RETURNING id`,
          [String(to), String(from), req.orgId, req.verticalId]);
        for (const r of rows)
          await addHistory(client, r.id, `Stage removed — moved to ${labels[String(to)]}`);
      }

      await client.query(
        `DELETE FROM stages WHERE vertical_id = $1 AND NOT (id = ANY($2::text[]))`,
        [req.verticalId, [...keep]]);

      for (const [i, s] of next_.entries()) {
        await client.query(
          `INSERT INTO stages (vertical_id, org_id, id, label, sub, accent, wait, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (vertical_id, id) DO UPDATE SET
             label = EXCLUDED.label, sub = EXCLUDED.sub,
             accent = EXCLUDED.accent, wait = EXCLUDED.wait,
             position = EXCLUDED.position`,
          [req.verticalId, req.orgId, String(s.id), s.label.trim(), s.sub || "",
           s.accent || "#7E9895",
           Math.min(365, Math.max(1, Number(s.wait) || 7)), i]);
      }
    });

    /* Companies come back too: a remap changed some of them, and the client
       has no way to work out which without asking. */
    res.json({
      stages: await allStages(req.verticalId),
      companies: await allCompanies(req.orgId, req.verticalId),
    });
  } catch (e) { next(e); }
});
