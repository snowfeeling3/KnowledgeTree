import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string, _args?: Record<string, unknown>) => {}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
import { hydratePreferences, readStored, writeStored, flushPreferences } from "./preferences";
import { registerLifecycleSave, saveBeforeLifecycleChange, trackWrite } from "./saving";
describe("lifecycle safety", () => {
  beforeEach(() => { mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue(undefined); });
  it("isolates same subject and draft IDs between libraries", async () => {
    await hydratePreferences({}, "C:/one", false);writeStored("kt-document-draft:s:n", {content:"one"});await flushPreferences();
    const saved = mocks.invoke.mock.calls[0]?.[1] as { preferences: Record<string,unknown> };
    await hydratePreferences(saved.preferences, "C:/two", false);expect(readStored("kt-document-draft:s:n",null)).toBeNull();
    await hydratePreferences(saved.preferences, "C:/one", false);expect(readStored("kt-document-draft:s:n",null)).toEqual({content:"one"});
  });
  it("blocks lifecycle actions when an editor cannot save", async () => {
    const remove=registerLifecycleSave(async()=>{throw new Error("disk full");});await expect(saveBeforeLifecycleChange()).rejects.toThrow("disk full");remove();
  });
  it("waits for in-flight structural writes before returning", async () => {
    let finish!:()=>void;let done=false;trackWrite(new Promise<void>((resolve)=>{finish=resolve;}));
    const barrier=saveBeforeLifecycleChange().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);finish();await barrier;expect(done).toBe(true);
  });
  it("blocks when native preferences cannot persist, then allows a successful retry", async () => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    await hydratePreferences({}, "C:/settings-test", false);
    mocks.invoke.mockRejectedValue(new Error("settings disk full"));writeStored("kt-theme", "dark");
    await expect(saveBeforeLifecycleChange()).rejects.toThrow("settings disk full");
    mocks.invoke.mockResolvedValue(undefined);await saveBeforeLifecycleChange();expect(readStored("kt-theme", "")).toBe("dark");vi.unstubAllGlobals();
  });
});

it("flushes healthy editors even when another editor fails, and still blocks exit", async () => {
  const healthy=vi.fn(async()=>{});
  const removeBad=registerLifecycleSave(async()=>{throw new Error("first editor disk full");});
  const removeGood=registerLifecycleSave(healthy);
  try { await expect(saveBeforeLifecycleChange()).rejects.toThrow("first editor disk full"); expect(healthy).toHaveBeenCalledOnce(); }
  finally { removeBad(); removeGood(); }
});
