export interface TimeSeriesOptions {
  /**
   * How much history to keep, in milliseconds. Older samples are evicted as new ones
   * arrive. Retention is measured relative to the newest sample's timestamp (not the wall
   * clock), so replayed/historical data behaves the same as live data, and a stream that
   * stops producing keeps its last window of data around instead of silently draining.
   *
   * Charts that are zoomed into the past temporarily extend retention (see `maxRetention`).
   *
   * _default: 5 minutes_
   */
  retention?: number;

  /**
   * Hard upper bound on retained history, in milliseconds, including any temporary
   * extensions from charts inspecting the past. Data older than this is always evicted,
   * even while visible in a detached chart, so memory use is strictly bounded.
   *
   * _default: 6 × `retention`_
   */
  maxRetention?: number;
}

/** Sample values are numbers; `null` marks an explicit gap in the line (see `appendGap`). */
export type SampleValue = number | null;

/** How many stale samples may accumulate before the backing arrays are compacted */
const COMPACT_THRESHOLD = 1024;

/**
 * A time/value buffer for streaming data, decoupled from any chart.
 *
 * Append-only from the front of time's arrow: timestamps must be non-decreasing (out-of-order
 * appends are clamped to the latest timestamp rather than throwing — streaming hot paths
 * shouldn't explode on clock jitter). Old samples are evicted per `retention`.
 *
 * One series may be displayed by any number of charts simultaneously.
 */
export class TimeSeries {
  readonly retention: number;
  readonly maxRetention: number;

  /**
   * Bumped on every mutation (append/clear/eviction). Charts compare this against the last
   * revision they drew to skip redrawing unchanged data.
   */
  revision = 0;

  private times: number[] = [];
  private values: SampleValue[] = [];
  /** Index of the oldest live sample; everything before it is evicted-but-not-yet-compacted */
  private head = 0;
  /** Oldest timestamp each holder still needs, keyed by an opaque owner */
  private holds = new Map<unknown, number>();

  constructor(options: TimeSeriesOptions = {}) {
    this.retention = options.retention ?? 5 * 60_000;
    this.maxRetention = options.maxRetention ?? this.retention * 6;
  }

  /** Number of live samples in the buffer */
  get length(): number {
    return this.times.length - this.head;
  }

  /** Timestamp of the oldest retained sample, or `undefined` when empty */
  get firstTime(): number | undefined {
    return this.times[this.head];
  }

  /** Timestamp of the newest sample, or `undefined` when empty */
  get lastTime(): number | undefined {
    return this.times.length > this.head ? this.times[this.times.length - 1] : undefined;
  }

  /** Value of the newest sample, or `undefined` when empty */
  get lastValue(): SampleValue | undefined {
    return this.times.length > this.head ? this.values[this.values.length - 1] : undefined;
  }

  /**
   * Append a sample. `time` is a millisecond epoch timestamp and defaults to now — the
   * overwhelmingly common case for live data. Timestamps must be non-decreasing; an
   * out-of-order `time` is clamped to the latest existing timestamp.
   */
  append(value: SampleValue, time: number = Date.now()): void {
    const last = this.lastTime;
    if (last !== undefined && time < last) time = last;

    this.times.push(time);
    this.values.push(value);
    this.revision++;

    this.evict();
  }

  /**
   * Mark an explicit break in the line (e.g. the data source disconnected). Rendered as a
   * gap rather than interpolating between the samples on either side.
   */
  appendGap(time: number = Date.now()): void {
    this.append(null, time);
  }

  /** Drop all samples */
  clear(): void {
    this.times = [];
    this.values = [];
    this.head = 0;
    this.revision++;
  }

  /**
   * Keep samples at/after `oldestNeeded` from being evicted on behalf of `owner` — used by
   * charts detached into the past. Clamped by `maxRetention` regardless of holds.
   * Re-holding with the same owner updates the hold.
   */
  hold(owner: unknown, oldestNeeded: number): void {
    this.holds.set(owner, oldestNeeded);
  }

  /** Release `owner`'s hold, letting normal retention apply again */
  release(owner: unknown): void {
    this.holds.delete(owner);
  }

  /**
   * Evict samples older than the retention floor as of `asOf` (defaults to the newest
   * sample's timestamp). Called automatically on append; safe to call redundantly.
   */
  evict(asOf: number | undefined = this.lastTime): void {
    if (asOf === undefined) return;

    let floor = asOf - this.retention;
    for (const oldestNeeded of this.holds.values()) floor = Math.min(floor, oldestNeeded);
    floor = Math.max(floor, asOf - this.maxRetention);

    const { times } = this;
    let head = this.head;
    while (head < times.length && times[head] < floor) head++;
    if (head === this.head) return;

    this.head = head;
    this.revision++;

    // Compact once the dead prefix dominates, so memory is actually reclaimed
    if (this.head >= COMPACT_THRESHOLD && this.head * 2 >= times.length) {
      this.times = times.slice(this.head);
      this.values = this.values.slice(this.head);
      this.head = 0;
    }
  }

  /**
   * Copy the samples visible in the time range `[minTime, maxTime]`, plus one sample of
   * margin on each side so lines continue past the viewport edges instead of stopping at
   * the first on-screen point.
   */
  window(minTime: number, maxTime: number): [times: number[], values: SampleValue[]] {
    const lo = Math.max(this.head, this.lowerBound(minTime) - 1);
    const hi = Math.min(this.times.length, this.lowerBound(maxTime + 1) + 1);
    return [this.times.slice(lo, hi), this.values.slice(lo, hi)];
  }

  /** Index of the first live sample with timestamp >= `time` (binary search) */
  private lowerBound(time: number): number {
    let lo = this.head;
    let hi = this.times.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.times[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
