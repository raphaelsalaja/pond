import { Spherical, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function moveCameraWithKey(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  key: string,
  shiftKey: boolean,
): boolean {
  const direction = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[key];
  const offset = camera.position.clone().sub(controls.target);
  if (direction && shiftKey) {
    const pan = new Vector3(direction[0] ?? 0, -(direction[1] ?? 0), 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(offset.length() * 0.05);
    camera.position.add(pan);
    controls.target.add(pan);
  } else if (direction) {
    const spherical = new Spherical().setFromVector3(offset);
    spherical.theta += ((direction[0] ?? 0) * Math.PI) / 36;
    spherical.phi += ((direction[1] ?? 0) * Math.PI) / 36;
    spherical.makeSafe();
    camera.position
      .copy(controls.target)
      .add(offset.setFromSpherical(spherical));
  } else if (["+", "=", "-"].includes(key)) {
    const distance = Math.max(
      camera.near * 2,
      Math.min(
        camera.far * 0.8,
        offset.length() * (key === "-" ? 1.1 : 1 / 1.1),
      ),
    );
    camera.position.copy(controls.target).add(offset.setLength(distance));
  } else {
    return false;
  }
  controls.update();
  return true;
}

export function bindCameraKeys(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  controls: OrbitControls,
  reset: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Home") {
      reset();
    } else if (
      !moveCameraWithKey(camera, controls, event.key, event.shiftKey)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  canvas.addEventListener("keydown", onKeyDown);
  return () => canvas.removeEventListener("keydown", onKeyDown);
}
