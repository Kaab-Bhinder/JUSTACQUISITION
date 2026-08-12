import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool, query } from "./db.js";
import { DEFAULT_STAGES, ORGS } from "./constants.js";

const here = dirname(fileURLToPath(import.meta.url));

/* Stages belong to verticals now, so there is nothing to seed per organization
   here: creating a vertical (in the app, or in schema.sql's adoption of old
   rows) is what creates a funnel. What this still guards against is a vertical
   with no stages — an interrupted create — which would be a board with nowhere
   to put a company. */
async function repairStages() {
  const { rows } = await query(
    `SELECT v.id, v.org_id, v.name FROM verticals v
      WHERE NOT EXISTS (SELECT 1 FROM stages s WHERE s.vertical_id = v.id)`);
  for (const v of rows) {
    for (const [i, s] of DEFAULT_STAGES.entries())
      await query(
        `INSERT INTO stages (vertical_id, org_id, id, label, sub, accent, wait, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [v.id, v.org_id, s.id, s.label, s.sub, s.accent, s.wait, i]);
    console.log(`  ✓ restored default stages for vertical ${v.name}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const sql = await readFile(join(here, "schema.sql"), "utf8");
  await query(sql);
  console.log("✓ schema applied");

  /* The two organizations the product ships with. ON CONFLICT DO NOTHING means
     re-running this never overwrites branding someone has since changed — and
     the schema's own migration may already have created BSBW while adopting
     rows from a single-tenant database. */
  for (const o of ORGS) {
    const { rowCount } = await query(
      `INSERT INTO organizations
         (id, name, full_name, mark, tagline, accent, verticals, logo, sender_name, sender_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [o.id, o.name, o.fullName, o.mark, o.tagline, o.accent, o.verticals, o.logo || "",
       o.senderName, o.senderEmail]);
    console.log(rowCount ? `✓ created organization ${o.name}` : `· ${o.name} already present, left alone`);

    /* The one field a re-run does fill in on an existing row. A logo is an
       asset shipped with the app rather than something a user typed, so a
       tenant created before it existed should pick it up — but only if it
       hasn't since chosen one of its own, which is what the empty check is
       for. Everything else above stays as the owner arranged it. */
    if (o.logo) {
      const { rowCount: set } = await query(
        `UPDATE organizations SET logo = $2 WHERE id = $1 AND logo = ''`,
        [o.id, o.logo]);
      if (set) console.log(`  ✓ applied the ${o.name} logo`);
    }
  }

  await repairStages();

  const { rows: [{ n }] } = await query(`SELECT count(*)::int AS n FROM verticals`);
  console.log(n
    ? `· ${n} vertical${n === 1 ? "" : "s"} across the installation`
    : "· no verticals yet - each organization adds its own from the app");

  await pool.end();
}

main().catch((e) => {
  console.error("migration failed:", e.message);
  process.exit(1);
});
