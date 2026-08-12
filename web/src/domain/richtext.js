/* ----------------------------------------------------------------------
   HTML-or-plain helpers

   Scripts written in the rich editor are HTML; scripts typed before it, or
   pasted replies, are plain text. Everything that renders or sends a body
   asks these two questions rather than guessing locally.
---------------------------------------------------------------------- */

export const looksHtml = (s) => /<([a-z][a-z0-9]*)\b[^>]*>/i.test(String(s ?? ""));

/* Plain text good enough for a preview line or a text/plain alternative. */
export const htmlToText = (html) => String(html ?? "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
  .replace(/<li\b[^>]*>/gi, "· ")
  .replace(/<img\b[^>]*>/gi, "")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
