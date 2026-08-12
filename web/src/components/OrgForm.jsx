import { useState, useRef } from "react";
import {
  X, Building2, AlertTriangle, Upload, Trash2, ImageIcon, ShieldCheck,
  Eye, EyeOff,
} from "lucide-react";
import { S } from "../theme.js";
import { Field } from "./ui.jsx";
import { OrgMark } from "./OrgMark.jsx";
import { ColourPicker } from "./ColourPicker.jsx";
import { readLogoFile, LOGO_MAX_BYTES } from "../domain/logo.js";

/* ----------------------------------------------------------------------
   Add or edit an organization

   The same form does both. Creating writes an id that then appears in the URL
   and on every request, so it is shown and editable up front rather than
   generated silently — but it is derived from the name as you type, because
   almost nobody wants to think about it.

   Editing hides the id: changing it would orphan every company in the tenant,
   and the API has no route to do it.
---------------------------------------------------------------------- */

const slugify = (s) => String(s ?? "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const initials = (name) => String(name ?? "").trim().split(/\s+/)
  .slice(0, 2).map(w => w[0] || "").join("").toUpperCase();

export function OrgForm({ org, taken = [], onSave, onCancel, busy }) {
  const editing = !!org;

  const [f, setF] = useState(() => ({
    name: org?.name || "",
    fullName: org?.fullName || "",
    /* Empty until the name is typed, then tracked — see `id` below. */
    id: org?.id || "",
    idTouched: false,
    mark: org?.mark || "",
    logo: org?.logo || "",
    tagline: org?.tagline || "",
    accent: org?.accent || "#0ABAB5",
    senderName: org?.senderName || "",
    senderEmail: org?.senderEmail || "",
  }));
  /* Kept apart from the organization's own fields: these are credentials for
     one request, not part of the record being created, and keeping them in
     their own object means they can never be spread into a payload by
     accident. */
  const [admin, setAdmin] = useState({ adminEmail: "", adminPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef(null);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  /* The id follows the name until you edit it yourself, at which point it
     stops — otherwise a deliberate choice would be silently overwritten by
     the next keystroke in the name field. */
  const setName = (name) => setF(x => ({
    ...x, name,
    id: x.idTouched ? x.id : slugify(name),
  }));

  const pickLogo = async (file) => {
    if (!file) return;
    setError("");
    setLogoBusy(true);
    try {
      set("logo", await readLogoFile(file));
    } catch (e) {
      setError(e.message);
    } finally {
      setLogoBusy(false);
      /* Cleared so choosing the same file twice still fires a change. */
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  const id = editing ? org.id : (f.idTouched ? slugify(f.id) : slugify(f.name));
  const mark = (f.mark || initials(f.name) || "?").slice(0, 2).toUpperCase();

  const clash = !editing && taken.includes(id);
  /* Editing needs no credentials — it changes how one tenant looks, not what
     the installation contains. Creating does. */
  const adminReady = editing ||
    (admin.adminEmail.trim().length > 0 && admin.adminPassword.length > 0);
  const ready = f.name.trim().length > 0 && adminReady &&
    (editing || (id.length >= 2 && !clash));

  const submit = (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError("");
    const payload = {
      name: f.name.trim(),
      fullName: f.fullName.trim(),
      mark,
      logo: f.logo,
      tagline: f.tagline.trim(),
      accent: f.accent,
      senderName: f.senderName.trim(),
      senderEmail: f.senderEmail.trim(),
    };
    if (!editing) payload.id = id;
    /* Credentials travel as a second argument, never merged into the record,
       so there is no path by which they could be stored on the organization. */
    Promise.resolve(editing ? onSave(payload) : onSave(payload, { ...admin }))
      .catch(err => setError(err.message));
  };

  return (
    <>
      <div className="scrim" style={S.scrim} onClick={onCancel} />
      {/* A <form> so Enter submits and the browser's own validation and
          autofill behave the way they do everywhere else. */}
      <form className="modal" style={S.modal} onSubmit={submit}>
        <div style={S.modalHead}>
          <button type="button" style={S.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={18} />
          </button>
          <div style={S.modalStep}>{editing ? "Organization settings" : "New organization"}</div>
          <h2 style={S.modalTitle}>{editing ? f.name || org.name : "Add an organization"}</h2>
          <p style={S.modalSub}>
            {editing
              ? "Branding, verticals and the signature shown on the composer. Its id and its pipeline stay as they are."
              : "It starts with the four default funnel stages and no companies."}
          </p>
        </div>

        <div style={S.modalBody}>
          {error && (
            <div style={S.errBox}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <Field label="Name">
            <input style={S.input} value={f.name} autoFocus maxLength={60}
              placeholder="e.g. Close Crew Marketing"
              onChange={e => setName(e.target.value)} />
          </Field>

          {!editing && (
            <Field label="Id">
              <input style={S.input} value={f.idTouched ? f.id : id}
                placeholder="close-crew"
                onChange={e => setF(x => ({ ...x, id: e.target.value, idTouched: true }))} />
              <div style={{ ...S.auHint, color: clash ? "var(--danger)" : "var(--faint)" }}>
                {clash
                  ? `You already have an organization with the id "${id}".`
                  : id.length >= 2
                    ? <>Used in the address bar: <code style={S.code}>#/org/{id}</code>. It can&apos;t be changed later.</>
                    : "Lowercase letters, numbers and hyphens. At least two characters."}
              </div>
            </Field>
          )}

          <Field label="Full name">
            <input style={S.input} value={f.fullName} maxLength={80}
              placeholder="The longer form, shown under the name"
              onChange={e => set("fullName", e.target.value)} />
          </Field>

          <Field label="Tagline">
            <textarea style={{ ...S.input, minHeight: 62, resize: "vertical" }}
              value={f.tagline} maxLength={160}
              placeholder="One line describing what this organization sells."
              onChange={e => set("tagline", e.target.value)} />
            <div style={S.auHint}>{160 - f.tagline.length} characters left.</div>
          </Field>

          {/* ---- brand ---- */}
          <div style={{ ...S.sectionTitle, marginTop: 26 }}>Brand</div>
          <p style={{ ...S.auHint, marginTop: -4, marginBottom: 12 }}>
            The whole CRM takes this colour when the organization is open — sidebar,
            buttons, chips and highlights, in both light and dark.
          </p>

          <Field label="Colour">
            <ColourPicker value={f.accent} onChange={v => set("accent", v)} />
          </Field>

          <Field label="Logo">
            <div style={S.logoRow}>
              <OrgMark org={{ name: f.name || "Your organization", mark, accent: f.accent, logo: f.logo }} />
              <div style={S.logoBtns}>
                <button type="button" className="btn-ghost" style={S.btnGhost}
                  disabled={logoBusy} onClick={() => logoRef.current?.click()}>
                  {logoBusy ? <ImageIcon size={14} /> : <Upload size={14} />}
                  {logoBusy ? "Reading…" : f.logo ? "Replace" : "Upload a logo"}
                </button>
                {f.logo && (
                  <button type="button" className="btn-ghost" style={S.btnGhost}
                    onClick={() => set("logo", "")}>
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
              <input ref={logoRef} type="file" style={{ display: "none" }}
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                onChange={e => pickLogo(e.target.files?.[0])} />
            </div>
            <div style={S.auHint}>
              PNG, JPEG, WebP, GIF or SVG, up to {Math.round(LOGO_MAX_BYTES / 1024)}KB.
              Anything larger is scaled down for you. It sits on a near-black tile, so
              a mark that reads on dark works best. Without one, the initials below are used.
            </div>
          </Field>

          <Field label="Logo initials">
            <input style={{ ...S.input, width: 92, textTransform: "uppercase" }}
              value={f.mark} maxLength={2} placeholder={initials(f.name) || "CC"}
              onChange={e => set("mark", e.target.value)} />
            <div style={S.auHint}>
              One or two letters, used when there&apos;s no logo. Left blank, we take
              them from the name.
            </div>
          </Field>

          <div style={{ ...S.sectionTitle, marginTop: 24 }}>Email signature</div>
          <p style={{ ...S.auHint, marginTop: -4, marginBottom: 14 }}>
            What <code style={S.code}>{"{{sender}}"}</code> becomes in this organization&apos;s
            templates. A label only — mail is still sent by you, from Gmail.
          </p>
          <Field label="Sender name">
            <input style={S.input} value={f.senderName} placeholder={f.name || "Partnerships"}
              onChange={e => set("senderName", e.target.value)} />
          </Field>
          <Field label="Sender email">
            <input style={S.input} type="email" value={f.senderEmail} placeholder="partners@example.com"
              onChange={e => set("senderEmail", e.target.value)} />
          </Field>

          {/* ---- the gate ----
              Last, because it is the price of the form rather than part of the
              thing being described, and asking for a password before anything
              has been filled in reads as a login. */}
          {!editing && (
            <>
              <div style={{ ...S.sectionTitle, marginTop: 26 }}>
                <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
                Administrator
              </div>
              <p style={{ ...S.auHint, marginTop: -4, marginBottom: 14 }}>
                Opening an organization needs nothing. Creating one changes what this
                installation contains, so it asks for the credentials set as{" "}
                <code style={S.code}>ADMIN_EMAIL</code> and{" "}
                <code style={S.code}>ADMIN_PASSWORD</code> in <code style={S.code}>server/.env</code>.
                They are checked once and never stored.
              </p>
              <Field label="Administrator email">
                <input style={S.input} type="email" value={admin.adminEmail}
                  autoComplete="off" placeholder="admin@example.com"
                  onChange={e => setAdmin(a => ({ ...a, adminEmail: e.target.value }))} />
              </Field>
              <Field label="Administrator password">
                <div className="au-pw-wrap" style={S.auPwWrap}>
                  <input style={S.auPwInput} type={showPw ? "text" : "password"}
                    value={admin.adminPassword} autoComplete="off"
                    onChange={e => setAdmin(a => ({ ...a, adminPassword: e.target.value }))} />
                  <button type="button" className="au-pw-btn" style={S.auPwBtn}
                    onClick={() => setShowPw(s => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </>
          )}
        </div>

        <div style={S.modalFoot}>
          <button type="button" className="btn-ghost" style={S.btnGhost} onClick={onCancel}>Cancel</button>
          <div style={{ flex: 1 }} />
          <button type="submit" className="btn-fill" style={S.btnFill} disabled={!ready || busy}>
            <Building2 size={15} />
            {busy ? "Saving…" : editing ? "Save changes" : "Create organization"}
          </button>
        </div>
      </form>
    </>
  );
}
