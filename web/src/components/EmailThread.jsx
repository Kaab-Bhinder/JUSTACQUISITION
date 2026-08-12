import { CornerUpLeft, Send } from "lucide-react";
import { S } from "../theme.js";
import { fmtDate } from "../domain/dates.js";
import { looksHtml } from "../domain/richtext.js";

export function EmailThread({ c }) {
  const msgs = c.emails || [];
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
            {!incoming && looksHtml(m.body)
              ? <div style={{ ...S.msgBody, whiteSpace: "normal", overflowWrap: "anywhere" }}
                  dangerouslySetInnerHTML={{ __html: m.body }} />
              : <p style={S.msgBody}>{m.body}</p>}
          </div>
        );
      })}
    </div>
  );
}

