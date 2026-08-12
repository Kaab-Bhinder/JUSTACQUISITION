/* Lift URLs out of company names.
 *
 *   npm run tidy:names           show what would change, write nothing
 *   npm run tidy:names -- --write   apply it
 *
 * Sheets routinely carry one cell holding both the company and its LinkedIn
 * page:
 *
 *     Madrivo
 *     (https://www.linkedin.com/company/madrivo/)
 *
 * Imported literally that is a 117-character company name, which is what
 * pushed the board cards and the detail panel sideways. The import wizard now
 * splits these on the way in; this repairs rows that came in before it did.
 *
 * Lossless and idempotent: the URL moves into `linkedin` (or `website`), and
 * only into a field that is empty, so a column somebody mapped explicitly is
 * never overwritten. A row whose name has no URL is left alone. Running it
 * twice changes nothing the second time.
 */
import "dotenv/config";
import { pool, query } from "../src/db.js";

const write = process.argv.includes("--write");

/* Kept in step with web/src/domain/importSheet.js. Duplicated rather than
   imported because the two halves are separate packages with no shared
   module, the same way VERTICAL_LABELS is. */
const stripTracking = (s) => String(s ?? "")
  .replace(/([?&])(utm_[a-z]+|gclid|fbclid|mc_cid|mc_eid|ref|source)=[^&#]*/gi, "$1")
  .replace(/[?&]+$/, "").replace(/\?&/, "?");

const cleanWeb = (s) => stripTracking(String(s ?? "").trim())
  .replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();

const URL_IN_TEXT = /\(?\s*(https?:\/\/[^\s)]+|(?:www\.|[a-z0-9-]+\.)?linkedin\.com\/[^\s)]+)\s*\)?/i;

const splitNameUrl = (raw) => {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  const m = URL_IN_TEXT.exec(text);
  if (!m) return { name: text, url: "" };
  const name = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .replace(/\s+/g, " ").replace(/[\s(),;:–—-]+$/, "").replace(/^[\s(),;:–—-]+/, "").trim();
  return { name, url: cleanWeb(m[1]) };
};

const isLinkedIn = (url) => /(^|\.)linkedin\.com\//i.test(String(url ?? ""));

const { rows } = await query(
  `SELECT id, org_id, name, website, linkedin FROM companies ORDER BY org_id, id`);

const changes = [];
for (const c of rows) {
  const split = splitNameUrl(c.name);
  const nextName = split.name || c.name;      // never blank a company out
  let nextSite = c.website, nextLi = c.linkedin;

  if (split.url) {
    if (isLinkedIn(split.url)) { if (!nextLi) nextLi = split.url; }
    else if (!nextSite) nextSite = split.url;
  }
  /* Tracking parameters on the existing fields go too — same noise, same
     reason, and it is what makes these render wide. */
  nextSite = cleanWeb(nextSite);
  nextLi = cleanWeb(nextLi);

  if (nextName !== c.name || nextSite !== c.website || nextLi !== c.linkedin)
    changes.push({ ...c, nextName, nextSite, nextLi });
}

console.log(`${rows.length} companies, ${changes.length} would change\n`);
for (const c of changes.slice(0, 10)) {
  console.log(`  [${c.org_id}] ${JSON.stringify(c.name)}`);
  console.log(`        name -> ${JSON.stringify(c.nextName)}`);
  if (c.nextSite !== c.website) console.log(`     website -> ${JSON.stringify(c.nextSite)}`);
  if (c.nextLi !== c.linkedin) console.log(`    linkedin -> ${JSON.stringify(c.nextLi)}`);
}
if (changes.length > 10) console.log(`  … and ${changes.length - 10} more`);

if (!write) {
  console.log("\nNothing written. Re-run with --write to apply.");
} else {
  for (const c of changes)
    await query(
      `UPDATE companies SET name = $2, website = $3, linkedin = $4, updated_at = now()
        WHERE id = $1`, [c.id, c.nextName, c.nextSite, c.nextLi]);
  console.log(`\n✓ updated ${changes.length} companies`);

  const { rows: [left] } = await query(
    `SELECT count(*)::int AS n FROM companies WHERE name ~ 'https?://'`);
  console.log(`  names still containing a URL: ${left.n}`);
}

await pool.end();
