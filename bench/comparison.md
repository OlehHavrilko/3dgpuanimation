# Level cache: before / after

`baseline` (level cache off, `?cache=0`) vs `after` (current + previous + next kept built and warmed up).
Both runs: same build, Chromium + SwiftShader (software GL, CPU-bound),
walk 1 → 8 → 1, 1.5 s dwell + background work finished before each swap. Times in ms.

- **Build**: `create()` + `init()` on the critical path of the swap.
- **Warmup**: background shader compile + GPU upload of a neighbour (idle time, off the critical path).
- **First frame**: first render after the swap, GPU-synchronised. **Overhead** = first frame − the next frame:
  what the swap itself costs on top of normal rendering (shader compiles, buffer/texture upload).
- **Memory**: live geometries in the renderer and JS heap at the first frame.

## Totals over the 14 swaps

| metric | before | after |
| --- | --- | --- |
| Level build, sum | 263.3 | 0 |
| Level build, worst swap | 46.7 | 0 |
| Shader programs compiled during swaps | 66 | 0 |
| Shader warmup (background, off the swap) | — | 9184.8 |
| First frame, sum | 21385.5 | 11743.8 |
| First-frame overhead, sum | 9854.9 | 1148.1 |
| First-frame overhead, worst swap | 1665.9 | 400.7 |
| Live geometries, max | 41 | 54 |
| Textures, max | 35 | 39 |
| JS heap MB, max | 16.2 | 23 |

## Per swap (before → after)

| swap | build | warmup | first frame | overhead | programs | geometries | heap MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| · 1. GeForce RTX 5090 | 74.6 → 51.6 | 0 | 1639.3 → 1258.1 | 1110.8 → 739.4 | 17 → 17 | 41 → 41 | 12.4 → 14.8 |
| ↓ 2. Main PCB | 30.6 → 0 | 291.7 | 2223.6 → 555.2 | 1665.9 → 120.5 | 4 → 0 | 15 → 54 | 10.5 → 9.8 |
| ↓ 3. GB202 package | 40.7 → 0 | 1201.9 | 2464.9 → 1059 | 1458.5 → 74.4 | 5 → 0 | 16 → 29 | 13 → 18.1 |
| ↓ 4. GB202 die | 1.3 → 0 | 1034.7 | 508.1 → 436.1 | 178.5 → 0 | 2 → 0 | 5 → 19 | 15.5 → 21 |
| ↓ 5. Metal stack | 17.5 → 0 | 245.1 | 2874.7 → 2382.7 | 334.6 → 400.7 | 4 → 0 | 25 → 28 | 13.1 → 16.9 |
| ↓ 6. FinFET transistors | 3.6 → 0 | 555.7 | 1974.6 → 1083.4 | 1134.3 → 133.5 | 10 → 0 | 5 → 28 | 11.1 → 19.2 |
| ↓ 7. Silicon lattice | 14.9 → 0 | 1024.4 | 1321.2 → 984.1 | 301.8 → 66.3 | 5 → 0 | 7 → 10 | 9.4 → 19.2 |
| ↓ 8. Silicon atom | 46.7 → 0 | 125.3 | 702 → 462.2 | 209.8 → 78.3 | 2 → 0 | 4 → 9 | 12.9 → 21.6 |
| ↑ 7. Silicon lattice | 4 → 0 | 1024.4 | 1300.4 → 997.1 | 344.6 → 112.2 | 5 → 0 | 7 → 9 | 13 → 22.1 |
| ↑ 6. FinFET transistors | 1.3 → 0 | 1151.5 | 1611.7 → 743.5 | 986.9 → 65.5 | 10 → 0 | 5 → 10 | 14.5 → 23 |
| ↑ 5. Metal stack | 14.8 → 0 | 128 | 1874.3 → 1462.5 | 361 → 5.8 | 4 → 0 | 25 → 28 | 16.2 → 16.2 |
| ↑ 4. GB202 die | 0.9 → 0 | 41 | 336.2 → 205.2 | 112.4 → 1.3 | 2 → 0 | 5 → 28 | 15.8 → 10.6 |
| ↑ 3. GB202 package | 22.9 → 0 | 1073.8 | 2126.4 → 845 | 1257.7 → 31 | 5 → 0 | 16 → 19 | 10.5 → 13.1 |
| ↑ 2. Main PCB | 18.8 → 0 | 1254.8 | 1354.8 → 223.3 | 1089 → 50 | 4 → 0 | 15 → 29 | 10.8 → 10.1 |
| ↑ 1. GeForce RTX 5090 | 45.3 → 0 | 32.5 | 712.6 → 304.5 | 419.9 → 8.6 | 4 → 0 | 41 → 54 | 16 → 17.1 |

**Transition** (swap decision → first frame on screen) is in the raw files but not compared here: under
SwiftShader it is dominated by draining frames already queued on the software GPU, which says nothing
about a real GPU. On hardware it is ≈ build + first frame.
