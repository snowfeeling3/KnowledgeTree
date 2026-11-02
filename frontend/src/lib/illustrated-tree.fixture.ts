import type { LayoutNode, Stage, TreeLayout } from "../types";

/** Dense sample exercises summaries; titles also serve the local visual preview. */
export function illustratedFixture(stageCount = 8, domainCount = 7): { layout: TreeLayout; stages: Stage[] } {
  const names = ["计算基础", "计算机组成", "操作系统", "编程语言", "网络与 Web", "数据库", "云与分布式", "人工智能"];
  const topics = ["计算模型", "存储与检索", "系统设计", "通信协议", "数据处理", "软件架构", "工程实践"];
  const technologies = ["Transformer", "向量检索", "消息队列", "容器运行时", "B+ Tree", "并发控制", "类型系统"];
  const stages: Stage[] = Array.from({ length: stageCount }, (_, index) => ({
    id: `stage-${index}`, title: names[index % names.length], order: index, type: "stage", description: "", created: "", updated: "",
  }));
  const nodes: LayoutNode[] = [{ id: "subject", title: "计算机科学", type: "concept", depth: 0, x: 0, y: 0 }];
  const add = (id: string, title: string, depth: number, parent: string, stage: string, type: LayoutNode["type"] = "concept") => {
    nodes.push({ id, title, depth, parent, stage, type, x: depth * 100, y: nodes.length * 40 });
  };
  stages.forEach((stage, s) => {
    add(stage.id, stage.title, 1, "subject", stage.id);
    for (let d = 0; d < domainCount; d += 1) {
      const domain = `${stage.id}-d${d}`;
      add(domain, topics[(d + s) % topics.length], 2, stage.id, stage.id);
      const topic = `${domain}-topic`;
      add(topic, "原理与应用", 3, domain, stage.id);
      for (let t = 0; t < 6; t += 1) {
        const tech = `${domain}-tech${t}`;
        add(tech, technologies[(t + s + d) % technologies.length], 4, topic, stage.id, "technology");
        for (let c = 0; c < 3; c += 1) add(`${tech}-c${c}`, ["核心思想", "实现细节", "应用场景"][c], 5, tech, stage.id);
      }
    }
  });
  return { stages, layout: { nodes, edges: nodes.filter((node) => node.parent).map((node) => ({ from: node.parent!, to: node.id, kind: "parent" })), width: 1000, height: 1000 } };
}
