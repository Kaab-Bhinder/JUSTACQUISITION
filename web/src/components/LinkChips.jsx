import { Globe, Linkedin, ExternalLink } from "lucide-react";
import { S } from "../theme.js";
import { linksFor, href } from "../domain/links.js";

/* A company's website and LinkedIn as fixed-width buttons rather than raw
   URLs. See domain/links.js for why the URL is never the label.

   Rendered as real anchors so middle-click and "open in new tab" work, with
   the click stopped from bubbling — these appear inside rows and cards that
   open a drawer, and following a link should not also open the panel behind
   it. */
export function LinkChips({ c, size = "md", style }) {
  const links = linksFor(c);
  if (!links.length) return null;

  const small = size === "sm";
  const chip = { ...S.linkChip, ...(small ? S.linkChipSm : {}) };
  const icon = small ? 11 : 13;

  return (
    <div style={{ ...S.linkRow, ...style }}>
      {links.map(l => (
        <a key={l.kind} className="link-chip" style={chip}
          href={href(l.url)} target="_blank" rel="noreferrer noopener"
          title={l.url}
          onClick={e => e.stopPropagation()}>
          {l.kind === "linkedin" ? <Linkedin size={icon} /> : <Globe size={icon} />}
          {l.kind === "linkedin" ? "LinkedIn" : "Website"}
          <ExternalLink size={small ? 9 : 10} style={S.linkChipOut} />
        </a>
      ))}
    </div>
  );
}
