import {
  IconArrowRotateAnticlockwise,
  IconGroundPlaneDetection,
} from "@pond/icons";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AnimationMixer,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  type Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { bindCameraKeys } from "./camera-keyboard";
import { loadModel } from "./load-model";
import styles from "./styles.module.css";

interface ModelViewerProps {
  url: string;
  path: string;
  onUnavailable: () => void;
  toolbarStart?: ReactNode;
  toolbarActions?: ReactNode;
}

export function ModelViewer({
  url,
  path,
  onUnavailable,
  toolbarStart,
  toolbarActions,
}: ModelViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const gridRef = useRef<GridHelper | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let alive = true;
    let frame = 0;
    let mixer: AnimationMixer | null = null;
    let loadedObject: Awaited<ReturnType<typeof loadModel>>["object"] | null =
      null;
    const scene = new Scene();
    scene.background = new Color(0x17191d);
    const camera = new PerspectiveCamera(38, 1, 0.01, 100_000);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    root.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "application");
    renderer.domElement.setAttribute(
      "aria-label",
      "3D model. Arrow keys orbit. Shift and arrow keys pan. Plus and minus zoom. Home resets the view.",
    );
    const unbindKeys = bindCameraKeys(
      renderer.domElement,
      camera,
      controls,
      () => resetRef.current?.(),
    );

    const hemisphere = new HemisphereLight(0xffffff, 0x334155, 2.4);
    scene.add(hemisphere);
    const key = new DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fill = new DirectionalLight(0x93c5fd, 1.4);
    fill.position.set(-5, 2, -4);
    scene.add(fill);
    const grid = new GridHelper(10, 20, 0x6b7280, 0x374151);
    gridRef.current = grid;
    scene.add(grid);

    const frameObject = (object: typeof loadedObject) => {
      if (!object) return;
      const box = new Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      object.position.sub(center);
      const radius = Math.max(size.x, size.y, size.z, 0.01) * 0.5;
      const distance = radius / Math.tan((camera.fov * Math.PI) / 360);
      camera.near = Math.max(radius / 1_000, 0.001);
      camera.far = Math.max(distance * 20, 100);
      camera.position.set(distance * 0.9, distance * 0.65, distance * 1.15);
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
      grid.scale.setScalar(Math.max(radius / 5, 0.1));
      grid.position.y = -size.y / 2;
    };
    resetRef.current = () => frameObject(loadedObject);

    const resize = () => {
      const width = Math.max(root.clientWidth, 1);
      const height = Math.max(root.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);

    const clock = new Clock();
    const render = () => {
      if (!alive) return;
      frame = requestAnimationFrame(render);
      mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    void loadModel(url, path)
      .then((result) => {
        if (!alive) {
          disposeObject(result.object);
          return;
        }
        loadedObject = result.object;
        scene.add(result.object);
        if (result.animations.length > 0) {
          mixer = new AnimationMixer(result.object);
          for (const clip of result.animations) mixer.clipAction(clip).play();
        }
        frameObject(result.object);
        setLoading(false);
      })
      .catch(() => {
        if (alive) onUnavailable();
      });

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resetRef.current = null;
      gridRef.current = null;
      mixer?.stopAllAction();
      unbindKeys();
      controls.dispose();
      if (loadedObject) disposeObject(loadedObject);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onUnavailable, path, url]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = gridVisible;
  }, [gridVisible]);

  return (
    <div className={styles.root}>
      <div ref={rootRef} className={styles.canvas} />
      {loading ? (
        <div className={styles.status} role="status">
          Loading 3D model
        </div>
      ) : null}
      <ChromePortal slot="top">
        <ViewerHud.Bar
          label="Model"
          start={toolbarStart}
          center={
            <ViewerToolbarGroups
              controls={
                <>
                  <ViewerHud.Tool
                    label="Reset View"
                    onClick={() => resetRef.current?.()}
                  >
                    <IconArrowRotateAnticlockwise />
                  </ViewerHud.Tool>
                  <ViewerHud.Tool
                    label="Grid"
                    pressed={gridVisible}
                    onClick={() => setGridVisible((visible) => !visible)}
                  >
                    <IconGroundPlaneDetection />
                  </ViewerHud.Tool>
                </>
              }
              actions={toolbarActions}
            />
          }
        />
      </ChromePortal>
    </div>
  );
}

function disposeObject(
  object: Awaited<ReturnType<typeof loadModel>>["object"],
) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) disposeMaterial(material);
  });
}

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) {
      value.dispose();
    }
  }
  material.dispose();
}
