import { Pencil, Reply, Send, Trash2, X } from "lucide-react";
import { S } from "../theme.js";
import { useStages } from "../domain/stages.js";
import { Section } from "./ui.jsx";
import { LinkChips } from "./LinkChips.jsx";
import { EmailThread } from "./EmailThread.jsx";
import { displayValue } from "../domain/columns.js";
import { fmtDate } from "../domain/dates.js";

/* The drawer never advances a stage on its own — "Write next follow-up" opens
   the composer, and the stage dropdown below is an explicit choice. */
export function Drawer({ c, columns, onClose, onEdit, onStage, onRemove, onCompose, onLogReply }) {
  const stages = useStages();
  const known = stages.some(s => s.id === c.stage);
  const last = stages[stages.length - 1];
  /* The record is the vertical's own columns. The name column is the title
     above; long text reads better after the short facts. */
  const details = (columns || [])
    .filter(col => col.role !== "name" && col.type !== "longtext");
  const longs = (columns || [])
    .filter(col => col.type === "longtext" && String(c.data?.[col.key] ?? "").trim());
  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onClose} />
      <div className="drawer" style={S.drawer}>
        <div style={S.drawerHead}>
          <button style={S.closeBtn} onClick={onClose}><X size={18} /></button>
          <h2 style={S.drawerName}>{c.name}</h2>
          {/* Buttons rather than the URLs themselves: a LinkedIn company
              address is routinely longer than this 420px panel, and printing
              it pushed the panel sideways. The full address is on the title. */}
          <LinkChips c={c} />
        </div>

        <div style={S.drawerBody}>
          <Section title="Details">
            <button className="row-btn" style={{ ...S.rowBtn, marginBottom: 10 }}
              onClick={() => onEdit(c)}>
              <Pencil size={12} /> Edit this lead
            </button>
            {details.map(col => (
              <div key={col.key} style={{ display: "flex", gap: 10, padding: "8px 0",
                borderBottom: "1px solid var(--line)", fontSize: 14 }}>
                <span style={{ color: "var(--faint)", flex: "0 0 38%" }}>{col.label}</span>
                <span style={{ color: "var(--text)", minWidth: 0, overflowWrap: "anywhere" }}>
                  {displayValue(col, c.data?.[col.key]) || "—"}
                </span>
              </div>
            ))}
          </Section>

          {longs.map(col => (
            <Section key={col.key} title={col.label}>
              <p style={S.notes}>{c.data[col.key]}</p>
            </Section>
          ))}

          <Section title="Emails">
            <EmailThread c={c} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="d-next" style={{ ...S.dNext, padding: "10px" }} onClick={() => onCompose(c, false)}>
                <Send size={14} /> Compose
              </button>
              <button className="row-btn-go" style={{ ...S.rowBtnGo, padding: "10px 13px", fontSize: 12.5 }}
                onClick={() => onLogReply(c)}>
                <Reply size={14} /> Log manually
              </button>
            </div>
          </Section>

          <Section title="Activity">
            <div style={S.timeline}>
              {(c.history || []).map((h, i) => (
                <div key={i} style={S.tlRow}>
                  <span style={S.tlDot} />
                  <span style={S.tlDate}>{fmtDate(h.d)}</span>
                  <span style={S.tlText}>{h.t}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div style={S.drawerActions}>
          {/* The stage, as the same dropdown the board rows carry. */}
          <label style={{ ...S.fieldLabel, marginBottom: 4 }}>Stage</label>
          <select
            value={known ? c.stage : ""}
            style={{ ...S.input, width: "100%", marginBottom: 10 }}
            aria-label={`Stage of ${c.name}`}
            onChange={e => onStage(c, e.target.value)}>
            {!known && <option value="">{c.stage}</option>}
            {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            {c.stage !== last?.id &&
              <button className="d-next" style={S.dNext} onClick={() => onCompose(c)}>
                <Send size={15} /> Write next follow-up</button>}
            <button className="d-remove" style={S.dRemove} onClick={() => onRemove(c)}>
              <Trash2 size={15} /> Clear</button>
          </div>
        </div>
      </div>
    </>
  );
}

