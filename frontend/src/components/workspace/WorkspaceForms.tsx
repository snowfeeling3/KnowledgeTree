import { useState, type FormEvent } from "react";
import { errorText } from "../../api";
import type { NewNodeInput, NewRelationInput, NewStageInput, UpdateNodeFactsInput, UpdateNodeInput, UpdateStageInput } from "../../api-inputs";
import { NODE_STATUSES, NODE_TYPES, RELATION_TYPES, labelOf, type NodeRecord, type Stage } from "../../types";
import { parentChoices } from "../../lib/forest";
import { Modal } from "../Modal";
export function StagePicker({ stages, onClose, onPick }: { stages: Stage[]; onClose: () => void; onPick: (stage: Stage) => void }) {
  return (
    <Modal title="选择阶段" onClose={onClose}>
      <p className="muted">有多个阶段。先选择要编辑的一个。</p>
      <div className="stage-choices">
        {stages.map((stage) => (
          <button key={stage.id} type="button" className="ghost" onClick={() => onPick(stage)}>
            <span>{stage.title}</span>
            <small>{stageYears(stage)}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function stageYears(stage: Stage): string {
  const start = stage.start ?? null;
  const end = stage.end ?? null;
  if (start == null && end == null) return "年份未填";
  if (start != null && end != null) return `${start}–${end}`;
  if (start != null) return `${start} 起`;
  return `至 ${end ?? ""}`;
}

export function StageForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (stage: NewStageInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [id, setId] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({ title, description, id: id.trim() || null, start: optionalYear(start), end: optionalYear(end), order: null });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="新建阶段" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
        <label>描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <div className="split">
          <label>起始年<input value={start} onChange={(event) => setStart(event.target.value)} inputMode="numeric" /></label>
          <label>结束年<input value={end} onChange={(event) => setEnd(event.target.value)} inputMode="numeric" /></label>
        </div>
        <label>标识（可选）<input value={id} onChange={(event) => setId(event.target.value)} placeholder="architecture" /></label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">创建</button>
      </form>
    </Modal>
  );
}

export function StageEditForm({ stage, onClose, onSubmit, onDelete }: { stage: Stage; onClose: () => void; onSubmit: (stage: UpdateStageInput) => Promise<void>; onDelete: () => Promise<void> }) {
  const [title, setTitle] = useState(stage.title);
  const [description, setDescription] = useState(stage.description);
  const [start, setStart] = useState(stage.start == null ? "" : String(stage.start));
  const [end, setEnd] = useState(stage.end == null ? "" : String(stage.end));
  const [order, setOrder] = useState(String(stage.order));
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        title,
        description,
        start: optionalYear(start),
        end: optionalYear(end),
        order: requiredInteger(order, "顺序"),
      });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function remove() {
    if (!window.confirm(`删除阶段「${stage.title}」？`)) return;
    try {
      await onDelete();
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="编辑阶段" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
        <label>描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <div className="split">
          <label>起始年<input value={start} onChange={(event) => setStart(event.target.value)} inputMode="numeric" /></label>
          <label>结束年<input value={end} onChange={(event) => setEnd(event.target.value)} inputMode="numeric" /></label>
        </div>
        <label>顺序<input value={order} onChange={(event) => setOrder(event.target.value)} inputMode="numeric" required /></label>
        <p className="muted">标识保持为 {stage.id}。时间线先按顺序，再按年份排列。仍有节点属于这个阶段时不能删除。</p>
        {error && <p className="form-error">{error}</p>}
        <div className="button-row">
          <button type="button" className="danger" onClick={() => { void remove(); }}>删除</button>
          <button type="submit">保存阶段</button>
        </div>
      </form>
    </Modal>
  );
}

export function NodeForm({ stages, nodes, onClose, onSubmit, initialParent = null, initialStage = null }: { stages: Stage[]; nodes: NodeRecord[]; onClose: () => void; onSubmit: (node: NewNodeInput) => Promise<void>; initialParent?: string | null; initialStage?: string | null }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<NewNodeInput["type"]>("concept");
  const [stage, setStage] = useState(initialStage ?? "");
  const [parent, setParent] = useState(initialParent ?? "");
  const [tags, setTags] = useState("");
  const [id, setId] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        title,
        type,
        id: id.trim() || null,
        stage: stage || null,
        parent: parent || null,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="新建节点" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus placeholder="CPU" /></label>
        <label>类型
          <select value={type} onChange={(event) => setType(event.target.value as NewNodeInput["type"])}>
            {NODE_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>阶段
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="">未分阶段</option>
            {stages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>上级节点
          <select value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">作为根节点</option>
            {nodes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔" /></label>
        <label>标识（可选）<input value={id} onChange={(event) => setId(event.target.value)} placeholder="cpu" /></label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">创建</button>
      </form>
    </Modal>
  );
}

export function FactsForm({ node, onClose, onSubmit }: { node: NodeRecord; onClose: () => void; onSubmit: (facts: UpdateNodeFactsInput) => Promise<void> }) {
  const [origin, setOrigin] = useState(node.origin ?? "");
  const [inventor, setInventor] = useState(node.inventor ?? "");
  const [organization, setOrganization] = useState(node.organization ?? "");
  const [year, setYear] = useState(node.year == null ? "" : String(node.year));
  const [purpose, setPurpose] = useState(node.purpose ?? "");
  const [problem, setProblem] = useState(node.problem ?? "");
  const [solution, setSolution] = useState(node.solution ?? "");
  const [references, setReferences] = useState((node.references ?? []).join("\n"));
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        origin: origin.trim() || null,
        inventor: inventor.trim() || null,
        organization: organization.trim() || null,
        year: optionalYear(year),
        purpose: purpose.trim() || null,
        problem: problem.trim() || null,
        solution: solution.trim() || null,
        references: references.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="来源属性" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="split">
          <label>来源<input value={origin} onChange={(event) => setOrigin(event.target.value)} /></label>
          <label>年份<input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" /></label>
        </div>
        <div className="split">
          <label>发明者<input value={inventor} onChange={(event) => setInventor(event.target.value)} autoFocus /></label>
          <label>组织<input value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
        </div>
        <label>目的<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} /></label>
        <label>问题<textarea value={problem} onChange={(event) => setProblem(event.target.value)} rows={2} /></label>
        <label>方案<textarea value={solution} onChange={(event) => setSolution(event.target.value)} rows={2} /></label>
        <label>引用<textarea value={references} onChange={(event) => setReferences(event.target.value)} rows={3} placeholder="每行一条" /></label>
        <p className="muted">这些属性写在节点文件里，不会改 Markdown，也不会改树上的位置。</p>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">保存属性</button>
      </form>
    </Modal>
  );
}

export function StructureForm({ node, stages, nodes, onClose, onSubmit }: { node: NodeRecord; stages: Stage[]; nodes: NodeRecord[]; onClose: () => void; onSubmit: (update: UpdateNodeInput) => Promise<void> }) {
  const [title, setTitle] = useState(node.title);
  const [type, setType] = useState<NodeRecord["type"]>(node.type);
  const [stage, setStage] = useState(node.stage ?? "");
  const [parent, setParent] = useState(node.parent ?? "");
  const [status, setStatus] = useState<NodeRecord["status"]>(node.status);
  const [tags, setTags] = useState(node.tags.join(", "));
  const [error, setError] = useState("");
  const choices = parentChoices(nodes, node.id);
  const parentKnown = choices.some((item) => item.id === parent);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        title,
        type,
        stage: stage || null,
        parent: parent || null,
        status,
        tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="编辑结构" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>名称<input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
        <label>类型
          <select value={type} onChange={(event) => setType(event.target.value as NodeRecord["type"])}>
            {NODE_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>状态
          <select value={status} onChange={(event) => setStatus(event.target.value as NodeRecord["status"])}>
            {NODE_STATUSES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>阶段
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="">未分阶段</option>
            {stages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>上级节点
          <select value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">作为根节点</option>
            {parent && !parentKnown && <option value={parent}>{nodes.find((item) => item.id === parent)?.title ?? parent}</option>}
            {choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔" /></label>
        <p className="muted">标识保持为 {node.id}。正文，以及发明者、组织、年份等属性都不会被这次修改清掉。</p>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">保存结构</button>
      </form>
    </Modal>
  );
}

export function RelationForm({ nodes, onClose, onSubmit, initialFrom }: { nodes: NodeRecord[]; onClose: () => void; onSubmit: (relation: NewRelationInput) => Promise<void>; initialFrom?: string }) {
  const [from, setFrom] = useState(initialFrom ?? nodes[0]?.id ?? "");
  const [to, setTo] = useState(nodes[1]?.id ?? nodes[0]?.id ?? "");
  const [type, setType] = useState<NewRelationInput["type"]>("contains");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({ from, to, type, id: null, note: null });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Modal title="新建关系" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>起点
          <select value={from} onChange={(event) => setFrom(event.target.value)}>
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
          </select>
        </label>
        <label>类型
          <select value={type} onChange={(event) => setType(event.target.value as NewRelationInput["type"])}>
            {RELATION_TYPES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>终点
          <select value={to} onChange={(event) => setTo(event.target.value)}>
            {nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
          </select>
        </label>
        <p className="muted">{labelOf(RELATION_TYPES, type)}是有向关系，不会改写 Markdown。</p>
        {error && <p className="form-error">{error}</p>}
        <button type="submit">建立</button>
      </form>
    </Modal>
  );
}

function optionalYear(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) throw new Error("年份必须是整数");
  return Number(trimmed);
}

function requiredInteger(value: string, label: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) throw new Error(`${label}必须是整数`);
  return Number(trimmed);
}
