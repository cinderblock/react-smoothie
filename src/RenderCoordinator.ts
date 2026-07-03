/** Anything the coordinator can drive: gets one call per animation frame while active. */
export interface CoordinatedChart {
  /** Draw a frame. `now` is a shared `Date.now()` epoch-ms snapshot for the whole frame. */
  renderFrame(now: number): void;
}

export type RenderCoordinatorOptions = {
  /**
   * Maximum frame rate, in frames per second. `0` renders at the display refresh rate.
   */
  fps?: number;

  /** While `true`, charts stay registered but no frames are rendered. */
  paused?: boolean;
};

/**
 * Drives any number of charts from a single `requestAnimationFrame` loop.
 *
 * The loop only runs while at least one chart is registered, not paused, and the document
 * is visible; it hard-stops otherwise and resumes cleanly (no frame-rate-limit catch-up).
 */
export class RenderCoordinator {
  private registry = new Map<CoordinatedChart, { paused: boolean }>();
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
  register(chart: CoordinatedChart, options: { paused?: boolean } = {}) {
    this.registry.set(chart, { paused: options.paused ?? false });
    this.sync();
  }

  /** Remove a chart from the coordinated loop. Stops the loop when the last chart leaves. */
  unregister(chart: CoordinatedChart) {
    this.registry.delete(chart);
    this.sync();
  }

  has(chart: CoordinatedChart) {
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
    // One time snapshot for the frame so all charts scroll in lockstep
    const now = Date.now();
    this.registry.forEach(({ paused }, chart) => {
      if (paused) return;
      chart.renderFrame(now);
    });
  }
}

/**
 * The default coordinator that all charts register with when no `<StreamChartGroup>` overrides it.
 *
 * Exposed so the frame rate can be capped (`globalCoordinator.setFps()`) or all default-coordinated
 * charts paused (`globalCoordinator.setPaused()`) without wrapping the app in a group.
 */
export const globalCoordinator = new RenderCoordinator();
