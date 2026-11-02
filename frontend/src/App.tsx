import { lifecycleApi, type BootStatus } from "./lifecycle/api";
import { LibrarySetup } from "./lifecycle/LibrarySetup";
import { Settings } from "./lifecycle/Settings";
import { hydratePreferences, readStored, writeStored } from "./lifecycle/preferences";
import { saveBeforeLifecycleChange } from "./lifecycle/saving";
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from "react";
import { api, errorText, isDesktop } from "./api";
import { SubjectHome } from "./components/SubjectHome";
import { readTheme, type ThemeName } from "./components/ThemeSwitch";
import { Workspace } from "./components/Workspace";
import type { Subject } from "./types";

type BoundaryState = { error: Error | null };

class AppBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Knowledge Tree render failed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-recovery" role="alert">
          <span className="empty-orb">!</span>
          <p className="eyebrow">界面未能完成渲染</p>
          <h1>知识库内容没有丢失</h1>
          <p>刚才的界面出现异常。你可以立即重新载入；若问题重复出现，请把下面的错误信息反馈出来。</p>
          <code>{this.state.error.message || "未命名的渲染错误"}</code>
          <button type="button" onClick={() => window.location.reload()}>重新载入</button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return <AppBoundary><KnowledgeTreeApp /></AppBoundary>;
}

function KnowledgeTreeApp() {
  const [theme, setTheme] = useState<ThemeName>(readTheme);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [current, setCurrent] = useState<Subject | null>(null);
  const [libraryRoot, setLibraryRoot] = useState("");
  const [status, setStatus] = useState("正在读取应用配置…");
  const [boot, setBoot] = useState<BootStatus | null>(null);
  const [settings, setSettings] = useState(false), [switching, setSwitching] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; if (!isDesktop() || boot?.ready) writeStored("kt-theme", theme); }, [theme, boot?.ready]);
  useEffect(() => {
    const fail = (event: Event) => setStatus(`设置保存失败：${(event as CustomEvent).detail}`);
    window.addEventListener("kt-settings-error", fail); return () => window.removeEventListener("kt-settings-error", fail);
  }, []);
  const refresh = useCallback(async () => {
    if (!isDesktop()) { setStatus("请在桌面端打开 KnowledgeTree。"); return; }
    const [root, list] = await Promise.all([api.libraryRoot(), api.listSubjects()]); setLibraryRoot(root); setSubjects(list); return list;
  }, []);
  async function acceptBoot(next: BootStatus) {
    if (next.ready && next.library_path) {
      await hydratePreferences(next.preferences, next.library_path, next.import_legacy_preferences);
      setTheme(readTheme());
      const list = await refresh();
      const last = readStored<string | null>("kt-current-subject", null);
      setCurrent(list?.find((subject) => subject.id === last) ?? null);
      setStatus("就绪");
    } else setStatus(next.error ?? "请选择本地知识库");
    setBoot(next); setSwitching(false);
  }
  useEffect(() => {
    if (!isDesktop()) { void refresh(); return; }
    void lifecycleApi.startup().then(acceptBoot).catch((error) => setStatus(errorText(error)));
  }, []);
  useEffect(() => { if (boot?.ready) { const timer = setTimeout(() => { void lifecycleApi.check(false).then((update) => { if (update.phase === "available") setStatus(`发现新版本 ${update.version}，可在设置中查看`); }).catch(() => {}); }, 3000); return () => clearTimeout(timer); } }, [boot?.ready]);
  function openSubject(subject: Subject) { setCurrent(subject); writeStored("kt-current-subject", subject.id); }
  async function createSubject(title: string, description: string, id: string) {
    try { const subject = await api.createSubject(title, description, id); await refresh(); openSubject(subject); setStatus(`已创建 ${subject.title}`); }
    catch (error) { setStatus(errorText(error)); throw error; }
  }
  if (isDesktop() && !boot) return <main className="app-recovery"><h1>Knowledge Tree</h1><p role="status">{status}</p><button onClick={() => window.location.reload()}>重新读取</button></main>;
  if (boot && !boot.ready) return <div className="app-shell"><main className="welcome-shell"><LibrarySetup boot={boot} onReady={acceptBoot} /></main><footer className="statusbar">{status}</footer></div>;
  return <div className="app-shell">
    <div className="app-content" inert={settings || switching}>
      {current ? <Workspace key={`${libraryRoot}:${current.id}`} subject={current} theme={theme} onTheme={setTheme} onBack={() => { setCurrent(null); writeStored("kt-current-subject", null); void refresh().catch((e) => setStatus(errorText(e))); }} onStatus={setStatus} /> : <SubjectHome subjects={subjects} libraryRoot={libraryRoot} theme={theme} onTheme={setTheme} onCreate={createSubject} onOpen={openSubject} />}
    </div>
    <footer className="statusbar"><span>{status}</span>{boot && <button onClick={() => setSettings(true)}>设置 · {boot.version}</button>}</footer>
    {settings && boot && <Settings boot={boot} onClose={() => setSettings(false)} onSwitch={() => { void saveBeforeLifecycleChange().then(() => { setSettings(false); setSwitching(true); }).catch((e) => setStatus(errorText(e))); }} />}
    {switching && boot && <div className="modal-backdrop"><LibrarySetup boot={boot} onReady={acceptBoot} onCancel={() => setSwitching(false)} /></div>}
  </div>;
}
