import * as THREE from 'three';

/**
 * Where the atom scale hands over to the nucleus scale. Kept apart from both levels so each can
 * be loaded on its own.
 */

/** Atom-scene units (~5 pm) -> nucleus-scene units (0.1 fm), for the nucleus drawn in both. */
export const NUCLEUS_SCALE = 20;
/** Camera distance to the nucleus at the atom scale's last content frame (|(3.6, 1.6, 4.6)|). */
export const ATOM_END_DIST = Math.hypot(3.6, 1.6, 4.6);
/** Direction the atom scale dives in from: both scales see the nucleus from the same side. */
export const NUCLEUS_APPROACH = new THREE.Vector3(3.6, 1.6, 4.6).normalize();
