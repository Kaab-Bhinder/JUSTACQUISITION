import { GripVertical, Send, User } from "lucide-react";
import { S } from "../theme.js";
import { useStages } from "../domain/stages.js";
import { LinkChips } from "./LinkChips.jsx";

export function Card({ c, onClick, onAdvance, onDragStart, onDragEnd, held }) {
  const stages = useStages();
  const last = stages[stages.length - 1];
  const k = c.contacts[0];
  return (
    <div className="card" draggable style={{ ...S.card, ...(held ? S.cardHeld : {}) }}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={S.cardName}><GripVertical size={13} style={S.grip} />{c.name}</span>
      </div>
      {k && (
        <div style={S.cardContact}>
          <User size={12} style={{ flexShrink: 0 }} />
          {/* One line, clipped. A long name and a long job title together are
              wider than a board column, and a card that grows to fit pushes
              every card under it down. */}
          <span style={S.cardContactText}>
            {k.name}{k.role ? <span style={{ color: "var(--faint)" }}> · {k.role}</span> : null}
          </span>
        </div>
      )}
      <LinkChips c={c} size="sm" style={{ marginTop: 8 }} />
      <div style={S.cardFoot}>
        <span style={S.cellSub}>{(c.emails || []).length
          ? `${(c.emails || []).length} email${(c.emails || []).length === 1 ? "" : "s"}`
          : "not contacted"}</span>
        {c.stage !== last?.id && (
          <button className="advance-btn" style={S.advanceBtn}
            onClick={(e) => { e.stopPropagation(); onAdvance(); }}>
            <Send size={11} /> Email
          </button>
        )}
      </div>
    </div>
  );
}
