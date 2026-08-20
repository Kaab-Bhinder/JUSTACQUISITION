/* ----------------------------------------------------------------------
   Columns

   A vertical declares the shape of its own spreadsheet, once, and everything
   downstream reads that declaration rather than a fixed list:

     · import maps the sheet's header row onto these
     · the table renders these
     · the add form is generated from these
     · the email script's merge tags are these

   So the CRM has no opinion about what a row contains — except for the few
   things it cannot do its job without. Those are `role`s, and a column claims
   one:

     name     the row's title. Required, exactly one. Mirrored into
              companies.name because everything sorts and dedupes on it.
     email    where outreach is sent. Required, exactly one — a row we cannot
              email is not a row this product can work.
     contact  the person's name, which is what {{first_name}} reads.
     phone    · website · notes — convenience, all optional.

   Everything else is just data. Values live in companies.data keyed by column
   key, and the roles are mirrored onto the columns and the contacts row that
   the rest of the system (dedupe, inbound reply matching, the thread view)
   was already built against.

   This module is imported by the routes and duplicated in spirit by
   web/src/domain/columns.js — the client needs the same rules to validate a
   form before it posts. The server's copy is the one that decides.
---------------------------------------------------------------------- */

/* What a column can hold. `type` drives the input the add form renders and how
   a value is cleaned on the way in; it is deliberately a short list, because a
   type nobody can explain is a type nobody sets correctly. */
export const COLUMN_TYPES = ["text", "longtext", "email", "phone", "url", "number", "date"];

/* The roles the CRM itself reads. A column with role null is data the product
   carries and shows but never interprets.

   `email` is deliberately repeatable: a sheet carries as many address columns
   as it carries — Email 1, Email 2, a generic Owner Email — and nothing here
   presumes how many. Each email column instead carries a LINK: `linkTo`, the
   key of the column holding that person's name. Generating mail walks every
   email column with a value and greets each address with its linked column's
   first name. The other roles stay singular. */
export const ROLES = ["name", "email", "website", "notes"];

/* At most one column may claim these — two "name" columns would make "what is
   this row called?" ambiguous. `email` is exempt: many is the point. */
export const UNIQUE_ROLES = ["name", "website", "notes"];

export const MAX_COLUMNS = 40;

/* Keys are used as JSONB object keys, as merge tags and as DOM ids, so they
   get the same treatment the org and vertical slugs get. Derived from the
   label the user typed rather than asked for separately: nobody wants to name
   a column twice. */
export const keyify = (s) => String(s ?? "")
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 40);

/* ---- validation --------------------------------------------------------
   Returns { columns } on success or { error } on failure. One shape so the
   routes can do `if (out.error) return 400`. */
export function validateColumns(raw) {
  if (!Array.isArray(raw)) return { error: "Columns must be a list." };
  if (!raw.length) return { error: "Add at least one column." };
  if (raw.length > MAX_COLUMNS)
    return { error: `That's more than ${MAX_COLUMNS} columns. Split the sheet, or drop the ones you don't work from.` };

  const columns = [];
  const seenKey = new Set();
  const seenRole = new Map();
  let emails = 0;

  for (const [i, c] of raw.entries()) {
    const label = String(c?.label ?? "").trim();
    if (!label) return { error: `Column ${i + 1} needs a name.` };
    if (label.length > 60)
      return { error: `"${label.slice(0, 20)}…" is too long a column name — 60 characters at most.` };

    /* An explicit key is honoured so renaming a column's label never orphans
       the data already stored under its key. The form sends the existing key
       back for exactly that reason. */
    const key = keyify(c?.key || label);
    if (!key)
      return { error: `"${label}" has no letters or numbers to make a column key from.` };
    if (seenKey.has(key))
      return { error: `Two columns are both called "${label}". Give them different names.` };
    seenKey.add(key);

    const type = COLUMN_TYPES.includes(c?.type) ? c.type : "text";

    const role = ROLES.includes(c?.role) ? c.role : null;
    if (role === "email") emails++;
    else if (role && UNIQUE_ROLES.includes(role)) {
      if (seenRole.has(role))
        return { error: `"${label}" and "${seenRole.get(role)}" are both marked as the ${role} column. Only one can be.` };
      seenRole.set(role, label);
    }

    /* The link from an email column to its person's name column. Carried as a
       raw key here and checked against the finished list below, because the
       column it points at may be declared later in the sheet. */
    const linkTo = role === "email" ? keyify(c?.linkTo || "") : "";
    columns.push(linkTo ? { key, label, type, role, linkTo } : { key, label, type, role });
  }

  /* A link must name a real column, and not the email column itself — a
     dangling one would silently greet everyone as "there". */
  for (const c of columns) {
    if (!c.linkTo) continue;
    if (c.linkTo === c.key || !seenKey.has(c.linkTo)) delete c.linkTo;
  }

  if (!seenRole.has("name"))
    return { error: "Mark one column as the name — it's what each row is called." };
  if (!emails)
    return { error: "Mark at least one column as an email — it's where outreach goes." };

  return { columns };
}

/* Every email column, in sheet order. What "generate emails" walks. */
export const emailColumns = (columns) =>
  (columns || []).filter(c => c.role === "email");

/* The recipients one row actually has: every email column with a value,
   each carrying the name its column is linked to. One entry here is one
   generated message. */
export function recipientsFor(columns, data) {
  const out = [];
  const seen = new Set();
  for (const col of emailColumns(columns)) {
    /* Extracted, not trusted — and ALL of them: a cell routinely carries two
       stacked addresses ("Name <a@x.co> b@y.co"), and each address-shaped
       token is its own recipient, greeted by the column's linked name. The
       same address appearing twice on a row counts once. */
    const cell = String((data || {})[col.key] ?? "");
    const name = col.linkTo ? String((data || {})[col.linkTo] ?? "").trim() : "";
    for (const m of cell.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
      const email = m[0].toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ email, name, colKey: col.key, colLabel: col.label });
    }
  }
  return out;
}

/* ---- reading a row ------------------------------------------------------ */

export const byRole = (columns, role) =>
  (columns || []).find(c => c.role === role) || null;

/* The value of whichever column claims `role`, or "". Every read of a role
   goes through here so "the vertical has no phone column" and "this row's
   phone is blank" collapse to the same harmless answer. */
export function roleValue(columns, data, role) {
  const col = byRole(columns, role);
  if (!col) return "";
  const v = (data || {})[col.key];
  return v === null || v === undefined ? "" : String(v);
}

/* Bare — no scheme, no www, no trailing slash — so two people typing the same
   site the two ways they type it dedupe against each other. Matches the rule
   in routes/companies.js, which is where it was before columns existed. */
export const cleanWeb = (s) => String(s ?? "").trim()
  .replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();

/* A value on its way into `data`. Light: the point of a custom column is that
   the product does not second-guess what the user's sheet holds. Only the
   types the CRM itself acts on are normalised. */
export function cleanValue(col, v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  if (!s) return "";
  if (col.type === "email") return s.toLowerCase();
  if (col.type === "url") return cleanWeb(s);
  return s;
}

/* The whole bag, cleaned and confined to the columns the vertical declares.
   A key the vertical doesn't have is dropped rather than stored: otherwise a
   renamed column leaves its old values behind to be found later by something
   that has forgotten why they are there. */
export function cleanData(columns, data) {
  const out = {};
  for (const col of columns || []) {
    const v = cleanValue(col, (data || {})[col.key]);
    if (v !== "") out[col.key] = v;
  }
  return out;
}

/* ----------------------------------------------------------------------
   Projection

   The columns the rest of the schema still has — name, website, linkedin,
   notes, and the contacts row — filled from whichever columns claim the
   matching role. This is what keeps the parts built before verticals existed
   working unchanged: inbound reply matching still joins on contacts.email,
   the thread view still reads company.name.

   It is a derived value written at the same moment as its source, in one
   place, which is the only way a mirror stays honest.
---------------------------------------------------------------------- */
export function project(columns, data) {
  const name = roleValue(columns, data, "name").slice(0, 200);
  const website = cleanWeb(roleValue(columns, data, "website"));
  const notes = roleValue(columns, data, "notes");

  /* One contact row per email the row carries, each named by its linked
     column. These rows exist for display and for inbound reply matching — a
     reply from ANY of the addresses files against the row; the send path
     resolves its recipients from the columns directly (recipientsFor), so
     nothing depends on which index a person lands at. */
  const contacts = recipientsFor(columns, data)
    .map(r => ({ name: r.name, role: r.colLabel, email: r.email, phone: "" }));

  return { name, website, notes, contacts };
}

/* ----------------------------------------------------------------------
   Merge tags

   The tags a script may use are the vertical's own column keys, plus a few
   the CRM computes. Both brace styles are accepted: the composer writes
   {{first_name}}, and people typing a script by hand reliably write
   {first_name}, and refusing the second would only teach them the product is
   fussy.

   Resolved on the server at the moment of sending, against the record as it
   stands then — never trusting already-merged text a browser posted.
---------------------------------------------------------------------- */

/* ---- first-name extraction ---------------------------------------------
   The linked name column holds whatever the sheet holds: "Marcus Hale",
   "HALE, Marcus", "Dr. J. Smith", "priya n.". The greeting must come out a
   greeting, so:

     1. "Last, First" flips — the part after the comma is the person.
     2. Honorifics drop: Mr/Mrs/Ms/Dr/Prof and friends are not names.
     3. Initials skip: "J." is not what you call someone — take the next
        real word ("J. Robert" greets Robert).
     4. Case is normalised when the sheet shouted or whispered: JOHN → John,
        priya → Priya. Mixed-case names (McKay, DeAndre) are left alone.
     5. Nothing usable → "there", the neutral fallback the templates expect.  */
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|professor|sir|madam|rev|fr|capt|captain|col|maj|sgt|hon|md|eng|er|adv)\.?$/i;

export function firstNameOf(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";

  /* "HALE, Marcus" → "Marcus HALE" (only a real last-first comma — a value
     with several commas is a title or a company, not a flipped name). */
  const parts = s.split(",");
  if (parts.length === 2 && parts[1].trim()) s = parts[1].trim();

  const words = s.split(/\s+/);
  let pick = "";
  for (const w of words) {
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "");
    if (!clean) continue;
    if (HONORIFIC.test(clean)) continue;
    /* A bare initial — "J" or "J." — reads wrong as a greeting; prefer the
       next full word, but keep it as a last resort. */
    if (clean.length === 1) { if (!pick) pick = clean; continue; }
    pick = clean;
    break;
  }
  if (!pick) return "";

  /* Sheets shout (JOHN) and whisper (john); greetings do neither. Mixed case
     is someone's deliberate spelling — McKay, DeAndre — and stays. */
  if (pick === pick.toUpperCase() || pick === pick.toLowerCase())
    pick = pick[0].toUpperCase() + pick.slice(1).toLowerCase();
  return pick;
}

/* Computed tags, which shadow nothing: a column whose key is `first_name`
   wins, because the user named it and that is a clearer signal than ours.

   `recipient` is who this copy of the message is going to — one of the row's
   recipientsFor() entries, since a row generates one message per email it
   carries. The person tags read it first, so every address is greeted by the
   name its column is linked to. Without one (a settings-screen preview, say)
   they fall back to the row's first recipient. */
const BUILTIN = {
  first_name: ({ columns, data, recipient }) => {
    const who = recipient?.name ||
      recipientsFor(columns, data)[0]?.name || roleValue(columns, data, "name");
    return firstNameOf(who) || "there";
  },
  contact: ({ columns, data, recipient }) =>
    recipient?.name || recipientsFor(columns, data)[0]?.name || "there",
  company: ({ columns, data }) => roleValue(columns, data, "name"),
  email: ({ columns, data, recipient }) =>
    recipient?.email || recipientsFor(columns, data)[0]?.email || "",
  website: ({ columns, data }) => roleValue(columns, data, "website"),
  vertical: ({ vertical }) => vertical?.name || "",
  sender: ({ vertical, org }) =>
    vertical?.smtpFrom || org?.senderName || org?.name || "",
};

/* Everything a script for this vertical may say, for the chips the editor
   offers. Columns first: they are the ones the user just named and will reach
   for, and the built-ins are the tail nobody scrolls to. */
export function mergeTags(columns) {
  const keys = (columns || []).map(c => c.key);
  const extra = Object.keys(BUILTIN).filter(k => !keys.includes(k));
  return [...keys, ...extra];
}

export function fillMerge(text, { columns, data, vertical, org, recipient }) {
  const ctx = { columns, data: data || {}, vertical, org, recipient };
  const cols = new Map((columns || []).map(c => [c.key, c]));

  const resolve = (rawKey) => {
    const key = keyify(rawKey);
    if (cols.has(key)) {
      const v = ctx.data[key];
      return v === null || v === undefined ? "" : String(v);
    }
    const fn = BUILTIN[key];
    return fn ? String(fn(ctx) ?? "") : null;      // null = leave it alone
  };

  return String(text ?? "")
    /* {{ }} first. Doing { } first would eat the inner braces of a {{tag}} and
       leave a stray brace on each side. */
    .replace(/\{\{\s*([a-z0-9_ ]+?)\s*\}\}/gi, (whole, k) => resolve(k) ?? whole)
    .replace(/\{\s*([a-z0-9_ ]+?)\s*\}/gi, (whole, k) => resolve(k) ?? whole);
}
