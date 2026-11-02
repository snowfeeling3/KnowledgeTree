import { minimapFrame } from "../../lib/camera";
import type { TreeSceneGraph } from "../../lib/tree-scene";

export function TreeMinimap({ scene, selectedId, onCenter }: { scene: TreeSceneGraph; selectedId: string | null; onCenter: (x: number, y: number) => void }) {
  const points = scene.illustration ? [scene.illustration.skeleton.root, ...scene.illustration.skeleton.slots.filter((slot) => slot.level <= 2).map((slot) => slot.point)] : scene.nodes.map((node) => node.point);
  const frame = minimapFrame(points);
  const project = (x: number, y: number) => ({ x: 12 + (x - frame.minX) * frame.scale, y: 10 + (y - frame.minY) * frame.scale });
  return (
    <svg className="tree-minimap" viewBox="0 0 128 102" aria-label="知识树缩略图" onPointerDown={(event) => {
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width * 128 - 12) / frame.scale + frame.minX;
      const y = ((event.clientY - bounds.top) / bounds.height * 102 - 10) / frame.scale + frame.minY;
      onCenter(x, y);
    }}>
      {scene.illustration && scene.branches.filter((branch) => branch.role !== "twig").map((branch) => <path key={branch.id} d={branch.path} transform={`translate(${12 - frame.minX * frame.scale} ${10 - frame.minY * frame.scale}) scale(${frame.scale})`} fill="none" stroke="var(--primary)" strokeWidth={branch.widthBase} />)}
      {scene.nodes.filter((node) => !scene.illustration || !node.grouped).map((node) => {
        const point = project(node.point.x, node.point.y);
        return <circle key={node.id} className={node.id === selectedId ? "is-selected" : undefined} cx={point.x} cy={point.y} r={node.depth <= 1 ? 2.2 : 1.25} />;
      })}
    </svg>
  );
}
