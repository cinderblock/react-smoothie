import { SmoothieChart, TimeSeries } from 'smoothie';

// TODO: SmoothieCharts should update their types so that this is less hacky
type SmoothieChartInternals = SmoothieChart & {
  // We need to tell TypeScript about some non-exposed internal variables

  canvas?: HTMLCanvasElement;
  delay?: number;
  seriesSet: { timeSeries: TimeSeries & { data: [number, number][] } }[];
};

/**
 * Draw a single frame of a chart, the same way the chart's own animation loop would.
 *
 * Mirrors the body of `SmoothieChart.prototype.start()`'s animate callback, including its
 * `nonRealtimeData` handling. Note that `chart.render()` applies the chart's stream delay
 * (`chart.delay`) itself, so no time argument is passed here.
 */
export function renderChartFrame(chart: SmoothieChart) {
  const internals = chart as SmoothieChartInternals;

  if (!internals.canvas) return;

  if (chart.options.nonRealtimeData) {
    // Find the data point with the latest timestamp and use it as the current time
    const maxTimeStamp = internals.seriesSet.reduce((max, series) => {
      const dataSet = series.timeSeries.data;

      if (!dataSet.length) return max;

      let indexToCheck = Math.round((chart.options.displayDataFromPercentile ?? 1) * dataSet.length) - 1;
      indexToCheck = Math.min(Math.max(indexToCheck, 0), dataSet.length - 1);

      // Timestamp corresponds to element 0 of the data point
      return Math.max(max, dataSet[indexToCheck][0]);
    }, 0);

    chart.render(internals.canvas, maxTimeStamp > 0 ? maxTimeStamp : undefined);
  } else {
    chart.render();
  }
}

export type RenderCoordinatorOptions = {
  /**
   * Maximum frame rate, in frames per second. `0` renders at the display refresh rate.
   *
   * Charts' own `limitFPS` options still apply on top of this.
   */
  fps?: number;

  /** While `true`, charts stay registered but no frames are rendered. */
  paused?: boolean;
};

/**
 * Drives any number of SmoothieCharts from a single `requestAnimationFrame` loop.
 *
 * Charts are expected to already be bound to their canvas (i.e. `streamTo()` has set
 * `chart.canvas` and `chart.delay`) but not self-animating (`chart.stop()`).
 *
 * The loop only runs while at least one chart is registered, not paused, and the document
 * is visible; it hard-stops otherwise and resumes cleanly (no frame-rate-limit catch-up).
 */
export class RenderCoordinator {
  private registry = new Map<SmoothieChart, { paused: boolean }>();
  private frame?: number;
  private fps: number;
  private paused: boolean;
  private lastFrameTime?: number;
  private watchingVisibility = false;

  constructor(options: RenderCoordinatorOptions = {}) {
    this.fps = options.fps ?? 0;
    this.paused = options.paused ?? false;
  }

  /**
   * Add a chart to the coordinated loop, or update its per-chart options if already added.
   * Starts the loop if it isn't running.
   */
  register(chart: SmoothieChart, options: { paused?: boolean } = {}) {
    this.registry.set(chart, { paused: options.paused ?? false });
    this.sync();
  }

  /** Remove a chart from the coordinated loop. Stops the loop when the last chart leaves. */
  unregister(chart: SmoothieChart) {
    this.registry.delete(chart);
    this.sync();
  }

  has(chart: SmoothieChart) {
    return this.registry.has(chart);
  }

  get size() {
    return this.registry.size;
  }

  /** Cap the frame rate, or `0` to render at the display refresh rate. Applies from the next frame. */
  setFps(fps: number) {
    if (this.fps === fps) return;
    this.fps = fps;
    this.lastFrameTime = undefined;
  }

  /** Freeze/unfreeze all registered charts. Registrations are kept while paused. */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.lastFrameTime = undefined;
    this.sync();
  }

  /** Whether frames should currently be rendered */
  private get active() {
    return this.registry.size > 0 && !this.paused && !(typeof document !== 'undefined' && document.hidden);
  }

  /** Reconcile the animation loop and visibility listener with the current state */
  private sync() {
    if (typeof document !== 'undefined') {
      const shouldWatch = this.registry.size > 0;
      if (shouldWatch !== this.watchingVisibility) {
        if (shouldWatch) document.addEventListener('visibilitychange', this.handleVisibilityChange);
        else document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        this.watchingVisibility = shouldWatch;
      }
    }

    if (this.active) {
      if (this.frame === undefined && typeof requestAnimationFrame !== 'undefined') {
        this.frame = requestAnimationFrame(this.tick);
      }
    } else if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }

  private handleVisibilityChange = () => {
    // Reset the frame time base so becoming visible doesn't look like one giant elapsed frame
    if (typeof document !== 'undefined' && !document.hidden) this.lastFrameTime = undefined;
    this.sync();
  };

  private tick = (timestamp: number) => {
    this.frame = undefined;

    if (!this.active) return;

    if (this.fps > 0 && this.lastFrameTime !== undefined) {
      const interval = 1000 / this.fps;
      const elapsed = timestamp - this.lastFrameTime;

      if (elapsed >= interval) {
        // Stay aligned to the fps interval instead of drifting by the rAF granularity
        this.lastFrameTime = timestamp - (elapsed % interval);
        this.renderAll();
      }
    } else {
      this.lastFrameTime = timestamp;
      this.renderAll();
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  private renderAll() {
    this.registry.forEach(({ paused }, chart) => {
      if (paused) return;
      renderChartFrame(chart);
    });
  }
}

/**
 * The default coordinator that all charts register with when no `<SmoothieProvider>` overrides it.
 *
 * Exposed so the frame rate can be capped (`globalCoordinator.setFps()`) or all default-coordinated
 * charts paused (`globalCoordinator.setPaused()`) without wrapping the app in a provider.
 */
export const globalCoordinator = new RenderCoordinator();
