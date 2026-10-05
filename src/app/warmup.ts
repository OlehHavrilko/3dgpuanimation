import * as THREE from 'three';
import type { EffectComposer } from 'postprocessing';
import type { Level } from '../core/types';

/**
 * Prepare a built level before the user reaches it, so its first frame is cheap:
 *  1. compile every program it needs (KHR_parallel_shader_compile when available), and
 *  2. upload its buffers + textures with one tiny render (frustum culling off).
 * Both happen with a small copy of the composer's input buffer bound: three picks a different
 * shader variant (linear output) for a render target than for the canvas, and drivers key
 * pipelines on the attachment format and MSAA sample count, so warming against anything else
 * would compile the wrong variants.
 */
export function createWarmup(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, composer: EffectComposer) {
  let target: THREE.WebGLRenderTarget | null = null;
  const cam = new THREE.PerspectiveCamera();

  return async function warmup(level: Level): Promise<number> {
    const t0 = performance.now();
    if (!target) {
      target = composer.inputBuffer.clone();
      target.setSize(32, 32);
    }
    cam.copy(camera);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const compiled = renderer.compileAsync(level.scene, cam); // programs are chosen synchronously here
    renderer.setRenderTarget(prev);
    await compiled;

    const culled: THREE.Object3D[] = [];
    level.scene.traverse((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(level.scene, cam);
    renderer.setRenderTarget(before);
    for (const o of culled) o.frustumCulled = true;
    return performance.now() - t0;
  };
}
