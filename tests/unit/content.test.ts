import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../../src/content';
import { en } from '../../src/content/en';
import { ru } from '../../src/content/ru';
import { powerOfTen } from '../../src/core/math';
import type { EntityInfo } from '../../src/core/types';

const levels = Object.entries(content.levels);

describe('content dictionary', () => {
  it('has all nine levels with name, scale, description and a follow narration', () => {
    expect(levels.map(([k]) => k)).toEqual([
      'card',
      'pcb',
      'package',
      'die',
      'metal',
      'transistor',
      'lattice',
      'atom',
      'nucleus',
    ]);
    for (const [, l] of levels) {
      expect(l.meta.name.length).toBeGreaterThan(0);
      expect(powerOfTen(l.meta.scale)).toMatch(/^10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+ m$/);
      expect(l.meta.description.length).toBeGreaterThan(10);
      const follow = typeof l.follow === 'function' ? l.follow(11) : l.follow;
      expect(follow.length).toBeGreaterThan(10);
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
    expect(content.accuracy.levels).toHaveLength(9);
    for (const n of content.accuracy.levels) {
      expect(n.spec.length + n.representative.length + n.notToScale.length).toBeGreaterThan(0);
    }
  });

  it('UI helpers format their arguments', () => {
    expect(content.ui.dive('5 cm')).toBe('Dive ▸ 5 cm');
    expect(content.ui.traceStage(2, 4, 'Cache')).toBe('Trace 2/4 · Cache');
  });
});

describe('Russian dictionary', () => {
  /** Leaf paths of a dictionary (functions count as leaves), so a missing key shows by name. */
  const paths = (o: unknown, prefix = ''): string[] =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o).flatMap(([k, v]) => paths(v, `${prefix}${k}.`))
      : [prefix.slice(0, -1)];
  const skip = (p: string) => p.startsWith('ui.options');

  it('has every key the English one has', () => {
    expect(paths(ru).filter((p) => !skip(p))).toEqual(paths(en).filter((p) => !skip(p)));
  });

  it('keeps lists the same length (captions, glossary, accuracy, sources)', () => {
    expect(ru.reference.glossary.length).toBe(en.reference.glossary.length);
    expect(ru.reference.sources.length).toBe(en.reference.sources.length);
    expect(ru.reference.glossary.map((g) => g.level)).toEqual(en.reference.glossary.map((g) => g.level));
    expect(ru.levels.metal.layerNames).toHaveLength(en.levels.metal.layerNames.length);
    for (const [k, l] of Object.entries(en.levels)) {
      const r = ru.levels[k as keyof typeof en.levels];
      if (Array.isArray(l.captions)) expect((r.captions as string[]).length).toBe(l.captions.length);
    }
    en.accuracy.levels.forEach((n, i) => {
      const r = ru.accuracy.levels[i];
      expect([r.spec.length, r.representative.length, r.notToScale.length]).toEqual([
        n.spec.length,
        n.representative.length,
        n.notToScale.length,
      ]);
    });
  });

  it('Russian scale labels parse to the same orders of magnitude', () => {
    const order = (d: typeof en) => Object.values(d.levels).map((l) => powerOfTen(l.meta.scale).split(' ')[0]);
    expect(order(ru)).toEqual(order(en));
  });

  it('translates every choice option the levels offer', () => {
    const options = ['Normal', 'X-Ray', 'Section', 'Thermal', 'Stop', 'Idle', 'Load', 'Off', 'Slow', 'Realtime'];
    options.push('Burst', 'None', 'Memory', 'OFF', 'ON', 'CLOCK', 'MANUAL', 'Mixed', 'Intrinsic', 'N-type', 'P-type');
    for (const o of [...options, 'All']) expect(ru.ui.options[o], o).toBeTruthy();
  });
});

describe('index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  it('only uses data-i18n keys the dictionary defines', () => {
    const keys = [...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) expect(Object.keys(en.ui.static), k).toContain(k);
  });
});
