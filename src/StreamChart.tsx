import * as React from 'react';
import type uPlot from 'uplot';

import { RenderCoordinator, globalCoordinator } from './RenderCoordinator.js';
import { CursorState, SeriesConfig, StreamChartController } from './StreamChartController.js';
import { SyncGroup, ViewState, globalSyncGroup, syncGroupFor } from './SyncGroup.js';

export type StreamContextValue = {
  coordinator: RenderCoordinator;
  /** Sync group for this subtree's charts, or `null` when each chart is independent */
  group: SyncGroup | null;
};

/** `undefined` (no provider) means charts use the module-wide global coordinator and sync group */
export const StreamContext = React.createContext<StreamContextValue | undefined>(undefined);

export interface LiveBadgeProps {
  live: boolean;
  /** Return the chart (and its sync group) to following now */
  goLive: () => void;
}

/**
 * Default overlay shown while a chart is detached from live: a click-to-resume badge.
 * Rendered (with `live: true`) even while live so custom badges can show a live indicator.
 */
export function LiveBadge({ live, goLive }: LiveBadgeProps) {
  if (live) return null;

  return (
    <button
      type="button"
      onClick={goLive}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        padding: '2px 8px',
        font: '12px sans-serif',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.35)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      ⏸ paused
      <span style={{ color: '#f33' }}>● LIVE</span>
    </button>
  );
}

export interface TooltipProps {
  /** Hovered sample timestamp, epoch ms */
  time?: number;
  values: { series: SeriesConfig; value: number | null | undefined }[];
}

/** Default tooltip: timestamp plus a color-keyed value per series */
export function DefaultTooltip({ time, values }: TooltipProps) {
  return (
    <div
      style={{
        font: '12px sans-serif',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.75)',
        borderRadius: 4,
        padding: '4px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {time !== undefined && <div>{new Date(time).toLocaleTimeString()}</div>}
      {values.map(({ series, value }, i) => (
        <div key={i}>
          <span style={{ color: series.stroke }}>{series.label ?? `Series ${i + 1}`}</span>{' '}
          {value == null ? '—' : String(value)}
        </div>
      ))}
    </div>
  );
}

export interface StreamChartHandle {
  /** The underlying uPlot instance (null before mount) */
  uplot: uPlot | null;
  /** The chart's sync group — view state, timebase, and freeze control */
  group: SyncGroup;
  setLive(live: boolean): void;
  /** Absolute visible range when detached, or `null` while live */
  getViewRange(): [number, number] | null;
}

export interface StreamChartProps {
  /** The data to plot. Series are matched by array position across renders. */
  series: SeriesConfig[];

  /** Trailing view duration while live, ms. _default: 30 000_ */
  window?: number;

  /**
   * Render this many ms in the past so samples don't pop in at the right edge
   * (was `streamDelay` in v1). _default: 0_
   */
  delay?: number;

  /** Y bounds. Leave either side undefined to auto-range it over the visible data. */
  min?: number;
  max?: number;

  /** Chart height in CSS px (plotting area + axes). _default: 200_ */
  height?: number;

  /** Fixed chart width in CSS px. Omit for responsive (fills the container). */
  width?: number;

  /**
   * Controlled live/detached state. When set, gestures still fire `onLiveChange` but the
   * chart (and its whole sync group) follows this prop.
   */
  live?: boolean;
  onLiveChange?: (live: boolean) => void;

  /** Controlled absolute view range (epoch ms) while detached */
  viewRange?: [number, number];
  /** Fires with the new range when the view detaches/moves, `null` on return to live */
  onViewRangeChange?: (range: [number, number] | null) => void;

  /**
   * Freeze the group's viewport while the cursor hovers this chart, so tooltips are
   * readable on fast-moving data. Buffers keep filling. _default: true_
   */
  pauseOnHover?: boolean;

  /** Master switch for zoom/pan gestures. _default: true_ */
  zoom?: boolean;

  /**
   * Which charts this one zooms/pauses/synchronizes with:
   * - unset: the nearest `<StreamChartGroup>`, or the global group
   * - a string: the app-wide named group with that key
   * - `false`: this chart is fully independent
   */
  syncKey?: string | false;

  /** Skip this chart's frames while `true` (it stays mounted and registered) */
  paused?: boolean;

  /** Where "now" comes from: the wall clock, or the newest sample (replay/simulation). _default: 'clock'_ */
  timeMode?: 'clock' | 'data';

  /**
   * The "return to live" overlay. `true` for the default badge, `false` for none, or a
   * custom component. _default: true_
   */
  liveBadge?: boolean | React.ComponentType<LiveBadgeProps>;

  /** Cursor tooltip. `true` for the default, or a custom component. _default: false_ */
  tooltip?: boolean | React.ComponentType<TooltipProps>;

  /** Escape hatch: deep-merged over the generated uPlot options */
  uplot?: Partial<uPlot.Options>;

  className?: string;
  style?: React.CSSProperties;
}

/**
 * A realtime streaming chart backed by uPlot.
 *
 * Append data to `TimeSeries` buffers; the chart follows "now" with a trailing window,
 * rendered from a shared animation loop. Drag to zoom into the past (detaches from live),
 * wheel to change the timebase, double-click to return to live.
 */
export const StreamChart = React.forwardRef<StreamChartHandle, StreamChartProps>(function StreamChart(props, ref) {
  const {
    series,
    window: windowProp = 30_000,
    delay = 0,
    min,
    max,
    height = 200,
    width,
    live,
    onLiveChange,
    viewRange,
    onViewRangeChange,
    pauseOnHover = true,
    zoom = true,
    syncKey,
    paused = false,
    timeMode = 'clock',
    liveBadge = true,
    tooltip = false,
    uplot: uplotOptions,
    className,
    style,
  } = props;

  const context = React.useContext(StreamContext);
  const coordinator = context?.coordinator ?? globalCoordinator;

  const privateGroup = React.useRef<SyncGroup | null>(null);
  const group =
    syncKey === false
      ? (privateGroup.current ??= new SyncGroup())
      : typeof syncKey === 'string'
        ? syncGroupFor(syncKey)
        : context !== undefined
          ? (context.group ?? (privateGroup.current ??= new SyncGroup()))
          : globalSyncGroup;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const controllerRef = React.useRef<StreamChartController | null>(null);
  const [cursor, setCursor] = React.useState<CursorState | null>(null);

  const view: ViewState = React.useSyncExternalStore(
    React.useCallback(onChange => group.subscribe(onChange), [group]),
    () => group.view,
    () => group.view,
  );

  const config = {
    series,
    window: windowProp,
    delay,
    min,
    max,
    height,
    width,
    pauseOnHover,
    zoom,
    timeMode,
    uplot: uplotOptions,
    onCursor: tooltip ? setCursor : undefined,
  };
  const configRef = React.useRef(config);
  configRef.current = config;

  // Create the uPlot controller once the container exists; rebuild if the group changes
  // (the cursor-sync key is baked into uPlot options).
  React.useLayoutEffect(() => {
    const controller = new StreamChartController(containerRef.current!, group, configRef.current);
    controllerRef.current = controller;

    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [group]);

  // Keep the controller's config current (cheap when nothing structural changed)
  React.useLayoutEffect(() => {
    controllerRef.current?.update(config);
  });

  // Drive frames from the coordinator
  React.useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;

    coordinator.register(controller, { paused });
    return () => coordinator.unregister(controller);
  }, [coordinator, group, paused]);

  // Controlled live/viewRange: assert the props whenever they or the group state diverge
  React.useEffect(() => {
    if (live === undefined && viewRange === undefined) return;

    const shouldBeLive = live ?? viewRange === undefined;

    if (shouldBeLive) {
      if (!group.view.live) group.goLive();
      return;
    }

    const range = viewRange ?? (group.view.live ? null : group.view.range);
    if (range === null) {
      // live={false} without a range: freeze the current window in place
      const now = Date.now();
      group.detach([now - delay - (group.window ?? windowProp), now - delay]);
    } else if (group.view.live || group.view.range[0] !== range[0] || group.view.range[1] !== range[1]) {
      group.detach(range);
    }
  }, [group, live, viewRange?.[0], viewRange?.[1], view, delay, windowProp]);

  // Notify view transitions
  const lastNotifiedView = React.useRef(view);
  React.useEffect(() => {
    const prev = lastNotifiedView.current;
    if (prev === view) return;
    lastNotifiedView.current = view;

    if (prev.live !== view.live) onLiveChange?.(view.live);
    onViewRangeChange?.(view.live ? null : view.range);
  }, [view, onLiveChange, onViewRangeChange]);

  React.useImperativeHandle(
    ref,
    (): StreamChartHandle => ({
      get uplot() {
        return controllerRef.current?.uplot ?? null;
      },
      group,
      setLive(nextLive: boolean) {
        if (nextLive) group.goLive();
        else if (group.view.live) {
          const now = Date.now();
          group.detach([now - delay - (group.window ?? windowProp), now - delay]);
        }
      },
      getViewRange() {
        return group.view.live ? null : group.view.range;
      },
    }),
    [group, delay, windowProp],
  );

  const Badge = liveBadge === true ? LiveBadge : liveBadge || null;
  const Tip = tooltip === true ? DefaultTooltip : tooltip || null;

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div ref={containerRef} />
      {Badge && <Badge live={view.live} goLive={() => group.goLive()} />}
      {Tip && cursor && (
        <div
          style={{
            position: 'absolute',
            left: cursor.left + 12,
            top: cursor.top + 12,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Tip time={cursor.time} values={cursor.values} />
        </div>
      )}
    </div>
  );
});
