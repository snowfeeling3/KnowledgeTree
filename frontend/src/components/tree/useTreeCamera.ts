import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { centerCameraOn, DEFAULT_CAMERA, fitCameraToPoints, panCamera, zoomCameraAt, type CameraState, type Viewport } from "../../lib/camera";
import type { TreeSceneGraph } from "../../lib/tree-scene";
import { DENSITY, openingScaleCap } from "../../lib/tree-density";
import { readPreference, writePreference } from "../../panels/PanelState";
import type { NavigationRequest } from "../../interaction/NavigationController";

export function useTreeCamera(scene: TreeSceneGraph | null, resetSignal: number, persistenceKey?: string, navigation?: NavigationRequest | null) {
  const hostRef = useRef<HTMLDivElement>(null);
  const savedCamera = useRef(persistenceKey ? readPreference<CameraState | null>(`kt-camera:${persistenceKey}`, null) : null);
  const [camera, setCamera] = useState<CameraState>(savedCamera.current ?? DEFAULT_CAMERA);
  const initialized = useRef(Boolean(savedCamera.current)), previousReset = useRef(resetSignal);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const processedNavigation = useRef<number | null>(null);
  const drag = useRef<{ px: number; py: number; camera: CameraState } | null>(null);

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || !scene || scene.nodes.length === 0) {
      setCamera(DEFAULT_CAMERA);
      return;
    }
    const visible = scene.nodes.filter((node) => !node.grouped);
    if (scene.illustration || scene.mode === "mindmap") {
      const { left, right, top, bottom } = scene.bounds;
      setCamera(fitCameraToPoints([{ x: left, y: top }, { x: right, y: bottom }], { width: host.clientWidth, height: host.clientHeight }, { minScale: 0.06, maxScale: scene.mode === "mindmap" ? 1 : 0.61 }));
      return;
    }
    const structural = visible.filter((node) => node.rank === "root" || node.rank === "stage" || node.rank === "domain" || node.rank === "topic");
    const framed = structural.length > 0 ? structural : visible;
    setCamera(fitCameraToPoints(framed.map((node) => node.point), { width: host.clientWidth, height: host.clientHeight }, {
      minScale: DENSITY.opening.fitMinScale,
      maxScale: openingScaleCap(visible.length),
    }));
  }, [scene]);

  useEffect(() => {
    if (!scene) return;
    if (initialized.current && previousReset.current === resetSignal) return;
    const frame = window.requestAnimationFrame(() => { initialized.current = true; previousReset.current = resetSignal; fit(); });
    return () => window.cancelAnimationFrame(frame);
  }, [fit, resetSignal]);

  useEffect(() => {
    if (scene?.mode !== "mindmap" || navigation) return;
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [scene, fit, navigation]);

  useEffect(() => {
    if (!persistenceKey) return;
    const timer = setTimeout(() => writePreference(`kt-camera:${persistenceKey}`, camera), 250);
    return () => clearTimeout(timer);
  }, [camera, persistenceKey]);
  useEffect(() => {
    if (!navigation || !scene || processedNavigation.current === navigation.sequence) return;
    const node = scene.nodes.find((item) => item.id === navigation.id), host = hostRef.current;
    if (!node || !host) return;
    processedNavigation.current = navigation.sequence;
    setCamera((current) => {
      const sx = node.point.x * current.scale + current.x, sy = node.point.y * current.scale + current.y;
      if (navigation.kind === "jump" && sx > 48 && sx < host.clientWidth - 48 && sy > 64 && sy < host.clientHeight - 64) return current;
      return centerCameraOn({ ...current, scale: navigation.kind === "focus" ? Math.max(current.scale, 1.1) : current.scale }, { width: host.clientWidth, height: host.clientHeight }, node.point.x, node.point.y);
    });
  }, [navigation, scene]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = host.getBoundingClientRect();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setCamera((current) => zoomCameraAt(current, event.clientX - bounds.left, event.clientY - bounds.top, factor, scene?.illustration || scene?.mode === "mindmap" ? 0.06 : 0.35));
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [scene?.mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let lastSize: Viewport | null = null;
    const updateViewport = () => {
      const next = { width: host.clientWidth, height: host.clientHeight };
      setViewport(next);
      if (lastSize && (lastSize.width !== next.width || lastSize.height !== next.height)) {
        {
          const dx = (next.width - lastSize.width) / 2, dy = (next.height - lastSize.height) / 2;
          setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        }
      }
      lastSize = next;
    };
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(host);
    return () => observer.disconnect();
  }, [fit, scene?.mode]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("[data-node-id], .tree-node, .tree-minimap, .canvas-toolbar, .tree-knowledge-panel, .botanical-wood")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, camera: cameraRef.current };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag) return;
    setCamera(panCamera(activeDrag.camera, event.clientX - activeDrag.px, event.clientY - activeDrag.py));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const zoomOut = () => setCamera((current) => zoomCameraAt(current, viewport.width / 2, viewport.height / 2, 0.86, scene?.illustration || scene?.mode === "mindmap" ? 0.06 : 0.35, 2.4));
  const zoomIn = () => setCamera((current) => zoomCameraAt(current, viewport.width / 2, viewport.height / 2, 1.16, scene?.illustration || scene?.mode === "mindmap" ? 0.06 : 0.35, 2.4));
  const centerOn = (worldX: number, worldY: number) => {
    const host = hostRef.current;
    if (!host) return;
    setCamera((current) => centerCameraOn(current, { width: host.clientWidth, height: host.clientHeight }, worldX, worldY));
  };

  return { hostRef, camera, viewport, fit, zoomIn, zoomOut, centerOn, onPointerDown, onPointerMove, endDrag };
}

