import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/** Nucleon radius in the atom scene's units (the nucleus there is drawn ~10⁴ times too large). */
export const NUCLEON_R = 0.42;

export interface NucleusLayout {
  /** Nucleon centres, in units of NUCLEON_R = 0.42. */
  positions: THREE.Vector3[];
  /** True for the 14 protons, false for the 14 neutrons. */
  proton: boolean[];
  /** The proton the descent dives into: on the surface, rotated onto +Y (the spin axis). */
  diveProton: number;
}

let cached: NucleusLayout | null = null;

/**
 * The ²⁸Si nucleus shared by the atom and the nucleus scales: 28 hard spheres relaxed into a
 * compact cluster (repulsion plus a gentle pull to the centre), protons and neutrons mixed
 * evenly. Both scales draw the same layout, so the dive from one into the other is not a cut.
 * The cluster is turned so one surface proton sits on +Y: the nucleus spins about Y, so that
 * proton stays put and the camera can fly into it without chasing it.
 */
export function nucleusLayout(): NucleusLayout {
  if (cached) return cached;
  const rng = mulberry32(28);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 28; i++) {
    pts.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(2));
  }
  const d = new THREE.Vector3();
  const minD = NUCLEON_R * 2 * 0.97;
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < pts.length; i++) {
      pts[i].multiplyScalar(0.985);
      for (let j = i + 1; j < pts.length; j++) {
        d.subVectors(pts[j], pts[i]);
        const len = d.length() || 1e-4;
        if (len < minD) {
          d.multiplyScalar((minD - len) / len / 2);
          pts[i].sub(d);
          pts[j].add(d);
        }
      }
    }
  }
  // Re-centre on the centre of mass so the spin axis runs through the middle.
  const com = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  pts.forEach((p) => p.sub(com));

  // Alternate protons / neutrons through the cluster (sorted by angle for an even mix).
  const proton = pts.map(() => false);
  pts
    .map((p, i) => ({ i, k: Math.atan2(p.z, p.x) + p.y * 3 }))
    .sort((a, b) => a.k - b.k)
    .forEach((o, rank) => (proton[o.i] = rank % 2 === 0));

  // The outermost proton, nudged towards the top so the turn below stays small.
  let diveProton = 0;
  let best = -Infinity;
  pts.forEach((p, i) => {
    if (!proton[i]) return;
    const score = p.length() + 0.3 * p.y;
    if (score > best) {
      best = score;
      diveProton = i;
    }
  });
  const turn = new THREE.Quaternion().setFromUnitVectors(
    pts[diveProton].clone().normalize(),
    new THREE.Vector3(0, 1, 0),
  );
  pts.forEach((p) => p.applyQuaternion(turn));

  cached = { positions: pts, proton, diveProton };
  return cached;
}

/** Zero-point jitter of nucleon i at `time`, in units of NUCLEON_R = 0.42 (purely decorative). */
export function nucleonJitter(i: number, time: number, out: THREE.Vector3) {
  const j = 0.035;
  return out.set(
    Math.sin(time * 7.1 + i * 1.7) * j,
    Math.sin(time * 6.3 + i * 2.3) * j,
    Math.sin(time * 5.7 + i * 0.9) * j,
  );
}

/** Spin and breathing of the whole nucleus, identical at both scales. */
export function nucleusSpin(time: number) {
  return { angle: time * 0.15, scale: 1 + 0.03 * Math.sin(time * 0.9) };
}
