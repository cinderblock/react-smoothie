import 'uplot/dist/uPlot.min.css';

import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';

import type { StreamChartHandle } from './index.js';
import { StreamChart, TimeSeries } from './index.js';

/** Backfill a series with `hz` samples/sec over the trailing `spanMs` */
function feed(ts: TimeSeries, spanMs = 5000, hz = 100): TimeSeries {
  const now = Date.now();
  for (let t = now - spanMs; t <= now; t += 1000 / hz) {
    ts.append(Math.sin(t / 500) * 50 + 50, t);
  }
  return ts;
}

function frames(n: number): Promise<void> {
  return new Promise(resolve => {
    const step = (remaining: number) =>
      remaining <= 0 ? resolve() : requestAnimationFrame(() => step(remaining - 1));
    step(n);
  });
}

function mouse(target: EventTarget, type: string, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      // uPlot ignores mid-drag mousemoves with zero movement (Chrome stray-event
      // workaround); synthetic events default movementX/Y to 0, so claim movement.
      movementX: 1,
      movementY: 0,
    }),
  );
}

/**
 * Drag horizontally across a chart's plot area, from/to fractions of its width.
 * uPlot processes cursor moves on animation frames, so each step waits a frame.
 */
async function drag(handle: StreamChartHandle, fromFraction: number, toFraction: number) {
  const over = handle.uplot!.over;
  const rect = over.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const from = rect.left + rect.width * fromFraction;
  const to = rect.left + rect.width * toFraction;

  mouse(over, 'mousemove', from, y);
  await frames(1);
  mouse(over, 'mousedown', from, y);
  await frames(1);
  mouse(over, 'mousemove', (from + to) / 2, y);
  await frames(1);
  mouse(over, 'mousemove', to, y);
  await frames(1);
  mouse(over, 'mouseup', to, y);
  await frames(1);
}

function chart(ref: React.Ref<StreamChartHandle>, series: TimeSeries, extra?: Partial<React.ComponentProps<typeof StreamChart>>) {
  return (
    <StreamChart
      ref={ref}
      series={[{ data: series, label: 'test' }]}
      window={10_000}
      width={600}
      height={200}
      syncKey={false}
      {...extra}
    />
  );
}

describe('StreamChart (real browser)', () => {
  it('renders streaming data onto a real uPlot canvas and follows now', async () => {
    const ts = feed(new TimeSeries());
    const ref = React.createRef<StreamChartHandle>();
    const screen = await render(chart(ref, ts));

    await frames(3);

    const u = ref.current!.uplot!;
    expect(screen.container.querySelector('canvas')).toBeTruthy();
    expect(u.data[0].length).toBeGreaterThan(100);

    // Live: the window's right edge tracks now and keeps advancing
    const firstMax = u.scales.x.max!;
    expect(firstMax).toBeGreaterThan(Date.now() - 1000);

    await frames(5);
    expect(u.scales.x.max!).toBeGreaterThan(firstMax);
  });

  it('appended samples appear on the next frame', async () => {
    const ts = feed(new TimeSeries());
    const ref = React.createRef<StreamChartHandle>();
    await render(chart(ref, ts));

    await frames(2);
    const before = ref.current!.uplot!.data[0].length;

    ts.append(123);
    await frames(2);
    expect(ref.current!.uplot!.data[0].length).toBe(before + 1);
  });

  it('drag-zoom detaches; the badge returns to live', async () => {
    const ts = feed(new TimeSeries(), 20_000);
    const ref = React.createRef<StreamChartHandle>();
    const screen = await render(chart(ref, ts));

    await frames(2);
    expect(ref.current!.getViewRange()).toBeNull();

    await drag(ref.current!, 0.1, 0.4);
    await frames(2);

    const range = ref.current!.getViewRange();
    expect(range).not.toBeNull();
    // Roughly the dragged 30% of the 10s window, well before "now"
    expect(range![1] - range![0]).toBeGreaterThan(2000);
    expect(range![1] - range![0]).toBeLessThan(4000);

    // The detached chart still has data under the view (held from eviction)
    expect(ref.current!.uplot!.data[0].length).toBeGreaterThan(0);

    await screen.getByRole('button').click();
    expect(ref.current!.getViewRange()).toBeNull();
  });

  it('wheel zoom changes the timebase without detaching', async () => {
    const ts = feed(new TimeSeries());
    const ref = React.createRef<StreamChartHandle>();
    await render(chart(ref, ts));

    await frames(2);
    const over = ref.current!.uplot!.over;

    over.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
    expect(ref.current!.getViewRange()).toBeNull(); // still live
    expect(ref.current!.group.window).toBe(10_000 / 1.25);

    over.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
    expect(ref.current!.group.window).toBe(10_000);
  });

  it('double-click returns to live and resets the timebase', async () => {
    const ts = feed(new TimeSeries(), 20_000);
    const ref = React.createRef<StreamChartHandle>();
    await render(chart(ref, ts));

    await frames(2);
    await drag(ref.current!, 0.1, 0.4);
    expect(ref.current!.getViewRange()).not.toBeNull();

    ref.current!.uplot!.over.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(ref.current!.getViewRange()).toBeNull();
    expect(ref.current!.group.window).toBeUndefined();
  });

  it('charts with the same syncKey zoom together', async () => {
    const a = feed(new TimeSeries(), 20_000);
    const b = feed(new TimeSeries(), 20_000);
    const refA = React.createRef<StreamChartHandle>();
    const refB = React.createRef<StreamChartHandle>();

    await render(
      <div>
        {chart(refA, a, { syncKey: 'pair' })}
        {chart(refB, b, { syncKey: 'pair' })}
      </div>,
    );

    await frames(2);
    await drag(refA.current!, 0.2, 0.5);
    await frames(2);

    const rangeA = refA.current!.getViewRange();
    const rangeB = refB.current!.getViewRange();
    expect(rangeA).not.toBeNull();
    expect(rangeB).toEqual(rangeA);

    refB.current!.setLive(true);
    expect(refA.current!.getViewRange()).toBeNull();
  });
});
