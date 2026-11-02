import type { NodeRecord, NodeSnapshot, Relation, Stage, TreeLayout } from "../src/types";
/** Isolated in-memory adapter for interaction acceptance. Never opens a real library. */
export function previewStore(data: { layout: TreeLayout; stages: Stage[] }) {
  const nodes: NodeRecord[] = data.layout.nodes.map((node) => ({ ...node, tags: [], status: "active", created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" }));
  const stages = structuredClone(data.stages), relations: Relation[] = [], documents: Record<string, string> = {};
  for (const node of nodes) documents[node.id] = `# ${node.title}\n\n从问题出发，把概念、原理与应用连接起来。\n\n## 学习目标\n\n- 理解核心概念与适用场景\n- 能用自己的话解释工作原理\n- 建立与已有知识的联系\n\n## 核心概念\n\n知识并非孤立的结论。阅读时记录 **为什么**、**如何实现**，以及还没有解决的问题。\n\n> 学习提示：合上笔记后，尝试用三句话复述本节内容。\n\n## 对比与联系\n\n| 学习方式 | 关注点 | 自检问题 |\n| --- | --- | --- |\n| 阅读笔记 | 定义与来源 | 我理解了吗？ |\n| 浏览脉络 | 前提与演化 | 它与什么相关？ |\n| 主动复习 | 推理与应用 | 我能解释吗？ |\n\n## 复习清单\n\n- [ ] 解释关键概念\n- [ ] 写出一个具体例子\n- [x] 建立学习笔记\n\n## 延伸阅读\n\n通过大纲或知识树继续探索，正文始终是学习的主体。\n\n隔离预览：修改只保存在浏览器内存。`;
  const calls: Record<string, number> = {}; let sequence = 0;
  const state = { nodes, stages, relations, documents, calls, failWrite: false, readDelay: {} as Record<string, number> };
  const invoke = async (command: string, args: Record<string, any> = {}): Promise<any> => {
    calls[command] = (calls[command] ?? 0) + 1;
    const index = nodes.findIndex((node) => node.id === args.nodeId), node = nodes[index];
    let result: unknown = null;
    if (command === "list_stages") result = stages;
    else if (command === "list_nodes") result = nodes;
    else if (command === "list_relations") result = relations;
    else if (command === "layout_subject") result = { ...data.layout, nodes: nodes.map((item) => { const original = data.layout.nodes.find((other) => other.id === item.id); const parent = data.layout.nodes.find((other) => other.id === item.parent); return { ...original, ...item, x: original?.x ?? (parent?.x ?? 0) + 20, y: original?.y ?? (parent?.y ?? 0) - 30, depth: original?.depth ?? (parent?.depth ?? 0) + 1 }; }) };
    else if (command === "subject_history") result = { ready: false, note: "隔离预览", entries: [] };
    else if (command === "read_document") { await new Promise((done) => setTimeout(done, state.readDelay[args.nodeId] ?? 0)); if (!node) throw new Error("节点不存在"); result = documents[args.nodeId]; }
    else if (command === "write_document") { if (state.failWrite) throw new Error("模拟磁盘写入失败"); if (!node) throw new Error("节点不存在"); documents[args.nodeId] = args.content; }
    else if (command === "search_nodes") result = nodes.filter((item) => `${item.title} ${documents[item.id]}`.toLowerCase().includes(args.query.toLowerCase())).map((item) => ({ node_id: item.id, title: item.title, snippet: documents[item.id].slice(0, 130), matched_in: "document" }));
    else if (command === "create_node") { const input = args.node; const id = input.id || `preview-node-${++sequence}`; if (nodes.some((item) => item.id === id)) throw new Error("ID 已存在"); result = { ...input, id, status: "active", created: new Date().toISOString(), updated: new Date().toISOString() }; nodes.push(result as NodeRecord); documents[id] = `# ${input.title}\n\n## 定义\n\n`; }
    else if (command === "update_node" || command === "update_node_facts") { if (!node) throw new Error("节点不存在"); Object.assign(node, args.node || args.facts, { updated: new Date().toISOString() }); result = node; }
    else if (command === "delete_node_undoable") { if (!node) throw new Error("节点不存在"); if (nodes.some((item) => item.parent === node.id)) throw new Error("仍有子节点"); result = { node, document: documents[node.id], relations: relations.filter((item) => item.from === node.id || item.to === node.id) }; nodes.splice(index, 1); for (let i = relations.length - 1; i >= 0; i--) if (relations[i].from === node.id || relations[i].to === node.id) relations.splice(i, 1); delete documents[node.id]; }
    else if (command === "restore_node") { const snapshot: NodeSnapshot = args.snapshot; if (nodes.some((item) => item.id === snapshot.node.id)) throw new Error("ID 冲突"); nodes.push(structuredClone(snapshot.node)); documents[snapshot.node.id] = snapshot.document; relations.push(...structuredClone(snapshot.relations)); result = snapshot.node; }
    else if (command === "create_relation") { const item = { ...args.relation, id: args.relation.id || `preview-relation-${++sequence}`, created: new Date().toISOString() }; if (item.from === item.to || relations.some((other) => other.from === item.from && other.to === item.to && other.type === item.type)) throw new Error("关系重复"); relations.push(item); result = item; }
    else if (command === "delete_relation") { const index = relations.findIndex((item) => item.id === args.relationId); if (index < 0) throw new Error("关系不存在"); relations.splice(index, 1); }
    else if (command === "create_stage") { result = { ...args.stage, type: "stage", id: `preview-stage-${++sequence}`, order: stages.length, created: new Date().toISOString(), updated: new Date().toISOString() }; stages.push(result as Stage); }
    else throw new Error(`隔离预览不支持 ${command}`);
    return structuredClone(result);
  };
  return { state, invoke };
}
