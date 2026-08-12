import { simpleParser } from "mailparser";

/* ----------------------------------------------------------------------
   Turning a raw message into the one thing the CRM wants: what they wrote.

   mailparser handles the MIME tree, transfer encodings and charsets. What it
   won't do is decide which of the text it found is actually *their reply* —
   a mail client sends the whole conversation back every time. So everything
   below is about throwing away the parts that aren't new.
---------------------------------------------------------------------- */

export const stripHtml = (html) => String(html ?? "")
  .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/&apos;/gi, "'")
  .replace(/\n{3,}/g, "\n\n").trim();

/* Cut the message at the first sign of a quoted chain and drop `>` lines.

   The patterns are the dividers real clients insert. They're matched in one
   pass and the earliest hit wins, because a long thread contains several and
   only the first marks where the new text ends. */
const QUOTE_MARKERS = [
  /^\s*On .+ wrote:\s*$/,            // Gmail, Apple Mail
  /^\s*On .+,.+ at .+ wrote:\s*$/,   // Gmail with a line break in the middle
  /^\s*-{2,}\s*Original Message/i,   // Outlook
  /^\s*_{5,}\s*$/,                   // Outlook's horizontal rule
  /^\s*-{3,}\s*Forwarded message/i,
  /^\s*From:\s.+@/,                  // Outlook header block
  /^\s*Sent from my /i,              // signature, not a quote, but never wanted
  /^\s*El .+ escribió:\s*$/,         // es
  /^\s*Le .+ a écrit\s*:\s*$/,       // fr
  /^\s*Am .+ schrieb .+:\s*$/,       // de
];

export const stripQuoted = (text) => {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    if (QUOTE_MARKERS.some(re => re.test(lines[i]))) { cut = i; break; }
  }

  /* cut > 0, not >= 0: a message that opens with a quote marker has no new text
     above it, so cutting at zero would throw the entire body away. Better to
     keep it all and let a human read it. */
  return (cut > 0 ? lines.slice(0, cut) : lines)
    .filter(l => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/* A plain-day date string in local time. Matches how every other date in the
   system is stored, so an evening reply doesn't file itself as tomorrow. */
export const isoDay = (d) => {
  const x = d instanceof Date && !isNaN(d) ? d : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export const addressOf = (raw) => {
  const m = String(raw ?? "").match(/<([^>]+)>/);
  return (m ? m[1] : String(raw ?? "")).trim().toLowerCase();
};

/* Everything above, applied to a raw RFC822 buffer. This is the single place
   an inbound message becomes a CRM record, so the IMAP poller and the tests
   are exercising identical code. */
export async function parseMessage(source) {
  const p = await simpleParser(source);

  const plain = (p.text || "").trim();
  const body = stripQuoted(plain || stripHtml(p.html || "")) || (p.subject ? "" : "(empty message)");

  return {
    /* The RFC Message-ID is the de-duplication key. It's assigned by the
       sender's server and never changes, unlike an IMAP UID, which is only
       unique per mailbox and resets if the folder is recreated. */
    messageId: p.messageId || null,
    threadId: p.references?.[0] || p.inReplyTo || p.messageId || null,
    from: addressOf(p.from?.value?.[0]?.address || p.from?.text || ""),
    fromName: p.from?.value?.[0]?.name || "",
    subject: (p.subject || "").trim() || "(no subject)",
    body,
    at: isoDay(p.date),
  };
}
