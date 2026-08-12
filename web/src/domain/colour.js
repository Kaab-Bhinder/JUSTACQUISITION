/* ----------------------------------------------------------------------
   Brand colour

   An organization now picks any colour it likes, so the palette that used to
   be a hand-checked lookup table has to be computed instead. Everything the
   interface needs is derived from one hex:

     ink        what reads on top of the fill        (white or near-black)
     text       the accent as body text on a light surface
     textDark   the same on a dark surface
     soft       a light tint for chip and button backgrounds
     softDark   the same for dark mode

   Every derived value is walked until it actually clears its contrast target
   rather than being nudged by a fixed amount, because a fixed amount that
   works for teal fails for yellow. The targets are WCAG AA: 4.5:1 for text,
   which is what these are used for.
---------------------------------------------------------------------- */

export const clampHex = (v, fallback = "#0ABAB5") => {
  let s = String(v ?? "").trim();
  if (!s.startsWith("#")) s = `#${s}`;
  /* #abc is legal CSS and people type it. */
  if (/^#[0-9a-f]{3}$/i.test(s))
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback;
};

export const hexToRgb = (hex) => {
  const h = clampHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export const rgbToHex = ([r, g, b]) =>
  `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/* WCAG relative luminance. The 0.03928 branch is the sRGB transfer curve's
   linear segment near black — skipping it makes dark colours read as lighter
   than they are, which is exactly where ink choice flips. */
const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const contrast = (a, b) => {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/* ---- HSL, for walking a colour lighter or darker -------------------- */

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToHex(h, s, l) {
  if (!s) { const v = Math.round(l * 255); return rgbToHex([v, v, v]); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return rgbToHex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]);
}

/* ---- HSV, for the picker ---------------------------------------------
   The saturation/value square with a hue rail beside it is the picker people
   already know, and that geometry is HSV. HSL is kept above because walking
   lightness is what the contrast search needs; the two coexist rather than one
   being converted through the other. */

export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToHex(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return rgbToHex([r * 255, g * 255, b * 255]);
}

/* Walk lightness in small steps until the colour clears `target` against
   `against`, and return the first one that does. Stepping rather than solving
   because the relationship between HSL lightness and WCAG luminance is not
   linear — a closed form would need a per-hue correction, and this converges
   in a few dozen integer steps. */
function reachContrast(hex, against, target, direction) {
  const [h, s] = hexToHsl(hex);
  let [, , l] = hexToHsl(hex);
  for (let i = 0; i < 100; i++) {
    const candidate = hslToHex(h, s, l);
    if (contrast(candidate, against) >= target) return candidate;
    l += direction * 0.01;
    if (l <= 0 || l >= 1) break;
  }
  /* Ran out of room: black or white always clears it. */
  return direction < 0 ? "#000000" : "#FFFFFF";
}

/* Mix towards a background, for the very light chip fills. */
const mix = (hex, towards, amount) => {
  const a = hexToRgb(hex), b = hexToRgb(towards);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * amount));
};

/* The ink that goes on top of a fill of this colour. Deep, saturated versions
   of the hue read better than flat black on a mid-tone fill, so a darkened
   tint of the colour itself is tried before falling back. */
export function inkFor(fill) {
  const white = contrast(fill, "#FFFFFF");
  if (white >= 4.5) return "#FFFFFF";

  /* A very dark version of the same hue, which keeps the fill feeling like one
     colour rather than a colour with black text dropped on it. */
  const [h, s] = hexToHsl(fill);
  for (let l = 0.24; l >= 0.04; l -= 0.02) {
    const candidate = hslToHex(h, Math.min(1, s * 0.9), l);
    if (contrast(candidate, fill) >= 4.5) return candidate;
  }
  return white >= contrast(fill, "#000000") ? "#FFFFFF" : "#000000";
}

const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#10201E";

/* Everything the theme needs, from one hex. */
export function brandTokens(accent) {
  const fill = clampHex(accent);
  return {
    fill,
    ink: inkFor(fill),
    /* Darkened until it reads as body text on a white card. */
    text: reachContrast(fill, LIGHT_SURFACE, 4.5, -1),
    /* Lightened until it reads on the dark theme's surface. */
    textDark: reachContrast(fill, DARK_SURFACE, 4.5, +1),
    /* Chip and soft-button fills. Opaque in light mode because the light
       theme's surfaces are opaque; an alpha wash in dark mode, which behaves
       over a near-black ground in a way it does not over white. */
    soft: mix(fill, LIGHT_SURFACE, 0.9),
    softDark: rgba(fill, 0.15),
  };
}

export const rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

/* ----------------------------------------------------------------------
   Neutrals

   The theme's greys are not grey: every surface, line and ink in it is a
   near-desaturated teal, which is what made the original palette feel like one
   thing rather than a brand colour dropped onto a default. That stops working
   the moment an organization picks violet — a violet sidebar on a teal-green
   background reads as two designs fighting.

   So the whole neutral ramp is regenerated at the brand's hue. The reference
   values below are the original teal palette; each is decomposed, its hue is
   swapped for the brand's, and its saturation and lightness are kept exactly.
   Teal-branded tenants therefore land within a couple of degrees of where they
   started, and everyone else gets the same design in their own hue.

   Text neutrals get one extra step: a hue shift at constant HSL lightness does
   move luminance (yellow is brighter than blue at the same lightness), so each
   is walked until it matches the contrast its teal original had. That makes the
   rule "no worse than the palette this was designed as", which is stronger than
   any absolute target would be here — `faint` is deliberately low-contrast, and
   "fixing" it would be redesigning rather than re-hueing.
---------------------------------------------------------------------- */

const REFERENCE = {
  light: {
    surface: "#FFFFFF",          // stays pure white: cards are cards
    on: "#FFFFFF",               // what the text neutrals are measured against
    tints: {
      "--bg": "#F1F7F6",
      "--surface-2": "#F7FBFA",
      "--surface-3": "#ECF4F3",
      "--line": "#DFEBE9",
      "--line-soft": "#EEF5F4",
      "--track": "#CFE1DF",
    },
    inks: {
      "--ink": "#0A2E2B",
      "--ink-2": "#2A4E4A",
      "--mute": "#5F7A77",
      "--faint": "#93ACA9",
    },
  },
  dark: {
    surface: "#10201E",
    on: "#10201E",
    tints: {
      "--bg": "#081514",
      "--surface": "#10201E",
      "--surface-2": "#152A27",
      "--surface-3": "#1B3733",
      "--line": "#22403B",
      "--line-soft": "#1A302C",
      "--track": "#22403B",
    },
    inks: {
      "--ink": "#E9F5F3",
      "--ink-2": "#C2DAD7",
      "--mute": "#8CA6A3",
      "--faint": "#6D8885",
    },
  },
};

/* Re-hue one reference colour, keeping its saturation and lightness. */
const rehue = (ref, hue) => {
  const [, s, l] = hexToHsl(ref);
  return hslToHex(hue, s, l);
};

/* Re-hue, then walk lightness until it is at least as legible as the original
   was. Direction follows the theme: light-mode inks darken, dark-mode inks
   lighten. */
function rehueInk(ref, hue, against, direction) {
  const want = contrast(ref, against);
  const start = rehue(ref, hue);
  if (contrast(start, against) >= want) return start;

  const [, s] = hexToHsl(start);
  let [, , l] = hexToHsl(start);
  for (let i = 0; i < 100; i++) {
    l += direction * 0.01;
    if (l <= 0 || l >= 1) break;
    const candidate = hslToHex(hue, s, l);
    if (contrast(candidate, against) >= want) return candidate;
  }
  return direction < 0 ? "#000000" : "#FFFFFF";
}

/* The neutral half of a tenant's palette, as CSS variables. */
export function neutralVars(accent, dark) {
  const [hue] = hexToHsl(clampHex(accent));
  const ref = dark ? REFERENCE.dark : REFERENCE.light;
  const out = {};

  for (const [name, value] of Object.entries(ref.tints))
    out[name] = rehue(value, hue);

  /* Measured against the surface they actually sit on, which in light mode is
     the white card rather than the tinted page behind it. */
  const surface = dark ? out["--surface"] : ref.surface;
  for (const [name, value] of Object.entries(ref.inks))
    out[name] = rehueInk(value, hue, surface, dark ? +1 : -1);

  /* The modal backdrop is the page background pushed much darker, so it reads
     as the same room with the lights off. */
  const [, bs, bl] = hexToHsl(out["--bg"]);
  out["--scrim"] = rgba(hslToHex(hue, bs, Math.max(0.02, bl * (dark ? 0.4 : 0.12))),
    dark ? 0.62 : 0.42);

  return out;
}

/* Shown next to the picker so the choice is informed rather than a surprise
   after the fact. */
export function contrastReport(accent) {
  const t = brandTokens(accent);
  return {
    onFill: contrast(t.fill, t.ink),
    onLight: contrast(t.text, LIGHT_SURFACE),
    onDark: contrast(t.textDark, DARK_SURFACE),
  };
}
