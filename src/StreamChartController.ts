import uPlot from 'uplot';

import type { CoordinatedChart } from './RenderCoordinator.js';
import type { SyncGroup } from './SyncGroup.js';
import type { TimeSeries } from './TimeSeries.js';

export type PathStyle = 'linear' | 'step' | 'spline';

export interface SeriesConfig {
  /** The buffer to plot. One `TimeSeries` may be shown by any number of charts. */
  data: TimeSeries;
  label?: string;
  /** Line color (any CSS color). Defaults to a per-index palette color. */
  stroke?: string;
  /** Area fill color under the line (any CSS color) */
  fill?: string;
  /** Line width in CSS pixels. _default: 2_ */
  width?: number;
  dash?: number[];
  /** Line shape between samples. _default: 'linear'_ */
  paths?: PathStyle;
  /** Connect the line across explicit gaps (`appendGap`) instead of breaking it */
  spanGaps?: boolean;
}

/** Everything the controller needs that can change between renders */
export interface ControllerConfig {
  series: SeriesConfig[];
  /** Trailing view duration while live, ms */
  window: number;
  /** Render this far in the past, ms (hides the jitter of samples arriving at the right edge) */
  delay: number;
  /** Y bounds; undefined sides auto-range over the visible data */
  min?: number;
  max?: number;
  height: number;
  /** Fixed width in px; `undefined` = responsive (track the container) */
  width?: number;
  /** Freeze the group's viewport while the cursor hovers this chart */
  pauseOnHover: boolean;
  /** Master switch for zoom/pan gestures */
  zoom: boolean;
  /** Where "now" comes from: the wall clock, or the newest sample (replayed/simulated data) */
  timeMode: 'clock' | 'data';
  /** Escape hatch, deep-merged over the generated uPlot options */
  uplot?: Partial<uPlot.Options>;
  /** Cursor movement, for driving a React tooltip. `null` when the cursor leaves. */
  onCursor?: (cursor: CursorState | null) => void;
}

export type CursorState = {
  /** Position within the plotting area, CSS px */
  left: number;
  top: number;
  /** Hovered sample timestamp (epoch ms) and per-series values, when over data */
  time?: number;
  values: { series: SeriesConfig; value: number | null | undefined }[];
};

const PALETTE = ['#7EB26D', '#EAB839', '#6ED0E0', '#EF843C', '#E24D42', '#1F78C1', '#BA43A9', '#705DA0'];

const WHEEL_ZOOM_FACTOR = 1.25;
/** Narrowest allowed view, ms — past this, zooming in is meaningless */
const MIN_SPAN = 100;
/** Widest allowed trailing window, ms */
const MAX_SPAN = 7 * 24 * 60 * 60 * 1000;
/** Fraction of the span the right edge may lag "now" and still snap back to live */
const SNAP_TO_LIVE_FRACTION = 0.02;

function pathBuilder(style: PathStyle | undefined): uPlot.Series.PathBuilder | undefined {
  if (style === 'spline') return uPlot.paths.spline!();
  if (style === 'step') return uPlot.paths.stepped!({ align: 1 });
  return undefined; // linear is uPlot's default
}

/**
 * Owns one uPlot instance: builds it from a `ControllerConfig`, feeds it a sliding window of
 * series data each coordinated frame, and translates user gestures into live/detached view
 * transitions on the chart's `SyncGroup`.
 *
 * React-free — `StreamChart` wires this to component lifecycle and context.
 */
export class StreamChartController implements CoordinatedChart {
  uplot: uPlot;

  private config: ControllerConfig;
  private group: SyncGroup;
  private container: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private hovering = false;
  /** Signature of the last-applied structural config, to know when uPlot must be rebuilt */
  private structure: string;
  /** What was last drawn, to skip frames with nothing new */
  private lastDrawn?: { min: number; max: number; revisions: number[] };

  constructor(container: HTMLElement, group: SyncGroup, config: ControllerConfig) {
    this.container = container;
    this.group = group;
    this.config = config;
    this.structure = structuralSignature(config);
    this.uplot = this.build();
  }

  /** Apply a config change, rebuilding the uPlot instance only on structural changes */
  update(config: ControllerConfig): void {
    const prev = this.config;
    this.config = config;

    // Series that left the chart must not keep extending their buffers' retention
    for (const { data } of prev.series) {
      if (!config.series.some(s => s.data === data)) data.release(this);
    }

    if (!config.pauseOnHover && prev.pauseOnHover && this.hovering) this.group.setFrozenAt(undefined);

    const structure = structuralSignature(config);
    if (structure !== this.structure) {
      this.structure = structure;
      this.teardownUplot();
      this.uplot = this.build();
      return;
    }

    if (config.height !== prev.height || config.width !== prev.width) {
      this.uplot.setSize({ width: this.currentWidth(), height: config.height });
      this.syncResizeObserver();
    }

    if (
      config.window !== prev.window ||
      config.delay !== prev.delay ||
      config.min !== prev.min ||
      config.max !== prev.max ||
      config.timeMode !== prev.timeMode ||
      config.series.length !== prev.series.length ||
      config.series.some((s, i) => s.data !== prev.series[i].data)
    ) {
      // Picked up by the next frame; force it to draw even if the window hasn't moved
      this.lastDrawn = undefined;
    }
  }

  destroy(): void {
    this.teardownUplot();
    for (const { data } of this.config.series) data.release(this);
    if (this.hovering) this.setHovering(false);
  }

  /** Re-attach to a different sync group (syncKey/provider change) */
  setGroup(group: SyncGroup): void {
    if (group === this.group) return;
    for (const { data } of this.config.series) data.release(this);
    this.group = group;
    // cursor.sync key lives in uPlot opts, so a group change is structural
    this.teardownUplot();
    this.uplot = this.build();
  }

  /** The group's notion of "now", epoch ms */
  now(clockNow: number): number {
    if (this.config.timeMode === 'data') {
      let latest = 0;
      for (const { data } of this.config.series) latest = Math.max(latest, data.lastTime ?? 0);
      return latest || clockNow;
    }
    return this.group.frozenAt ?? clockNow;
  }

  /** The trailing window duration currently in effect, ms */
  windowSpan(): number {
    return this.group.window ?? this.config.window;
  }

  // ---------------------------------------------------------------- rendering

  renderFrame(clockNow: number): void {
    const view = this.group.view;
    const now = this.now(clockNow);

    let min: number;
    let max: number;

    if (view.live) {
      max = now - this.config.delay;
      min = max - this.windowSpan();
    } else {
      [min, max] = view.range;
    }

    // Hold the visible past while detached so it isn't evicted out from under the viewer
    // (bounded by each series' maxRetention). Eviction itself happens on append.
    for (const { data } of this.config.series) {
      if (view.live) data.release(this);
      else data.hold(this, min);
    }

    const revisions = this.config.series.map(s => s.data.revision);
    const last = this.lastDrawn;
    if (
      last &&
      last.min === min &&
      last.max === max &&
      last.revisions.length === revisions.length &&
      last.revisions.every((r, i) => r === revisions[i])
    ) {
      return; // nothing moved, nothing new — skip the frame entirely
    }

    const tables = this.config.series.map(s => {
      const [times, values] = s.data.window(min, max);
      return [times, values] as uPlot.AlignedData;
    });

    const data = tables.length === 1 ? tables[0] : uPlot.join(tables);

    // With resetScales=false, setData defers the redraw to the setScale that follows
    this.uplot.setData(data, false);
    this.uplot.setScale('x', { min, max });

    this.lastDrawn = { min, max, revisions };
  }

  // ---------------------------------------------------------------- interactions

  /** Freeze the viewport to an absolute range; snaps back to live if the range hugs "now" */
  detach(range: [number, number]): void {
    const [min, max] = clampSpan(range);
    const now = this.now(Date.now());
    const span = max - min;

    if (max >= now - this.config.delay - span * SNAP_TO_LIVE_FRACTION) {
      // The right edge (re)reached now — follow it instead of freezing
      this.group.goLive(clampWindow(span));
      return;
    }

    this.group.detach([min, max]);
  }

  goLive(): void {
    this.group.goLive();
  }

  private handleWheel = (event: WheelEvent) => {
    if (!this.config.zoom) return;
    event.preventDefault();

    const view = this.group.view;
    const now = this.now(Date.now());

    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX || event.deltaY : event.deltaY;

    if (horizontal) {
      // Pan. Panning a live chart into the past detaches it.
      const span = view.live ? this.windowSpan() : view.range[1] - view.range[0];
      const shift = (delta / 200) * span * -1;

      const [min, max] = view.live
        ? [now - this.config.delay - span + shift, now - this.config.delay + shift]
        : [view.range[0] + shift, view.range[1] + shift];

      this.detach([min, max]);
      return;
    }

    const factor = delta > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;

    if (view.live) {
      // Timebase zoom: change the trailing window, right edge stays glued to now
      this.group.setWindow(clampWindow(this.windowSpan() * factor));
      return;
    }

    // Detached: zoom around the cursor's time position
    const [min, max] = view.range;
    const anchor = this.cursorTime(event) ?? (min + max) / 2;
    this.detach([anchor - (anchor - min) * factor, anchor + (max - anchor) * factor]);
  };

  private handleDblClick = () => {
    if (!this.config.zoom) return;
    // uPlot's native reset gesture: back to live, back to the prop-configured timebase
    this.group.setWindow(undefined);
    this.group.goLive();
  };

  private handleMouseEnter = () => this.setHovering(true);
  private handleMouseLeave = () => {
    this.setHovering(false);
    this.config.onCursor?.(null);
  };

  private setHovering(hovering: boolean) {
    this.hovering = hovering;
    if (!this.config.pauseOnHover) return;

    if (hovering) {
      if (this.group.frozenAt === undefined) this.group.setFrozenAt(Date.now());
    } else {
      this.group.setFrozenAt(undefined);
    }
  }

  /** Time value (epoch ms) under a mouse event, or undefined when outside the plot area */
  private cursorTime(event: MouseEvent): number | undefined {
    const rect = this.uplot.over.getBoundingClientRect();
    const left = event.clientX - rect.left;
    if (left < 0 || left > rect.width) return undefined;
    return this.uplot.posToVal(left, 'x');
  }

  // ---------------------------------------------------------------- uPlot lifecycle

  private build(): uPlot {
    const { config, group } = this;

    const series: uPlot.Series[] = [
      {}, // x
      ...config.series.map((s, i) => ({
        label: s.label,
        stroke: s.stroke ?? PALETTE[i % PALETTE.length],
        fill: s.fill,
        width: s.width ?? 2,
        dash: s.dash,
        spanGaps: s.spanGaps,
        paths: pathBuilder(s.paths),
      })),
    ];

    const opts: uPlot.Options = {
      width: this.currentWidth(),
      height: config.height,
      ms: 1, // timestamps are epoch milliseconds
      series,
      scales: {
        x: { time: true, auto: false },
        y: {
          auto: true,
          range: (u, dataMin, dataMax) => yRange(this.config.min, this.config.max, dataMin, dataMax),
        },
      },
      legend: { show: false },
      cursor: {
        drag: { x: true, y: false, setScale: false },
        sync: { key: group.key },
      },
      hooks: {
        setSelect: [
          u => {
            if (!this.config.zoom || u.select.width <= 0) return;

            const min = u.posToVal(u.select.left, 'x');
            const max = u.posToVal(u.select.left + u.select.width, 'x');
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            this.detach([min, max]);
          },
        ],
        setCursor: [
          u => {
            if (!this.config.onCursor) return;
            const { left, top, idx } = u.cursor;
            if (left == null || left < 0 || top == null || top < 0) return;

            // Cursor positions are relative to the plot area; report them relative to the
            // chart container so overlays (tooltip) can be positioned without uPlot layout
            // knowledge.
            const overRect = u.over.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();

            this.config.onCursor({
              left: left + overRect.left - containerRect.left,
              top: top + overRect.top - containerRect.top,
              time: idx != null ? (u.data[0][idx] as number) : undefined,
              values: this.config.series.map((s, i) => ({
                series: s,
                value: idx != null ? u.data[i + 1][idx] : undefined,
              })),
            });
          },
        ],
      },
    };

    const merged = config.uplot ? deepMerge(opts, config.uplot) : opts;

    const u = new uPlot(merged, emptyData(config.series.length), this.container);

    u.over.addEventListener('wheel', this.handleWheel, { passive: false });
    u.over.addEventListener('dblclick', this.handleDblClick);
    u.over.addEventListener('mouseenter', this.handleMouseEnter);
    u.over.addEventListener('mouseleave', this.handleMouseLeave);

    this.syncResizeObserver();
    this.lastDrawn = undefined;

    return u;
  }

  private teardownUplot() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.uplot.over.removeEventListener('wheel', this.handleWheel);
    this.uplot.over.removeEventListener('dblclick', this.handleDblClick);
    this.uplot.over.removeEventListener('mouseenter', this.handleMouseEnter);
    this.uplot.over.removeEventListener('mouseleave', this.handleMouseLeave);
    this.uplot.destroy();
  }

  private currentWidth(): number {
    return this.config.width ?? Math.max(this.container.clientWidth, 1);
  }

  private syncResizeObserver() {
    const responsive = this.config.width === undefined;

    if (!responsive) {
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      return;
    }

    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const width = this.currentWidth();
        if (width !== this.uplot.width) this.uplot.setSize({ width, height: this.config.height });
      });
      this.resizeObserver.observe(this.container);
    }
  }
}

function emptyData(seriesCount: number): uPlot.AlignedData {
  return [[], ...Array.from({ length: seriesCount }, () => [])] as uPlot.AlignedData;
}

function yRange(
  min: number | undefined,
  max: number | undefined,
  dataMin: number | null,
  dataMax: number | null
): [number, number] {
  let lo = min ?? dataMin ?? 0;
  let hi = max ?? dataMax ?? 1;

  if (lo === hi) {
    // Flat data (or a single sample): give it some room
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.1;
    if (min === undefined) lo -= pad;
    if (max === undefined) hi += pad;
  }

  return [lo, hi];
}

function clampWindow(span: number): number {
  return Math.min(Math.max(span, MIN_SPAN), MAX_SPAN);
}

function clampSpan([min, max]: [number, number]): [number, number] {
  if (max - min >= MIN_SPAN) return [min, max];
  const mid = (min + max) / 2;
  return [mid - MIN_SPAN / 2, mid + MIN_SPAN / 2];
}

/** Which config fields require rebuilding the uPlot instance (vs applying incrementally) */
function structuralSignature(config: ControllerConfig): string {
  return JSON.stringify([
    config.series.map(s => [s.label, s.stroke, s.fill, s.width, s.dash, s.paths, s.spanGaps]),
    config.uplot,
  ]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = { ...base };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}
