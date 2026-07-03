import * as React from 'react';

import { RenderCoordinator, RenderCoordinatorOptions } from './RenderCoordinator.js';
import { StreamContext, StreamContextValue } from './StreamChart.js';
import { SyncGroup } from './SyncGroup.js';

export type StreamChartGroupProps = RenderCoordinatorOptions & {
  /**
   * Whether charts in this subtree zoom/detach/pause together (and share a cursor).
   * `false` makes each chart independent. Charts with an explicit `syncKey` prop opt out
   * of the subtree group either way.
   *
   * _default: `true`_
   */
  sync?: boolean;

  children?: React.ReactNode;
};

/**
 * Scopes a subtree of `StreamChart`s to their own shared animation loop and sync group —
 * separate from the global ones — with an optional frame rate cap and pausing.
 *
 * Charts don't need a group to be coordinated or synchronized; without one they share the
 * module-wide loop and sync group. The nearest group wins.
 */
export function StreamChartGroup(props: StreamChartGroupProps) {
  const { fps = 0, paused = false, sync = true, children } = props;

  const coordinatorRef = React.useRef<RenderCoordinator | null>(null);
  // Lazily create with the initial options so the first frames after mount already honor
  // them; later changes are applied by the effects below.
  const coordinator = (coordinatorRef.current ??= new RenderCoordinator({ fps, paused }));

  const groupRef = React.useRef<SyncGroup | null>(null);
  const group = (groupRef.current ??= new SyncGroup());

  React.useEffect(() => {
    coordinator.setFps(fps);
  }, [coordinator, fps]);

  React.useEffect(() => {
    coordinator.setPaused(paused);
  }, [coordinator, paused]);

  const value = React.useMemo<StreamContextValue>(
    () => ({ coordinator, group: sync ? group : null }),
    [coordinator, group, sync],
  );

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}
