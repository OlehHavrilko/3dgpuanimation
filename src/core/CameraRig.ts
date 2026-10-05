import * as THREE from 'three';
import { range } from './math';

export interface CameraKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
}

/**
 * Keyframed camera path. Positions and look-at points are interpolated with
 * Catmull-Rom splines so the camera glides through keys instead of stopping.
 */
export class CameraRig {
  private times: number[];
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();

  constructor(keys: CameraKey[]) {
    const sorted = [...keys].sort((a, b) => a.t - b.t);
    if (sorted.length === 1) sorted.push({ ...sorted[0], t: sorted[0].t + 1 });
    this.times = sorted.map((k) => k.t);
    this.posCurve = new THREE.CatmullRomCurve3(
      sorted.map((k) => new THREE.Vector3(...k.pos)),
      false,
      'centripetal',
    );
    this.lookCurve = new THREE.CatmullRomCurve3(
      sorted.map((k) => new THREE.Vector3(...k.look)),
      false,
      'centripetal',
    );
  }

  evaluate(t: number) {
    const ts = this.times;
    const n = ts.length;
    let u: number;
    if (t <= ts[0]) u = 0;
    else if (t >= ts[n - 1]) u = 1;
    else {
      let i = 0;
      while (i < n - 2 && t > ts[i + 1]) i++;
      const local = range(t, ts[i], ts[i + 1]);
      // Half-eased: keeps momentum through keys but softens the endpoints.
      const eased = local * 0.5 + local * local * (3 - 2 * local) * 0.5;
      u = (i + eased) / (n - 1);
    }
    this.posCurve.getPoint(u, this.pos);
    this.lookCurve.getPoint(u, this.look);
    return this;
  }

  apply(camera: THREE.PerspectiveCamera, t: number) {
    this.evaluate(t);
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }
}
