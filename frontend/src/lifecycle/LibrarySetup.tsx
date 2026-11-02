import { useState } from "react";
import { errorText } from "../api";
import { lifecycleApi, type BootStatus } from "./api";
export function LibrarySetup({ boot, onReady, onCancel }: { boot: BootStatus; onReady: (status: BootStatus) => Promise<void>; onCancel?: () => void }) {
  const [path, setPath] = useState(boot.library_path ?? boot.recommended_path), [create, setCreate] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(boot.error ?? "");
  async function browse() { try { const chosen = await lifecycleApi.chooseFolder(); if (chosen) setPath(chosen); } catch (e) { setError(errorText(e)); } }
  async function connect() { setBusy(true); setError(""); try { await onReady(await lifecycleApi.configure(path, create)); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <section className="library-setup card" role={onCancel ? "dialog" : undefined} aria-label="知识库设置">
    <p className="eyebrow">Knowledge Tree · {boot.version}</p><h1>{onCancel ? "切换知识库" : "让第一棵知识树发芽"}</h1>
    <p>知识、笔记和附件保存在你的电脑上。选择一个目录，开始记录或继续探索。</p>
    <div className="setup-choices"><button type="button" disabled={busy} aria-pressed={create} onClick={() => setCreate(true)}>创建新知识库</button><button type="button" disabled={busy} aria-pressed={!create} onClick={() => setCreate(false)}>打开已有知识库</button></div>
    <label>本地存储位置<input aria-label="知识库路径" value={path} disabled={busy} onChange={(e) => setPath(e.target.value)} /></label>
    <button type="button" disabled={busy} onClick={() => void browse()}>选择文件夹…</button>
    <p className="form-note">{create ? "请选择空目录或填写新目录路径。非空目录不会被覆盖。" : "选择包含学科文件夹的知识库根目录。原文件和 Git 历史保留在原位置。"}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="setup-actions">{onCancel && <button disabled={busy} onClick={onCancel}>取消</button>}<button type="button" disabled={busy || !path.trim() || boot.source === "environment" || boot.source === "configuration-error"} onClick={() => void connect()}>{busy ? "正在验证…" : "验证并进入"}</button></div>
    {boot.source === "environment" && <p>本次路径由环境变量指定。请移除环境变量并重新启动后再选择目录。</p>}
    {boot.source === "configuration-error" && <p>请关闭另一实例，或修复原配置后重新启动。不会覆盖已有配置。</p>}
  </section>;
}
