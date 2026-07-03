import { describe, expect, it, vi } from 'vitest';

import { SyncGroup, syncGroupFor } from './SyncGroup.js';

describe('SyncGroup', () => {
  it('transitions between live and detached, notifying subscribers', () => {
    const group = new SyncGroup();
    const listener = vi.fn();
    group.subscribe(listener);

    group.detach([1000, 2000]);
    expect(group.view).toEqual({ live: false, range: [1000, 2000] });
    expect(listener).toHaveBeenCalledTimes(1);

    group.goLive();
    expect(group.view).toEqual({ live: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('goLive can adopt a new trailing window', () => {
    const group = new SyncGroup();
    group.goLive(10_000);
    expect(group.window).toBe(10_000);
  });

  it('unsubscribe stops notifications', () => {
    const group = new SyncGroup();
    const listener = vi.fn();
    const unsubscribe = group.subscribe(listener);

    unsubscribe();
    group.detach([0, 1]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify for no-op window/freeze changes', () => {
    const group = new SyncGroup();
    const listener = vi.fn();
    group.subscribe(listener);

    group.setWindow(undefined);
    group.setFrozenAt(undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  it('syncGroupFor returns the same group per key', () => {
    expect(syncGroupFor('a')).toBe(syncGroupFor('a'));
    expect(syncGroupFor('a')).not.toBe(syncGroupFor('b'));
    expect(syncGroupFor('a').key).toBe('a');
  });
});
