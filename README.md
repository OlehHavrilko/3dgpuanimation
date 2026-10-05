# GPU → Atom

A scroll-driven 3D teardown of a **GeForce RTX 5090 Founders Edition**, from the whole card down to a single silicon atom. Eight scales, one scroll.

**Быстрый старт:** `npm install`, then `npm run dev`, then open the URL Vite prints and scroll. Add `?debug` to get a timeline scrubber.

| # | Level | Scale | What happens |
|---|-------|-------|--------------|
| 1 | GeForce RTX 5090 FE | 30 cm | 304 × 137 mm dual-slot card. Both fans spin, then stop. Exploded view: shroud, fans, two flow-through fin stacks, 3D vapor chamber, heat pipes, main PCB, PCIe and display boards. |
| 2 | Main PCB | 10 cm | GB202 ringed by 16 GDDR7 chips (32 GB, 512-bit). Chips light up in sequence while data pulses run along the memory bus traces. Power stages, MLCC field, 12V-2x6 connector, PCIe 5.0 x16 fingers. |
| 3 | GB202 package | 5 cm | Flip-chip BGA. The substrate peels apart layer by layer (solder mask, copper, ABF, glass-fibre core). About 5,000 BGA balls and 3,000 C4 bumps, all instanced. |
| 4 | GB202 die | 1 cm | Thin-film interference shader. The floorplan highlights 12 GPCs, then 192 SMs (170 enabled, 22 fused off), then the L2 and the 16 × 32-bit memory controllers. |
| 5 | Metal stack | 10 µm | SEM-style cross-section of about 15 interconnect layers, from the aluminium pad down to 28 nm pitch. The camera descends and zooms with the pitch. |
| 6 | FinFET transistors | 50 nm | A FinFET array. One gate fades out so you can see the high-k dielectric and the electrons, which drift source → drain when the gate pulses. |
| 7 | Silicon lattice | 2 nm | Diamond cubic built from the lattice maths (a = 5.431 Å, bonds found at a·√3/4). Shows a unit cell, glowing bond pairs, and P and B dopants. |
| 8 | Silicon atom | 0.2 nm | A nucleus of 14 p⁺ + 14 n⁰ packed by relaxation. The electron cloud (~86k points) is sampled from hydrogen-like 1s/2s/2p/3s/3p orbitals with Clementi–Raimondi Z_eff, and pulses slowly. |

## Run

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
```

### Debug mode

Open `http://localhost:5173/?debug` to get a lil-gui panel with:

- an FPS readout
- a timeline slider (it scrolls the page, or drives the timeline directly when "scrub with slider" is on)
- a time scale
- jump buttons for every level
- bloom and depth-of-field controls

In debug mode, `window.__teardown` exposes `{ settings, manager, renderer }` for console scripting.

## Architecture

```
src/
  main.ts               renderer, post chain (DOF → bloom/vignette/ACES), ScrollTrigger, debug GUI
  core/
    LevelManager.ts     timeline → level segments, scene swap, dive + flash
    BaseLevel.ts        scene/camera-rig/dispose boilerplate, per-instance glow material patch
    CameraRig.ts        Catmull-Rom keyframed camera path
    Overlay.ts          HUD: scale label, name, caption, scale rail, live field of view
    types.ts            Level interface
    canvas.ts, points.ts, dispose.ts, math.ts
  levels/
    L1Card.ts … L8Atom.ts, index.ts (ordered registry)
```

**Powers of Ten without float problems.** Each level is its own `THREE.Scene` in its own local units: cm, mm, µm, nm, Å, and stylised pm for the atom. Only one level exists at a time. `LevelManager` maps scroll progress (0..1) onto weighted segments. When the scroll crosses a boundary, it disposes the old level and `init()`s the new one. All levels share one camera, and each level sets its near and far planes for its own units.

**Transition.** Each segment has two parts:

1. **Content (first 84%).** The level animates its story via `update(t)`, with `t` running 0..1.
2. **Dive (last 16%).** The manager dollies the camera logarithmically into `getTransitionTarget()` until the target is about 3× larger than the frame. A green/white flash ramps up with the scroll. On swap, a 0.3 s time-based flash pops and fades, and the next level starts zoomed out. The flash is also scroll-driven at the start of each level, so it behaves the same when scrolling backwards.

Level interface:

```ts
interface Level {
  meta: LevelMeta;                 // name, scale label, unitMeters, timeline weight
  scene: THREE.Scene;
  init(): void;
  update(t: number, dt: number, time: number): void;
  dispose(): void;
  getTransitionTarget(): { position: Vector3; radius: number; approach?: Vector3 };
  getLookAt(): Vector3;
  caption: string;
}
```

To add a level, extend `BaseLevel`, implement `build()`, `cameraKeys()`, `animate()` and `getTransitionTarget()`, then register it in `src/levels/index.ts`.

**Performance.**

- Every repeated object uses `InstancedMesh`: fins, blades, chips, MLCCs, BGA balls, bumps, wires, vias, fins and gates, atoms, bonds.
- Per-instance glow comes from an `aGlow` attribute patched into `MeshStandardMaterial`, so there are no material clones.
- Levels dispose all their geometries, materials and textures on swap. Renderer memory counters stay flat while cycling through all levels.
- Pixel ratio is capped at 1.75, and DOF runs at half resolution.

## Accuracy notes

These figures come from NVIDIA's public specs:

- Card: RTX 5090 FE, 304 × 137 mm, dual-slot, 575 W, double flow-through cooler.
- Memory: 32 GB GDDR7, 512-bit, 28 Gbps, 1.79 TB/s.
- GB202: TSMC 4N, ~750 mm², 92.2 B transistors, 12 GPCs, 192 SMs (170 enabled on the 5090), 21,760 CUDA cores, 128 MB L2 (96 MB enabled).

These parts are representative rather than exact:

- **Package and die floorplan:** the physical placement is schematic. It follows the published block diagram, not a die shot.
- **Metal stack and FinFET dimensions:** 5/4 nm-class values (fin pitch ~28 nm, gate pitch ~51 nm), because TSMC does not publish exact 4N figures.
- **Exaggerated or compressed geometry:** substrate layer thicknesses are drawn ×5. In the atom, radii are compressed (r^0.62) so 1s and 3p fit in one frame, and the nucleus is drawn ~10⁴× too large.

Everything is procedural: no external models or textures.

## Stack

Vite, TypeScript, Three.js r186, GSAP ScrollTrigger, [postprocessing](https://github.com/pmndrs/postprocessing) and lil-gui.
