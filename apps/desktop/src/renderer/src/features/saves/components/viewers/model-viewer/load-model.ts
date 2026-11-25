import { Mesh, MeshStandardMaterial } from "three";
import type { AnimationClip, BufferGeometry, Object3D } from "three";

export type ModelLoaderKind =
  | "gltf"
  | "fbx"
  | "obj"
  | "stl"
  | "ply"
  | "3mf"
  | "3ds"
  | "dae"
  | "amf"
  | "usd"
  | "vtk";

export interface LoadedModel {
  object: Object3D;
  animations: Array<AnimationClip>;
}

const LOADER_BY_EXTENSION = new Map<string, ModelLoaderKind>([
  ["glb", "gltf"],
  ["gltf", "gltf"],
  ["fbx", "fbx"],
  ["obj", "obj"],
  ["stl", "stl"],
  ["ply", "ply"],
  ["3mf", "3mf"],
  ["3ds", "3ds"],
  ["dae", "dae"],
  ["amf", "amf"],
  ["usdc", "usd"],
  ["usdz", "usd"],
  ["vtk", "vtk"],
]);

function extensionFrom(value: string): string {
  const filename = value.slice(
    Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\")) + 1,
  );
  const dot = filename.lastIndexOf(".");
  return (dot >= 0 ? filename.slice(dot + 1) : filename).toLowerCase();
}

export function modelLoaderKind(value: string): ModelLoaderKind | null {
  return LOADER_BY_EXTENSION.get(extensionFrom(value)) ?? null;
}

function meshForGeometry(geometry: BufferGeometry): Mesh {
  if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: 0x94_a3_b8,
    roughness: 0.72,
    metalness: 0.08,
    vertexColors: geometry.hasAttribute("color"),
  });
  return new Mesh(geometry, material);
}

export async function loadModel(
  url: string,
  path: string,
): Promise<LoadedModel> {
  const kind = modelLoaderKind(path);
  if (!kind) throw new Error(`No model loader for ${path}`);

  switch (kind) {
    case "gltf": {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const result = await new GLTFLoader().loadAsync(url);
      return { object: result.scene, animations: result.animations };
    }
    case "fbx": {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const object = await new FBXLoader().loadAsync(url);
      return { object, animations: object.animations };
    }
    case "obj": {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      return {
        object: await new OBJLoader().loadAsync(url),
        animations: [],
      };
    }
    case "stl": {
      const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
      return {
        object: meshForGeometry(await new STLLoader().loadAsync(url)),
        animations: [],
      };
    }
    case "ply": {
      const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
      return {
        object: meshForGeometry(await new PLYLoader().loadAsync(url)),
        animations: [],
      };
    }
    case "3mf": {
      const { ThreeMFLoader } =
        await import("three/addons/loaders/3MFLoader.js");
      return {
        object: await new ThreeMFLoader().loadAsync(url),
        animations: [],
      };
    }
    case "3ds": {
      const { TDSLoader } = await import("three/addons/loaders/TDSLoader.js");
      return {
        object: await new TDSLoader().loadAsync(url),
        animations: [],
      };
    }
    case "dae": {
      const { ColladaLoader } =
        await import("three/addons/loaders/ColladaLoader.js");
      const result = await new ColladaLoader().loadAsync(url);
      if (!result) throw new Error(`Unable to parse ${path}`);
      return { object: result.scene, animations: result.scene.animations };
    }
    case "amf": {
      const { AMFLoader } = await import("three/addons/loaders/AMFLoader.js");
      return {
        object: await new AMFLoader().loadAsync(url),
        animations: [],
      };
    }
    case "usd": {
      const { USDLoader } = await import("three/addons/loaders/USDLoader.js");
      return {
        object: await new USDLoader().loadAsync(url),
        animations: [],
      };
    }
    case "vtk": {
      const { VTKLoader } = await import("three/addons/loaders/VTKLoader.js");
      return {
        object: meshForGeometry(await new VTKLoader().loadAsync(url)),
        animations: [],
      };
    }
  }
}
