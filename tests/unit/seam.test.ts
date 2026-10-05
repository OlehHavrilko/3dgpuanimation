import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SeamMap, projectSphere } from '../../src/core/seam';

function pose(pos: [number, number, number], look: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  cam.position.set(...pos);
  cam.lookAt(new THREE.Vector3(...look));
  cam.updateMatrixWorld();
  return { cam, look: new THREE.Vector3(...look) };
}

describe('SeamMap', () => {
  const a = pose([1, 2, 3], [0.5, 0, 0]);
  const b = pose([260, 300, 410], [10, -4, 2]);
  const map = new SeamMap().set(a.look, a.cam.position, a.cam.quaternion, b.look, b.cam.position, b.cam.quaternion);
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();

  it('maps the end of the dive exactly onto the first frame of the next level', () => {
    map.apply(a.cam.position, a.cam.quaternion, p, q);
    expect(p.distanceTo(b.cam.position)).toBeLessThan(1e-9 * b.cam.position.length() + 1e-9);
    expect(Math.abs(q.dot(b.cam.quaternion))).toBeCloseTo(1, 12);
  });

  it('a camera further out along the dive maps further out along the next view axis', () => {
    // Pull camera A back 3x along its view axis.
    const back = a.cam.position.clone().sub(a.look).multiplyScalar(3).add(a.look);
    map.apply(back, a.cam.quaternion, p, q);
    const expected = b.cam.position.clone().sub(b.look).multiplyScalar(3).add(b.look);
    expect(p.distanceTo(expected)).toBeLessThan(1e-6);
    expect(Math.abs(q.dot(b.cam.quaternion))).toBeCloseTo(1, 12);
  });

  it('scale is the ratio of viewing distances', () => {
    expect(map.scale).toBeCloseTo(b.cam.position.distanceTo(b.look) / a.cam.position.distanceTo(a.look), 12);
  });
});

describe('projectSphere', () => {
  it('centres the disc on the projected point and covers everything from inside', () => {
    const { cam } = pose([0, 0, 10], [0, 0, 0]);
    cam.updateProjectionMatrix();
    const c = new THREE.Vector2();
    const r = projectSphere(cam, new THREE.Vector3(0, 0, 0), 1, c);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.y).toBeCloseTo(0.5);
    // tan(asin(1/10)) / tan(20°) / 2
    expect(r).toBeCloseTo((0.5 * Math.tan(Math.asin(0.1))) / Math.tan(THREE.MathUtils.degToRad(20)), 6);
    expect(projectSphere(cam, new THREE.Vector3(0, 0, 9.5), 1, c)).toBeGreaterThan(100);
  });
});
