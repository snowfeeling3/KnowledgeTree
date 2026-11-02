import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { errorText } from "../api";
import { lifecycleApi, type BootStatus, type UpdateStatus } from "./api";
import { saveBeforeLifecycleChange } from "./saving";
const labels: Record<string, string> = { unconfigured: "尚未配置发布源，当前使用本地安装更新", idle: "可以检查更新", checking: "正在检查…", available: "发现新版本", current: "当前已是最新版本", failed: "检查未完成，可继续离线使用", downloading: "正在下载并验证…", downloaded: "更新已下载并通过签名验证", installing: "正在安装…" };
export function Settings({ boot, onSwitch, onClose }: { boot: BootStatus; onSwitch: () => void; onClose: () => void }) {
  const [update, setUpdate] = useState<UpdateStatus | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    void lifecycleApi.updates().then((state) => { if (!disposed) setUpdate(state); }).catch((e) => setError(errorText(e)));
    void listen<UpdateStatus>("knowledge-tree-update", (event) => { if (!disposed) setUpdate(event.payload); }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  async function action(run: () => Promise<void>) { setBusy(true); setError(""); try { await run(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <div className="modal-backdrop"><section className="modal lifecycle-settings" role="dialog" aria-modal="true" aria-label="软件设置" onKeyDown={(e) => e.stopPropagation()}>
    <header className="modal-head"><h2>软件设置</h2><button disabled={busy} onClick={onClose} aria-label="关闭">×</button></header>
    <h3>知识库与数据</h3><p className="settings-path">{boot.library_path}</p><p className="form-note">应用配置：{boot.config_directory}</p>
    <div className="setup-actions"><button disabled={busy || boot.source === "environment"} onClick={onSwitch}>切换知识库</button><button disabled={busy || !boot.ready} onClick={() => void action(async () => { await saveBeforeLifecycleChange(); setNotice(`完整备份已验证：${await lifecycleApi.backup()}`); })}>创建完整备份</button></div>
    <h3>版本与更新</h3><p>当前版本 {boot.version}{update?.version && ` · 最新版本 ${update.version}`}</p><p role="status">{labels[update?.phase ?? "idle"]}</p>
    {update?.notes && <pre className="update-notes">{update.notes}</pre>}
    {update?.phase === "downloading" && <><progress value={update.downloaded} max={update.total ?? undefined} /><p>{(update.downloaded / 1048576).toFixed(1)} MB{update.total ? ` / ${(update.total / 1048576).toFixed(1)} MB` : ""}</p></>}
    <div className="setup-actions"><button disabled={busy || ["checking", "downloading", "installing"].includes(update?.phase ?? "")} onClick={() => void action(async () => { setUpdate(await lifecycleApi.check(true)); })}>检查更新</button>
      {update?.phase === "available" && <button disabled={busy} onClick={() => void action(async () => { setUpdate(await lifecycleApi.download()); })}>下载更新</button>}
      {update?.phase === "downloaded" && <button disabled={busy} onClick={() => setConfirm(true)}>安装并重启…</button>}</div>
    {confirm && <div className="update-confirm"><p>安装将关闭应用并重新启动。继续前会保存正文、属性和设置并验证完整备份；保存或备份失败将取消安装。</p><button disabled={busy} onClick={() => setConfirm(false)}>取消</button><button disabled={busy} onClick={() => void action(async () => { await saveBeforeLifecycleChange(); await lifecycleApi.backup(); await lifecycleApi.install(); })}>确认保存并安装</button></div>}
    {(error || update?.error) && <p className="form-error" role="alert">{error || update?.error}</p>}{notice && <p className="settings-path" role="status">{notice}</p>}
  </section></div>;
}
