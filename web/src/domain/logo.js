/* ----------------------------------------------------------------------
   Reading an uploaded logo

   The file becomes a data: URI stored on the organization row, so it travels
   with every bootstrap and has to stay small. A phone photo or a 4000px export
   is the normal case, not the exceptional one, so oversized raster images are
   scaled down here rather than rejected — being told "too big, go and resize
   it" is not an answer anyone wants from an upload button.

   SVG is passed through untouched: it is already small and already resolution
   independent. The server sanitises it; see routes/orgs.js for why that is
   belt and braces rather than the only defence.
---------------------------------------------------------------------- */

export const LOGO_MAX_BYTES = 512 * 1024;   // the encoded URI, matching the API
/* Rendered at ~22px tall and never more than a few hundred wide. 512 on the
   long edge is generous for a retina display and keeps the encoded string in
   the tens of kilobytes. */
const MAX_EDGE = 512;

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(new Error("That file couldn't be read."));
  fr.readAsDataURL(file);
});

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("That file isn't an image we can read."));
  img.src = src;
});

/* Draw to a canvas at a bounded size, then try formats in order of how well
   they hold a logo: WebP is markedly smaller than PNG at the same quality and
   is supported everywhere this app runs, but a browser that can't produce it
   silently returns a PNG data URI, which is why the result is measured rather
   than assumed. */
async function shrink(dataUrl, type) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  /* Transparency has to survive, so a source that may carry an alpha channel
     is never re-encoded as JPEG. */
  const opaque = type === "image/jpeg";
  const candidates = opaque
    ? [["image/jpeg", 0.9], ["image/jpeg", 0.75]]
    : [["image/webp", 0.92], ["image/png"], ["image/webp", 0.8]];

  let best = null;
  for (const [mime, q] of candidates) {
    const out = canvas.toDataURL(mime, q);
    if (!best || out.length < best.length) best = out;
    if (out.length <= LOGO_MAX_BYTES) return out;
  }
  return best;
}

export async function readLogoFile(file) {
  if (!ACCEPT.includes(file.type))
    throw new Error("Upload a PNG, JPEG, WebP, GIF or SVG.");

  const raw = await readAsDataUrl(file);

  if (file.type === "image/svg+xml") {
    if (raw.length > LOGO_MAX_BYTES)
      throw new Error(`That SVG is too large — keep it under ${Math.round(LOGO_MAX_BYTES / 1024)}KB.`);
    return raw;
  }

  /* An animated GIF loses its animation through a canvas, so a small one is
     kept as it is; a large one is worth the still frame. */
  if (raw.length <= LOGO_MAX_BYTES && file.type === "image/gif") return raw;

  const out = await shrink(raw, file.type);
  if (out.length > LOGO_MAX_BYTES)
    throw new Error(`That image is still too large after scaling. Try one under ${Math.round(LOGO_MAX_BYTES / 1024)}KB.`);
  return out;
}
