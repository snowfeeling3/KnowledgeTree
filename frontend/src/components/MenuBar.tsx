import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  id: string;
  label: string;
  hint?: string;
  detail?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  keepOpen?: boolean;
  onSelect?: () => void;
};

export type MenuGroup = {
  id: string;
  label: string;
  items: MenuItem[];
};

type Props = {
  groups: MenuGroup[];
  extra?: ReactNode;
};

export function MenuBar({ groups, extra }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openMenu(id: string) {
    clearCloseTimer();
    setOpenId(id);
  }

  function closeMenu() {
    clearCloseTimer();
    setOpenId(null);
    setPinned(false);
  }

  function scheduleClose() {
    if (pinned) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpenId(null), 160);
  }

  useEffect(() => {
    if (!openId) return;
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) closeMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <nav className="menubar" ref={barRef} aria-label="主菜单" onMouseLeave={scheduleClose}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <span className="mark" aria-hidden="true" />
      {groups.map((group) => {
        const open = openId === group.id;
        return (
          <div key={group.id} className={open ? "menu is-open" : "menu"} onMouseEnter={() => openMenu(group.id)}>
            <button
              type="button"
              className="menu-label"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => {
                if (open && pinned) closeMenu();
                else {
                  openMenu(group.id);
                  setPinned(true);
                }
              }}
            >
              {group.label}
            </button>
            {open && (
              <div className="menu-dropdown" role="menu" aria-label={group.label}>
                {group.items.map((item) => item.separator ? (
                  <div key={item.id} className="menu-sep" role="separator" />
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={item.checked === undefined ? undefined : item.checked}
                    className={item.danger ? "menu-item is-danger" : "menu-item"}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect?.();
                      if (!item.keepOpen) closeMenu();
                    }}
                  >
                    <span className="menu-item-copy">
                      <span className="menu-item-label">
                        <span className="menu-check" aria-hidden="true">{item.checked ? "✓" : ""}</span>
                        {item.label}
                      </span>
                      {item.detail && <span className="menu-detail" title={item.detail}>{item.detail}</span>}
                    </span>
                    {item.hint && <span className="menu-hint">{item.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {extra && <div className="menu-extra">{extra}</div>}
    </nav>
  );
}
