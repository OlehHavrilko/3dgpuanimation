import * as THREE from 'three';
import type { Level, PickHit } from '../core/types';

/** A throwaway intersection: resolvers that need a real ray (custom floorplans) will throw and are skipped. */
const dummyHit = { instanceId: undefined, point: new THREE.Vector3(), distance: 0 } as unknown as THREE.Intersection;

/**
 * Enumerate the entities a level exposes without a pointer.
 *
 * Object- and group-level pickables resolve to a titled hit with a world box, so they can
 * be listed for the command palette and pinned as 3D labels. Per-instance pickables need an
 * actual `instanceId` and simply return null here.
 */
export function collectEntities(level: Level): PickHit[] {
  const out: PickHit[] = [];
  const seen = new Set<string>();
  for (const p of level.pickables ?? []) {
    let hit: PickHit | null = null;
    try {
      hit = p.resolve(dummyHit);
    } catch {
      hit = null;
    }
    if (hit && !seen.has(hit.key)) {
      seen.add(hit.key);
      out.push(hit);
    }
  }
  return out;
}
