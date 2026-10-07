import { Effect } from 'postprocessing';

/**
 * Clamps the HDR scene colour to a finite range before bloom and depth of field read it.
 *
 * Mobile GPUs evaluate some lighting at reduced precision; a specular peak can overflow the
 * half-float buffer to +Inf, and 0 * Inf or a pow() of a negative base gives NaN. Bloom's mip
 * chain then spreads one bad pixel over the screen: Inf floods the frame white, NaN eats black
 * holes into it (the metal-stack artefacts seen on phones). Finite colours below the cap pass
 * through unchanged, so desktop frames are identical.
 */
const fragmentShader = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  // NaN is the only value not equal to itself; written per channel so drivers can't fold it.
  c.r = c.r == c.r ? c.r : 0.0;
  c.g = c.g == c.g ? c.g : 0.0;
  c.b = c.b == c.b ? c.b : 0.0;
  outputColor = vec4(clamp(c, 0.0, 64.0), inputColor.a);
}
`;

export class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', fragmentShader);
  }
}
