import { api } from "../../api";
import { inheritedStage } from "../../interaction/NavigationController";
import type { WorkspaceController } from "../../workspace/useWorkspaceController";
import { StageForm, StageEditForm, StagePicker, NodeForm, RelationForm, StructureForm, FactsForm } from "./WorkspaceForms";
export function WorkspaceModals({ c }: { c: WorkspaceController }) {
  const close = () => { c.setModal(null); c.setEditingStageId(null); };
  const stage = c.data.stages.find((stage) => stage.id === c.editingStageId);
  return <>
    {c.modal === "stage" && <StageForm onClose={close} onSubmit={c.createStage} />}
    {c.modal === "pick-stage" && <StagePicker stages={c.data.stages} onClose={close} onPick={(stage) => { c.setEditingStageId(stage.id); c.setModal("edit-stage"); }} />}
    {c.modal === "edit-stage" && stage && <StageEditForm stage={stage} onClose={close} onSubmit={async (input) => { const updated = await api.updateStage(c.subject.id, stage.id, input); c.data.setStages((all) => all.map((item) => item.id === stage.id ? updated : item)); c.report("已更新阶段"); }} onDelete={async () => { await api.deleteStage(c.subject.id, stage.id); c.data.setStages((all) => all.filter((item) => item.id !== stage.id)); c.setStageFilter(null); c.report("已删除阶段"); }} />}
    {c.modal === "node" && <NodeForm stages={c.data.stages} nodes={c.data.nodes} initialParent={c.selectedId} initialStage={inheritedStage(c.selectedId, c.data.nodes) ?? c.stageFilter} onClose={close} onSubmit={async (input) => { await c.actions.create(input); }} />}
    {c.modal === "relation" && <RelationForm nodes={c.data.nodes} initialFrom={c.selectedId ?? undefined} onClose={close} onSubmit={async (input) => { await c.actions.relation(input); }} />}
    {c.modal === "structure" && c.selected && <StructureForm key={c.selected.id} node={c.selected} stages={c.data.stages} nodes={c.data.nodes} onClose={close} onSubmit={(input) => c.actions.update(c.selected!.id, input)} />}
    {c.modal === "facts" && c.selected && <FactsForm key={c.selected.id} node={c.selected} onClose={close} onSubmit={(input) => c.actions.facts(c.selected!.id, input)} />}
  </>;
}
