/* ----------------------------------------------------------------------
   Email

   OUTBOUND: the server sends now, from each vertical's own account — see the
   Composer and server/src/mail/smtp.js. The script lives on the vertical, its
   merge tags in domain/columns.js. What used to live here (Gmail compose
   links, a fixed template set, a global SENDER) went with that move.

   INBOUND: unchanged — the server polls the shared mailbox over read-only
   IMAP and files each reply against the company whose contact address matches
   the sender. What's left in this file is the one presentation helper the
   mail status bar uses.
---------------------------------------------------------------------- */

export const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} days ago`;
};
