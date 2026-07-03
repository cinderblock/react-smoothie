import { describe, expect, it } from 'vitest';

import { TimeSeries } from './TimeSeries.js';

const T0 = 1_750_000_000_000;

describe('TimeSeries', () => {
  it('appends with explicit timestamps', () => {
    const ts = new TimeSeries();
    ts.append(1, T0);
    ts.append(2, T0 + 100);

    expect(ts.length).toBe(2);
    expect(ts.firstTime).toBe(T0);
    expect(ts.lastTime).toBe(T0 + 100);
    expect(ts.lastValue).toBe(2);
  });

  it('defaults the timestamp to now', () => {
    const ts = new TimeSeries();
    const before = Date.now();
    ts.append(42);
    const after = Date.now();

    expect(ts.lastTime).toBeGreaterThanOrEqual(before);
    expect(ts.lastTime).toBeLessThanOrEqual(after);
  });

  it('clamps out-of-order timestamps instead of throwing', () => {
    const ts = new TimeSeries();
    ts.append(1, T0);
    ts.append(2, T0 - 5000);

    expect(ts.lastTime).toBe(T0);
    expect(ts.length).toBe(2);
  });

  it('bumps revision on every mutation', () => {
    const ts = new TimeSeries();
    const r0 = ts.revision;
    ts.append(1, T0);
    expect(ts.revision).toBeGreaterThan(r0);

    const r1 = ts.revision;
    ts.clear();
    expect(ts.revision).toBeGreaterThan(r1);
  });

  it('records gaps as null samples', () => {
    const ts = new TimeSeries();
    ts.append(1, T0);
    ts.appendGap(T0 + 100);
    ts.append(3, T0 + 200);

    const [, values] = ts.window(T0, T0 + 200);
    expect(values).toEqual([1, null, 3]);
  });

  describe('eviction', () => {
    it('evicts samples older than retention, anchored to the newest sample', () => {
      const ts = new TimeSeries({ retention: 1000 });
      ts.append(1, T0);
      ts.append(2, T0 + 500);
      ts.append(3, T0 + 1400); // retention window is now [T0+400, T0+1400]

      expect(ts.length).toBe(2);
      expect(ts.firstTime).toBe(T0 + 500);
    });

    it('holds extend retention for detached viewers', () => {
      const ts = new TimeSeries({ retention: 1000, maxRetention: 10_000 });
      const viewer = {};
      ts.append(1, T0);
      ts.hold(viewer, T0);

      ts.append(2, T0 + 5000);
      expect(ts.firstTime).toBe(T0);

      ts.release(viewer);
      ts.evict(T0 + 5000);
      expect(ts.firstTime).toBe(T0 + 5000); // only the last sample survives
      expect(ts.length).toBe(1);
    });

    it('maxRetention caps holds', () => {
      const ts = new TimeSeries({ retention: 1000, maxRetention: 3000 });
      const viewer = {};
      ts.append(1, T0);
      ts.hold(viewer, T0);

      ts.append(2, T0 + 5000);
      // Hold requested T0, but the cap only reaches back 3000ms from now
      expect(ts.firstTime).toBe(T0 + 5000);
      expect(ts.length).toBe(1);
    });

    it('compacts the backing arrays after large evictions', () => {
      const ts = new TimeSeries({ retention: 1000 });
      for (let i = 0; i < 5000; i++) ts.append(i, T0 + i);
      ts.append(-1, T0 + 100_000);

      expect(ts.length).toBe(1);
      expect(ts.window(T0, T0 + 200_000)[1]).toEqual([-1]);
    });
  });

  describe('window', () => {
    it('returns samples in range plus one margin sample on each side', () => {
      const ts = new TimeSeries();
      for (let i = 0; i < 10; i++) ts.append(i, T0 + i * 100);

      const [times, values] = ts.window(T0 + 250, T0 + 650);
      expect(values).toEqual([2, 3, 4, 5, 6, 7]);
      expect(times[0]).toBe(T0 + 200);
      expect(times.at(-1)).toBe(T0 + 700);
    });

    it('handles ranges beyond the data', () => {
      const ts = new TimeSeries();
      ts.append(1, T0);

      expect(ts.window(T0 - 1000, T0 + 1000)[1]).toEqual([1]);
      expect(ts.window(T0 + 500, T0 + 1000)[1]).toEqual([1]); // margin sample
      expect(new TimeSeries().window(T0, T0 + 1000)[1]).toEqual([]);
    });
  });
});
