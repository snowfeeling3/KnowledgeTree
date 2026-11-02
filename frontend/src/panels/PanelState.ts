import { useEffect, useState } from "react";
import { readStored, writeStored } from "../lifecycle/preferences";
export type PanelMode = "closed" | "peek" | "open" | "pinned";
export type StudyRegion = "document" | "outline" | "tree";
export type WorkspacePreferences = { left: PanelMode; right: PanelMode; tree: PanelMode; leftWidth: number; rightWidth: number; treeWidth: number; focusRegion: StudyRegion | null; editing: boolean; recent: string[]; selected: string | null; focused: string | null };
export const DEFAULT_PREFERENCES: WorkspacePreferences = { left: "open", right: "open", tree: "closed", leftWidth: 240, rightWidth: 380, treeWidth: 400, focusRegion: null, editing: false, recent: [], selected: null, focused: null };
export const readPreference = readStored;
export const writePreference = writeStored;
export function normalizeWorkspacePreferences(saved: Partial<WorkspacePreferences>): WorkspacePreferences {
  const result = { ...DEFAULT_PREFERENCES, ...saved, right: "open" as const };
  result.leftWidth = Math.min(460, Math.max(190, Number(result.leftWidth) || 240));
  result.treeWidth = Math.min(800, Math.max(280, Number(result.treeWidth) || 400));
  if (!["document", "outline", "tree"].includes(result.focusRegion ?? "")) result.focusRegion = null;
  return result;
}
export function usePanelState(subjectId: string) {
  const key = `kt-workspace:${subjectId}`;
  const [prefs, setPrefs] = useState<WorkspacePreferences>(() => normalizeWorkspacePreferences(readPreference(key, {})));
  useEffect(() => { writePreference(key, { ...prefs, left: prefs.left === "peek" ? "closed" : prefs.left, right: "open" }); }, [key, prefs]);
  const patch = (value: Partial<WorkspacePreferences>) => setPrefs(current => normalizeWorkspacePreferences({ ...current, ...value }));
  const toggleRegion = (region: "outline" | "tree") => setPrefs(current => {
    const field = region === "outline" ? "left" : "tree";
    return { ...current, [field]: current[field] === "closed" ? "open" : "closed", focusRegion: null };
  });
  const focus = (region: StudyRegion) => setPrefs(current => ({ ...current, focusRegion: current.focusRegion === region ? null : region }));
  const visit = (id: string) => setPrefs(current => ({ ...current, selected: id, recent: [id, ...current.recent.filter(other => other !== id)].slice(0, 20) }));
  return { prefs, patch, visit, toggleRegion, focus };
}
