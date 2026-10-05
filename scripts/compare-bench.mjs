// Usage: node scripts/compare-bench.mjs bench/baseline.json bench/after.json > bench/comparison.md
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const r1 = (v) => Math.round(v * 10) / 10;
const sum = (rs, k) => r1(rs.reduce((s, r) => s + r[k], 0));
const overhead = (r) => Math.max(0, r.firstFrameMs - r.nextFrameMs);
// Skip the first activation: the initial page load is the same in both runs.
const swaps = (run) => run.records.slice(1);

const rows = [];
for (let i = 0; i < a.records.length; i++) {
  const x = a.records[i];
  const y = b.records[i];
  rows.push(
    `| ${i ? (i < 8 ? '↓' : '↑') : '·'} ${x.index + 1}. ${x.name} | ${x.buildMs} → ${y.buildMs} | ${y.warmupMs} | ` +
      `${x.firstFrameMs} → ${y.firstFrameMs} | ${r1(overhead(x))} → ${r1(overhead(y))} | ` +
      `${x.programsCompiled} → ${y.programsCompiled} | ${x.geometries} → ${y.geometries} | ${x.heapMB} → ${y.heapMB} |`,
  );
}
const A = swaps(a);
const B = swaps(b);
const tot = (rs, f) => r1(rs.reduce((s, r) => s + f(r), 0));
const max = (rs, k) => Math.max(...rs.map((r) => r[k]));

console.log(`# Level cache: before / after

\`${a.label}\` (level cache off, \`?cache=0\`) vs \`${b.label}\` (current + previous + next kept built and warmed up).
Both runs: same build, Chromium + SwiftShader (${a.env.gl.includes('SwiftShader') ? 'software GL, CPU-bound' : a.env.gl}),
walk 1 → 8 → 1, 1.5 s dwell + background work finished before each swap. Times in ms.

- **Build**: \`create()\` + \`init()\` on the critical path of the swap.
- **Warmup**: background shader compile + GPU upload of a neighbour (idle time, off the critical path).
- **First frame**: first render after the swap, GPU-synchronised. **Overhead** = first frame − the next frame:
  what the swap itself costs on top of normal rendering (shader compiles, buffer/texture upload).
- **Memory**: live geometries in the renderer and JS heap at the first frame.

## Totals over the 14 swaps

| metric | before | after |
| --- | --- | --- |
| Level build, sum | ${sum(A, 'buildMs')} | ${sum(B, 'buildMs')} |
| Level build, worst swap | ${max(A, 'buildMs')} | ${max(B, 'buildMs')} |
| Shader programs compiled during swaps | ${sum(A, 'programsCompiled')} | ${sum(B, 'programsCompiled')} |
| Shader warmup (background, off the swap) | — | ${sum(B, 'warmupMs')} |
| First frame, sum | ${sum(A, 'firstFrameMs')} | ${sum(B, 'firstFrameMs')} |
| First-frame overhead, sum | ${tot(A, overhead)} | ${tot(B, overhead)} |
| First-frame overhead, worst swap | ${r1(Math.max(...A.map(overhead)))} | ${r1(Math.max(...B.map(overhead)))} |
| Live geometries, max | ${max(A, 'geometries')} | ${max(B, 'geometries')} |
| Textures, max | ${max(A, 'textures')} | ${max(B, 'textures')} |
| JS heap MB, max | ${max(A, 'heapMB')} | ${max(B, 'heapMB')} |

## Per swap (before → after)

| swap | build | warmup | first frame | overhead | programs | geometries | heap MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

**Transition** (swap decision → first frame on screen) is in the raw files but not compared here: under
SwiftShader it is dominated by draining frames already queued on the software GPU, which says nothing
about a real GPU. On hardware it is ≈ build + first frame.`);
