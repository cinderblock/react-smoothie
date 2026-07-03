/**
 * What a chart's viewport is doing:
 * - live: the right edge follows "now"; the visible span is a trailing window duration.
 * - detached: the viewport is frozen to an absolute time range (the user zoomed/panned into
 *   the past). Data keeps streaming into buffers behind the scenes.
 */
export type ViewState =
  | { live: true }
  | { live: false; range: [min: number, max: number] };

let anonymousGroups = 0;

/**
 * Shared viewport state for a set of charts that zoom, detach, and pause together.
 *
 * Charts in the same group read this state every frame (pull model — no event plumbing in
 * the render hot path) and write to it from user interactions, so a drag-zoom on one chart
 * detaches all of them, wheel-zooming one changes every chart's timebase, and hovering one
 * (with `pauseOnHover`) freezes the whole group coherently. The group's `key` also drives
 * uPlot's native cursor sync.
 *
 * Subscribers (React components) are notified on state transitions — not per frame — to
 * update badges and fire `onLiveChange`.
 */
export class SyncGroup {
  /** uPlot cursor-sync key shared by all charts in this group */
  readonly key: string;

  /** Current viewport state for all charts in the group */
  view: ViewState = { live: true };

  /**
   * Trailing window duration (ms) set by wheel-zooming while live, shared by the group.
   * `undefined` means each chart uses its own `window` prop.
   */
  window?: number;

  /**
   * While set, "now" is frozen at this epoch-ms timestamp for the whole group
   * (`pauseOnHover`). Buffers keep filling; only the viewport stops advancing.
   */
  frozenAt?: number;

  private listeners = new Set<() => void>();

  constructor(key?: string) {
    this.key = key ?? `react-smoothie:${++anonymousGroups}`;
  }

  /** Freeze the viewport to an absolute time range (epoch ms) for the whole group */
  detach(range: [min: number, max: number]): void {
    this.view = { live: false, range };
    this.notify();
  }

  /** Resume following now. Optionally adopt a new trailing window duration (ms). */
  goLive(window?: number): void {
    this.view = { live: true };
    if (window !== undefined) this.window = window;
    this.notify();
  }

  /** Set or clear the group-wide trailing window override (wheel timebase zoom) */
  setWindow(window: number | undefined): void {
    if (this.window === window) return;
    this.window = window;
    this.notify();
  }

  /** Freeze/unfreeze "now" for the group (pauseOnHover). Pass `undefined` to unfreeze. */
  setFrozenAt(time: number | undefined): void {
    if (this.frozenAt === time) return;
    this.frozenAt = time;
    this.notify();
  }

  /** Subscribe to state transitions. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }
}

/** The default group that all charts join when no `<StreamChartGroup>` or `syncKey` overrides it */
export const globalSyncGroup = new SyncGroup('react-smoothie:global');

const namedGroups = new Map<string, SyncGroup>();

/** Get or create the shared group for a `syncKey` string (app-wide, provider-independent) */
export function syncGroupFor(key: string): SyncGroup {
  let group = namedGroups.get(key);
  if (!group) {
    group = new SyncGroup(key);
    namedGroups.set(key, group);
  }
  return group;
}
