/* ----------------------------------------------------------------------
   Columns — client side

   A vertical declares the shape of its own sheet once, in the setup wizard,
   and everything here reads that declaration: the table renders it, the add
   form is generated from it, import maps onto it, and the script's merge
   tags are its keys.

   This mirrors server/src/columns.js. The server's copy decides; this one
   exists so a form can be validated before it posts and a preview can render
   without a round trip.
---------------------------------------------------------------------- */

export const COLUMN_TYPES = [
  { id: "text",     label: "Text" },
  { id: "longtext", label: "Long text" },
  { id: "email",    label: "Email address" },
  { id: "phone",    label: "Phone number" },
  { id: "url",      label: "Link / website" },
  { id: "number",   label: "Number" },
  { id: "date",     label: "Date" },
];

/* What the CRM itself reads out of a row. `email` is repeatable — a sheet
   carries as many address columns as it carries, and each one links (via
   `linkTo`) to the column holding that person's name, which is what
   {first_name} greets them by. The rest are singular. */
export const ROLES = [
  { id: "name",    label: "The company / row name", required: true },
  { id: "email",   label: "An email outreach goes to", required: true, repeatable: true },
  { id: "website", label: "Website" },
  { id: "notes",   label: "Notes" },
];

export const keyify = (s) => String(s ?? "")
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 40);

/* What the wizard opens with: the shape buyer sheets around here actually
   have. A starting point to edit, not a catalogue — every part of it can be
   renamed, retyped or deleted. The email column arrives already linked to
   the contact-name column, showing the pattern to copy for a POC 2. */
export const starterColumns = () => [
  { key: "company", label: "Company",      type: "text",  role: "name" },
  { key: "contact", label: "Contact name", type: "text",  role: null },
  { key: "email",   label: "Email",        type: "email", role: "email", linkTo: "contact" },
  { key: "website", label: "Website",      type: "url",   role: "website" },
];

/* Same rules as the server, phrased for a form that is still being typed in.
   Returns { columns } or { error }. */
export function validateColumns(raw) {
  if (!raw?.length) return { error: "Add at least one column." };

  const columns = [];
  const seenKey = new Set();
  const seenRole = new Map();
  let emails = 0;

  for (const [i, c] of raw.entries()) {
    const label = String(c?.label ?? "").trim();
    if (!label) return { error: `Column ${i + 1} needs a name.` };

    const key = keyify(c?.key || label);
    if (!key) return { error: `"${label}" has no letters or numbers to make a key from.` };
    if (seenKey.has(key)) return { error: `Two columns are both called "${label}".` };
    seenKey.add(key);

    const role = ROLES.some(r => r.id === c?.role) ? c.role : null;
    if (role === "email") emails++;
    else if (role) {
      if (seenRole.has(role))
        return { error: `"${label}" and "${seenRole.get(role)}" both claim the same role. Only one can.` };
      seenRole.set(role, label);
    }

    const linkTo = role === "email" ? keyify(c?.linkTo || "") : "";
    columns.push({
      key, label,
      type: COLUMN_TYPES.some(t => t.id === c?.type) ? c.type : "text",
      role,
      ...(linkTo ? { linkTo } : {}),
    });
  }

  /* A link must name a real column, and not the email column itself. */
  for (const c of columns) {
    if (c.linkTo && (c.linkTo === c.key || !seenKey.has(c.linkTo))) delete c.linkTo;
  }

  if (!seenRole.has("name"))
    return { error: "Mark one column as the name — it's what each row is called." };
  if (!emails)
    return { error: "Mark at least one column as an email — it's where outreach goes." };

  return { columns };
}

/* Every email column, in sheet order — what "generate emails" walks. */
export const emailColumns = (columns) =>
  (columns || []).filter(c => c.role === "email");

/* The recipients one row actually has: every email column with a value, each
   carrying the name its column is linked to. One entry = one message. */
export function recipientsFor(columns, data) {
  const out = [];
  for (const col of emailColumns(columns)) {
    /* Extracted, not trusted — mirrors the server: first address-shaped token
       wins, a cell with none is no recipient. */
    const m = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(String((data || {})[col.key] ?? ""));
    if (!m) continue;
    const name = col.linkTo ? String((data || {})[col.linkTo] ?? "").trim() : "";
    out.push({ email: m[0].toLowerCase(), name, colKey: col.key, colLabel: col.label });
  }
  return out;
}

export const byRole = (columns, role) =>
  (columns || []).find(c => c.role === role) || null;

export function roleValue(columns, data, role) {
  const col = byRole(columns, role);
  if (!col) return "";
  const v = (data || {})[col.key];
  return v === null || v === undefined ? "" : String(v);
}

/* ---- merge tags (client copy, for the composer's live preview) ---------- */

/* First-name extraction — mirrors the server exactly, so the preview greets
   the same word the sent mail will. "HALE, Marcus" flips, honorifics drop,
   bare initials defer to the next real word, SHOUTED and whispered names are
   case-normalised, deliberate mixed case (McKay) is left alone. */
const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|professor|sir|madam|rev|fr|capt|captain|col|maj|sgt|hon|md|eng|er|adv)\.?$/i;

export function firstNameOf(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  const parts = s.split(",");
  if (parts.length === 2 && parts[1].trim()) s = parts[1].trim();
  const words = s.split(/\s+/);
  let pick = "";
  for (const w of words) {
    const clean = w.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "");
    if (!clean) continue;
    if (HONORIFIC.test(clean)) continue;
    if (clean.length === 1) { if (!pick) pick = clean; continue; }
    pick = clean;
    break;
  }
  if (!pick) return "";
  if (pick === pick.toUpperCase() || pick === pick.toLowerCase())
    pick = pick[0].toUpperCase() + pick.slice(1).toLowerCase();
  return pick;
}

/* `recipient` is who this copy of the message is going to — one of the row's
   recipientsFor() entries. The person tags read it first, so every address is
   greeted by the name its column is linked to. */
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
  sender: ({ vertical, org }) => vertical?.smtpFrom || org?.senderName || org?.name || "",
};

export function mergeTags(columns) {
  const keys = (columns || []).map(c => c.key);
  return [...keys, ...Object.keys(BUILTIN).filter(k => !keys.includes(k))];
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
    return fn ? String(fn(ctx) ?? "") : null;
  };
  return String(text ?? "")
    .replace(/\{\{\s*([a-z0-9_ ]+?)\s*\}\}/gi, (whole, k) => resolve(k) ?? whole)
    .replace(/\{\s*([a-z0-9_ ]+?)\s*\}/gi, (whole, k) => resolve(k) ?? whole);
}

/* A fresh row for the add form: every declared column, blank. */
export const emptyRow = (columns) =>
  Object.fromEntries((columns || []).map(c => [c.key, ""]));

/* How a stored value renders in a cell. Only the types that benefit from
   shaping get any; everything else is shown as typed. */
export function displayValue(col, v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (!s) return "";
  if (col.type === "url") return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return s;
}
