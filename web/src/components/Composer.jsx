import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Mail as MailIcon,
  Reply, Send, X,
} from "lucide-react";
import { S, FONT } from "../theme.js";
import { fillMerge, mergeTags, recipientsFor } from "../domain/columns.js";
import { looksHtml } from "../domain/richtext.js";
import { Field } from "./ui.jsx";
import { RichText } from "./RichText.jsx";

/* A body that came out of the rich editor renders as the mail client will
   show it; a plain one keeps its line breaks. Outbound content only — we
   authored it. */
export function BodyView({ body }) {
  return looksHtml(body)
    ? <div style={{ ...S.msgBody, whiteSpace: "normal" }}
        dangerouslySetInnerHTML={{ __html: body }} />
    : <p style={S.msgBody}>{body}</p>;
}

/* ----------------------------------------------------------------------
   Composer

   Two jobs behind one dialog:
     mode "log"  — record an inbound reply you already received.
     mode "send" — send the vertical's script, one message per email address
                   each row carries, from the vertical's own account.

   A row with three filled email columns produces three messages, each
   greeting the person its column is linked to — that is what "generate
   emails" means here. The Review step pages through every generated message,
   and only the button on that screen sends anything. The server re-merges
   with the same rules at the moment of sending.
---------------------------------------------------------------------- */
export function Composer({ job, vertical, org, stages, onSend, onLog, onCancel }) {
  const { mode, targets, advance } = job;
  const first = targets[0];
  const idx = stages.findIndex(s => s.id === first.stage);
  const nextStage = advance && idx > -1 && idx < stages.length - 1 ? stages[idx + 1] : null;

  const logging = mode === "log";
  const [subject, setSubject] = useState(logging ? "" : (vertical.subject || ""));
  const [body, setBody] = useState(logging ? "" : (vertical.body || ""));
  const [reviewing, setReviewing] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // {sent, failed[], skipped[]}
  const bodyRef = useRef(null);

  /* Every message that will go out: (row × filled email column). This is the
     unit the review pages through and the count every label shows. */
  const messages = useMemo(() => targets.flatMap(c =>
    recipientsFor(vertical.columns, c.data).map(r => ({ c, r }))),
    [targets, vertical.columns]);
  const noEmail = useMemo(() => targets.filter(c =>
    recipientsFor(vertical.columns, c.data).length === 0),
    [targets, vertical.columns]);

  const bulk = messages.length > 1;
  const ready = !!subject.trim() && !!body.trim() && messages.length > 0;
  const canSend = !!vertical.smtpUser;

  const tags = useMemo(() => mergeTags(vertical.columns), [vertical.columns]);

  const insertTag = (tag) => {
    const token = `{{${tag}}}`;
    if (bodyRef.current?.insertText) bodyRef.current.insertText(token);
    else setBody(b => b + token);
  };

  /* Client-side merge for the review pages — the server re-merges with the
     same rules (and the same recipient) on send, so what is shown is what
     goes out, without a round trip per page-turn. */
  const previewFor = ({ c, r }) => ({
    to: r.email,
    who: r.name,
    column: r.colLabel,
    subject: fillMerge(subject, { columns: vertical.columns, data: c.data, vertical, org, recipient: r }),
    body: fillMerge(body, { columns: vertical.columns, data: c.data, vertical, org, recipient: r }),
  });

  const submitLog = async () => {
    if (busy) return;
    setBusy(true);
    await onLog({ target: first, subject: subject.trim() || "(no subject)", body });
    setBusy(false);
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    const r = await onSend({ targets, subject, body, advance });
    setBusy(false);
    if (r) setResult(r);
  };

  const current = messages[Math.min(page, messages.length - 1)];
  const pv = reviewing && current ? previewFor(current) : null;

  /* ---- the after screen: what actually happened, per message ---- */
  if (result) {
    const failedKey = new Set((result.failed || []).map(f => `${f.id}\n${f.to}`));
    return (
      <Shell onCancel={onCancel} step="Sent" title={
        result.sent === messages.length
          ? `All ${result.sent} sent`
          : `${result.sent} of ${messages.length} sent`}
        sub={nextStage ? `Each company that was emailed moved to ${nextStage.label}.` : ""}>
        <div style={S.modalBody}>
          {result.failed?.length > 0 && (
            <div style={S.errBox}>
              <AlertTriangle size={15} />
              <span>
                {result.failed.map(f => `${f.to}: ${f.why}`).join(" · ")}
              </span>
            </div>
          )}
          {result.skipped?.length > 0 && (
            <div style={S.warnBox}>
              <AlertTriangle size={15} />
              <span>{result.skipped.length} skipped — no email address on file.</span>
            </div>
          )}
          <div style={S.recipientList}>
            {messages.map(({ c, r }) => {
              const failed = failedKey.has(`${c.id}\n${r.email}`);
              return (
                <div key={`${c.id}:${r.colKey}`} style={{ ...S.recipient, ...(failed ? {} : S.recipientDone) }}>
                  <span style={S.recipientTick}>
                    {failed
                      ? <AlertTriangle size={14} style={{ color: "var(--warn)" }} />
                      : <Check size={14} style={{ color: "var(--good)" }} />}
                  </span>
                  <span style={S.recipientText}>
                    <span style={S.recipientName}>
                      {c.name}{r.name ? ` — ${r.name}` : ""}
                    </span>
                    <span style={S.recipientMail}>{r.email}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={S.modalFoot}>
          <div style={{ flex: 1 }} />
          <button className="btn-fill" style={S.btnFill} onClick={onCancel}>Done</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onCancel={onCancel}
      step={logging ? "Record an inbound reply" : reviewing ? "Review before sending" : "Compose"}
      title={logging ? `Reply from ${first.name}`
        : reviewing ? (bulk ? `${messages.length} personalised emails` : `To ${first.name}`)
        : targets.length > 1 ? `Email ${targets.length} companies` : `Email ${first.name}`}
      sub={logging
        ? "Paste what they wrote. This files the message and moves them to Responded."
        : reviewing
          ? "One message per email address, each greeting its linked name. Nothing sends until the button below."
          : `Sent from ${vertical.smtpUser || "this vertical's account (not set up yet)"}${
              nextStage ? ` · sending moves each company to ${nextStage.label}` : ""}`}>

      <div style={S.modalBody}>
        {/* ---- log mode ---- */}
        {logging && (
          <>
            <div style={S.composerTo}>
              <span style={S.toLabel}>From</span>
              <span style={S.toValue}>{first.contacts?.[0]?.email || "no address on file"}</span>
            </div>
            <Field label="Subject">
              <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="What did they write back about?" />
            </Field>
            <Field label="Message">
              <textarea style={{ ...S.input, minHeight: 200, resize: "vertical",
                lineHeight: 1.6, fontFamily: FONT }} value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Paste their reply here" />
            </Field>
          </>
        )}

        {/* ---- compose ---- */}
        {!logging && !reviewing && (
          <>
            {!canSend && (
              <div style={S.warnBox}>
                <AlertTriangle size={15} />
                <span>This vertical has no sending account yet. You can still generate
                  and review every email — add the Gmail and app password in the
                  vertical settings when you&apos;re ready to send.</span>
              </div>
            )}
            {!vertical.subject && !vertical.body && (
              <div style={S.infoBox}>
                <MailIcon size={14} />
                <span>No saved script yet — write one here, or save one under
                  Vertical settings → Email script so it&apos;s pre-filled next time.</span>
              </div>
            )}
            <div style={S.composerTo}>
              <span style={S.toLabel}>From</span>
              <span style={S.toValue}>
                {vertical.smtpFrom ? `${vertical.smtpFrom} · ` : ""}{vertical.smtpUser || "not set"}
              </span>
            </div>
            <div style={S.composerTo}>
              <span style={S.toLabel}>To</span>
              <span style={S.toValue}>
                {messages.length === 1
                  ? `${messages[0].r.email}${messages[0].r.name ? ` (${messages[0].r.name})` : ""}`
                  : `${messages.length} addresses across ${targets.length - noEmail.length} ${targets.length - noEmail.length === 1 ? "company" : "companies"}`}
              </span>
            </div>

            {noEmail.length > 0 && (
              <div style={S.warnBox}>
                <AlertTriangle size={15} />
                <span>{noEmail.length === targets.length
                  ? "No email address on file, so there's nobody to write to."
                  : `${noEmail.length} of these have nothing in their email columns and will be skipped.`}</span>
              </div>
            )}

            <Field label="Subject">
              <input style={S.input} value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Subject line" />
            </Field>
            <Field label="Message">
              <RichText value={body} onChange={setBody} editorRef={bodyRef}
                minHeight={200}
                placeholder="Write your message — style it, paste an image, like Gmail" />
            </Field>

            <div style={S.tagHint}>Insert a field — filled in per message when it sends</div>
            <div style={S.tags}>
              {tags.map(t => (
                <button key={t} className="tag-chip" style={S.tagChip} onClick={() => insertTag(t)}>
                  {`{${t}}`}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---- review ---- */}
        {!logging && reviewing && pv && (
          <>
            {bulk && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <button className="row-btn" style={S.rowBtn} disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}>
                  <ChevronLeft size={13} /> Prev
                </button>
                <span style={{ ...S.cellSub, flex: 1, textAlign: "center" }}>
                  {page + 1} of {messages.length} — {current.c.name}
                  {pv.who ? ` · ${pv.who}` : ""} ({pv.column})
                </span>
                <button className="row-btn" style={S.rowBtn} disabled={page >= messages.length - 1}
                  onClick={() => setPage(p => Math.min(messages.length - 1, p + 1))}>
                  Next <ChevronRight size={13} />
                </button>
              </div>
            )}
            <div style={S.composerTo}>
              <span style={S.toLabel}>To</span>
              <span style={S.toValue}>{pv.to}{pv.who ? ` (${pv.who})` : ""}</span>
            </div>
            <div style={S.previewBox}>
              <div style={S.previewSubject}>{pv.subject || "(no subject)"}</div>
              <BodyView body={pv.body} />
            </div>
          </>
        )}
      </div>

      <div style={S.modalFoot}>
        {!logging && reviewing && (
          <button className="btn-ghost" style={S.btnGhost} onClick={() => setReviewing(false)}>
            <ChevronLeft size={14} /> Edit
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>

        {logging && (
          <button className="btn-fill" style={S.btnFill} disabled={busy || !body.trim()}
            onClick={submitLog}>
            <Reply size={15} /> Save reply
          </button>
        )}

        {!logging && !reviewing && (
          <button className="btn-fill" style={S.btnFill} disabled={!ready}
            onClick={() => { setPage(0); setReviewing(true); }}>
            <MailIcon size={15} /> {bulk ? `Generate ${messages.length} emails` : "Generate & review"}
          </button>
        )}

        {!logging && reviewing && (
          <button className="btn-fill" style={S.btnFill} disabled={busy || !ready || !canSend}
            onClick={send}>
            <Send size={15} />
            {busy ? "Sending…"
              : bulk ? `Send all ${messages.length}`
              : nextStage ? `Send & move to ${nextStage.label}` : "Send"}
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ step, title, sub, onCancel, children }) {
  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      <div className="modal" style={S.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div style={S.modalHead}>
          <button style={S.closeBtn} onClick={onCancel} aria-label="Close"><X size={18} /></button>
          <div style={S.modalStep}>{step}</div>
          <h2 style={S.modalTitle}>{title}</h2>
          {sub && <p style={S.modalSub}>{sub}</p>}
        </div>
        {children}
      </div>
    </>
  );
}
