# UX / Interaction Optimization

本文记录 0.1.0 的编辑交互验收；当前 0.1.1 启动与更新机制见 [技术说明](安装与更新技术说明.md)。

实施日期：2026-10-06。按 P0 → P1 → P2 推进，每个阶段执行前端构建（含 `tsc --noEmit`）与现有测试。知识记录仍使用原 YAML / Markdown 格式，插画布局与传统布局均保留。

## 初始审查

| 路径 / 状态 | 改造前的问题 | 当前行为 |
| --- | --- | --- |
| Search | 返回列表，缺少方向键、定位和请求过期保护 | Ctrl+F 实时结果，方向键选中，Enter 定位并 Focus，Ctrl+Enter 打开正文 |
| Node 创建 | 每次填写完整表单，重复选择阶段与上级 | N / Shift+N 只填标题，继承阶段、上级和默认模板 |
| Stage 创建 | 完整表单属于低频路径 | 保留知识菜单中的完整表单与原校验 |
| 编辑与保存 | 重命名需弹窗；手动保存会刷新整树并恢复视野 | F2 行内重命名；Markdown / 属性 750ms 自动保存；Ctrl+S 立即 flush |
| 点击 / 双击 | 树、集合列表和索引的打开行为不一致 | 单击选择并 Peek，节点图形双击 Focus，标题双击 Rename |
| Hover | 即时提示，内容有限 | 延迟 400ms，展示标题、说明、阶段、子节点与关系数量；不改变选择 |
| Collapse / Expand | 主要依赖小按钮 | Space 与上下文菜单；大纲和树投影共享折叠状态 |
| DocumentPane | 正文点击会意外进入编辑 | Enter / 打开按钮进入 Open；浏览正文点击保持阅读 |
| Palette / 键盘 | 缺少命令面板，快捷键有限 | Ctrl+K 模糊命令与节点操作；输入和 IME 上下文保护 |
| Context Menu | 无节点上下文菜单 | Open、Focus、Child、Sibling、Rename、Properties、Relation、Move、Collapse、Copy ID、Delete；隐藏不支持的操作 |
| 面板 | 只有开关，缺少临时预览和固定状态 | Closed / Peek / Open / Pinned，记忆宽度与固定状态 |
| Focus / Selection | 选择高亮，缺少独立分枝聚焦 | 分离 selected / focused / hovered；保留祖先、后代与直接相关知识，降低其余区域透明度 |
| Breadcrumb | 无路径导航 | 学科、阶段与祖先路径；深路径折叠中段，每一级可点击 |
| Drag & Drop | 无 | 编辑模式：节点→节点换上级，节点→阶段换阶段，Shift 拖拽建立关系；松开前显示操作与合法性 |
| Undo / Redo | Git 记录不能替代交互撤销 | 创建、重命名、移动、上级、关系创建/删除、叶节点删除可撤销/重做，最多 50 项 |
| Recent / 偏好 | 无最近访问和完整工作区记忆 | 最近 20 个节点；保存选择、Focus、模式、面板、宽度与布局对应的相机 |

## 操作约定

| 快捷键 | 行为 |
| --- | --- |
| Ctrl+F | 搜索标题、阶段、标签、正文及关系；结果显示类型、语义层级、阶段与路径 |
| Ctrl+K | 命令面板：节点 Open / Focus / Child / Relations、同级创建、关系创建、阶段、主题、面板、适应整树、模式、Undo / Redo；输入 `recent` 访问最近节点 |
| N / Shift+N | 快速创建子节点 / 同级节点；无选中节点时使用当前阶段或根位置 |
| F2 | 重命名；Enter 保存，Escape 取消，失焦统一保存 |
| F / Enter / Space | Focus / 打开正文 / 折叠与展开 |
| Escape | 关闭当前输入浮层；否则退出 Focus 并关闭临时 Peek，不关闭固定面板 |
| Delete | 删除叶节点并提供撤销；有子节点的删除在菜单隐藏，并在业务层与后端拒绝 |
| Ctrl+E | 浏览 / 编辑模式切换 |
| Ctrl+S | 立即保存待提交的正文与属性 |
| Ctrl+Z / Ctrl+Shift+Z | 撤销 / 重做结构操作；文本输入中保留编辑器自身的撤销 |

普通字母快捷键不会截获 Markdown、表单、搜索输入或 IME。编辑控件在浏览模式隐藏；N、F2、右键编辑等明确编辑意图会进入编辑模式。拖拽在编辑模式启用。

## 模块边界

- `Workspace.tsx` 仅导出组合组件，`components/workspace/WorkspaceShell.tsx` 组合界面。菜单、旧完整表单、弹窗和浮层分别管理。
- `workspace/useWorkspaceController.ts` 连接选择、导航、面板与命令；`useWorkspaceData.ts` 分开结构读取与普通属性更新。
- `commands/` 管理命令与快捷键；`search/` 管理搜索索引和搜索界面；`interaction/` 管理公共节点事件、导航与拖拽。
- `panels/` 管理状态、路径、宽度及属性编辑；`node-actions/` 管理快速创建、重命名、上下文菜单与数据操作。
- `history/UndoManager.ts` 串行执行撤销操作，失败不丢弃历史，新的操作清空 redo。
- `DocumentSaveQueue.ts` 为每个节点缓存独立草稿、串行写入、处理写入期间继续编辑与失败重试。一份草稿失败不会阻止其他草稿保存。
- `SaveCoordinator.ts` 汇总正文与属性 flush。创建、删除、移动、Undo / Redo 先 flush，再进入结构操作队列，避免属性自动保存与历史队列互相等待。

SceneGraph 的输入仍是结构数据。搜索、hover、selection、Focus、面板、命令面板、正文保存、标题与普通属性更新只改变 UI 或投影。标题修改在投影层重新校验标签宽度与碰撞；相机不会因保存或重命名自动 fit。只有节点插入/删除、parent / stage 修改及阶段结构更新读取布局。

插画布局继续使用 12–16 / 28 / 50 的标签预算。Focus 或非常近的视图在独立详情层展开概念、下级知识与说明，避免把所有知识转为常驻标签。详细关系可从正文面板继续导航。

## 数据与恢复

`delete_node_undoable` 返回原节点、正文和相关关系的快照；`restore_node` 恢复原 ID、时间戳、所有属性、Markdown 与关系 ID。恢复前校验父节点、阶段、端点、重复关系和所有目标文件；冲突不会覆盖后来创建的文件。失败时保留撤销记录。撤销栈限当前会话，Git 提交历史仍独立保留。

未保存正文与属性另存本机草稿缓存；成功保存后清理。正文恢复发现磁盘内容发生变化时保留草稿并显示失败/恢复提示，由 Ctrl+S 明确保存。正常切换节点与面板不会丢失正在编辑的草稿。

P3 本轮仅落实 Recent 与工作区记忆。`LearningTrailSink` 保留访问路径记录接口；Learning Trail UI 和自定义快捷键设置留到后续。

## 验收与复现

- 前端：43 项测试通过；构建含 TypeScript 检查。
- Rust：19 项测试通过，包含完整删除恢复、冲突保护、无子节点删除约束与缺失关系端点的恢复预检。
- `scripts/check-ux-interactions.cjs`：全部七条核心流程通过；额外覆盖保存失败/重试、正文搜索、模糊命令、阅读模式、Peek / Open / Pin、属性与基本元数据保存、未完成属性保存时创建/删除、拖拽防环、关系 Undo / Redo、移动到阶段、偏好恢复。
- `scripts/check-illustrated-workspace.cjs`：默认标签数量、集合探索、正文打开与新旧布局切换回归。
- 性能断言直接比较 DOM 中的 `data-scene-generation` 和隔离适配器的 `layout_subject` 调用次数，验证交互不重建 SceneGraph，避免只比较可重复的 revision 字符串。

运行 Vite 后，在已提供 Playwright 的 Node 环境运行两个浏览器脚本。工作区预览使用 `frontend/preview/PreviewStore.ts` 的可写内存适配器，所有变更与模拟错误只作用于隔离的浏览器数据，不写入实际知识库。`artifacts/ux-interaction-check.json` 保存详细结果，`ux-overview.png`、`ux-focus-edit.png` 与 `ux-properties-and-outline.png` 保存界面截图。

当前正式版本为 **0.1.0**。2026-10-08 已将最新 UX 程序统一为 `target/release/knowledge-tree-desktop.exe`，并清理旧版程序副本。程序内置前端资源，不依赖开发服务器。
