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
| Level build, sum | 269.2 | 0 |
| Level build, worst swap | 56.9 | 0 |
| Shader programs compiled during swaps | 66 | 0 |
| Shader warmup (background, off the swap) | — | 7395.4 |
| First frame, sum | 21344.3 | 11935 |
| First-frame overhead, sum | 9216.6 | 1312.1 |
| First-frame overhead, worst swap | 1440.9 | 362.4 |
| Live geometries, max | 41 | 54 |
| Textures, max | 35 | 39 |
| JS heap MB, max | 17.1 | 23.3 |

## Per swap (before → after)

| swap | build | warmup | first frame | overhead | programs | geometries | heap MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| · 1. GeForce RTX 5090 | 57.2 → 45.9 | 0 | 1281.3 → 1306.1 | 619.7 → 741.2 | 17 → 17 | 41 → 41 | 12.3 → 12.9 |
| ↓ 2. Main PCB | 44.3 → 0 | 274.6 | 1792.8 → 584.3 | 1251.9 → 96.8 | 4 → 0 | 15 → 54 | 10.7 → 10.3 |
| ↓ 3. GB202 package | 33.9 → 0 | 247 | 2455.3 → 1172 | 1440.9 → 147.1 | 5 → 0 | 16 → 29 | 10.2 → 16.9 |
| ↓ 4. GB202 die | 1.3 → 0 | 73.1 | 581.9 → 498.9 | 0 → 122.9 | 2 → 0 | 5 → 19 | 10.3 → 19.9 |
| ↓ 5. Metal stack | 13.9 → 0 | 739 | 2783.2 → 2377.1 | 382.4 → 362.4 | 4 → 0 | 25 → 28 | 12.5 → 18.5 |
| ↓ 6. FinFET transistors | 5.9 → 0 | 572.2 | 2190.3 → 1062.9 | 1027.2 → 94.8 | 10 → 0 | 5 → 28 | 11.5 → 19.3 |
| ↓ 7. Silicon lattice | 12.7 → 0 | 1064.1 | 1309.8 → 995.4 | 261.1 → 104.4 | 5 → 0 | 7 → 10 | 9.6 → 20.9 |
| ↓ 8. Silicon atom | 56.9 → 0 | 127.6 | 711.4 → 437.5 | 254.9 → 98 | 2 → 0 | 4 → 9 | 13.2 → 23.3 |
| ↑ 7. Silicon lattice | 3.5 → 0 | 1064.1 | 1357.6 → 958.9 | 395.3 → 50.6 | 5 → 0 | 7 → 9 | 13.5 → 11.8 |
| ↑ 6. FinFET transistors | 1.4 → 0 | 1858.1 | 1843.6 → 780.5 | 964.7 → 201.7 | 10 → 0 | 5 → 10 | 15 → 13.9 |
| ↑ 5. Metal stack | 9.5 → 0 | 761.4 | 1904.5 → 1530 | 439.9 → 0 | 4 → 0 | 25 → 28 | 16.8 → 14.2 |
| ↑ 4. GB202 die | 1.1 → 0 | 47.1 | 346.6 → 216 | 155.8 → 3 | 2 → 0 | 5 → 28 | 15.8 → 14.3 |
| ↑ 3. GB202 package | 23.6 → 0 | 464.6 | 2095.7 → 850.5 | 1251.1 → 30.4 | 5 → 0 | 16 → 19 | 10.7 → 11.5 |
| ↑ 2. Main PCB | 27.8 → 0 | 74.4 | 1374.1 → 201.6 | 1076.2 → 0 | 4 → 0 | 15 → 29 | 10 → 10.2 |
| ↑ 1. GeForce RTX 5090 | 33.4 → 0 | 28.1 | 597.5 → 269.4 | 315.2 → 0 | 4 → 0 | 41 → 54 | 17.1 → 17.5 |

**Transition** (swap decision → first frame on screen) is in the raw files but not compared here: under
SwiftShader it is dominated by draining frames already queued on the software GPU, which says nothing
about a real GPU. On hardware it is ≈ build + first frame.
