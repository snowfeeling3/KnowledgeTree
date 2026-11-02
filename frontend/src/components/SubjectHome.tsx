import { useState, type FormEvent } from "react";
import type { Subject } from "../types";
import { MenuBar, type MenuGroup } from "./MenuBar";
import { THEMES, type ThemeName } from "./ThemeSwitch";

type Props = {
  subjects: Subject[];
  libraryRoot: string;
  theme: ThemeName;
  onTheme: (theme: ThemeName) => void;
  onCreate: (title: string, description: string, id: string) => Promise<void>;
  onOpen: (subject: Subject) => void;
};

export function SubjectHome({ subjects, libraryRoot, theme, onTheme, onCreate, onOpen }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [id, setId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const menus: MenuGroup[] = [
    {
      id: "file",
      label: "文件",
      items: [
        {
          id: "library",
          label: libraryRoot ? "当前知识库" : "尚未连接桌面端",
          detail: libraryRoot || "请在仓库根目录运行 pnpm dev",
          disabled: true,
        },
      ],
    },
    {
      id: "theme",
      label: "主题",
      items: THEMES.map(([value, label]) => ({
        id: value,
        label,
        checked: theme === value,
        keepOpen: true,
        onSelect: () => onTheme(value),
      })),
    },
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onCreate(title, description, id);
      setTitle("");
      setDescription("");
      setId("");
    } catch {
      setError("学科创建失败，请检查知识库连接与名称后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="home-shell">
      <MenuBar groups={menus} extra={<span>选择一个学科开始</span>} />
      <main className="home" id="main-content" tabIndex={-1}>
        <section className="hero home-hero">
          <div>
            <p className="home-wordmark" translate="no">Knowledge Tree</p>
            <h1>让知识以脉络的方式生长</h1>
            <p>将时间、概念与来源组织成可探索的知识地图。每个学科独立保存，Markdown 与演化关系始终在你的电脑上。</p>
          </div>
          <div className="library-stat" title={libraryRoot || undefined}>
            <span>{libraryRoot ? "本地知识库" : "知识库概览"}</span>
            <strong>{subjects.length}</strong><em>个学科</em>
          </div>
        </section>
        <section className="home-grid">
          <form className="card create-card" onSubmit={submit}>
            <p className="card-kicker">开始一张新地图</p>
            <h2>新建学科</h2>
            <label>名称<input name="subject-title" autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="例如：计算机科学…" /></label>
            <label>描述<textarea name="subject-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="这门学科为什么值得被整理成演化树" /></label>
            <label>标识（可选）<input name="subject-id" autoComplete="off" spellCheck={false} value={id} onChange={(event) => setId(event.target.value)} placeholder="例如：computer-science…" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" disabled={pending} aria-busy={pending}>{pending ? "正在建立…" : "建立知识地图"}</button>
            <p className="form-note">创建后可继续添加发展阶段、节点和关系。</p>
          </form>
          <div className="library-panel">
            <div className="library-panel-head"><div><p className="card-kicker">你的知识库</p><h2>继续探索</h2></div><span>{subjects.length} 个学科</span></div>
            <div className="subject-list">
            {subjects.length === 0 && <div className="empty-card"><span className="empty-orb">+</span><strong>第一棵树等待发芽</strong><p>创建第一个学科，把概念、来源和发展脉络连接起来。</p></div>}
            {subjects.map((subject) => (
              <button key={subject.id} type="button" className="subject-card" onClick={() => onOpen(subject)}>
                <span className="subject-monogram" aria-hidden="true">{Array.from(subject.title)[0] || "知"}</span>
                <span className="subject-copy"><strong>{subject.title}</strong><span>{subject.description || "暂无描述"}</span><small>{subject.id}</small></span>
                <svg className="subject-arrow" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
