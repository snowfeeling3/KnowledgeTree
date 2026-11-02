import { useEffect, useRef } from "react";
export function isTextInput(target: EventTarget | null): boolean { return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=textbox]")); }
export function shortcutCommand(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "isComposing">, textInput = false): string | null {
  if (event.isComposing || event.altKey) return null;
  const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
  if (mod && ["s", "f", "k", "e"].includes(key)) return { s: "save", f: "search", k: "palette", e: "mode" }[key]!;
  if (mod && key === "z" && !textInput) return event.shiftKey ? "redo" : "undo";
  if (mod || textInput) return null;
  return ({ n: event.shiftKey ? "sibling" : "child", f: "focus", f2: "rename", enter: "open", " ": "collapse", delete: "delete", escape: "escape" })[key] ?? null;
}
export function useShortcuts(run: (command: string) => void, enabled = true) {
  const latest = useRef(run); latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const dialog = (event.target as Element)?.closest?.('[role="dialog"], [role="menu"]');
      if (dialog && event.key !== "Escape" && !(event.ctrlKey && event.key.toLowerCase() === "s")) return;
      const command = shortcutCommand(event, isTextInput(event.target));
      if ((command === "open" || command === "collapse") && (event.target as Element)?.closest?.("button, a, [role=button]")) return;
      if (command) { event.preventDefault(); latest.current(command); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [enabled]);
}
