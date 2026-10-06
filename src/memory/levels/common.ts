import * as THREE from 'three';

/** PAM3 symbol colours, by level −1 / 0 / +1. */
export const PAM3_COLORS = [0x3aa8ff, 0x46505a, 0xb6ff3a] as const;

/** Key + rim + fill, the studio look of the main descent (green NVIDIA-ish rim). */
export function studioLights(scene: THREE.Scene, scale: number, rimColor: THREE.ColorRepresentation = 0x76b900) {
  scene.add(new THREE.HemisphereLight(0xe8f5e0, 0x040805, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(1.2 * scale, 2.4 * scale, 1.5 * scale);
  scene.add(key);
  const rim = new THREE.DirectionalLight(rimColor, 1.8);
  rim.position.set(-1.6 * scale, 0.6 * scale, -1.4 * scale);
  scene.add(rim);
}

/**
 * Device-scale lighting, as on the FinFET level: dim sky, white key, blue fill, green rim, a
 * dark background with a little fog and a quieter environment, so glows carry the frame.
 */
export function deviceLights(scene: THREE.Scene, scale: number, fogDensity: number) {
  scene.background = new THREE.Color(0x020405);
  scene.fog = new THREE.FogExp2(0x020405, fogDensity);
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x050806, 0.18));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.6 * scale, 1 * scale, 0.9 * scale);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x4a78ff, 0.9);
  fill.position.set(-1 * scale, 0.15 * scale, 0.3 * scale);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x76b900, 0.8);
  rim.position.set(-0.6 * scale, 0.4 * scale, -0.9 * scale);
  scene.add(rim);
}

/**
 * Glowing data pulses along straight lines, for an InstancedMesh of unit boxes stretched along
 * +z. Each line carries a stream of PAM3 symbols (three colours) that scrolls with uTime.
 */
export function pam3PulseMaterial(symbolLength: number) {
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 1 },
    uOn: { value: 1 },
    uLen: { value: symbolLength },
    uC0: { value: new THREE.Color(PAM3_COLORS[0]) },
    uC1: { value: new THREE.Color(PAM3_COLORS[1]) },
    uC2: { value: new THREE.Color(PAM3_COLORS[2]) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vLine;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vAlong = world.z;
        vLine = float(gl_InstanceID);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed, uOn, uLen;
      uniform vec3 uC0, uC1, uC2;
      varying float vAlong;
      varying float vLine;
      float hash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
      void main() {
        float s = (vAlong + uTime * uSpeed) / uLen;
        float cell = floor(s);
        float lvl = floor(hash(cell + vLine * 17.31) * 3.0);
        vec3 c = lvl < 0.5 ? uC0 : lvl < 1.5 ? uC1 : uC2;
        // Short gap between symbols so the stream reads as discrete pulses.
        float edge = smoothstep(0.0, 0.12, fract(s)) * smoothstep(1.0, 0.88, fract(s));
        vec3 base = vec3(0.55, 0.36, 0.2) * 0.35;
        gl_FragColor = vec4(mix(base, c * 1.6, edge * uOn), 1.0);
      }`,
  });
  return { mat, uniforms };
}

/** Additive round point sprites (electrons, charge), sized in world units. */
export function glowPointsMaterial(color: THREE.ColorRepresentation, size: number) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uSize: { value: size },
    uScale: { value: 400 },
    uOpacity: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uSize, uScale;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vAlpha = aAlpha;
        gl_PointSize = max(1.5, uSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        float a = exp(-r * 3.0) * vAlpha * uOpacity;
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
  });
  return { mat, uniforms };
}
