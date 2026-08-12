import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { S } from "../theme.js";

/* ----------------------------------------------------------------------
   Deleting, with a pause built in

   Destroying data is the one action that cannot be walked back, so the
   button that does it refuses to work for a few seconds — long enough for
   "wait, wrong vertical" to surface before it matters, which is exactly
   when it needs to. Deleting a vertical additionally wants its name typed
   back: muscle memory can click through a countdown, but it can't type the
   wrong name by accident.
---------------------------------------------------------------------- */
export function ConfirmDelete({
  title, message, requireText, seconds = 5, confirmLabel = "Delete",
  onConfirm, onCancel,
}) {
  const [left, setLeft] = useState(seconds);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const armed = left <= 0 && (!requireText || typed.trim() === requireText);

  const go = async () => {
    if (!armed || busy) return;
    setBusy(true);
    try { await onConfirm(); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="scrim" style={{ ...S.scrim, zIndex: 60 }} onClick={onCancel} />
      <div className="modal" style={{ ...S.modal, maxWidth: 460, zIndex: 61 }}
        role="alertdialog" aria-modal="true" aria-label={title}>
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={{ ...S.modalStep, color: "var(--danger)" }}>
            <AlertTriangle size={12} style={{ verticalAlign: -1.5, marginRight: 5 }} />
            This cannot be undone
          </div>
          <h2 style={S.modalTitle}>{title}</h2>
        </div>

        <div style={S.modalBody}>
          <div style={S.errBox}>
            <AlertTriangle size={15} />
            <span>{message}</span>
          </div>

          {requireText && (
            <div style={{ marginTop: 14 }}>
              <label style={S.fieldLabel}>Type “{requireText}” to confirm</label>
              <input style={S.input} value={typed} autoFocus
                placeholder={requireText}
                onChange={e => setTyped(e.target.value)} />
            </div>
          )}
        </div>

        <div style={S.modalFoot}>
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>
            Keep it
          </button>
          <button className="btn-fill"
            style={{ ...S.btnFill, background: "var(--danger)",
              opacity: armed ? 1 : 0.55 }}
            disabled={!armed || busy}
            title={left > 0 ? `Hold on — ${left}s` : requireText && typed.trim() !== requireText
              ? `Type "${requireText}" first` : ""}
            onClick={go}>
            <Trash2 size={14} />
            {busy ? "Deleting…" : left > 0 ? `${confirmLabel} (${left})` : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
