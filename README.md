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

## Interaction

The page has two modes:

- **Cinematic** (default): scroll and the camera directs. A faint mouse parallax makes it feel like a space, not a video.
- **Explore**: press `E`, the **Explore** button, or click any object. The scroll timeline freezes and the camera is yours.

| Input | What it does |
|-------|--------------|
| Hover | Identifies a part: corner bracket, tooltip with a leader line, key specs |
| Click | Inspects it: spotlight, inspector panel, the camera glides to it |
| Drag / wheel / right-drag | Orbit / zoom / pan (Explore) |
| `←` `→` | Previous / next scale, flying through the dive |
| `Esc` | Deselect, then leave Explore |
| Breadcrumb, scale rail, ◀ ▶ | Jump to any scale |

Per-level controls appear in the inspector in Explore mode:

| Level | Controls |
|-------|----------|
| 1 · Card | Disassembly slider (0–100 %); fans Stop / Idle / Load |
| 2 · PCB | Data flow Off / Slow / Realtime / Burst |
| 3 · Package | Peel-apart slider |
| 4 · Die | Highlight GPC / SM / L2 / Memory. Hovering far away gives GPCs; close up gives individual SMs, including the 22 fused off on the 5090 |
| 5 · Metal | Hover any wire for its layer, pitch and role |
| 6 · FinFET | Gate voltage OFF / ON / CLOCK; clock speed |
| 7 · Lattice | Doping Mixed / Intrinsic / N-type (free electrons) / P-type (holes) |
| 8 · Atom | Orbitals All / 1s / 2s / 2p / 3s / 3p; hover a shell |

On touch screens, a first tap identifies a part (tooltip) and a second tap on it inspects, so swiping through the story never drops you into Explore by accident. In Explore, one finger orbits, a pinch zooms and two fingers pan. The inspector becomes a bottom sheet that collapses to its title (tap the grip). While it is open, the view slides so the subject stays clear of the panel.

### View modes (Explore)

The inspector's **View** control offers four modes:

- **Normal**: the regular rendering.
- **X-Ray**: everything becomes a Fresnel ghost. The selected part stays solid, which isolates it.
- **Section**: a clipping plane with a cut slider. Each level has its own axis, and the atom's electron cloud is sliced as well.
- **Thermal** (card and PCB): an illustrative lumped heat model drives a thermal-camera palette.
  - Heat visibly spreads die → vapor chamber → heat pipes → fins.
  - You can set GPU load and fan mode.
  - Live readouts show temperatures, an estimated hotspot and board power. Throttling starts above 90 °C.

### Signal trace

Click any GDDR7 chip → **Trace signal**. The chip's own 32-bit bus lights up with fast packets while the other buses fade. The camera then walks through each stage on its own:

1. On the board: chip → bus → GPU package.
2. **Follow into the die**: memory controller (numbered to match the chip) → L2 → GPC → SM, along a glowing on-die path.

### Transistor

Gate drive has four settings: OFF, ON, CLOCK, or MANUAL with a gate-voltage slider (threshold about 0.3 V). Live readouts show the channel state, the relative drain current and a rolling logic trace (`0 1 0 1 …`).

### Follow the electron

Press the **Follow e⁻** button or `F`. The page scrolls itself through all eight scales while a glowing electron with a tail follows one physical path:

12V-2x6 connector → VRM → PCB → solder ball and substrate → on-die power grid → down the via stack → contact → source → channel → through the silicon crystal → a 3p orbital.

Each level shows its own narration. The tour pauses while you explore and stops on a second press or with `Esc`.

The interaction layer lives in `src/interaction/` and is shared by every level:

- `InteractionManager.ts` handles raycasting, hover and selection, Explore mode (OrbitControls), camera fly-to, keyboard input and parallax.
- `Hud.ts` handles the DOM: tooltip, leader line, spotlight, inspector, breadcrumb and nav.
- `pick.ts` holds the helpers levels use to declare what is pickable.
- `ViewModes.ts` implements X-Ray, Section and Thermal, plus the heat model.
- `FollowTracer.ts` draws the followed electron.

Levels only describe *what* can be picked (`pickables`, with `EntityInfo` metadata) and *which* controls they offer (`controls`). They never handle input themselves.

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
    types.ts            Level interface, EntityInfo, Pickable, LevelControl
    canvas.ts, points.ts, dispose.ts, math.ts
  interaction/
    InteractionManager.ts  hover / select / Explore / keyboard / parallax
    Hud.ts                 tooltip, leader, spotlight, inspector, breadcrumb, nav
    pick.ts                pickObject / pickInstances / pickInstancedGroup helpers
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
- Pixel ratio is capped at 1.75, and DOF runs at half resolution. DOF is switched off entirely in Explore mode.
- **Adaptive resolution.** If the frame rate stays below ~52 fps for 1.5 s, the render resolution steps down. After 8 s of smooth frames it steps back up. Hysteresis and cooldowns keep it from oscillating.
- `?quality=low` forces pixel ratio 1, no MSAA and no DOF. `?quality=high` sets pixel ratio up to 2 with adaptation off.
- `?debug` shows FPS, frame time, draw calls, triangles and the current pixel ratio.

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
