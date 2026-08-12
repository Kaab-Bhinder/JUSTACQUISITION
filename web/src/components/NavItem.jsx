import { S } from "../theme.js";

export function NavItem({ icon, label, count, active, alert, onClick }) {
  return (
    /* aria-current is what a screen reader uses to announce "you are here",
       and the stylesheet keys the leading marker off the same attribute, so
       the visual and the announced state cannot drift apart. */
    <button className="nav-item" onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{ ...S.navItem, ...(active ? S.navActive : {}) }}>
      <span style={{ display: "flex", alignItems: "center", gap: 11 }}>{icon}{label}</span>
      <span style={{ ...S.navCount, ...(active ? S.navCountActive : {}),
        ...(alert && !active ? S.navCountAlert : {}) }}>{count}</span>
    </button>
  );
}

