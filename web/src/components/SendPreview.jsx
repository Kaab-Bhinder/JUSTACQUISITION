import { useState } from "react";
import { AlertTriangle, Send, X } from "lucide-react";
import { S } from "../theme.js";
import { fillMerge, sendAddress } from "../domain/columns.js";
import { BodyView } from "./Composer.jsx";

/* ----------------------------------------------------------------------
   Send preview — one cell's message, in full

   Opened by a Send button on the board: the complete email exactly as this
   one address will receive it, script merged against this row with THIS
   recipient's linked name filling {first_name}. The send happens from the
   button below the text, never from the cell directly — the human reads
   what goes out, every time.
---------------------------------------------------------------------- */
export function SendPreview({ c, r, vertical, org, script, credsReady, onSend, onCancel }) {
  const [busy, setBusy] = useState(false);

  /* `script` is stage-resolved by the board: the follow-up linked to this
     row's stage, or the first touch. What previews is what sends. */
  const ctx = { columns: vertical.columns, data: c.data, vertical, org, recipient: r };
  const subject = fillMerge(script?.subject ?? vertical.subject ?? "", ctx);
  const body = fillMerge(script?.body ?? vertical.body ?? "", ctx);
  const scriptReady = !!body.trim() && (!!subject.trim() || script?.kind !== "script");

  const send = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onSend(c, r);       // guard()ed upstream: null on failure
    setBusy(false);
    if (ok !== null && ok !== undefined) onCancel();
  };

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      <div className="modal" style={S.modal} role="dialog" aria-modal="true"
        aria-label={`Email to ${r.email}`}>
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={S.modalStep}>{script?.label ? `${script.label} · ` : ""}{r.colLabel} — {c.name}</div>
          <h2 style={S.modalTitle}>{r.name ? `To ${r.name}` : `To ${r.email}`}</h2>
          <p style={S.modalSub}>
            The exact message this address gets. Sending records it on the thread
            and flips this cell to Sent.
          </p>
        </div>

        <div style={S.modalBody}>
          <div style={S.composerTo}>
            <span style={S.toLabel}>From</span>
            <span style={S.toValue}>
              {vertical.smtpFrom ? `${vertical.smtpFrom} · ` : ""}{sendAddress(vertical) || "not set"}
            </span>
          </div>
          <div style={S.composerTo}>
            <span style={S.toLabel}>To</span>
            <span style={S.toValue}>{r.email}{r.name ? ` (${r.name})` : ""}</span>
          </div>

          {!scriptReady && (
            <div style={S.warnBox}>
              <AlertTriangle size={15} />
              <span>No saved script to merge — write one under Vertical settings →
                Email script first.</span>
            </div>
          )}

          <div style={S.previewBox}>
            <div style={S.previewSubject}>{subject || "Re: (threads under the first email's subject)"}</div>
            <BodyView body={body} />
          </div>
        </div>

        <div style={S.modalFoot}>
          {!credsReady && (
            <span style={{ display: "flex", alignItems: "center", gap: 5,
              fontSize: 12.5, color: "var(--warn)" }}>
              <AlertTriangle size={13} />
              Add the Gmail app password in Vertical settings to activate Send.
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>
          <button className="btn-fill" style={S.btnFill}
            disabled={busy || !credsReady || !scriptReady}
            onClick={send}>
            <Send size={15} /> {busy ? "Sending…" : `Send to ${r.email}`}
          </button>
        </div>
      </div>
    </>
  );
}
