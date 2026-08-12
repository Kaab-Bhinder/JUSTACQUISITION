import { Router } from "express";
import { query, tx, allOrgs, orgById } from "../db.js";
import { requireAdmin, requireOrg } from "../auth.js";

export const orgs = Router();

/* ---- helpers ---------------------------------------------------------- */

/* The id lands in the URL and in a header, so it has to survive being typed
   and read aloud: lowercase, no spaces, no punctuation beyond a hyphen. The
   same rule is spelled as a CHECK constraint in schema.sql — this produces a
   readable error, the constraint guarantees nothing else can get in. */
const slugify = (s) => String(s ?? "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/* Any colour, not one of a fixed set: everything the interface needs is
   derived from it on the client, so all this has to guarantee is that what
   comes back out is a colour. Stored uppercase so the value the client
   compares against is stable. */
const HEX = /^#[0-9a-f]{6}$/i;
const colour = (v, fallback) => (HEX.test(String(v ?? "")) ? String(v).toUpperCase() : fallback);

/* Initials for the logo tile: first letter of the first two words, so
   "Close Crew Marketing" reads CC and "BSBW" reads B. Only used when the
   organization has no logo of its own. */
const initials = (name) => String(name ?? "").trim().split(/\s+/)
  .slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";

/* ---- logos -------------------------------------------------------------
   A logo is uploaded rather than linked, so it arrives as a data: URI and is
   stored as one. Three things are worth being strict about:

     - it ends up in an <img src> on the landing page, so a `javascript:` or
       `data:text/html` would be stored XSS against everyone who opens it;
     - it lives in a row that gets sent on every bootstrap, so it needs a
       ceiling;
     - SVG is a document, not just pixels.

   SVG is allowed. An <img> renders it in the browser's secure static mode —
   no script, no external fetches — which is precisely why the mark is drawn
   with <img> everywhere rather than inlined. It is sanitised below anyway: the
   day someone inlines one, the stored bytes should already be harmless.
------------------------------------------------------------------------ */

const MAX_LOGO = 512 * 1024;          // the encoded URI, so ~380KB of image

/* Strip the parts of an SVG that make it a document rather than a picture. */
function sanitiseSvg(svg) {
  return svg
    .replace(/<\s*(script|foreignObject|iframe|object|embed|audio|video)\b[^]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*\/?>/gi, "")
    /* Event handlers, in any spelling. */
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    /* Anything that would reach off-origin, or navigate. */
    .replace(/(href|xlink:href)\s*=\s*("|')\s*(?!#)[^"']*\2/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<!ENTITY[^>]*>/gi, "");
}

const cleanLogo = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.length > MAX_LOGO) return null;

  /* Shipped assets, e.g. /brand/ccm.svg. */
  if (/^\/[^/]/.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;

  const raster = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;
  if (raster.test(s)) return s.replace(/\s+/g, "");

  const svg = /^data:image\/svg\+xml(;charset=[\w-]+)?(;base64)?,(.*)$/is.exec(s);
  if (svg) {
    const isB64 = !!svg[2];
    let body;
    try {
      body = isB64
        ? Buffer.from(svg[3], "base64").toString("utf8")
        : decodeURIComponent(svg[3]);
    } catch { return null; }
    if (!/<svg[\s>]/i.test(body)) return null;
    /* Re-encoded as base64 whatever it arrived as, so exactly one shape of
       this string is ever stored and the sanitised bytes are the stored ones. */
    const clean = Buffer.from(sanitiseSvg(body), "utf8").toString("base64");
    const uri = `data:image/svg+xml;base64,${clean}`;
    return uri.length > MAX_LOGO ? null : uri;
  }

  return null;
};

/* ---- read --------------------------------------------------------------
   Open. There are no accounts, so there is nothing to filter the list by and
   nothing a list of two organization names gives away that the landing page
   doesn't already show. */

orgs.get("/", async (_req, res, next) => {
  try { res.json({ orgs: await allOrgs() }); }
  catch (e) { next(e); }
});

/* Verticals stopped being a catalogue: each organization creates its own,
   named whatever its business calls them, under /api/verticals. This endpoint
   stays because an older client asks; the empty list is the truthful answer. */
orgs.get("/verticals", (_req, res) => res.json({ verticals: [] }));

/* ---- create ------------------------------------------------------------
   The one gated action. Creating an organization changes what the whole
   installation contains rather than what is inside one tenant, so it asks for
   the administrator credentials from server/.env. requireAdmin reads them out
   of the request body and compares without a session — see auth.js. */

orgs.post("/", requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "The organization needs a name." });
    if (name.length > 60)
      return res.status(400).json({ error: "That name is too long — 60 characters at most." });

    const id = slugify(b.id || name);
    if (id.length < 2)
      return res.status(400).json({ error: "That name has too few letters and numbers to make a URL from. Add an id." });

    const accent = colour(b.accent, "#0ABAB5");

    const logo = cleanLogo(b.logo);
    if (logo === null)
      return res.status(400).json({ error: "That logo isn't an image we can use. Upload a PNG, JPEG, WebP, GIF or SVG." });

    /* A new organization is born with no verticals: adding its first is the
       first thing its owner does inside it, and stages are created with each
       vertical rather than here. */
    const created = await tx(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO organizations
           (id, name, full_name, mark, tagline, accent, logo, sender_name, sender_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [id, name,
         String(b.fullName ?? "").trim(),
         (String(b.mark ?? "").trim() || initials(name)).slice(0, 2).toUpperCase(),
         String(b.tagline ?? "").trim().slice(0, 160),
         accent, logo,
         String(b.senderName ?? "").trim() || name,
         String(b.senderEmail ?? "").trim().toLowerCase()]);

      return rows.length ? id : null;   // null: id already taken
    });

    if (!created)
      return res.status(409).json({ error: `The id "${id}" is already taken. Try a different name.` });

    res.status(201).json({ org: await orgById(created), orgs: await allOrgs() });
  } catch (e) { next(e); }
});

/* ---- one organization --------------------------------------------------
   The org is named in the path and again in the X-Org-Id header, so the client
   sends both and they must agree. Editing branding is not gated: it changes
   how one tenant looks, not what the installation contains, and everything
   else inside a tenant is open too. */

const sameOrg = (req, res, next) =>
  req.params.id === req.orgId
    ? next()
    : res.status(400).json({ error: "That organization doesn't match the one you're working in." });

orgs.patch("/:id", requireOrg, sameOrg, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [], vals = [];
    const set = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) return res.status(400).json({ error: "The organization needs a name." });
      set("name", name.slice(0, 60));
    }
    if (b.fullName !== undefined) set("full_name", String(b.fullName).trim());
    if (b.mark !== undefined) set("mark", String(b.mark).trim().slice(0, 2).toUpperCase());
    if (b.tagline !== undefined) set("tagline", String(b.tagline).trim().slice(0, 160));
    if (b.logo !== undefined) {
      const logo = cleanLogo(b.logo);
      if (logo === null)
        return res.status(400).json({ error: "That logo isn't an image we can use. Upload a PNG, JPEG, WebP, GIF or SVG." });
      set("logo", logo);
    }
    /* b.verticals is ignored: verticals are rows under /api/verticals now, not
       an attribute of the organization. */
    if (b.senderName !== undefined) set("sender_name", String(b.senderName).trim());
    if (b.senderEmail !== undefined) set("sender_email", String(b.senderEmail).trim().toLowerCase());
    if (b.accent !== undefined) set("accent", colour(b.accent, "#0ABAB5"));

    if (!sets.length) return res.status(400).json({ error: "Nothing to change." });

    vals.push(req.orgId);
    await query(`UPDATE organizations SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    res.json({ org: await orgById(req.orgId), orgs: await allOrgs() });
  } catch (e) { next(e); }
});

/* ---- delete ------------------------------------------------------------
   Gated like create, and for the same reason. Everything the organization owns
   goes with it — the foreign keys cascade — so it asks for the name back
   rather than taking a click as consent. */

orgs.post("/:id/delete", requireOrg, sameOrg, requireAdmin, async (req, res, next) => {
  try {
    const org = await orgById(req.orgId);
    if (!org) return res.status(404).json({ error: "No such organization." });

    if (String(req.body?.confirm ?? "").trim() !== org.name)
      return res.status(400).json({ error: `Type "${org.name}" to confirm.` });

    const { rows } = await query(
      `SELECT count(*)::int AS n FROM organizations`);
    if (rows[0].n <= 1)
      return res.status(409).json({ error: "This is the only organization left." });

    await query(`DELETE FROM organizations WHERE id = $1`, [req.orgId]);
    res.json({ deleted: req.orgId, orgs: await allOrgs() });
  } catch (e) { next(e); }
});
