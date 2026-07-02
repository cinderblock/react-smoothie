import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SmoothieChart } from 'smoothie';

import SmoothieComponent, { SmoothieProvider, TimeSeries } from './SmoothieComponent';

/**
 * Controllable requestAnimationFrame: callbacks queue up until pumpFrame() runs them.
 * The number of queued callbacks is the number of live animation loops.
 */
let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let now: number;

function pumpFrame(deltaMillis = 16) {
  now += deltaMillis;
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  callbacks.forEach(callback => callback(now));
}

/** Stubbed-out chart draw calls, one per chart per coordinated frame */
let renderSpy: ReturnType<typeof vi.spyOn>;

let documentHidden = false;

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  now = 0;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });

  // jsdom has no 2d canvas context; the coordinator only needs render() to be callable anyway
  renderSpy = vi.spyOn(SmoothieChart.prototype, 'render').mockImplementation(() => {});

  documentHidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => documentHidden });
});

afterEach(() => {
  cleanup();
  delete (document as { hidden?: boolean }).hidden;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setDocumentHidden(hidden: boolean) {
  documentHidden = hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}

function charts(count: number, props: Partial<React.ComponentProps<typeof SmoothieComponent>> = {}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SmoothieComponent key={i} series={[{ data: new TimeSeries() }]} {...props} />
      ))}
    </>
  );
}

describe('coordinated rendering (default)', () => {
  it('drives multiple charts from a single animation loop', () => {
    render(charts(5));

    // One loop, not five
    expect(rafCallbacks.size).toBe(1);

    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(5);

    // Loop keeps going
    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(10);
  });

  it('keeps tooltip mouse tracking working even though the chart is not self-animating', () => {
    const ref = React.createRef<SmoothieComponent>();
    render(<SmoothieComponent ref={ref} tooltip />);

    const canvas = ref.current!.canvas!;
    canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

    expect((ref.current!.smoothie as unknown as { mouseover: boolean }).mouseover).toBe(true);
  });

  it('stops the loop when the last chart unmounts, and survives add/remove', () => {
    const first = render(charts(2));
    const second = render(charts(1));
    expect(rafCallbacks.size).toBe(1);

    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(3);

    first.unmount();
    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(4);

    second.unmount();
    expect(rafCallbacks.size).toBe(0);
  });

  it('passes streamDelay to the chart and picks up changes', () => {
    const ref = React.createRef<SmoothieComponent>();
    const view = render(<SmoothieComponent ref={ref} streamDelay={250} />);

    const chart = ref.current!.smoothie as unknown as { delay?: number };
    expect(chart.delay).toBe(250);

    view.rerender(<SmoothieComponent ref={ref} streamDelay={750} />);
    expect(chart.delay).toBe(750);
  });

  it('works under React.StrictMode without leaking loops', () => {
    const view = render(<React.StrictMode>{charts(3)}</React.StrictMode>);

    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(3);

    view.unmount();
    expect(rafCallbacks.size).toBe(0);
  });
});

describe('tab visibility', () => {
  it('hard-stops the loop while hidden and resumes when visible again', () => {
    render(charts(2));

    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(2);

    setDocumentHidden(true);
    expect(rafCallbacks.size).toBe(0);

    setDocumentHidden(false);
    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(4);
  });

  it('does not lose registrations while hidden', () => {
    const view = render(charts(2));

    setDocumentHidden(true);
    view.rerender(charts(2)); // updates while hidden are fine
    setDocumentHidden(false);

    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });
});

describe('<SmoothieProvider>', () => {
  it('fps caps the frame rate of its subtree', () => {
    render(<SmoothieProvider fps={1}>{charts(1)}</SmoothieProvider>);

    // First frame always renders, then nothing until 1000ms have passed
    pumpFrame();
    pumpFrame();
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(1);

    pumpFrame(1000);
    expect(renderSpy).toHaveBeenCalledTimes(2);

    // Loop stays alive between rendered frames
    expect(rafCallbacks.size).toBe(1);
  });

  it('paused freezes the subtree and resumes cleanly', () => {
    const view = render(<SmoothieProvider paused>{charts(2)}</SmoothieProvider>);

    expect(rafCallbacks.size).toBe(0);
    expect(renderSpy).not.toHaveBeenCalled();

    view.rerender(<SmoothieProvider paused={false}>{charts(2)}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(2);

    view.rerender(<SmoothieProvider paused>{charts(2)}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(0);
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('runs its own loop, separate from the global coordinator', () => {
    render(
      <>
        {charts(1)}
        <SmoothieProvider>{charts(1)}</SmoothieProvider>
      </>
    );

    expect(rafCallbacks.size).toBe(2);
  });

  it('coordinate={false} restores per-chart self-animation', () => {
    render(<SmoothieProvider coordinate={false}>{charts(3)}</SmoothieProvider>);

    // One smoothie-owned loop per chart
    expect(rafCallbacks.size).toBe(3);

    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(3);
    expect(rafCallbacks.size).toBe(3);
  });

  it('moves charts between animation modes when coordinate changes', () => {
    const view = render(<SmoothieProvider coordinate>{charts(2)}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(1);

    view.rerender(<SmoothieProvider coordinate={false}>{charts(2)}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(2);

    view.rerender(<SmoothieProvider coordinate>{charts(2)}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(1);

    view.unmount();
    expect(rafCallbacks.size).toBe(0);
  });
});

describe('per-chart paused prop', () => {
  it('skips paused charts in the coordinated loop', () => {
    render(
      <>
        {charts(1)}
        {charts(1, { paused: true })}
      </>
    );

    expect(rafCallbacks.size).toBe(1);
    pumpFrame();
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it('stops and restarts a self-animating chart', () => {
    const view = render(<SmoothieProvider coordinate={false}>{charts(1, { paused: true })}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(0);

    view.rerender(<SmoothieProvider coordinate={false}>{charts(1, { paused: false })}</SmoothieProvider>);
    expect(rafCallbacks.size).toBe(1);
  });
});
