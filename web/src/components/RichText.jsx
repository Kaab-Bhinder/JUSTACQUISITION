import { useEffect, useRef } from "react";
import {
  Bold, Italic, Underline, Link2, List, ListOrdered, AlignLeft, AlignCenter,
  AlignRight, Image as ImageIcon, Undo2, Redo2, Eraser,
} from "lucide-react";
import { S } from "../theme.js";

/* ----------------------------------------------------------------------
   Rich text editor — the Gmail-shaped compose surface

   A contentEditable div with the toolbar people expect from a mail client:
   styles, sizes, colours, lists, alignment, links — and pasted or inserted
   images, which is how a signature gets in. Images land as data: URIs in the
   HTML; the server converts them to proper inline attachments at send time,
   because most mail clients (Gmail included) refuse data: images but render
   CID attachments fine.

   No editor library: document.execCommand is officially deprecated yet
   universally supported, and it is exactly the size of this job. The value
   in and out is an HTML string; merge tags stay plain {first_name} text
   inside it and are filled at send time like always.
---------------------------------------------------------------------- */

const btn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer",
  background: "transparent", color: "var(--mute)",
};

function ToolButton({ title, onClick, children }) {
  return (
    <button type="button" className="rt-btn" style={btn} title={title}
      /* mousedown + preventDefault keeps the selection in the editor — a
         click would move focus and the command would land nowhere. */
      onMouseDown={e => { e.preventDefault(); onClick(); }}>
      {children}
    </button>
  );
}

export function RichText({ value, onChange, placeholder, minHeight = 220, editorRef }) {
  const elRef = useRef(null);
  const lastHtml = useRef(null);

  /* Controlled, carefully: writing innerHTML while the user types would
     reset the caret, so the value only flows in when it genuinely differs
     and the editor isn't focused (an outside reset, a template load). */
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (value !== lastHtml.current && document.activeElement !== el) {
      el.innerHTML = value || "";
      lastHtml.current = value || "";
    }
  }, [value]);

  const emit = () => {
    const el = elRef.current;
    if (!el) return;
    lastHtml.current = el.innerHTML;
    onChange(el.innerHTML);
  };

  const exec = (cmd, arg = null) => {
    elRef.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  /* What the insert-tag chips call: drop text at the caret. Reassigned every
     render on purpose — it closes over the current exec. */
  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      insertText: (text) => exec("insertText", text),
      focus: () => elRef.current?.focus(),
    };
  });

  const insertImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 900 * 1024) {
      window.alert("That image is over 900KB — big images get emails flagged as spam. Use a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => exec("insertImage", reader.result);
    reader.readAsDataURL(file);
  };

  /* Pasted HTML drags its old home's decor along — Gmail signatures arrive
     wrapped in background:white with hard-black text, which renders as a
     white slab in a dark editor and ships a white slab inside the email.
     Backgrounds go; pure-black text is unpinned so it inherits the editor's
     ink here and each mail client's default at the other end. Deliberate
     colours (a brand link, a highlight that isn't white-on-black plumbing)
     survive. */
  const stripPasteBaggage = (html) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    for (const el of div.querySelectorAll("*")) {
      el.removeAttribute("bgcolor");
      const st = el.style;
      if (!st) continue;
      st.removeProperty("background");
      st.removeProperty("background-color");
      const c = (st.color || "").replace(/\s+/g, "").toLowerCase();
      if (["#000", "#000000", "rgb(0,0,0)", "black", "windowtext"].includes(c))
        st.removeProperty("color");
    }
    return div.innerHTML;
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type?.startsWith("image/")) {
        e.preventDefault();
        insertImageFile(it.getAsFile());
        return;
      }
    }
    const html = e.clipboardData?.getData("text/html");
    if (html) {
      e.preventDefault();
      exec("insertHTML", stripPasteBaggage(html));
      return;
    }
    /* Plain-text pastes fall through to the browser's default. */
  };

  const fileRef = useRef(null);

  const addLink = () => {
    const url = window.prompt("Link address (https://…):");
    if (!url) return;
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", safe);
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)" }}>
      <style>{`
        .rt-editor:empty:before { content: attr(data-placeholder); color: var(--faint); }
        .rt-editor img { max-width: 100%; height: auto; }
        .rt-editor a { color: var(--accent); }
        .rt-btn:hover { background: var(--surface-3); color: var(--ink); }
      `}</style>

      {/* ---- toolbar ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
        padding: "6px 8px", borderBottom: "1px solid var(--line)" }}>
        <ToolButton title="Undo" onClick={() => exec("undo")}><Undo2 size={14} /></ToolButton>
        <ToolButton title="Redo" onClick={() => exec("redo")}><Redo2 size={14} /></ToolButton>
        <span style={{ width: 1, height: 18, background: "var(--line)", margin: "0 4px" }} />
        <select title="Text size" style={{ ...S.input, width: 92, padding: "4px 6px", fontSize: 12 }}
          defaultValue="3"
          onMouseDown={e => e.stopPropagation()}
          onChange={e => exec("fontSize", e.target.value)}>
          <option value="1">Tiny</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">Huge</option>
        </select>
        <ToolButton title="Bold" onClick={() => exec("bold")}><Bold size={14} /></ToolButton>
        <ToolButton title="Italic" onClick={() => exec("italic")}><Italic size={14} /></ToolButton>
        <ToolButton title="Underline" onClick={() => exec("underline")}><Underline size={14} /></ToolButton>
        <label title="Text colour" style={{ ...btn, position: "relative", overflow: "hidden" }}
          onMouseDown={e => e.preventDefault()}>
          <span style={{ fontWeight: 800, fontSize: 13, borderBottom: "3px solid var(--accent)", lineHeight: 1 }}>A</span>
          <input type="color" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            onChange={e => exec("foreColor", e.target.value)} />
        </label>
        <span style={{ width: 1, height: 18, background: "var(--line)", margin: "0 4px" }} />
        <ToolButton title="Align left" onClick={() => exec("justifyLeft")}><AlignLeft size={14} /></ToolButton>
        <ToolButton title="Align centre" onClick={() => exec("justifyCenter")}><AlignCenter size={14} /></ToolButton>
        <ToolButton title="Align right" onClick={() => exec("justifyRight")}><AlignRight size={14} /></ToolButton>
        <ToolButton title="Bulleted list" onClick={() => exec("insertUnorderedList")}><List size={14} /></ToolButton>
        <ToolButton title="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered size={14} /></ToolButton>
        <span style={{ width: 1, height: 18, background: "var(--line)", margin: "0 4px" }} />
        <ToolButton title="Insert link" onClick={addLink}><Link2 size={14} /></ToolButton>
        <ToolButton title="Insert image (or just paste one)" onClick={() => fileRef.current?.click()}>
          <ImageIcon size={14} />
        </ToolButton>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { insertImageFile(e.target.files?.[0]); e.target.value = ""; }} />
        <ToolButton title="Clear formatting" onClick={() => exec("removeFormat")}><Eraser size={14} /></ToolButton>
      </div>

      {/* ---- the page ---- */}
      <div ref={elRef} className="rt-editor" contentEditable suppressContentEditableWarning
        data-placeholder={placeholder || ""}
        style={{ minHeight, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6,
          color: "var(--ink)", outline: "none", overflowWrap: "anywhere" }}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste} />
    </div>
  );
}
