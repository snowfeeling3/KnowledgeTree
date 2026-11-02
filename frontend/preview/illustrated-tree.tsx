import { LibrarySetup } from "../src/lifecycle/LibrarySetup";
import { SubjectHome } from "../src/components/SubjectHome";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TreeView } from "../src/components/TreeView";
import { Workspace } from "../src/components/Workspace";
import { illustratedFixture } from "../src/lib/illustrated-tree.fixture";
import type { TreeLayoutMode } from "../src/lib/illustrated-tree-layout";
import type { Stage, TreeLayout } from "../src/types";
import "../src/styles.css";
import { previewStore } from "./PreviewStore";

const fixture = illustratedFixture();
type PreviewData = { layout: TreeLayout; stages: Stage[]; title?: string };
function Preview({ data = fixture }: { data?: PreviewData }) {
  const [selectedId, select] = useState<string | null>(null);
  const [mode, setMode] = useState<TreeLayoutMode>("illustrated");
  const [theme, setTheme] = useState("light");
  return <main data-theme={theme} style={{ height: "100%", display: "grid", gridTemplateRows: "58px minmax(0, 1fr)", background: "var(--canvas)" }}>
    <header style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 24px", borderBottom: "1px solid var(--border)", color: "var(--fg)" }}><strong style={{ flexShrink: 0 }}>Knowledge Tree · 插画布局预览</strong>
      <select aria-label="布局" value={mode} onChange={(event) => setMode(event.target.value as TreeLayoutMode)}><option value="illustrated">插画知识树</option><option value="legacy">传统树布局</option></select>
      <select aria-label="主题" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="light">Light</option><option value="everforest">Everforest</option><option value="dark">Dark</option></select>
      <span style={{ color: "var(--muted)", fontSize: 12, flexShrink: 0 }}>{data.layout.nodes.length} 项知识 · 滚轮缩放，点击枝条探索</span>
    </header>
    <TreeView key={mode} layout={data.layout} stages={data.stages} subjectTitle={data.title || "计算机科学"} layoutMode={mode} selectedId={selectedId} onSelect={select} stageFilter={null} resetSignal={0} />
  </main>;
}

/** Browser-only adapter: exercise the real workspace without writing to a library. */
function WorkspacePreview({ data }: { data: PreviewData }) {
  const [theme, setTheme] = useState<"light" | "everforest" | "dark">("light");
  const [status, setStatus] = useState("");
  useState(() => { const store = previewStore(data); Object.assign(window, { __TAURI_INTERNALS__: { invoke: store.invoke }, __UX_PREVIEW__: store.state }); return store; });
  document.documentElement.dataset.theme = theme;
  return <main style={{ height: "100%", display: "grid", gridTemplateRows: "minmax(0, 1fr) 24px" }}>
    <Workspace subject={{ id: "preview", title: data.title || "计算机科学", type: "subject", format_version: 1, description: "", created: "", updated: "" }} theme={theme} onTheme={setTheme} onBack={() => { location.href = "illustrated-tree-preview.html"; }} onStatus={setStatus} />
    <div style={{ color: "var(--muted)", fontSize: 11, paddingLeft: 12 }}>隔离内存预览 · {status}</div>
  </main>;
}

function HomePreview() {
  const [theme, setTheme] = useState<"light" | "everforest" | "dark">("light");
  const [subjects, setSubjects] = useState(["计算机科学", "人工智能", "数学与逻辑"].map((title, i) => ({ id: `subject-${i}`, type: "subject", format_version: 1, title, description: ["从计算基础到软件系统，连接技术背后的思想。", "整理机器学习、语言模型与智能体的知识脉络。", "记录定义、证明，以及它们之间的联系。"][i], created: "", updated: "" })));
  document.documentElement.dataset.theme = theme;
  return <SubjectHome subjects={subjects} libraryRoot="隔离预览知识库" theme={theme} onTheme={setTheme} onCreate={async (title, description, id) => { setSubjects(prev => [...prev, { id: id || `preview-${prev.length}`, title, description, type: "subject", format_version: 1, created: "", updated: "" }]); }} onOpen={() => { location.href = "illustrated-tree-preview.html?workspace"; }} />;
}

function render(data: PreviewData) {
  createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("setup") ? <main className="welcome-shell" style={{ height: "100%" }}><LibrarySetup boot={{ version: "0.1.1", ready: false, library_path: null, recommended_path: "D:\\KnowledgeTree", config_directory: "", source: "default", error: null, preferences: {}, import_legacy_preferences: false }} onReady={async () => {}} /></main> : new URLSearchParams(location.search).has("home") ? <HomePreview /> : new URLSearchParams(location.search).has("workspace") ? <WorkspacePreview data={data} /> : <Preview data={data} />);
}

const dataUrl = new URLSearchParams(location.search).get("data");
if (dataUrl) {
  fetch(dataUrl).then((response) => response.json()).then(render);
} else render(fixture);

