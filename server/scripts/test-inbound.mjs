/* Tests the reply-detection pipeline on real RFC822 messages.
 *
 *   node scripts/test-inbound.mjs
 *
 * The IMAP network call is the only part not covered: these are raw messages of
 * exactly the kind fetchNewReplies() downloads, run through the same
 * parseMessage() and fileInbound() the poller uses. So MIME handling, quote
 * stripping, sender matching, the stage move and de-duplication are all really
 * exercised. Needs a database; does not need a mailbox.
 *
 * Creates its own companies and deletes them afterwards.
 */
import "dotenv/config";
import { pool, query } from "../src/db.js";
import { parseMessage, stripQuoted, stripHtml, addressOf } from "../src/mail/parse.js";
import { fileInbound } from "../src/inbound.js";

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`); }
};

/* ---- fixtures: raw messages, as they arrive off the wire ---- */

const plainMsg = `From: Tom Beckett <tom@replytest.com>
To: partners@bsbw.co
Subject: Re: Exclusive Auto Insurance leads
Date: Tue, 28 Jul 2026 14:22:00 +0000
Message-ID: <plain-001@replytest.com>
Content-Type: text/plain; charset="UTF-8"

Thanks for following up - send the rate card.

Tom
`;

/* multipart/alternative carrying a quoted chain, which is what a reply from
   Gmail or Apple Mail actually looks like */
const quotedMsg = `From: tom@replytest.com
To: partners@bsbw.co
Subject: Re: Exclusive Auto Insurance leads
Date: Wed, 29 Jul 2026 09:05:00 +0000
Message-ID: <quoted-002@replytest.com>
In-Reply-To: <plain-001@replytest.com>
References: <root-000@bsbw.co> <plain-001@replytest.com>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="bnd42"

--bnd42
Content-Type: text/plain; charset="UTF-8"

Looks workable. Can you do Oregon first?

On Tue, 28 Jul 2026 at 09:00, BSBW Partnerships <partners@bsbw.co> wrote:
> Every lead goes to one buyer only.
> Worth 15 minutes?

--bnd42
Content-Type: text/html; charset="UTF-8"

<div>Looks workable.</div>
--bnd42--
`;

/* HTML only, quoted-printable, which is most corporate mail */
const htmlOnlyMsg = `From: "Priya Nathan" <priya@replytest2.com>
To: partners@bsbw.co
Subject: RE: Leads for Keystone
Date: Wed, 29 Jul 2026 16:40:00 +0000
Message-ID: <html-003@replytest2.com>
MIME-Version: 1.0
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<style>p{color:red}</style><p>We are interested.</p>=
<p>Send pricing &amp; volume for Q4.</p><br><div>Priya</div>
`;

/* a base64 body with non-ASCII, to prove charset handling isn't guesswork */
const utf8Msg = `From: tom@replytest.com
To: partners@bsbw.co
Subject: =?UTF-8?B?UmU6IHByaWNpbmcgLSDCoTUwJSDvvIE=?=
Date: Thu, 30 Jul 2026 08:00:00 +0000
Message-ID: <utf8-005@replytest.com>
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

UGFyZmFpdCDigJQgbGV0J3MgcHJvY2VlZC4gQ2Fmw6kgb24gbWUu
`;

const strangerMsg = `From: newsletter@somewhere.example
To: partners@bsbw.co
Subject: Your weekly digest
Date: Thu, 30 Jul 2026 06:00:00 +0000
Message-ID: <stranger-004@somewhere.example>
Content-Type: text/plain

Unsubscribe here.
`;

/* ---- pure helpers ---- */
console.log("\nhelpers");
check("address extracted from a display name",
  addressOf("Tom Beckett <tom@replytest.com>") === "tom@replytest.com");
check("bare address passes through", addressOf("tom@replytest.com") === "tom@replytest.com");
check("address lowercased", addressOf("<TOM@ReplyTest.com>") === "tom@replytest.com");
check("empty input is safe", addressOf(null) === "");

check("Outlook divider cuts the quote",
  stripQuoted("New text.\n-----Original Message-----\nold stuff") === "New text.");
check("underscore rule cuts the quote",
  stripQuoted("New text.\n\n________________________________\nold") === "New text.");
check("'>' lines dropped",
  stripQuoted("Mine.\n> theirs\n> more theirs") === "Mine.");
check("a body that is ONLY a quote is kept, not emptied",
  stripQuoted("On Mon, someone wrote:\n> hello").length > 0,
  JSON.stringify(stripQuoted("On Mon, someone wrote:\n> hello")));
check("German divider recognised",
  stripQuoted("Meins.\nAm 01.01.2026 schrieb Tom:\n> alt") === "Meins.");
check("<style> contents dropped",
  !stripHtml("<style>p{color:red}</style><p>hi</p>").includes("color"));
check("entities decoded", stripHtml("<p>a &amp; b</p>") === "a & b");

/* ---- parsing whole messages ---- */
console.log("\nparsing");
const p1 = await parseMessage(plainMsg);
check("Message-ID captured", p1.messageId === "<plain-001@replytest.com>", p1.messageId);
check("sender parsed", p1.from === "tom@replytest.com", p1.from);
check("display name kept separately", p1.fromName === "Tom Beckett", p1.fromName);
check("subject parsed", p1.subject === "Re: Exclusive Auto Insurance leads", p1.subject);
check("date reduced to a plain day", p1.at === "2026-07-28", p1.at);
check("body decoded", p1.body === "Thanks for following up - send the rate card.\n\nTom",
  JSON.stringify(p1.body));

const p2 = await parseMessage(quotedMsg);
check("prefers text/plain over text/html", p2.body.startsWith("Looks workable."));
check("quoted chain stripped", !p2.body.includes("Every lead goes to one buyer"), p2.body);
check('"On ... wrote:" line stripped', !p2.body.includes("wrote:"), p2.body);
check("only their new words remain", p2.body === "Looks workable. Can you do Oregon first?",
  JSON.stringify(p2.body));
check("thread traced to the conversation root", p2.threadId === "<root-000@bsbw.co>", p2.threadId);

const p3 = await parseMessage(htmlOnlyMsg);
check("HTML-only message yields text", p3.body.length > 0, JSON.stringify(p3.body));
check("quoted-printable soft break joined", p3.body.includes("Send pricing"), JSON.stringify(p3.body));
check("<style> block dropped", !p3.body.includes("color:red"), p3.body);
check("tags stripped", !p3.body.includes("<p>"), p3.body);
check("entities decoded", p3.body.includes("pricing & volume"), p3.body);

const p4 = await parseMessage(utf8Msg);
check("encoded-word subject decoded", p4.subject.includes("¡50%"), p4.subject);
check("base64 UTF-8 body decoded", p4.body.includes("Café") && p4.body.includes("—"),
  JSON.stringify(p4.body));

/* ---- filing ---- */
console.log("\nfiling");
/* Fixtures need an organization to belong to. Whichever exists first will do —
   nothing here depends on which one, only that a company always has one. */
const { rows: [{ id: ORG }] } = await query(
  `SELECT id FROM organizations ORDER BY created_at, id LIMIT 1`);

/* Everything this suite creates is deleted at the end, and the count is
   checked back to here. */
const { rows: [{ n: startCount }] } = await query(
  `SELECT count(*)::int AS n FROM companies`);

const mk = async (name, email, stage, org = ORG) => {
  const { rows: [c] } = await query(
    `INSERT INTO companies (org_id, name, vertical, website, stage)
     VALUES ($1,$2,'auto_ins','',$3) RETURNING id`,
    [org, name, stage]);
  await query(`INSERT INTO contacts (company_id, name, email) VALUES ($1,$2,$3)`,
    [c.id, "Contact", email]);
  return c.id;
};

const inFunnelId = await mk("Reply Test Co", "tom@replytest.com", "fu2");
const closedId = await mk("Reply Test Closed", "priya@replytest2.com", "closed");
const created = [inFunnelId, closedId];

const fileRaw = async (raw) => fileInbound(await parseMessage(raw));

const hit1 = await fileRaw(plainMsg);
check("matched the company by contact address", hit1 === inFunnelId, `got ${hit1}`);

const row = async (id) => (await query(
  `SELECT stage, responded_on FROM companies WHERE id=$1`, [id])).rows[0];
const r1 = await row(inFunnelId);
check("moved out of the funnel to responded", r1.stage === "responded", r1.stage);
check("respondedOn taken from the message date, not today",
  String(r1.responded_on) === "2026-07-28", String(r1.responded_on));

const { rows: [msg] } = await query(
  `SELECT direction, addr, subject, body, read, thread_id FROM emails WHERE message_id=$1`,
  ["<plain-001@replytest.com>"]);
check("stored as inbound", msg?.direction === "in");
check("sender stored lowercased", msg?.addr === "tom@replytest.com");
check("arrives unread, so the UI can flag it", msg?.read === false);
check("cleaned body stored", msg?.body?.includes("send the rate card"));

const { rows: [h] } = await query(
  `SELECT t FROM history WHERE company_id=$1 ORDER BY id DESC LIMIT 1`, [inFunnelId]);
check("history entry written", h?.t === "Replied — moved to Responded", h?.t);

/* the poller re-sees the same messages on every tick within the lookback
   window - this is the assertion that stops duplicates piling up */
const again = await fileRaw(plainMsg);
check("re-filing the same Message-ID is a no-op", again === null, `got ${again}`);
const { rows: dupes } = await query(
  `SELECT count(*)::int AS n FROM emails WHERE message_id=$1`, ["<plain-001@replytest.com>"]);
check("still exactly one copy stored", dupes[0].n === 1, `got ${dupes[0].n}`);

const hit2 = await fileRaw(quotedMsg);
check("a second, different reply is filed", hit2 === inFunnelId);
check("stage stays at responded, not dragged backwards",
  (await row(inFunnelId)).stage === "responded");
const { rows: [t2] } = await query(
  `SELECT thread_id FROM emails WHERE message_id=$1`, ["<quoted-002@replytest.com>"]);
check("thread id stored", t2?.thread_id === "<root-000@bsbw.co>", t2?.thread_id);

/* a reply to a signed deal must not reopen it */
const hit3 = await fileRaw(htmlOnlyMsg);
check("reply to a closed company is still filed", hit3 === closedId, `got ${hit3}`);
check("closed company NOT moved to responded", (await row(closedId)).stage === "closed");
const { rows: [h3] } = await query(
  `SELECT t FROM history WHERE company_id=$1 ORDER BY id DESC LIMIT 1`, [closedId]);
check("logged as a plain reply instead", h3?.t === "Reply received", h3?.t);

/* mail from someone we don't track is left alone entirely */
const hit4 = await fileRaw(strangerMsg);
check("unknown sender not filed anywhere", hit4 === null, `got ${hit4}`);

/* ---- tenancy ----------------------------------------------------------
   One mailbox serves every organization, so the poller and the webhook file
   wherever the sender matches. "Log a reply" is a person inside one tenant and
   passes orgId, which must constrain the lookup — otherwise typing a reply in
   one organization could write a row into another's pipeline. */
console.log("\ntenancy");
const { rows: [second] } = await query(
  `SELECT id FROM organizations WHERE id <> $1 ORDER BY created_at, id LIMIT 1`, [ORG]);

if (second) {
  const otherId = await mk("Reply Test Other Tenant", "zoe@replytest3.com", "fu1", second.id);
  created.push(otherId);

  const crossed = await fileInbound({
    from: "zoe@replytest3.com", subject: "wrong tenant",
    body: "should not file", messageId: "<cross-001@replytest3.com>", orgId: ORG,
  });
  check("a scoped filing can't reach another organization's company",
    crossed === null, `got ${crossed}`);

  const scoped = await fileInbound({
    from: "zoe@replytest3.com", subject: "right tenant",
    body: "should file", messageId: "<cross-002@replytest3.com>", orgId: second.id,
  });
  check("the same address files fine within its own organization",
    scoped === otherId, `got ${scoped}`);

  /* The unscoped path is what the poller uses, and it must still reach every
     tenant — that is the whole point of one shared mailbox. */
  const global = await fileInbound({
    from: "zoe@replytest3.com", subject: "poller",
    body: "shared mailbox", messageId: "<cross-003@replytest3.com>",
  });
  check("an unscoped filing still reaches any organization",
    global === otherId, `got ${global}`);
} else {
  check("second organization present to test isolation against", false,
    "only one organization exists - run `npm run migrate` to create BSBW and CCM");
}
const { rows: none } = await query(
  `SELECT count(*)::int AS n FROM emails WHERE message_id=$1`, ["<stranger-004@somewhere.example>"]);
check("nothing written for the stranger", none[0].n === 0);

/* ---- cleanup ----
   Measured as a difference rather than against a fixed total: this suite has
   to leave a database people are working in exactly as it found it, and how
   many rows that is depends on the database, not on the seed. */
await query(`DELETE FROM companies WHERE id = ANY($1::int[])`, [created]);
const { rows: left } = await query(`SELECT count(*)::int AS n FROM companies`);
check("test rows removed, existing data intact", left[0].n === startCount,
  `started with ${startCount}, ${left[0].n} left`);

console.log(`\n${"=".repeat(46)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(46)}`);
await pool.end();
process.exit(fail ? 1 : 0);
