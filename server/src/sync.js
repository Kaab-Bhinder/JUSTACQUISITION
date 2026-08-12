import { query } from "./db.js";
import { fileInbound } from "./inbound.js";
import { open as openSecret } from "./crypto.js";
import { envAccount, fetchNewReplies, describeImapError } from "./mail/imap.js";

const LOOKBACK_DAYS = Number(process.env.MAIL_LOOKBACK_DAYS || 30);
const MAX_FETCH = Number(process.env.MAIL_MAX_FETCH || 60);
export const POLL_MS = Number(process.env.MAIL_POLL_MS ?? 90000);

/* One sync at a time. Not paranoia: the poller ticks on a timer while "Check
   now" is a button anyone can hold down, and two overlapping runs would each
   download the same bodies before either had written its message ids. */
let running = false;

const noteState = (patch) => query(
  `UPDATE mail_state
      SET last_sync  = COALESCE($1, last_sync),
          last_error = $2,
          last_filed = COALESCE($3, last_filed),
          updated_at = now()
    WHERE id = 1`,
  [patch.lastSync ?? null, patch.lastError ?? null, patch.filed ?? null]);

export async function mailState() {
  const { rows } = await query(
    `SELECT last_sync, last_error, last_filed FROM mail_state WHERE id = 1`);
  return rows[0] || { last_sync: null, last_error: null, last_filed: 0 };
}

/* ----------------------------------------------------------------------
   Which mailboxes to read

   Every vertical that can send can also be read: a Gmail app password works
   for IMAP exactly as it works for SMTP, so the account someone saved to
   send outreach detects the replies to it with zero extra setup. The env
   pair (IMAP_USER / IMAP_PASSWORD) still works and is checked first; one
   mailbox is only ever polled once however many verticals share it.
---------------------------------------------------------------------- */
export async function mailAccounts() {
  const out = [];
  const seen = new Set();
  const env = envAccount();
  if (env) { out.push(env); seen.add(env.user.toLowerCase()); }

  const { rows } = await query(
    `SELECT DISTINCT smtp_user AS "user", smtp_secret AS secret
       FROM verticals WHERE smtp_user <> '' AND smtp_secret <> ''`);
  for (const r of rows) {
    const key = r.user.toLowerCase();
    if (seen.has(key)) continue;
    const pass = openSecret(r.secret);
    if (!pass) continue;               // sealed under a lost key — unusable
    seen.add(key);
    out.push({ user: r.user, pass, source: "vertical sending account" });
  }
  return out;
}

export const mailConfigured = async () => (await mailAccounts()).length > 0;

/* Pull anything new from every mailbox and file it against the matching
   company. Returns the ids it touched rather than the rows themselves: one
   run can file replies into several organizations, and the route reads the
   rows back under the caller's own tenant scope. */
export async function syncMail() {
  if (running) return { skipped: "already running", filed: 0, companyIds: [] };

  running = true;
  try {
    const accounts = await mailAccounts();
    if (!accounts.length) return { skipped: "unconfigured", filed: 0, companyIds: [] };

    /* Only ask about addresses we actually track. An inbox with ten thousand
       messages in the window still only yields bodies for our contacts. */
    const { rows: addrRows } = await query(
      `SELECT DISTINCT lower(email) AS email FROM contacts WHERE email <> ''`);
    const addresses = new Set(addrRows.map(r => r.email));
    if (!addresses.size) {
      await noteState({ lastSync: new Date(), lastError: null, filed: 0 });
      return { filed: 0, companyIds: [], scanned: 0 };
    }

    const { rows: knownRows } = await query(
      `SELECT message_id FROM emails WHERE message_id IS NOT NULL`);
    const known = new Set(knownRows.map(r => r.message_id));

    /* Per-account, sequentially — a dead mailbox reports its error and the
       rest still deliver. The known-set grows as messages file, so the same
       reply mirrored into two polled mailboxes files once. */
    const touched = new Set();
    const errors = [];
    let scanned = 0, matched = 0;

    for (const account of accounts) {
      try {
        const r = await fetchNewReplies({
          account, addresses, known, lookbackDays: LOOKBACK_DAYS, max: MAX_FETCH,
        });
        scanned += r.scanned; matched += r.matched;
        for (const m of r.messages) {
          const id = await fileInbound({
            from: m.from,
            subject: m.subject,
            body: m.body,
            at: m.at,
            messageId: m.messageId,
            threadId: m.threadId,
          });
          if (m.messageId) known.add(m.messageId);
          if (id) touched.add(id);
        }
      } catch (e) {
        errors.push(`${account.user}: ${describeImapError(e)}`);
      }
    }

    const lastError = errors.length ? errors.join(" · ") : null;
    await noteState({ lastSync: new Date(), lastError, filed: touched.size });
    if (errors.length === accounts.length && accounts.length)
      throw new Error(lastError);
    return { filed: touched.size, companyIds: [...touched], scanned, matched };
  } catch (e) {
    const msg = e.message || String(e);
    await noteState({ lastSync: new Date(), lastError: msg }).catch(() => {});
    throw new Error(msg);
  } finally {
    running = false;
  }
}

/* Background poller. Runs whether or not anything is configured at boot —
   accounts are discovered per tick, so saving a sending account in the app
   starts reply detection on the next tick, no restart needed. */
export function startPoller() {
  if (POLL_MS <= 0) {
    console.log("[mail] polling disabled (MAIL_POLL_MS=0), Check now still works");
    return;
  }

  const tick = () => syncMail()
    .then(r => { if (r.filed) console.log(`[mail] filed ${r.filed} new repl${r.filed === 1 ? "y" : "ies"}`); })
    .catch(e => console.error("[mail] sync failed:", e.message));

  /* A short delay rather than firing immediately: on a cold start this would
     otherwise race the first HTTP requests for the pool's connections. */
  setTimeout(tick, 5000).unref();
  setInterval(tick, POLL_MS).unref();
  console.log(`[mail] reply polling every ${Math.round(POLL_MS / 1000)}s - reads each vertical's sending account (and IMAP_USER if set)`);
}
