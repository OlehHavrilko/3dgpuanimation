import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameGuard } from '../../src/app/frameGuard';

describe('createFrameGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps going after an isolated failure and logs it', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFatal = vi.fn();
    const g = createFrameGuard(onFatal, 3);
    expect(g.run(() => {})).toBe(true);
    expect(
      g.run(() => {
        throw new Error('boom');
      }),
    ).toBe(true);
    expect(g.run(() => {})).toBe(true);
    expect(err).toHaveBeenCalledTimes(1);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('stops and reports once after N consecutive failures; a success resets the count', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFatal = vi.fn();
    const g = createFrameGuard(onFatal, 3);
    const bad = () => {
      throw new Error('boom');
    };
    expect(g.run(bad)).toBe(true);
    expect(g.run(bad)).toBe(true);
    expect(g.run(() => {})).toBe(true); // reset
    expect(g.run(bad)).toBe(true);
    expect(g.run(bad)).toBe(true);
    expect(g.run(bad)).toBe(false);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});
