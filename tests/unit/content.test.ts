import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { powerOfTen } from '../../src/core/math';
import type { EntityInfo } from '../../src/core/types';

const levels = Object.entries(content.levels);

describe('content dictionary', () => {
  it('has all eight levels with name, scale, description and a follow narration', () => {
    expect(levels.map(([k]) => k)).toEqual(['card', 'pcb', 'package', 'die', 'metal', 'transistor', 'lattice', 'atom']);
    for (const [, l] of levels) {
      expect(l.meta.name.length).toBeGreaterThan(0);
      expect(powerOfTen(l.meta.scale)).toMatch(/^10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+ m$/);
      expect(l.meta.description.length).toBeGreaterThan(10);
      expect(l.follow.length).toBeGreaterThan(10);
    }
  });

  it('every static entity has a title and a kind; parametric ones produce them', () => {
    const check = (info: EntityInfo) => {
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.kind.length).toBeGreaterThan(0);
    };
    for (const [, l] of levels) {
      for (const [, v] of Object.entries(l.entities as Record<string, unknown>)) {
        if (typeof v === 'string') continue; // e.g. a title fragment
        if (typeof v === 'function') continue; // covered by the explicit calls below
        if (v && typeof v === 'object' && 'title' in v) check(v as EntityInfo);
      }
    }
    check(content.levels.card.entities.memory(3));
    check(content.levels.pcb.entities.traceArrival(5));
    check(content.levels.metal.entities.layer('M7', 0.08, true, 9));
    check(content.levels.lattice.entities.silicon('0, 0, 0 Å', true));
    expect(
      content.levels.die.entities.block({ kind: 'sm', key: 'sm0', rect: [0, 0, 1, 1], gpc: 0, sm: 4, off: true }).title,
    ).toBe('SM 5 (fused off)');
  });

  it('has an accuracy note for every level, each with at least one entry', () => {
    expect(content.accuracy.levels).toHaveLength(8);
    for (const n of content.accuracy.levels) {
      expect(n.spec.length + n.representative.length + n.notToScale.length).toBeGreaterThan(0);
    }
  });

  it('UI helpers format their arguments', () => {
    expect(content.ui.dive('5 cm')).toBe('Dive ▸ 5 cm');
    expect(content.ui.traceStage(2, 4, 'Cache')).toBe('Trace 2/4 · Cache');
  });
});
