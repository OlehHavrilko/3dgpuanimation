/**
 * Keeps a render loop from dying silently. An exception inside a requestAnimationFrame callback
 * that runs before the next `requestAnimationFrame` call ends the loop and leaves a black page.
 *
 * `run(fn)` returns true while the loop should keep going. A single failure is logged and the loop
 * carries on (it is usually transient, e.g. one bad frame); `maxFailures` failures in a row call
 * `onFatal` once and return false, so the caller stops scheduling frames and shows the fallback.
 * Errors are always logged with console.error, so tests that collect them still fail.
 */
export function createFrameGuard(onFatal: (err: unknown) => void, maxFailures = 3) {
  let failures = 0;
  return {
    run(fn: () => void): boolean {
      try {
        fn();
        failures = 0;
        return true;
      } catch (err) {
        failures++;
        console.error(`[render] frame failed (${failures}/${maxFailures})`, err);
        if (failures < maxFailures) return true;
        onFatal(err);
        return false;
      }
    },
  };
}
