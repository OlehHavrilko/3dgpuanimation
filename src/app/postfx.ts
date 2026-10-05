import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Quality } from './settings';

/** Effect chain: scene -> depth of field -> bloom + vignette + ACES tone mapping. */
export function createPostFx(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, quality: Quality) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: quality === 'low' ? 0 : Math.min(4, renderer.capabilities.maxSamples),
  });
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  const dof = new DepthOfFieldEffect(camera, {
    focusDistance: 10,
    focusRange: 5,
    bokehScale: 1.5,
    resolutionScale: 0.5,
  });
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 0.62,
    luminanceSmoothing: 0.25,
    intensity: 1.1,
    radius: 0.7,
  });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const dofPass = new EffectPass(camera, dof);
  composer.addPass(renderPass);
  composer.addPass(dofPass);
  composer.addPass(new EffectPass(camera, bloom, vignette, toneMapping));
  return { composer, renderPass, dof, dofPass, bloom };
}

export type PostFx = ReturnType<typeof createPostFx>;
