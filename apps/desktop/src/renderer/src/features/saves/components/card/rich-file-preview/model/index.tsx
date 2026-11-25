import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Material, Mesh, Object3D, Texture } from "three";
import type { LibraryCardView } from "@/features/saves/components/card/types";
import { loadModel } from "@/features/saves/components/viewers/model-viewer/load-model";
import styles from "./styles.module.css";

export function ModelCardPreview({
  url,
  path,
  view,
}: {
  url: string;
  path: string;
  view?: LibraryCardView;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let alive = true;
    let loaded: Awaited<ReturnType<typeof loadModel>>["object"] | null = null;
    const scene = new Scene();
    scene.background = new Color(0x20_25_2d);
    const camera = new PerspectiveCamera(34, 1, 0.01, 100_000);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    root.append(renderer.domElement);

    scene.add(new HemisphereLight(0xff_ff_ff, 0x33_41_55, 2.8));
    const key = new DirectionalLight(0xff_ff_ff, 4);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new DirectionalLight(0x93_c5_fd, 2);
    rim.position.set(-5, 3, -4);
    scene.add(rim);
    const grid = new GridHelper(10, 16, 0x66_70_85, 0x34_3b_47);
    scene.add(grid);

    const render = () => {
      const width = Math.max(root.clientWidth, 1);
      const height = Math.max(root.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(render);
    observer.observe(root);

    void loadModel(url, path)
      .then((result) => {
        if (!alive) {
          disposeObject(result.object);
          return;
        }
        loaded = result.object;
        const box = new Box3().setFromObject(result.object);
        if (box.isEmpty()) throw new Error("empty model");
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        result.object.position.sub(center);
        result.object.rotation.y = -0.45;
        scene.add(result.object);
        const radius = Math.max(size.x, size.y, size.z, 0.01) * 0.5;
        const distance = radius / Math.tan((camera.fov * Math.PI) / 360);
        camera.near = Math.max(radius / 1000, 0.001);
        camera.far = Math.max(distance * 20, 100);
        camera.position.set(distance * 0.82, distance * 0.58, distance * 1.1);
        camera.lookAt(0, 0, 0);
        grid.scale.setScalar(Math.max(radius / 4, 0.1));
        grid.position.y = -size.y / 2;
        setStatus("ready");
        requestAnimationFrame(render);
      })
      .catch(() => {
        if (alive) setStatus("failed");
      });

    return () => {
      alive = false;
      observer.disconnect();
      if (loaded) disposeObject(loaded);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [path, url]);

  return (
    <div className={styles.model} data-view={view} data-status={status}>
      <div ref={rootRef} className={styles.canvas} />
      {status === "loading" ? <span>Loading model</span> : null}
      {status === "failed" ? (
        <div className={styles.fallback}>
          <strong>3D</strong>
          <span>Interactive model</span>
        </div>
      ) : null}
    </div>
  );
}

function disposeObject(
  object: Awaited<ReturnType<typeof loadModel>>["object"],
) {
  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) disposeMaterial(material);
  });
}

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && object.isMesh === true;
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === "object" &&
    value !== null &&
    "isTexture" in value &&
    value.isTexture === true
  );
}

function disposeMaterial(material: Material) {
  const values: Array<unknown> = Object.values(material);
  for (const value of values) {
    if (isTexture(value)) {
      value.dispose();
    }
  }
  material.dispose();
}
