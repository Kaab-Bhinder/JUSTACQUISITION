import { timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

/* ----------------------------------------------------------------------
   Access

   There are no user accounts. Anyone who can reach the app can open either
   organization and work its pipeline — the same footing the CRM had before it
   became multi-tenant, just with two pipelines instead of one.

   One action is held back: creating an organization. That changes what the
   whole installation contains rather than what is inside one tenant, so it
   asks for an administrator's email and password, checked against
   ADMIN_EMAIL / ADMIN_PASSWORD in server/.env.

   This is a gate, not a login. Nothing is remembered between requests: the
   credentials are sent with the one call that needs them and checked there.
   That is deliberate — a session would be authentication by another name, and
   there is no session to steal if none is issued.
---------------------------------------------------------------------- */

const DEFAULT_EMAIL = "admin@bsbw.co";
const DEFAULT_PASSWORD = "changeme-please";

export const adminEmail = () => (process.env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
const adminPassword = () => process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

/* True when the install is still on the shipped credentials, so the server can
   say so at boot rather than leaving it to be discovered. */
export const usingDefaultAdmin = () =>
  !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;

/* Compared without leaking length or position through timing. Overkill for a
   local tool, but it costs four lines and the alternative is a habit of
   comparing secrets with ===. Exported: the deployment gate compares its
   credentials the same way. */
export function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8");
  const y = Buffer.from(String(b ?? ""), "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export const isAdmin = (email, password) =>
  sameSecret(String(email ?? "").trim().toLowerCase(), adminEmail()) &&
  sameSecret(password, adminPassword());

/* Guards the routes that change the list of organizations. Credentials travel
   in the body of the request that needs them, so this reads them from there
   rather than from a header or a cookie. */
export function requireAdmin(req, res, next) {
  const { adminEmail: email, adminPassword: password } = req.body || {};
  if (!isAdmin(email, password))
    return res.status(401).json({ error: "That administrator email and password don't match." });
  next();
}

/* ----------------------------------------------------------------------
   Which organization

   Every data route still carries an X-Org-Id, and it is still the only thing
   that decides which tenant's rows a request touches. What it no longer does
   is prove anything about who is asking — it names a tenant, and the check is
   simply that the tenant exists. Keeping the shape means every query below it
   is unchanged, and the day this needs real accounts again, the check goes
   back here and nowhere else.
---------------------------------------------------------------------- */
export async function requireOrg(req, res, next) {
  try {
    const orgId = String(req.get("x-org-id") || "").trim().toLowerCase();
    if (!orgId)
      return res.status(400).json({ error: "No organization selected." });

    const { rows } = await query(
      `SELECT id FROM organizations WHERE id = $1`, [orgId]);
    if (!rows.length)
      return res.status(404).json({ error: "No such organization." });

    req.orgId = rows[0].id;
    next();
  } catch (e) { next(e); }
}

/* ----------------------------------------------------------------------
   Which vertical

   The CRM's data routes are all scoped one level further down now: a request
   works one vertical's board, named in X-Vertical-Id the same way the tenant
   is named in X-Org-Id. The check is the same shape too — the vertical exists
   and belongs to the named organization, or the request touches nothing.
   Routes below it read req.verticalId and req.vertical.
---------------------------------------------------------------------- */
export async function requireVertical(req, res, next) {
  try {
    const raw = Number(req.get("x-vertical-id"));
    if (!Number.isInteger(raw) || raw <= 0)
      return res.status(400).json({ error: "No vertical selected." });

    const { rows } = await query(
      `SELECT id, name, slug, columns, subject, body,
              smtp_user AS "smtpUser", smtp_from AS "smtpFrom",
              setup_done AS "setupDone"
         FROM verticals WHERE id = $1 AND org_id = $2`, [raw, req.orgId]);
    if (!rows.length)
      return res.status(404).json({ error: "No such vertical in this organization." });

    req.verticalId = rows[0].id;
    req.vertical = rows[0];
    next();
  } catch (e) { next(e); }
}
