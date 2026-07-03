import * as React from 'react';

import { TimeSeries, TimeSeriesOptions } from './TimeSeries.js';

/**
 * A stable `TimeSeries` instance for the lifetime of the component.
 *
 * Options are captured on first render; to change retention, remount or manage the
 * `TimeSeries` yourself.
 */
export function useTimeSeries(options?: TimeSeriesOptions): TimeSeries {
  const ref = React.useRef<TimeSeries | null>(null);
  return (ref.current ??= new TimeSeries(options));
}
