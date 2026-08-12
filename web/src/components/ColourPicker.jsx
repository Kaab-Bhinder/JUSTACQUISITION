import { useRef, useState, useEffect, useCallback } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { S } from "../theme.js";
import {
  clampHex, hexToHsv, hsvToHex, brandTokens, contrastReport,
} from "../domain/colour.js";

/* ----------------------------------------------------------------------
   Brand colour picker

   A saturation/value square with a hue rail beside it — the picker everyone
   already knows — plus a hex field for when someone has a brand colour written
   down. Presets remain, but as a starting point rather than the only choice.

   The contrast readout underneath is the point of the whole component. Any
   colour is now allowed, so the interface can no longer promise a checked
   palette; instead it shows what the colour actually resolves to and says so
   plainly when a choice is a poor one. The derived ink and tints always clear
   4.5:1 by construction — what varies is how much the colour has to be pushed
   to get there, which is what "adjusted for legibility" is telling you.
---------------------------------------------------------------------- */

const PRESETS = [
  "#0ABAB5", "#4F46E5", "#7C3AED", "#0369A1",
  "#047857", "#BE123C", "#B45309", "#0F172A",
];

/* Drag handling shared by the square and the rail: pointer capture so a drag
   that leaves the element still tracks, which is how every native slider
   behaves and how people actually use one. */
function useDrag(onMove) {
  const ref = useRef(null);

  const handle = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onMove(x, y);
  }, [onMove]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handle(e);
  };
  const onPointerMove = (e) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e);
  };

  return { ref, onPointerDown, onPointerMove };
}

export function ColourPicker({ value, onChange }) {
  const hex = clampHex(value);
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const [typed, setTyped] = useState(hex);

  /* The hex field and the square are two views of one value, so a change from
     outside — a preset, or the form being reopened — has to reach both. Keyed
     on the resolved hex rather than on every keystroke, or typing "#0a" would
     yank the square to black halfway through. */
  useEffect(() => {
    setTyped(hex);
    const next = hexToHsv(hex);
    setHsv(prev => (hsvToHex(...prev) === hex ? prev : next));
  }, [hex]);

  const emit = (h, s, v) => {
    setHsv([h, s, v]);
    onChange(hsvToHex(h, s, v));
  };

  const square = useDrag((x, y) => emit(hsv[0], x, 1 - y));
  const rail = useDrag((x) => emit(x, hsv[1] || 1, hsv[2] || 1));

  const t = brandTokens(hex);
  const report = contrastReport(hex);
  /* "Adjusted" means the colour itself could not carry text at this size and a
     darker or lighter relative was used instead. Worth saying: it explains why
     the buttons in the CRM will not be exactly the colour just chosen. */
  const adjusted = t.text !== hex;

  return (
    <div>
      <div style={S.cpTop}>
        <div className="cp-square" {...square} style={{
          ...S.cpSquare,
          backgroundColor: hsvToHex(hsv[0], 1, 1),
        }}>
          <div style={S.cpSat} />
          <div style={S.cpVal} />
          <div style={{
            ...S.cpKnob,
            left: `${hsv[1] * 100}%`,
            top: `${(1 - hsv[2]) * 100}%`,
            background: hex,
          }} />
        </div>

        <div className="cp-rail" {...rail} style={S.cpRail}>
          <div style={{ ...S.cpRailKnob, left: `${hsv[0] * 100}%`, background: hsvToHex(hsv[0], 1, 1) }} />
        </div>
      </div>

      <div style={S.cpRow}>
        <div style={{ ...S.cpChip, background: hex, color: t.ink }}>Aa</div>
        <input
          style={{ ...S.input, width: 128, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            textTransform: "uppercase" }}
          value={typed}
          spellCheck={false}
          aria-label="Brand colour, as a hex value"
          onChange={e => {
            setTyped(e.target.value);
            const v = e.target.value.trim();
            /* Only commit once it is a complete colour, so the square doesn't
               jump around while a six-digit value is being typed. */
            if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) onChange(clampHex(v));
          }}
          onBlur={() => setTyped(hex)}
        />
        <div style={S.cpPresets}>
          {PRESETS.map(p => (
            <button key={p} type="button" className="lp-swatch" title={p} aria-label={p}
              onClick={() => onChange(p)}
              style={{ ...S.lpSwatch, width: 24, height: 24, borderRadius: 8, background: p,
                ...(p === hex ? S.lpSwatchOn : {}) }}>
              {p === hex && <Check size={12} style={{ color: brandTokens(p).ink }} />}
            </button>
          ))}
        </div>
      </div>

      <div style={S.cpReport}>
        {adjusted ? (
          <span style={S.cpNote}>
            <AlertTriangle size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
            Text and links use <code style={S.code}>{t.text}</code> — a shade of this
            colour dark enough to read on white ({report.onLight.toFixed(1)}:1).
          </span>
        ) : (
          <span style={S.cpNote}>
            <Check size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
            Reads as text on white unchanged ({report.onLight.toFixed(1)}:1).
          </span>
        )}
        <span style={S.cpNote}>
          Buttons carry <code style={S.code}>{t.ink}</code> ink on this
          fill ({report.onFill.toFixed(1)}:1), and the dark theme uses{" "}
          <code style={S.code}>{t.textDark}</code> ({report.onDark.toFixed(1)}:1).
        </span>
      </div>
    </div>
  );
}
