import { invoke } from "@tauri-apps/api/core";

let native = false;
let scope = "";
let cache: Record<string, unknown> = {};
let dirty: Record<string, unknown> = {};
let tail: Promise<void> = Promise.resolve();
let failure: unknown;
const scoped = (key: string) => /^(kt-workspace:|kt-camera:|kt-document-draft:|kt-properties-draft:|kt-current-subject$)/.test(key);
const storageKey = (key: string) => scope && scoped(key) ? `kt-library:${encodeURIComponent(scope)}:${key}` : key;
export async function hydratePreferences(preferences: Record<string, unknown>, library: string, importLegacy: boolean) {
  native = true; scope = library.toLowerCase().replace(/\\/g, "/").replace(/^\/\/\?\/unc\//, "//").replace(/^\/\/\?\//, ""); cache = { ...preferences }; dirty = {}; failure = undefined;
  if (importLegacy) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || (!key.startsWith("kt-") && key !== "knowledge-tree-layout") || key.startsWith("kt-library:")) continue;
        const raw = localStorage.getItem(key); if (raw === null) continue;
        let value: unknown; try { value = JSON.parse(raw); } catch { value = raw; }
        cache[storageKey(key)] = value; dirty[storageKey(key)] = value;
      }
    } catch { /* Existing cached native preferences remain available. */ }
    await invoke("save_preferences", { preferences: dirty, imported: true }); dirty = {};
  }
}
export function readStored<T>(key: string, fallback: T): T {
  if (native) return cache[storageKey(key)] == null ? fallback : cache[storageKey(key)] as T;
  try { const raw = localStorage.getItem(key); if (raw === null) return fallback; try { return JSON.parse(raw) as T; } catch { return key === "kt-theme" || key === "knowledge-tree-layout" ? raw as T : fallback; } } catch { return fallback; }
}
function enqueue() {
  const snapshot = { ...dirty };
  tail = tail.catch(() => {}).then(async () => {
    try {
      await invoke("save_preferences", { preferences: snapshot, imported: false });
      for (const key of Object.keys(snapshot)) if (JSON.stringify(dirty[key]) === JSON.stringify(snapshot[key])) delete dirty[key];
      failure = undefined;
    } catch (error) {
      failure = error; window.dispatchEvent(new CustomEvent("kt-settings-error", { detail: String(error) })); throw error;
    }
  });
  void tail.catch(() => {});
}
export function writeStored(key: string, value: unknown) {
  if (native) { cache[storageKey(key)] = value; dirty[storageKey(key)] = value; enqueue(); return; }
  try { localStorage.setItem(key, (key === "kt-theme" || key === "knowledge-tree-layout") && typeof value === "string" ? value : JSON.stringify(value)); } catch { /* Browser preview fallback. */ }
}
export function removeStored(key: string) {
  if (native) { writeStored(key, null); return; }
  try { localStorage.removeItem(key); } catch { /* Browser preview fallback. */ }
}
export async function flushPreferences() {
  await tail.catch(() => {});
  if (Object.keys(dirty).length) { enqueue(); await tail; }
  if (failure) throw failure;
}
