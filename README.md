# GPU → Atom

A scroll-driven 3D teardown of a **GeForce RTX 5090 Founders Edition**, from the whole card down to a single silicon atom. Eight scales in **three acts**, one continuous dive — every part modelled procedurally and rendered live, with a **guided tour**, a seamless descent (each scale opens inside the previous one), X-Ray / section / thermal views and a command palette.

The eight scales are a chronology; the **narrative layer** gives them a shape. The landing shows a live attract loop, the descent is framed as _I — The Machine_ (GPU → PCB → package), _II — The Computation_ (die → metal → transistor) and _III — The Matter_ (lattice → atom), three anchor numbers land where they mean something, one dive runs chrome-free for a breath, and the journey ends on a finale instead of simply stopping.

**Быстрый старт:** `npm install`, then `npm run dev`, then open the URL Vite prints. Click **Start the descent** or scroll. Add `?debug` for a timeline scrubber, `?nointro` to skip the landing card, or `?quality=low|high` to force a tier.

| #   | Level               | Scale  | What happens                                                                                                                                                                                      |
| --- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GeForce RTX 5090 FE | 30 cm  | 304 × 137 mm dual-slot card. Both fans spin, then stop. Exploded view: shroud, fans, two flow-through fin stacks, 3D vapor chamber, heat pipes, main PCB, PCIe and display boards.                |
| 2   | Main PCB            | 10 cm  | GB202 ringed by 16 GDDR7 chips (32 GB, 512-bit). Chips light up in sequence while data pulses run along the memory bus traces. Power stages, MLCC field, 12V-2x6 connector, PCIe 5.0 x16 fingers. |
| 3   | GB202 package       | 5 cm   | Flip-chip BGA. The substrate peels apart layer by layer (solder mask, copper, ABF, glass-fibre core). About 5,000 BGA balls and 3,000 C4 bumps, all instanced.                                    |
| 4   | GB202 die           | 1 cm   | Thin-film interference shader. The floorplan highlights 12 GPCs, then 192 SMs (170 enabled, 22 fused off), then the L2 and the 16 × 32-bit memory controllers.                                    |
| 5   | Metal stack         | 10 µm  | SEM-style cross-section of about 15 interconnect layers, from the aluminium pad down to 28 nm pitch. The camera descends and zooms with the pitch.                                                |
| 6   | FinFET transistors  | 50 nm  | A FinFET array. One gate fades out so you can see the high-k dielectric and the electrons, which drift source → drain when the gate pulses.                                                       |
| 7   | Silicon lattice     | 2 nm   | Diamond cubic built from the lattice maths (a = 5.431 Å, bonds found at a·√3/4). Shows a unit cell, glowing bond pairs, and P and B dopants.                                                      |
| 8   | Silicon atom        | 0.2 nm | A nucleus of 14 p⁺ + 14 n⁰ packed by relaxation. The electron cloud (~86k points) is sampled from hydrogen-like 1s/2s/2p/3s/3p orbitals with Clementi–Raimondi Z_eff, and pulses slowly.          |

## Interaction

The page has two modes:

- **Cinematic** (default): scroll and the camera directs. A faint mouse parallax makes it feel like a space, not a video.
- **Explore**: press `E`, the **Explore** button, or click any object. The scroll timeline freezes and the camera is yours.

| Input                       | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| Hover                       | Identifies a part: corner bracket, tooltip with a leader line, key specs |
| Click                       | Inspects it: spotlight, inspector panel, the camera glides to it         |
| Drag / wheel / right-drag   | Orbit / zoom / pan (Explore)                                             |
| `←` `→`                     | Previous / next scale, flying through the dive                           |
| `Space`                     | Play / pause the guided tour; replay at the finale                       |
| `1`–`8`                     | Jump straight to a scale                                                 |
| `E`                         | Toggle Explore mode                                                      |
| `L`                         | Toggle 3D part labels                                                    |
| `M`                         | Toggle ambient sound (off by default)                                    |
| `X` `C` `T` `N`             | X-Ray / Section / Thermal / Normal view (in Explore)                     |
| `Ctrl`/`Cmd` + `K`          | Command palette: jump to a scale or a part                               |
| `F`                         | Trace one bit, card to atom (start / stop)                               |
| `Shift` + `F`               | Fullscreen                                                               |
| `Esc`                       | Deselect, then leave Explore                                             |
| Breadcrumb, scale rail, ◀ ▶ | Jump to any scale                                                        |

## The descent

Click **Start the descent** on the landing card, or press `Space` at any time. The tour drives
the timeline directly rather than the scrollbar, so the pacing is authored: it moves slowly
through each scale's content, holds for a beat before the dive, then accelerates through the
transition. The bar at the bottom shows the chapter, elapsed time and a clickable progress
track. Any deliberate input — wheel, touch, arrow keys, or selecting a part — hands control
back to the user; `Space` resumes.

**Three acts.** `Story.ts` groups the scales and drops a two-second title card at each act
boundary — whether you arrive there on the tour or by jumping/scrolling there. The card carries
the act's thesis: _This is the machine_, _This is how it thinks_, _This is what it is made of_.

**Three anchor numbers.** Each act contributes one fact, shown only at the moment it explains
the frame: **92.2 billion transistors** on the die, **15 metal layers** in the interconnect,
**≈0.1 nanometre** at the atom. Count one transistor a second and you would still be counting
in 2,900 years.

**The clean shot.** On the final dive — lattice into atom — the HUD, tour bar and captions all
fade out for a few seconds. Nothing but the zoom. Then the atom arrives and the chrome returns.

**The finale.** Reaching the bottom of the atom does not call `stop()`. The camera eases back
off the nucleus, "You reached the bottom" rises, and the whole descent resolves into one
composition: GPU → transistor → silicon → atom, with the three anchor numbers and the actions
that matter — **Replay** (`Space`), **Explore**, **Share frame**, and the source. Share frame
re-renders the live frame into a 1200×630 card with the scale, caption and a real scale bar, and
downloads it as a PNG.

**A sound invitation.** Starting the descent is a user gesture, so that is the one moment the
page offers its procedural ambience — a small, dismissible prompt. Turning it down is
remembered; the `Sound` button and `M` still work at any time.

## Deep links

The URL tracks the current scale and view mode (`#l=5&v=Section`), so a frame can be shared or
bookmarked. `?nointro` skips the landing card, `?quality=low|high` forces a tier and `?debug`
opens the lil-gui panel.

Per-level controls appear in the inspector in Explore mode:

| Level       | Controls                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Card    | Disassembly slider (0–100 %); fans Stop / Idle / Load                                                                                 |
| 2 · PCB     | Data flow Off / Slow / Realtime / Burst                                                                                               |
| 3 · Package | Peel-apart slider                                                                                                                     |
| 4 · Die     | Highlight GPC / SM / L2 / Memory. Hovering far away gives GPCs; close up gives individual SMs, including the 22 fused off on the 5090 |
| 5 · Metal   | Hover any wire for its layer, pitch and role                                                                                          |
| 6 · FinFET  | Gate voltage OFF / ON / CLOCK; clock speed                                                                                            |
| 7 · Lattice | Doping Mixed / Intrinsic / N-type (free electrons) / P-type (holes)                                                                   |
| 8 · Atom    | Orbitals All / 1s / 2s / 2p / 3s / 3p; hover a shell                                                                                  |

On touch screens, a first tap identifies a part (tooltip) and a second tap on it inspects, so swiping through the story never drops you into Explore by accident. In Explore, one finger orbits, a pinch zooms and two fingers pan. The inspector becomes a bottom sheet that collapses to its title (tap the grip). While it is open, the view slides so the subject stays clear of the panel.

### View modes (Explore)

The inspector's **View** control offers four modes:

- **Normal**: the regular rendering.
- **X-Ray**: everything becomes a Fresnel ghost. The selected part stays solid, which isolates it.
- **Section**: a clipping plane with a cut slider. Each level has its own axis. Cut solids are filled with a hatched face in their own colour, so copper reads as copper and silicon as silicon; the boards cut as a 14-layer stack of copper planes in laminate. The atom's electron cloud is sliced as well.
- **Thermal** (card and PCB): an illustrative lumped heat model drives a thermal-camera palette.
  - Heat visibly spreads die → vapor chamber → heat pipes → fins.
  - You can set GPU load and fan mode.
  - Live readouts show temperatures, an estimated hotspot and board power. Throttling starts above 90 °C.
  - The heat path is drawn and read out in watts: sparks run along every conduction link from the hotter part to the cooler one (GPU → vapour chamber → fin stacks under each fan), and on the card the forced air is visible too: drawn in over each fan, swirled, pushed through the fins and out, blue intake turning amber as it picks up heat. Fan mode changes the air speed; the readouts end with how much heat goes into the air.

### Signal trace

Click any GDDR7 chip → **Trace signal**. The chip's own 32-bit bus lights up with fast packets while the other buses fade. The camera then walks through each stage on its own:

1. On the board: chip → bus → GPU package.
2. **Follow into the die**: memory controller (numbered to match the chip) → L2 → GPC → SM, along a glowing on-die path.

### Transistor

Gate drive has four settings: OFF, ON, CLOCK, or MANUAL with a gate-voltage slider (threshold about 0.3 V). Live readouts show the channel state, the relative drain current and a rolling logic trace (`0 1 0 1 …`).

### Trace: one bit, card to atom

Press **Trace** or `F`. The page scrolls itself through all eight scales while a glowing packet with a tail follows one bit of data along a single route:

PCIe 5.0 x16 fingers → flex cable → GPU · GDDR7 chip 11 → its own 32-bit bus → GPU package · solder ball → substrate → C4 bump · memory controller 11 → L2 → GPC → SM · down the via stack → contact → source → channel · through the silicon crystal → a 3p orbital.

The signal-trace visuals come along: on the board the chip's bus lights up while the others fade, and on the die the route glows from the memory controller to the SM the descent dives into. Each level shows its own narration. The journey pauses while you explore and stops on a second press or with `Esc`. If you traced a chip by hand first, the journey reads from that chip instead.

The interaction layer lives in `src/interaction/` and is shared by every level:

- `InteractionManager.ts` handles raycasting, hover and selection, Explore mode (OrbitControls), camera fly-to, keyboard input and parallax.
- `Hud.ts` handles the DOM: tooltip, leader line, spotlight, inspector, breadcrumb, nav and the temperature legend.
- `ViewModes.ts` implements the X-Ray, Section and Thermal views plus the lumped thermal model.
- `Labels.ts` pins a level's named parts in 3D (toggle `L`); it reads them from `pickables`, so every level gets labels for free.
- `CommandPalette.ts` is the `Ctrl/Cmd+K` jump-to-anything dialog.
- `entities.ts` resolves a level's pickables into titled entities without a pointer.
- `pick.ts` holds the helpers levels use to declare what is pickable.
- `FollowTracer.ts` draws the traced packet.

Levels only describe _what_ can be picked (`pickables`, with `EntityInfo` metadata) and _which_ controls they offer (`controls`). They never handle input themselves.

## Run

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
```

### Checks

```bash
npm run lint           # ESLint (flat config, typescript-eslint + prettier)
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit tests (tests/unit)
npm run test:e2e       # build + Playwright smoke tests (tests/e2e/smoke.spec.ts)
npm run bench          # build + level activation benchmark → bench/<label>.{json,md}
```

The smoke suite runs every level and every feature (Explore, hover/inspect, X-Ray / Section / Thermal, signal trace, transistor gate, the Trace journey, the guided tour, acts and finale, Share frame, labels, the command palette and deep links) in headless Chromium with SwiftShader, so it needs no GPU. It also checks that the level cache stays at current ± 1 and that renderer memory counters return to their starting values after a full 1 → 8 → 1 cycle. CI (`.github/workflows/ci.yml`) runs all of the above except the benchmark.

`BENCH=<label> npm run bench` walks 1 → 8 → 1 and records, per activation: build, warmup, first frame (program compile + upload), transition, programs compiled, geometries, textures, estimated GPU MB and JS heap. `BENCH=baseline BENCH_QUERY='&cache=0' npm run bench`, `BENCH=after npm run bench`, then `npm run bench:compare` writes `bench/comparison.md` (before/after for the level cache; `?cache=0` turns the cache off). SwiftShader numbers are CPU-bound: compare runs with each other, not with a real GPU.

### Debug mode

Open `http://localhost:5173/?debug` to get a lil-gui panel with:

- an FPS readout, frame time, draw calls, triangles and the active quality tier
- a timeline slider (it scrolls the page, or drives the timeline directly when "scrub with slider" is on)
- a time scale
- jump buttons for every level
- bloom, depth-of-field, grain and chromatic-aberration controls

In debug mode, `window.__teardown` exposes `{ settings, manager, renderer, ctx, interaction, profiler, post, tour, story, labels }` for console scripting and tests, and every level activation is logged as `[level] {…timings}`. `?cache=0` turns the level cache off (A/B benchmarks).

## Architecture

```
src/
  main.ts               wiring: renderer, levels, scroll, tour + intro, deep links, frame loop
  app/                  settings, adaptive resolution, level warmup, Trace, sound, palette,
                        debug GUI, static text
  content/              every user-facing string (en/); add a language = add a dictionary
  core/
    LevelManager.ts     timeline → level segments, current/next/previous cache, dive + seam
    seam.ts             SeamMap: the camera mapping between two scales; sphere → screen disc
    SeamEffect.ts       draws the next scale and reveals it inside the dive target
    LevelProfiler.ts    build / warmup / first-frame / transition / memory per activation
    PostFX.ts           the effect chain + per-level colour grade
    Grade.ts            hand-tuned look per level (bloom, contrast, grain, chromatic)
    FxaaEffect.ts       a compact asset-free FXAA effect (MSAA fallback on low tier)
    FrameDissolve.ts    covers a swap that skipped the seam (a scrub jump) with a frozen frame
    Tour.ts             the guided autoplay tour and its progress bar
    Story.ts            acts, anchor numbers, clean shot, finale, share-frame composer
    Attract.ts          the landing's slow drift so the scene is live before the first click
    Audio.ts            procedural Web Audio ambience (hum, air, whoosh, blips)
    quality.ts          device-tier probe → resolution, MSAA, effects, cache sizes
    BaseLevel.ts        scene/camera-rig/dispose boilerplate, per-instance glow material patch
    CameraRig.ts        Catmull-Rom keyframed camera path
    Overlay.ts          HUD: scale label, name, caption, scale rail, FOV + scale bar
    types.ts            Level interface, EntityInfo, Pickable, LevelControl
    canvas.ts, points.ts, dispose.ts, math.ts
  interaction/
    InteractionManager.ts  hover / select / Explore / keyboard / view modes, orchestration
    CameraController.ts    Explore orbit, focus fly-to, parallax, inspector view shift
    TraceRunner.ts         signal-trace stages
    Hud.ts                 tooltip, leader, spotlight, inspector, breadcrumb, nav, legend
    ViewModes.ts           X-Ray / Section / Thermal + thermal simulation
    Labels.ts              in-world part labels
    CommandPalette.ts      Ctrl/Cmd+K palette
    entities.ts            pickables → titled entities without a ray
    pick.ts                pickObject / pickInstances / pickInstancedGroup helpers
  levels/
    L1Card.ts … L8Atom.ts, index.ts (ordered registry)
```

**Powers of Ten without float problems.** Each level is its own `THREE.Scene` in its own local units: cm, mm, µm, nm, Å, and stylised pm for the atom. `LevelManager` maps scroll progress (0..1) onto weighted segments. All levels share one camera, and each level sets its near and far planes for its own units.

**Level cache + warmup.** The current level and its two neighbours stay built (`QUALITY.levelCache`; off on the low tier and with `?cache=0`). In idle time `LevelManager` builds the next level, then the previous one, and `app/warmup.ts` prepares each: `compileAsync` against a 32×32 clone of the composer's input buffer (same colour space, format and MSAA, so the compiled programs are the ones the composer will use), then one tiny render with frustum culling off to upload every buffer and texture. Crossing a boundary is then a scene swap with no build and no shader compile; levels that leave the window are disposed. `bench/comparison.md` has the before/after numbers.

**Seamless descent.** Each segment has two parts:

1. **Content (first 84%).** The level animates its story via `update(t)`, with `t` running 0..1.
2. **Dive (last 16%).** The camera dollies logarithmically into `getTransitionTarget()`.

There is no cut and no flash between scales; the next level exists _inside_ the previous one:

- **Where the dive ends.** The next level's first frame (its camera rig at `t = 0`) decides it: the dive stops when the frame is physically as wide as that first frame, so the scale readout shrinks monotonically and is continuous across the boundary. Levels after the card open on an _entry_ key inside their subject (`entry()` in `CameraRig.ts`) and open up to their establishing shot over the first ~12% of their content.
- **Where the next level appears.** `SeamMap` is a similarity transform (rotation + uniform scale + translation) taking the end-of-dive camera onto the next level's first-frame camera, anchored on the dive target. Every camera of the dive maps to a camera in the next level, so the next level is drawn at its true size and place inside the target, approaching at the same rate.
- **How it is revealed.** From 45% of the dive, `SeamEffect` renders the next level (built and warmed up by the level cache) into its own buffer and blends it in: first inside the target's on-screen disc, then everywhere. At the end of the dive the frame _is_ the next level's first frame, so the swap changes nothing on screen. Colour grade, bloom and the scale readout blend with it; depth of field fades out during the reveal and back in once the new level has settled.
- **Both directions.** Everything is a function of scroll progress, so scrolling back up crosses the same seam in reverse. A scrub that jumps over the seam in one frame is the only case still covered by `FrameDissolve`.

`tests/e2e/descent.spec.ts` walks the whole route GPU → Atom and checks every boundary: the reveal, the matching frame, the shrinking field of view and a cover-free swap.

**Visual grade.** `PostFX` runs DOF → bloom → chromatic aberration → brightness/contrast → hue/saturation → vignette → ACES tone mapping → film grain, with a per-level look from `Grade.ts` (the SEM level goes near-monochrome and grainy, the die goes saturated, the atom goes dark and bloomy). Low-tier devices get asset-free FXAA instead of MSAA.

**Section caps.** Filled cut faces without a stencil buffer: every closed opaque mesh gets a back-face twin (`SectionCaps` in `ViewModes.ts`) that intersects the view ray with the cut plane and colours that point, with an optional layer stack from `mesh.userData.section` (`core/sectionStack.ts`).

**Scale ruler and the way back up.** A continuous logarithmic ruler (10⁰ to 10⁻¹¹ m, `core/ScaleRuler.ts`) carries a marker that rides it with the live field of view, with familiar sizes along it (a person, a fingernail, a hair, a blood cell, a virus, DNA, an atom). At the finale, **Zoom back out** flies up through every scale in 20 s (the seams work in both directions; any wheel, touch or Esc ends it) and lands on the closing line, "You were looking at one": the die holds about 2.9 × 10²² silicon atoms (`core/facts.ts`, assuming a ~0.78 mm die), and the last scale showed one of them.

**Content.** Every user-facing string (captions, entity info, control labels, acts, key numbers, UI) lives in `src/content/en/` behind one `content` export; levels and UI read it, so a second language is a new dictionary. The fixed text in `index.html` is the English fallback, partly filled in from the dictionary by `app/staticText.ts`.

**Narrative layer.** `Story.ts` is deliberately separate from the renderer: it reads the per-frame `FrameState` (level index, local progress, dive) and drives its own DOM, and the only thing it hands back is a `pullback` amount that `main.ts` applies to the camera for the finale. That keeps a scene-agnostic story controller out of the per-level code. `Attract.ts` is the same idea for the landing — a slow ping-pong through the first scale's content that writes to the timeline while the card is up and hands the progress over on dismissal, so _Start_ and _Scroll it yourself_ both continue from wherever the drift had reached.

Level interface:

```ts
interface Level {
  meta: LevelMeta; // name, scale label, unitMeters, timeline weight
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
- At most three levels are alive. Levels outside the window dispose all their geometries, materials and textures, and renderer memory counters return to their starting values after a full cycle (checked in the smoke suite).
- DOF runs at half resolution and is switched off entirely in Explore mode.
- **Device tiers.** `quality.ts` probes cores, memory, pointer type and `prefers-reduced-motion` once and derives a coherent preset: pixel-ratio cap, MSAA samples, FXAA fallback, DOF, grain/chromatic amounts, and whether the neighbouring levels are cached and warmed up. `?quality=low|high` overrides it.
- **Adaptive resolution.** On the auto tiers, if the frame rate stays below ~52 fps for 1.5 s the render resolution steps down; after 8 s of smooth frames it steps back up. Hysteresis and cooldowns keep it from oscillating.
- **Robustness.** WebGL context loss pauses the loop, then rebuilds the environment and drops the cached levels on restore; `prefers-reduced-motion` disables parallax; the inspector's bounding rect is cached instead of read every frame; `?debug` shows FPS, frame time, draw calls, triangles, pixel ratio and tier.

## Accuracy notes

In the page, **How accurate is this?** under each scale's description lists, for that scale, what comes from published specs, what is representative, and what is deliberately not to scale (`src/content/en/accuracy.ts`).

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

Vite, TypeScript, Three.js r186, GSAP ScrollTrigger, [postprocessing](https://github.com/pmndrs/postprocessing), lil-gui, the Web Audio API and hand-written GLSL (FXAA, the thin-film shader, per-instance glow). No model, texture or audio files ship with the project.
