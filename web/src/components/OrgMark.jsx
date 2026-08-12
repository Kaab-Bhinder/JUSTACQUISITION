import { useState } from "react";
import { S } from "../theme.js";
import { brandTokens } from "../domain/colour.js";

/* ----------------------------------------------------------------------
   An organization's mark

   Its own logo where it has one, its initials on a tile of its brand colour
   where it doesn't. Both are decorative: the name is always rendered as text
   beside this, so the mark is aria-hidden rather than carrying an alt that
   would be read out twice.

   A logo that fails to load falls back to the initials. Not defensive
   programming for its own sake — a logo is a URL somebody typed, and a
   404 leaving an empty hole where the brand should be is worse than the
   initials it replaced.
---------------------------------------------------------------------- */
/* `onBrand` means "this sits on the sidebar", which in light mode is a solid
   slab of the organization's own colour. An initials tile filled with that
   same colour would be invisible on it, so there the tile inverts: the theme's
   --logo-bg / --logo-ink pair, which orgVars keeps correct for both modes.
   A logo tile needs no such switch — it is near-black either way. */
export function OrgMark({ org, size = 46, logoHeight = 22, onBrand = false, style }) {
  const [broken, setBroken] = useState(false);
  const initials = org.mark || org.name.slice(0, 2).toUpperCase();

  if (org.logo && !broken) {
    return (
      <div style={{ ...S.logoTile, height: size, minWidth: size,
        borderRadius: Math.round(size * 0.28), ...style }} aria-hidden="true">
        <img src={org.logo} alt="" onError={() => setBroken(true)}
          style={{ ...S.logoImg, height: logoHeight }} />
      </div>
    );
  }

  /* Ink is derived, never passed in: the colour is free-form now, so the only
     thing that can guarantee the initials read on the tile is computing it. */
  const t = brandTokens(org.accent);

  return (
    <div aria-hidden="true"
      style={{ ...S.lpCardMark, width: size, height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.37),
        background: onBrand ? "var(--logo-bg)" : t.fill,
        color: onBrand ? "var(--logo-ink)" : t.ink,
        ...style }}>
      {initials}
    </div>
  );
}
