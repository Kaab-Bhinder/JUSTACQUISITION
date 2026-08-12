import * as XLSX from "xlsx";
import { DEFAULT_STAGES } from "./stages.js";
import { iso, today } from "./dates.js";
import { keyify } from "./columns.js";

/* ----------------------------------------------------------------------
   Spreadsheet import

   A sheet is one vertical's worth of rows, and the vertical has already
   declared what its sheets look like: its columns, named in the setup wizard.
   So the import maps the file's header row onto THOSE columns — the person
   who declared "Company · Contact · Email · Practice Area" gets slots called
   exactly that, and the data lands under those keys.

   The header row is guessed at, the guess is corrected by dragging or typing,
   and the corrected mapping is remembered against the vertical so the next
   sheet of the same shape needs no work at all. When the vertical's columns
   were named after the sheet's own headers — the normal case, since the wizard
   asks for the sheet's format — the guess is simply right.
---------------------------------------------------------------------- */

export const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Campaign parameters are noise in a CRM: they say how somebody arrived at the
   sheet, not anything about the company. */
export const stripTracking = (s) => String(s ?? "")
  .replace(/([?&])(utm_[a-z]+|gclid|fbclid|mc_cid|mc_eid|ref|source)=[^&#]*/gi, "$1")
  .replace(/[?&]+$/, "").replace(/\?&/, "?");

export const cleanWeb = (s) => stripTracking(String(s ?? "").trim())
  .replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();

/* A URL living inside the name cell — "Madrivo (linkedin.com/company/madrivo)"
   — is lifted out into the field it belongs in rather than imported as a
   117-character name. */
const URL_IN_TEXT = /\(?\s*(https?:\/\/[^\s)]+|(?:www\.|[a-z0-9-]+\.)?linkedin\.com\/[^\s)]+)\s*\)?/i;

export const splitNameUrl = (raw) => {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  const m = URL_IN_TEXT.exec(text);
  if (!m) return { name: text, url: "" };
  const name = (text.slice(0, m.index) + text.slice(m.index + m[0].length))
    .replace(/\s+/g, " ").replace(/[\s(),;:–—-]+$/, "").replace(/^[\s(),;:–—-]+/, "").trim();
  return { name, url: cleanWeb(m[1]) };
};

export const isLinkedInUrl = (url) => /(^|\.)linkedin\.com\//i.test(String(url ?? ""));

/* ---- guessing ----------------------------------------------------------
   Score how well a sheet header fits a declared column: exact label match
   beats key match beats prefix beats contains. The wizard asked for the
   sheet's own column names, so exact matches are the common case. */
const score = (header, col) => {
  const n = norm(header);
  if (!n) return 0;
  const label = norm(col.label);
  const key = norm(col.key.replace(/_/g, " "));
  if (n === label || n === key) return 100;
  if (n.startsWith(`${label} `) || n.endsWith(` ${label}`)) return 70;
  if (label && n.includes(label)) return 40;
  if (key && n.includes(key)) return 30;
  return 0;
};

/* Greedy best-first across every column/header pair, one column per header. */
export const guessMap = (headers, columns) => {
  const pairs = [];
  (columns || []).forEach(c => headers.forEach((h, i) => {
    const s = score(h, c);
    if (s > 0) pairs.push({ key: c.key, col: i, s });
  }));
  pairs.sort((a, b) => b.s - a.s);

  const map = Object.fromEntries((columns || []).map(c => [c.key, -1]));
  const takenCol = new Set(), takenKey = new Set();
  for (const p of pairs) {
    if (takenCol.has(p.col) || takenKey.has(p.key)) continue;
    map[p.key] = p.col;
    takenCol.add(p.col);
    takenKey.add(p.key);
  }
  return map;
};

/* Resolve a typed column name back to an index. Forgiving on purpose:
   "Company Name", "company_name" and " COMPANY  NAME " are the same column to
   anyone reading the sheet. */
export const columnIndex = (typed, headers) => {
  const n = norm(typed);
  if (!n) return -1;
  const exact = headers.findIndex(h => norm(h) === n);
  if (exact >= 0) return exact;
  const starts = headers.findIndex(h => norm(h).startsWith(n));
  if (starts >= 0) return starts;
  return headers.findIndex(h => norm(h).includes(n));
};

/* What to put in each slot before the user touches it. `remembered` is last
   time's mapping for this vertical; it wins over the guess wherever the column
   it names is actually in this sheet. */
export const guessNames = (headers, columns, remembered = null) => {
  const map = guessMap(headers, columns);
  const out = Object.fromEntries(
    (columns || []).map(c => [c.key, map[c.key] >= 0 ? headers[map[c.key]] : ""]));
  if (remembered) {
    for (const [key, name] of Object.entries(remembered)) {
      if (!(key in out)) continue;
      if (columnIndex(name, headers) >= 0) out[key] = name;
    }
  }
  return out;
};

/* Resolve every named column at once, reporting clashes — two slots pointing
   at one sheet column is almost always a mis-drop. */
export const resolveNames = (names, headers, columns) => {
  const map = {}, taken = new Map(), clashes = [];
  for (const c of columns || []) {
    const i = columnIndex(names[c.key], headers);
    map[c.key] = i;
    if (i < 0) continue;
    if (taken.has(i)) clashes.push({ column: headers[i], fields: [taken.get(i), c.label] });
    else taken.set(i, c.label);
  }
  return { map, clashes };
};

export const matchStage = (raw, stages) => {
  const list = stages || DEFAULT_STAGES;
  const n = norm(raw);
  if (!n) return null;
  const exact = list.find(s => norm(s.label) === n || norm(s.id) === n);
  if (exact) return exact.id;
  if (/(closed|won|signed|client|partner|live)/.test(n)) return "closed";
  if (/(meeting|demo|booked|scheduled)/.test(n) || /\bcall\b/.test(n)) return "meeting";
  if (/(respond|replied|reply|interested|warm)/.test(n)) return "responded";
  const m = n.match(/(?:follow ?up|fu|touch) ?([1-9])/) || n.match(/^([1-9])$/);
  if (m) { const hit = list.find(s => s.id === `fu${m[1]}`); if (hit) return hit.id; }
  for (const [word, sid] of [["3rd", "fu3"], ["third", "fu3"], ["2nd", "fu2"],
    ["second", "fu2"], ["1st", "fu1"], ["first", "fu1"]]) {
    if (n.includes(word)) { const hit = list.find(s => s.id === sid); if (hit) return hit.id; }
  }
  const loose = list.find(s => n.includes(norm(s.label)));
  if (loose) return loose.id;
  if (/(new|outreach|not contacted|uncontacted|cold|prospect|lead)/.test(n)) return list[0]?.id || null;
  return null;
};

// read a sheet into { head, body }, tolerating title rows above the header
export const parseSheet = (wb, name) => {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false });
  const hi = aoa.findIndex(r => r.some(c => String(c).trim() !== ""));
  if (hi < 0) return null;
  const head = aoa[hi].map((h, i) => String(h).trim() || `Column ${i + 1}`);
  const body = aoa.slice(hi + 1).filter(r => r.some(c => String(c).trim() !== ""));
  return { head, body };
};

/* An optional slot alongside the declared columns: many sheets carry a stage
   or status column, and reading it beats starting forty warm rows at Outreach.
   Matched by name like everything else; unmapped means "everything starts at
   the first stage". */
export const STAGE_SLOT = "__stage";
export const stageGuess = (headers) => {
  const i = headers.findIndex(h =>
    /\b(stage|status|funnel|step|progress)\b/.test(norm(h)));
  return i >= 0 ? headers[i] : "";
};

/* ---- reading one cell, strictly ----------------------------------------
   Extraction is positional and typed, never clever: a value lands in the
   column its sheet cell was mapped to, or nowhere. A blank in the sheet stays
   a blank in the CRM — data is never compacted sideways to fill a gap.

   Junk spellings of "empty" are treated as empty, and a typed column only
   accepts a value that looks like its type: an email column takes the email
   out of "Jane Doe <jane@x.co>" and refuses a cell with no address in it at
   all, rather than storing a phone number where an email belongs. */
const JUNK = new Set(["-", "--", "—", "–", ".", "n/a", "na", "n.a.", "none",
  "null", "nil", "not available", "not found", "missing", "tbd", "?"]);

const EMAIL_RX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export const cleanCell = (raw, type) => {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || JUNK.has(s.toLowerCase())) return "";
  if (type === "email") {
    const m = EMAIL_RX.exec(s);
    return m ? m[0].toLowerCase() : "";
  }
  if (type === "url") {
    const w = cleanWeb(s);
    return /[a-z0-9][a-z0-9-]*\.[a-z]{2,}/i.test(w) ? w : "";
  }
  return s;
};

/* Turn raw rows into records for POST /companies/import: each is
   { data: {columnKey: value}, stage, stageSince, ... }. The vertical's own
   column set decides what is read; everything else in the sheet is ignored. */
export const buildImport = (rows, map, stageCol, existing, stages, columns) => {
  const nameCol = (columns || []).find(c => c.role === "name");
  const webCol = (columns || []).find(c => c.role === "website");

  const seenName = new Set(existing.map(c => norm(c.name)));
  const seenSite = new Set(existing.map(c => cleanWeb(c.website)).filter(Boolean));
  const ready = [], dupes = [], skipped = [];
  const guessed = { stage: 0 };

  rows.forEach((r, i) => {
    const data = {};
    for (const c of columns || []) {
      const idx = map[c.key];
      if (idx < 0) continue;
      const v = cleanCell(r[idx], c.type);
      if (v) data[c.key] = v;
    }

    /* A row whose mapped cells are all empty is not a lead — it's a divider,
       a note, or spreadsheet residue. Left out entirely. */
    if (Object.keys(data).length === 0) {
      skipped.push({ row: i + 2, why: "empty row" });
      return;
    }

    /* The name cell often carries a URL on a second line. Lift it out before
       anything else looks at either half. */
    let linkedin = "";
    if (nameCol && data[nameCol.key]) {
      const split = splitNameUrl(data[nameCol.key]);
      data[nameCol.key] = split.name;
      if (split.url) {
        if (isLinkedInUrl(split.url)) linkedin = split.url;
        else if (webCol && !data[webCol.key]) data[webCol.key] = split.url;
      }
    }

    const name = nameCol ? String(data[nameCol.key] ?? "").trim() : "";
    if (!name) { skipped.push({ row: i + 2, why: "nothing in the name column" }); return; }

    const rawStage = stageCol >= 0 ? String(r[stageCol] ?? "").trim() : "";
    const stage = matchStage(rawStage, stages) || (rawStage && guessed.stage++, stages[0].id);
    const stamp = iso(today);

    const rec = { data, linkedin, stage, stageSince: stamp };
    if (["responded", "meeting", "closed"].includes(stage)) rec.respondedOn = stamp;
    if (["meeting", "closed"].includes(stage)) rec.meetingOn = stamp;
    if (stage === "closed") rec.closedOn = stamp;

    const site = webCol ? cleanWeb(data[webCol.key]) : "";
    const key = norm(name);
    if (seenName.has(key) || (site && seenSite.has(site))) { dupes.push(rec); return; }
    seenName.add(key); if (site) seenSite.add(site);
    ready.push(rec);
  });

  return { ready, dupes, skipped, guessed };
};

/* The display name of a queued record, for the review table. */
export const recName = (rec, columns) => {
  const nameCol = (columns || []).find(c => c.role === "name");
  return nameCol ? String(rec.data[nameCol.key] ?? "") : "";
};

/* ----------------------------------------------------------------------
   Remembering a vertical's layout

   Every sheet for a given vertical arrives with the same columns, so the
   mapping is worth keeping. Keyed by vertical id — already unique across
   organizations.
---------------------------------------------------------------------- */

const memoryKey = (verticalId) => `crm.import.v${verticalId}`;

export const rememberMapping = (verticalId, names, stageName) => {
  if (!verticalId) return;
  try {
    localStorage.setItem(memoryKey(verticalId),
      JSON.stringify({ names, stageName, at: Date.now() }));
  } catch { /* private mode, or storage disabled */ }
};

export const recallMapping = (verticalId) => {
  if (!verticalId) return null;
  try {
    const raw = localStorage.getItem(memoryKey(verticalId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.names === "object" ? v : null;
  } catch { return null; }
};

export const forgetMapping = (verticalId) => {
  try { localStorage.removeItem(memoryKey(verticalId)); } catch { /* ignore */ }
};

/* A sheet in exactly the shape this vertical declared: its columns as the
   header row, plus a Stage column, with one example row of blanks. What the
   wizard described is what the template offers back. */
export const downloadTemplate = (vertical) => {
  const cols = vertical?.columns || [];
  const head = [...cols.map(c => c.label), "Stage"];
  const example = cols.map(c =>
    c.type === "email" ? "person@company.com"
    : c.type === "phone" ? "(555) 555-0100"
    : c.type === "url" ? "company.com"
    : c.type === "date" ? iso(today)
    : c.type === "number" ? "0"
    : "");
  const ws = XLSX.utils.aoa_to_sheet([head, [...example, "Outreach"]]);
  ws["!cols"] = head.map(h => ({ wch: Math.max(18, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${keyify(vertical?.name || "import")}-template.xlsx`);
};
