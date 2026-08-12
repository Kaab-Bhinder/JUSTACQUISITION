import { ImapFlow } from "imapflow";
import { parseMessage } from "./parse.js";

/* ----------------------------------------------------------------------
   IMAP — reading replies out of your mailbox

   Read-only, by construction: IMAP is opened on the INBOX and nothing here
   sends, moves, deletes or marks anything. The app has no way to mail a buyer
   on your behalf — outbound goes through a Gmail compose link that you press
   send on yourself.

   Setup for Gmail (about three minutes):
     1. Turn on 2-step verification: myaccount.google.com/security
     2. Generate an app password: myaccount.google.com/apppasswords
        (16 characters, shown in four groups — paste it however you like,
         the spaces are stripped below)
     3. Put your address and that password in server/.env as IMAP_USER and
        IMAP_PASSWORD, then restart the API.

   No Google Cloud project, no OAuth consent screen, and none of the restricted
   -scope review that the Gmail API would need before anyone else could use it.

   Works against any IMAP server, not just Gmail — override IMAP_HOST/PORT.
---------------------------------------------------------------------- */

export const imapConfigured = () =>
  !!(process.env.IMAP_USER && process.env.IMAP_PASSWORD);

export const imapUser = () => process.env.IMAP_USER || null;

/* The env pair as an account, when set. Since verticals carry their own
   sending credentials, this is a fallback rather than the way in — the same
   Gmail app password that sends also reads, so a vertical with a sending
   account gets reply detection with zero extra setup. */
export const envAccount = () => imapConfigured()
  ? { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD, source: "server/.env" }
  : null;

const settings = (account) => ({
  host: process.env.IMAP_HOST || "imap.gmail.com",
  port: Number(process.env.IMAP_PORT || 993),
  secure: String(process.env.IMAP_SECURE ?? "true") !== "false",
  auth: {
    user: account.user,
    /* Google displays app passwords as "abcd efgh ijkl mnop". People paste
       them exactly like that, and IMAP AUTH then fails with a bare
       "Invalid credentials" that explains nothing. Strip the spaces. */
    pass: String(account.pass || "").replace(/\s+/g, ""),
  },
  logger: false,
  /* Without this a dead connection can hang the poller indefinitely. */
  socketTimeout: Number(process.env.IMAP_TIMEOUT_MS || 60000),
});

const MAILBOX = () => process.env.IMAP_MAILBOX || "INBOX";

/* Translate the driver's terser failures into something actionable. */
const FRIENDLY = [
  [/invalid credentials|authenticationfailed|auth.*fail/i,
    "The mailbox rejected the login. For Gmail this must be a 16-character app password, not your account password — and 2-step verification has to be on."],
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i,
    "Couldn't resolve the IMAP host. Check IMAP_HOST in server/.env."],
  [/ECONNREFUSED/i,
    "The IMAP host refused the connection. Check IMAP_PORT (993 for TLS)."],
  [/ETIMEDOUT|timeout/i,
    "The IMAP connection timed out. A firewall or VPN may be blocking port 993."],
  [/certificate|self.signed/i,
    "The server's TLS certificate wasn't trusted."],
  [/\[NONEXISTENT\]|Unknown Mailbox|does not exist/i,
    "That mailbox doesn't exist. Check IMAP_MAILBOX in server/.env."],
];

export const describeImapError = (e) => {
  const raw = e?.responseText || e?.message || String(e);
  for (const [re, msg] of FRIENDLY) if (re.test(raw)) return msg;
  return `Mailbox error: ${raw}`;
};

/* Connect, do one thing, always disconnect. Every IMAP call goes through here
   so a thrown error can't leave a socket open against the mail server. */
async function withMailbox(account, fn) {
  if (!account?.user || !account?.pass) throw new Error("IMAP is not configured.");
  const client = new ImapFlow(settings(account));
  /* ImapFlow also emits socket failures as 'error' EVENTS — a timeout after
     logout arrives outside any await, and an unhandled 'error' event kills
     the whole process. Listen, log, move on: the awaited calls still throw
     their own errors where the caller can catch them. */
  client.on("error", (e) => {
    console.error(`[mail] ${account.user}: ${e?.code || ""} ${e?.message || e}`);
  });
  await client.connect();
  let lock;
  try {
    /* readOnly opens the mailbox with EXAMINE rather than SELECT, so merely
       looking at a message can never mark it as read in your own inbox. */
    lock = await client.getMailboxLock(MAILBOX(), { readOnly: true });
    return await fn(client);
  } finally {
    try { lock?.release(); } catch { /* already gone */ }
    await client.logout().catch(() => { try { client.close(); } catch { /* closed */ } });
  }
}

/* Used by the "Test connection" button so a bad password is reported at setup
   time rather than silently failing in the background every 90 seconds. */
export async function verifyImap(account = envAccount()) {
  return withMailbox(account, async (client) => {
    const box = client.mailbox;
    return { ok: true, mailbox: box?.path || MAILBOX(), messages: box?.exists ?? null };
  });
}

/* ----------------------------------------------------------------------
   Fetching

   Two passes on purpose. Envelopes are small and come back for the whole
   window in one round trip; full message bodies are not, so only messages
   that are both from someone we track and not already filed get downloaded.
   On a busy inbox that's the difference between pulling thousands of
   messages and pulling three.
---------------------------------------------------------------------- */
export async function fetchNewReplies({ account, addresses, known, lookbackDays, max }) {
  const wanted = addresses instanceof Set
    ? addresses : new Set([...addresses].map(a => String(a).toLowerCase()));
  if (!wanted.size) return { messages: [], scanned: 0, matched: 0 };

  return withMailbox(account ?? envAccount(), async (client) => {
    const since = new Date(Date.now() - lookbackDays * 86400000);

    /* Server-side date filter only. Filtering by sender here would mean an
       OR tree with one branch per contact, which some servers truncate or
       reject outright once the list gets long. */
    const uids = await client.search({ since }, { uid: true });
    if (!uids?.length) return { messages: [], scanned: 0, matched: 0 };

    const candidates = [];
    for await (const m of client.fetch(uids, { envelope: true }, { uid: true })) {
      const from = String(m.envelope?.from?.[0]?.address || "").toLowerCase();
      if (!from || !wanted.has(from)) continue;
      const mid = m.envelope?.messageId || null;
      if (mid && known.has(mid)) continue;
      candidates.push({ uid: m.uid, messageId: mid });
    }

    /* Newest first, so a capped run brings back the replies that matter most
       and leaves the older tail for the next tick. */
    candidates.sort((a, b) => b.uid - a.uid);
    const take = candidates.slice(0, max);

    const messages = [];
    for (const c of take) {
      const full = await client.fetchOne(String(c.uid), { source: true }, { uid: true });
      if (!full?.source) continue;
      const parsed = await parseMessage(full.source);
      /* Fall back to the envelope's id if the body had no Message-ID header;
         without any id there's nothing to de-duplicate on, so skip it rather
         than risk filing the same reply on every poll. */
      const messageId = parsed.messageId || c.messageId;
      if (!messageId || known.has(messageId)) continue;
      messages.push({ ...parsed, messageId });
    }

    return { messages, scanned: uids.length, matched: candidates.length };
  });
}
