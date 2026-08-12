import { useState } from "react";
import { AlertTriangle, Check, Plus, Trash2, X } from "lucide-react";
import { S } from "../theme.js";
import { STAGE_PALETTE, uid } from "../domain/stages.js";

/* ---------- pipeline stage editor ---------- */

export function StageEditor({ stages, companies, onSave, onCancel }) {
  const [draft, setDraft] = useState(stages.map(s => ({ ...s })));
  const [remap, setRemap] = useState({});
  const [confirm, setConfirm] = useState(null);   // { id, moveTo }

  const countIn = (id) => companies.filter(c => c.stage === id).length;
  const patch = (i, p) => setDraft(d => d.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const shift = (i, dir) => setDraft(d => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const n = [...d]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const addStage = () => setDraft(d => [...d, { id: uid(), label: `Stage ${d.length + 1}`,
    sub: "", accent: STAGE_PALETTE[d.length % STAGE_PALETTE.length], wait: 7 }]);
  const cycleColour = (i) => {
    const at = STAGE_PALETTE.indexOf(draft[i].accent);
    patch(i, { accent: STAGE_PALETTE[(at + 1 + STAGE_PALETTE.length) % STAGE_PALETTE.length] });
  };

  const askRemove = (i) => {
    const s = draft[i];
    if (draft.length === 1) return;
    if (countIn(s.id) > 0) {
      setConfirm({ id: s.id, moveTo: draft.find(x => x.id !== s.id)?.id });
      return;
    }
    setDraft(d => d.filter((_, j) => j !== i));
  };

  const doRemove = () => {
    const { id, moveTo } = confirm;
    // anything already pointed at this stage has to follow it along
    setRemap(r => ({
      ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === id ? moveTo : v])),
      [id]: moveTo,
    }));
    setDraft(d => d.filter(s => s.id !== id));
    setConfirm(null);
  };

  const valid = draft.length > 0 && draft.every(s => s.label.trim());

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      <div className="modal" style={S.modal} role="dialog" aria-modal="true" aria-label="Edit pipeline stages">
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={S.modalStep}>Pipeline</div>
          <h2 style={S.modalTitle}>Edit your stages</h2>
          <p style={S.modalSub}>
            These are the columns on the board and the steps a company walks through.
            Replied, Meeting set and Closed sit outside this and can't be changed.
          </p>
        </div>

        <div style={S.modalBody}>
          <div style={S.seHead}>
            <span />
            <span style={S.seHeadLabel}>Stage name</span>
            <span style={S.seHeadLabel}>Wait before next touch</span>
            <span />
          </div>

          {draft.map((s, i) => (
            confirm && confirm.id === s.id ? (
              <div key={s.id} style={S.seConfirm}>
                <div style={S.seConfirmText}>
                  <AlertTriangle size={15} />
                  <span>{countIn(s.id)} companies sit in “{s.label}”. Move them where?</span>
                </div>
                <div style={S.seConfirmRow}>
                  <select style={{ ...S.input, ...S.mapSelect }} value={confirm.moveTo}
                    onChange={e => setConfirm(cf => ({ ...cf, moveTo: e.target.value }))}>
                    {draft.filter(x => x.id !== s.id).map(x =>
                      <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <button className="btn-fill" style={S.btnFill} onClick={doRemove}>Move &amp; delete</button>
                  <button className="btn-ghost" style={S.btnGhost} onClick={() => setConfirm(null)}>Keep</button>
                </div>
              </div>
            ) : (
              <div key={s.id} style={S.seRow}>
                <button style={{ ...S.seSwatch, background: s.accent }} onClick={() => cycleColour(i)}
                  title="Change colour" aria-label={`Change colour for ${s.label}`} />
                <div>
                  <input style={{ ...S.input, ...S.mapSelect }} value={s.label}
                    aria-label="Stage name"
                    onChange={e => patch(i, { label: e.target.value })} />
                  <input style={{ ...S.input, ...S.mapSelect, marginTop: 6, fontSize: 12 }} value={s.sub || ""}
                    aria-label="Stage hint" placeholder="Optional hint under the column title"
                    onChange={e => patch(i, { sub: e.target.value })} />
                </div>
                <div style={S.seWait}>
                  <input type="number" min="1" max="365" style={{ ...S.input, ...S.mapSelect, width: 74 }}
                    value={s.wait} aria-label={`Days before the next touch in ${s.label}`}
                    onChange={e => patch(i, { wait: e.target.value })} />
                  <span style={S.seDays}>days</span>
                </div>
                <div style={S.seTools}>
                  <button style={S.seIcon} onClick={() => shift(i, -1)} disabled={i === 0}
                    aria-label="Move up">↑</button>
                  <button style={S.seIcon} onClick={() => shift(i, 1)} disabled={i === draft.length - 1}
                    aria-label="Move down">↓</button>
                  <button style={{ ...S.seIcon, color: "var(--danger)" }} onClick={() => askRemove(i)}
                    disabled={draft.length === 1} aria-label={`Delete ${s.label}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          ))}

          <button style={S.addContactBtn} onClick={addStage}>
            <Plus size={14} /> Add a stage
          </button>

          {Object.keys(remap).length > 0 && (
            <div style={S.infoBox}>
              <Check size={14} />
              <span>Companies from {Object.keys(remap).length} deleted stage(s) will move across when you save.</span>
            </div>
          )}
        </div>

        <div style={S.modalFoot}>
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>
          <button className="btn-fill" style={S.btnFill} disabled={!valid}
            onClick={() => onSave(draft.map(s => ({ ...s, label: s.label.trim(),
              wait: Math.min(365, Math.max(1, Number(s.wait) || 7)) })), remap)}>
            <Check size={15} /> Save stages
          </button>
        </div>
      </div>
    </>
  );
}

