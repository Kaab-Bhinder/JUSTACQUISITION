import { useEffect, useState } from "react";
import { CornerUpLeft, Send } from "lucide-react";
import * as api from "../api.js";
import { S } from "../theme.js";
import { fmtDate } from "../domain/dates.js";
import { looksHtml } from "../domain/richtext.js";

export function EmailThread({ c }) {
  /* The row carries each message's metadata; bodies arrive when the thread
     is opened. Until then the list renders from the row, bodies pending, so
     opening a thread is instant and the board never ships signatures. */
  const meta = c.emails || [];
  const [full, setFull] = useState(null);
  useEffect(() => {
    let live = true;
    setFull(null);
    if (!meta.length) return undefined;
    api.companyEmails(c.id)
      .then(r => { if (live) setFull(r.emails || []); })
      .catch(() => { if (live) setFull([]); });
    return () => { live = false; };
  }, [c.id, meta.length]);
  const bodies = new Map((full || []).map(m => [m.id, m]));
  const msgs = meta.map(m => bodies.get(m.id) || m);
  if (!msgs.length) return <div style={S.threadEmpty}>Nothing sent or received yet.</div>;
  return (
    <div style={S.thread}>
      {msgs.map(m => {
        const incoming = m.dir === "in";
        return (
          <div key={m.id} style={{ ...S.msg, ...(incoming ? S.msgIn : {}) }}>
            <div style={S.msgHead}>
              <span style={{ ...S.msgTag, ...(incoming ? S.msgTagIn : {}) }}>
                {incoming ? <CornerUpLeft size={10} /> : <Send size={10} />}
                {incoming ? "Received" : "Sent"}
              </span>
              <span style={S.msgDate}>{fmtDate(m.at)}</span>
            </div>
            <div style={S.msgSubject}>{m.subject}</div>
            {/* Which address, exactly — a row can carry several, and "sent"
                without "to whom" stopped being enough the day it could. */}
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 6 }}>
              {incoming ? `From ${m.from || "unknown"}` : `To ${m.to || "—"}`}
            </div>
            {/* Outbound HTML renders as sent — it's our own authored content.
                Inbound stays escaped text, always: a reply is untrusted. */}
            {m.body == null
              ? <p style={{ ...S.msgBody, color: "var(--faint)" }}>{full ? "" : "Loading…"}</p>
              : !incoming && looksHtml(m.body)
                ? <div style={{ ...S.msgBody, whiteSpace: "normal", overflowWrap: "anywhere" }}
                    dangerouslySetInnerHTML={{ __html: m.body }} />
                : <p style={S.msgBody}>{m.body}</p>}
          </div>
        );
      })}
    </div>
  );
}

