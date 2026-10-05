import * as THREE from 'three';

/** One level activation, measured end to end. Times in ms. */
export interface LevelTiming {
  index: number;
  name: string;
  /** Level instance came from the cache (no build needed). */
  cached: boolean;
  /** Disposing / detaching the outgoing level. */
  disposeMs: number;
  /** create() + init(): geometry, textures, materials (CPU). */
  buildMs: number;
  /** Background preparation (shader compile + upload) done before activation, if any. */
  warmupMs: number;
  /** First composer.render() after the swap, GPU-synchronised: includes shader compiles. */
  firstFrameMs: number;
  /** Swap decision -> first frame on screen. What the user actually waits for. */
  transitionMs: number;
  /** Programs compiled during the first frame. */
  programsCompiled: number;
  geometries: number;
  textures: number;
  /** Rough GPU memory held by the active scene (vertex/index/instance buffers + textures). */
  gpuMB: number;
  /** JS heap (Chrome only, else 0). */
  heapMB: number;
}

/**
 * Measures every level activation. LevelManager reports the CPU phases, the render loop reports
 * the first frame. Results are kept in `records` (and logged in debug builds).
 */
export class LevelProfiler {
  readonly records: LevelTiming[] = [];
  private pending: { rec: LevelTiming; t0: number; programs: number } | null = null;
  private pixel = new Uint8Array(4);

  constructor(private renderer: THREE.WebGLRenderer) {}

  begin(index: number, name: string, cached: boolean) {
    const rec: LevelTiming = {
      index,
      name,
      cached,
      disposeMs: 0,
      buildMs: 0,
      warmupMs: 0,
      firstFrameMs: 0,
      transitionMs: 0,
      programsCompiled: 0,
      geometries: 0,
      textures: 0,
      gpuMB: 0,
      heapMB: 0,
    };
    this.pending = { rec, t0: performance.now(), programs: 0 };
    return rec;
  }

  /** True while the frame after a swap still has to be measured. */
  get awaitingFirstFrame() {
    return this.pending !== null;
  }

  /** Wrap the first render after a swap. Forces a GPU sync so compile/upload cost is included. */
  measureFirstFrame(render: () => void, scene: THREE.Scene) {
    const p = this.pending!;
    const programsBefore = this.renderer.info.programs?.length ?? 0;
    const t = performance.now();
    render();
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel); // blocks until the GPU is done
    const now = performance.now();
    const rec = p.rec;
    rec.firstFrameMs = now - t;
    rec.transitionMs = now - p.t0;
    rec.programsCompiled = Math.max(0, (this.renderer.info.programs?.length ?? 0) - programsBefore);
    rec.geometries = this.renderer.info.memory.geometries;
    rec.textures = this.renderer.info.memory.textures;
    rec.gpuMB = round(estimateGpuBytes(scene) / 1048576);
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    rec.heapMB = mem ? round(mem.usedJSHeapSize / 1048576) : 0;
    for (const k of ['disposeMs', 'buildMs', 'warmupMs', 'firstFrameMs', 'transitionMs'] as const)
      rec[k] = round(rec[k]);
    this.records.push(rec);
    this.pending = null;
    return rec;
  }
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Sum of buffer + texture bytes referenced by a scene (an estimate: ignores mip/driver overhead details). */
export function estimateGpuBytes(scene: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  let bytes = 0;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geos.add(mesh.geometry);
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      bytes += inst.instanceMatrix.array.byteLength;
      if (inst.instanceColor) bytes += inst.instanceColor.array.byteLength;
    }
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if (x.value instanceof THREE.Texture) textures.add(x.value);
    }
  });
  geos.forEach((g) => {
    for (const a of Object.values(g.attributes)) bytes += (a as THREE.BufferAttribute).array.byteLength;
    if (g.index) bytes += g.index.array.byteLength;
  });
  textures.forEach((t) => {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.33 : 1);
  });
  return bytes;
}
