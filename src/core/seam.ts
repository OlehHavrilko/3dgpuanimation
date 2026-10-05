import * as THREE from 'three';

const _inv = new THREE.Quaternion();

/**
 * The geometric link between two scales.
 *
 * A similarity transform (rotate + uniform scale + translate) that takes the camera of level N
 * at the very end of its dive (looking at the dive target from distance d) onto the camera of
 * level N+1 at the first frame of its content (looking at its own look-at point). Any other
 * camera pose of level N maps to the pose N+1 would have "inside" the target: so while the
 * dive is still under way, level N+1 can be drawn from the mapped camera and it sits exactly
 * where the target is, at the right size, approaching at the right speed. At the end of the
 * dive the two cameras coincide, so the hand-over is not a cut.
 */
export class SeamMap {
  private readonly rotation = new THREE.Quaternion();
  private readonly fromAnchor = new THREE.Vector3();
  private readonly toAnchor = new THREE.Vector3();
  scale = 1;

  /**
   * @param fromLook  where camera A looks at the end of the dive (the dive target)
   * @param fromPos   camera A position at the end of the dive
   * @param fromQuat  camera A orientation at the end of the dive
   * @param toLook    where camera B looks on its first frame
   * @param toPos     camera B position on its first frame
   * @param toQuat    camera B orientation on its first frame
   */
  set(
    fromLook: THREE.Vector3,
    fromPos: THREE.Vector3,
    fromQuat: THREE.Quaternion,
    toLook: THREE.Vector3,
    toPos: THREE.Vector3,
    toQuat: THREE.Quaternion,
  ) {
    this.fromAnchor.copy(fromLook);
    this.toAnchor.copy(toLook);
    this.scale = toPos.distanceTo(toLook) / Math.max(fromPos.distanceTo(fromLook), 1e-12);
    this.rotation.copy(toQuat).multiply(_inv.copy(fromQuat).invert());
    return this;
  }

  /** Map a pose from level N's space into level N+1's. */
  apply(pos: THREE.Vector3, quat: THREE.Quaternion, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
    outPos.copy(pos).sub(this.fromAnchor).applyQuaternion(this.rotation).multiplyScalar(this.scale).add(this.toAnchor);
    outQuat.copy(this.rotation).multiply(quat);
  }
}

/**
 * Screen-space disc covered by a sphere, for the reveal mask: centre in UV (0..1) and radius in
 * units of the viewport height. A camera inside the sphere gets a disc that covers everything.
 */
export function projectSphere(
  camera: THREE.PerspectiveCamera,
  centre: THREE.Vector3,
  radius: number,
  outCentre: THREE.Vector2,
): number {
  const v = _v.copy(centre).project(camera);
  outCentre.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
  const dist = camera.position.distanceTo(centre);
  if (dist <= radius * 1.0001) return 1e3;
  const angle = Math.asin(radius / dist);
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom;
  return (0.5 * Math.tan(angle)) / half;
}

const _v = new THREE.Vector3();
