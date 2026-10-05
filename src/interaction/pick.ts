import * as THREE from 'three';
import type { EntityInfo, Pickable, PickHit } from '../core/types';

let uid = 0;
const _m = new THREE.Matrix4();

/** A whole object (mesh or group) is one entity. Bounds are measured at hit time, so moving parts work. */
export function pickObject(object: THREE.Object3D, info: EntityInfo, priority = 0): Pickable {
  const key = `obj${uid++}`;
  return {
    object,
    priority,
    resolve: (): PickHit => ({ key, info, box: new THREE.Box3().setFromObject(object), object }),
  };
}

/** Each instance of an InstancedMesh is its own entity (or null to skip that instance). */
export function pickInstances(
  mesh: THREE.InstancedMesh,
  info: (index: number) => EntityInfo | null,
  priority = 0,
): Pickable {
  const key = `inst${uid++}`;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return {
    object: mesh,
    priority,
    resolve: (hit) => {
      const i = hit.instanceId;
      if (i === undefined) return null;
      const entity = info(i);
      if (!entity) return null;
      mesh.getMatrixAt(i, _m);
      _m.premultiply(mesh.matrixWorld);
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(_m);
      return { key: `${key}:${i}`, info: entity, box, object: mesh };
    },
  };
}

/** Same info for every instance, but bounds/brackets cover the whole InstancedMesh. */
export function pickInstancedGroup(mesh: THREE.InstancedMesh, info: EntityInfo, priority = 0): Pickable {
  const key = `grp${uid++}`;
  return {
    object: mesh,
    priority,
    resolve: () => {
      mesh.computeBoundingBox();
      const box = mesh.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      return { key, info, box, object: mesh };
    },
  };
}

/** Box helper for custom resolvers (e.g. die floorplan blocks). */
export function boxFrom(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
  return new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
}
