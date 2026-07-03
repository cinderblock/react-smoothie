import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoordinatedChart, RenderCoordinator } from './RenderCoordinator.js';

/** Manually-stepped requestAnimationFrame */
let rafCallbacks: Map<number, FrameRequestCallback>;
let rafId: number;
let frameTime: number;

function stepFrame(elapsed = 16) {
  frameTime += elapsed;
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  callbacks.forEach(cb => cb(frameTime));
}

function fakeChart() {
  return { renderFrame: vi.fn() } satisfies CoordinatedChart;
}

/**
 * Track registrations so coordinators are fully emptied after each test — otherwise they
 * keep watching visibilitychange and wake up in later tests.
 */
let registrations: [RenderCoordinator, CoordinatedChart][];

function register(coordinator: RenderCoordinator, chart: CoordinatedChart, options?: { paused?: boolean }) {
  coordinator.register(chart, options);
  registrations.push([coordinator, chart]);
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  rafCallbacks = new Map();
  rafId = 0;
  frameTime = 1000;
  registrations = [];

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.set(++rafId, cb);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
});

afterEach(() => {
  registrations.forEach(([coordinator, chart]) => coordinator.unregister(chart));
  vi.unstubAllGlobals();
  setHidden(false);
});

describe('RenderCoordinator', () => {
  it('drives all registered charts from one loop', () => {
    const coordinator = new RenderCoordinator();
    const a = fakeChart();
    const b = fakeChart();

    register(coordinator, a);
    register(coordinator, b);
    expect(rafCallbacks.size).toBe(1); // one shared loop, not one per chart

    stepFrame();
    expect(a.renderFrame).toHaveBeenCalledTimes(1);
    expect(b.renderFrame).toHaveBeenCalledTimes(1);

    // All charts see the same "now" snapshot per frame
    expect(a.renderFrame.mock.calls[0][0]).toBe(b.renderFrame.mock.calls[0][0]);
  });

  it('stops the loop when the last chart unregisters', () => {
    const coordinator = new RenderCoordinator();
    const chart = fakeChart();

    register(coordinator, chart);
    expect(rafCallbacks.size).toBe(1);

    coordinator.unregister(chart);
    expect(rafCallbacks.size).toBe(0);
  });

  it('caps the frame rate', () => {
    const coordinator = new RenderCoordinator({ fps: 25 }); // one render per 40ms
    const chart = fakeChart();
    register(coordinator, chart);

    stepFrame(16); // first frame always renders (establishes the time base)
    stepFrame(16); // 16ms since base: skipped
    stepFrame(16); // 32ms: skipped
    stepFrame(16); // 48ms: rendered

    expect(chart.renderFrame).toHaveBeenCalledTimes(2);
  });

  it('skips paused charts but keeps rendering others', () => {
    const coordinator = new RenderCoordinator();
    const running = fakeChart();
    const paused = fakeChart();

    register(coordinator, running);
    register(coordinator, paused, { paused: true });

    stepFrame();
    expect(running.renderFrame).toHaveBeenCalledTimes(1);
    expect(paused.renderFrame).not.toHaveBeenCalled();

    // Re-registering updates per-chart options in place
    register(coordinator, paused, { paused: false });
    stepFrame();
    expect(paused.renderFrame).toHaveBeenCalledTimes(1);
  });

  it('setPaused freezes and resumes the whole loop', () => {
    const coordinator = new RenderCoordinator();
    const chart = fakeChart();
    register(coordinator, chart);

    coordinator.setPaused(true);
    expect(rafCallbacks.size).toBe(0);

    coordinator.setPaused(false);
    expect(rafCallbacks.size).toBe(1);
    stepFrame();
    expect(chart.renderFrame).toHaveBeenCalledTimes(1);
  });

  it('hard-stops while the tab is hidden and resumes on visibility', () => {
    const coordinator = new RenderCoordinator();
    const chart = fakeChart();
    register(coordinator, chart);

    setHidden(true);
    expect(rafCallbacks.size).toBe(0);

    setHidden(false);
    expect(rafCallbacks.size).toBe(1);
    stepFrame();
    expect(chart.renderFrame).toHaveBeenCalledTimes(1);
  });
});
