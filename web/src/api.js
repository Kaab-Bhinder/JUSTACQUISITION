/* ----------------------------------------------------------------------
   API client

   One thin wrapper over fetch. Every call either resolves with the server's
   JSON or throws an Error carrying the server's own message, which is what the
   UI puts in its toast — so error text is written once, on the server, and
   never guessed at here.

   Mutations answer with the company rows they touched. The caller merges those
   into state rather than re-fetching the table, so a click stays a single round
   trip.

   One thing travels on every request: X-Org-Id, naming the tenant being worked
   in. It is held in a module variable rather than threaded through forty call
   sites, and setting it is how the app switches organizations.

   There are no accounts and no session. The single privileged action —
   creating an organization — sends administrator credentials in the body of
   that one call and nowhere else.
---------------------------------------------------------------------- */

const BASE = import.meta.env.VITE_API_BASE || "/api";

let orgId = null;
export const setOrg = (id) => { orgId = id || null; };
export const getOrg = () => orgId;

/* ---- the deployment gate, from a separate origin ------------------------
   Served by the API itself, the browser's own basic-auth prompt covers the
   gate. Served from another origin (a Vercel frontend calling the Render
   API), fetch() never shows that prompt — so the app collects the same
   credentials once in its own login screen and attaches them to every
   request. Kept for the session, not forever: closing the tab forgets. */
let gate = null;
try { gate = sessionStorage.getItem("crm.gate") || null; } catch { /* private mode */ }
export const setGate = (user, pass) => {
  gate = "Basic " + btoa(`${user}:${pass}`);
  try { sessionStorage.setItem("crm.gate", gate); } catch { /* ignore */ }
};
export const clearGate = () => {
  gate = null;
  try { sessionStorage.removeItem("crm.gate"); } catch { /* ignore */ }
};

/* One level below the organization: which vertical's board the CRM screens
   are working. Held the same way and for the same reason as the org id. */
let verticalId = null;
export const setVertical = (id) => { verticalId = id || null; };
export const getVertical = () => verticalId;

/* Thrown for anything the server refused. `status` is carried so the shell can
   tell "your session ended" (401) apart from "you can't see that org" (403)
   and from an ordinary validation message, which only needs a toast. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}


async function req(method, path, body, { org = true, vertical = false, timeoutMs = 0 } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  /* The organization-list endpoints are answered without one, and sending a
     stale id there would fail a request that should have succeeded. */
  if (org && orgId) headers["X-Org-Id"] = orgId;
  if (vertical && verticalId) headers["X-Vertical-Id"] = String(verticalId);
  if (gate) headers["Authorization"] = gate;

  /* Calls that can hang on the server side (an SMTP verify against a host
     whose email ports are blocked) carry their own deadline, so a button can
     never spin forever waiting on a request nothing will ever answer. */
  const ctl = timeoutMs ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...(ctl ? { signal: ctl.signal } : {}),
    });
  } catch (e) {
    if (e?.name === "AbortError")
      throw new ApiError("The server didn't answer in time. If this was a sending-account test, the host may be blocking email ports — on Render that means the free plan.", 0);
    /* fetch only rejects when the request never got an answer. */
    throw new ApiError("Can't reach the server. Is the API running on port 4000?", 0);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

  if (!res.ok) throw new ApiError(json?.error || text || `Request failed (${res.status})`, res.status);
  return json ?? {};
}

const get = (p, o) => req("GET", p, undefined, o);
const post = (p, b, o) => req("POST", p, b, o);

/* ---- organizations -----------------------------------------------------
   The list and the vertical catalogue carry no org header: they are what the
   landing page reads before one has been picked. */
const noOrg = { org: false };

export const listOrgs = () => get("/orgs", noOrg);
/* The verticals an organization may choose from. Served rather than hardcoded
   here so the list the picker offers and the list the API will accept are the
   same list. */
export const listVerticals = () => get("/orgs/verticals", noOrg);

/* Creating one is the single gated action: `admin` is { adminEmail,
   adminPassword }, checked against server/.env and never stored anywhere. */
export const createOrg = (data, admin) => post("/orgs", { ...data, ...admin }, noOrg);
export const updateOrg = (id, patch) => req("PATCH", `/orgs/${id}`, patch);
export const deleteOrg = (id, confirm, admin) =>
  post(`/orgs/${id}/delete`, { confirm, ...admin });

/* ---- verticals ---------------------------------------------------------
   Scoped to the organization only: the picker reads this before a vertical
   has been chosen, and creating one is how the first comes to exist. */
export const listVerticalsIn = () => get("/verticals");
export const createVertical = (data) => post("/verticals", data);
export const getVerticalDetail = (id) => get(`/verticals/${id}`);
export const updateVertical = (id, patch) => req("PATCH", `/verticals/${id}`, patch);
export const testVerticalSmtp = (id, to) =>
  req("POST", `/verticals/${id}/test`, { to }, { org: true, vertical: false, timeoutMs: 60000 });
export const deleteVertical = (id, confirm) => post(`/verticals/${id}/delete`, { confirm });

/* ---- the CRM itself ---------------------------------------------------
   Everything below works one vertical's board, named by the header pair. */
const inVertical = { org: true, vertical: true };

export const bootstrap = () => get("/bootstrap", inVertical);
export const getCompanies = () => get("/companies", inVertical);

/* ---- companies ----
   A row is `data` — values keyed by the vertical's own column keys. */
export const createCompany = (data) => post("/companies", data, inVertical);
export const updateCompany = (id, patch) => req("PATCH", `/companies/${id}`, patch, inVertical);
export const importCompanies = (records) =>
  post("/companies/import", { records }, { ...inVertical, timeoutMs: 180000 });
export const advance = (ids) => post("/companies/advance", { ids }, inVertical);
export const moveToStage = (id, stage) => post(`/companies/${id}/move`, { stage }, inVertical);
export const stamp = (ids, to) => post("/companies/stamp", { ids, to }, inVertical);
export const markRead = (id) => post(`/companies/${id}/read`, undefined, inVertical);
export const removeCompanies = (ids) => post("/companies/delete", { ids }, inVertical);

/* ---- stages ---- */
export const saveStages = (stages, remap) => req("PUT", "/stages", { stages, remap }, inVertical);

/* ---- email ----
   The API sends now, from the vertical's own account, after the composer's
   preview step. Preview resolves merge tags on the server so what is shown is
   what will be sent, by the same code. */
export const sendEmails = ({ ids, subject, body, advance: adv, colKey }) =>
  post("/emails/send", { ids, subject, body, advance: adv, colKey }, inVertical);
export const previewEmails = ({ ids, subject, body }) =>
  post("/emails/preview", { ids, subject, body }, inVertical);
export const logReply = ({ id, subject, body }) =>
  post("/emails/log", { id, subject, body });

/* ---- reply syncing ----
   Read-only IMAP, configured in server/.env. There's no connect flow to run
   from the browser: credentials never touch the client. */
export const mailStatus = () => get("/mail/status");
export const mailSync = () => post("/mail/sync");
export const mailTest = () => post("/mail/test");
