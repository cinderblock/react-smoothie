# react-smoothie

Realtime streaming charts for React, backed by [uPlot](https://github.com/leeoniya/uPlot).

**[Live demo →](https://cinderblock.github.io/react-smoothie/)**

Append values to a `TimeSeries` buffer and the chart follows "now" with a trailing window,
rendered from one shared animation loop for every chart on the page. Unlike its
[smoothie](http://smoothiecharts.org/)-based v1 ancestor, v2 lets you **zoom into live
data**: drag to inspect the past while data keeps streaming, wheel to change the timebase,
double-click to snap back to live — synchronized across charts by default.

> **v2 is a rewrite.** The smoothie backend and v1 API are gone (v1 remains on the
> [`latest` dist-tag](https://www.npmjs.com/package/react-smoothie) until v2 stabilizes).
> See [Migrating from v1](#migrating-from-v1).

## Install

```bash
npm install react-smoothie@next react
```

React ≥ 18 is a peer dependency. `uplot` comes along as a regular dependency.

## Quickstart

```tsx
import { StreamChart, useTimeSeries } from 'react-smoothie';
import 'react-smoothie/style.css'; // uPlot's stylesheet, required once per app

function Monitor({ socket }) {
  const ts = useTimeSeries();

  useEffect(() => {
    socket.on('sample', (value: number) => ts.append(value)); // timestamped "now"
  }, [socket, ts]);

  return (
    <StreamChart
      height={300}
      window={30_000} // show the trailing 30s
      tooltip
      series={[{ data: ts, label: 'load', stroke: 'tomato', width: 2 }]}
    />
  );
}
```

Charts are **responsive by default** (they fill their container and track resizes); pass
`width` for a fixed size. Outside React, `new TimeSeries()` works the same as the hook.

## The live/detached model

Streaming charts have a moving x-axis, so v2 has two viewport states, borrowed from
oscilloscopes and DVRs:

- **Live** — the right edge is pinned to now; the view is "the trailing `window` ms".
- **Detached** — the viewport is frozen to an absolute time range; data keeps streaming
  into the buffers behind it. A **⏸ / LIVE badge** appears (click it to resume).

Gestures map onto those states:

| Gesture                        | While live                                     | While detached               |
| ------------------------------ | ---------------------------------------------- | ---------------------------- |
| Wheel                          | Change the timebase (trailing window duration) | Zoom around the cursor       |
| Drag horizontally              | Box-zoom into the past → **detaches**          | Box-zoom further             |
| Shift+wheel / horizontal wheel | Pan into the past → **detaches**               | Pan                          |
| Double-click                   | —                                              | Back to live, reset timebase |
| Hover (`pauseOnHover`)         | Freeze the viewport so tooltips are readable   | already frozen               |

Panning or zooming back until the right edge reaches "now" snaps the chart back to live.

All of it is controllable from the app, too — the standard controlled/uncontrolled React
pattern: leave `live`/`viewRange` unset and gestures just work, or drive them and receive
gestures via `onLiveChange`/`onViewRangeChange`.

## Data: `TimeSeries`

```ts
const ts = new TimeSeries({
  retention: 5 * 60_000, // keep 5 minutes of history (default)
  maxRetention: 30 * 60_000, // hard memory bound, even while zoomed into the past
});

ts.append(value); // timestamp defaults to Date.now() — the common case
ts.append(value, timestamp); // explicit epoch-ms timestamp (non-decreasing)
ts.appendGap(); // explicit break in the line (e.g. sensor disconnected)
ts.clear();
```

- One `TimeSeries` can feed any number of charts.
- **Retention** is measured relative to the newest sample, so replayed/historical data
  works identically to live data (see `timeMode: 'data'` for driving "now" from the data).
- A chart detached into the past temporarily _holds_ its visible range in the buffer, but
  never past `maxRetention` (default 6× `retention`) — memory is strictly bounded, and
  data older than the cap evaporates even while on screen.
- Series may have different timestamps; charts align them per frame (uPlot's join). Use
  `spanGaps` per series to connect over explicit gaps.

## `<StreamChart>` props

| Prop                              | Default      | Description                                                                                                        |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `series`                          | required     | `{ data, label?, stroke?, fill?, width?, dash?, paths?, spanGaps? }[]` — `paths`: `'linear' \| 'step' \| 'spline'` |
| `window`                          | `30_000`     | Trailing view duration while live, ms                                                                              |
| `delay`                           | `0`          | Render this far in the past (hides right-edge sample pop-in); was v1 `streamDelay`                                 |
| `min` / `max`                     | auto         | Y bounds; unset sides auto-range over _visible_ data                                                               |
| `height`                          | `200`        | CSS px                                                                                                             |
| `width`                           | responsive   | Fixed CSS px; omit to fill the container                                                                           |
| `live` / `onLiveChange`           | uncontrolled | Controlled live/detached state                                                                                     |
| `viewRange` / `onViewRangeChange` | uncontrolled | Controlled absolute range (epoch ms) while detached                                                                |
| `pauseOnHover`                    | `true`       | Freeze the group's viewport while hovering                                                                         |
| `zoom`                            | `true`       | Master switch for zoom/pan gestures                                                                                |
| `syncKey`                         | inherited    | `string` app-wide named group, `false` fully independent                                                           |
| `paused`                          | `false`      | Skip this chart's frames                                                                                           |
| `timeMode`                        | `'clock'`    | `'data'` drives "now" from the newest sample (replay/simulation)                                                   |
| `liveBadge`                       | `true`       | `false` to hide, or a custom `ComponentType<LiveBadgeProps>`                                                       |
| `tooltip`                         | `false`      | `true` for the default, or a custom `ComponentType<TooltipProps>`                                                  |
| `uplot`                           | —            | Escape hatch: deep-merged over the generated uPlot options                                                         |
| `className` / `style`             | —            | Container passthroughs                                                                                             |

The ref exposes `{ uplot, group, setLive(), getViewRange() }` — `uplot` is the real uPlot
instance, nothing hidden.

## Groups: shared loops and synchronized zoom

Every chart belongs to a **sync group**: zooming, panning, detaching, the timebase, and
hover-freezing apply to the whole group, and cursors are synced (uPlot native). By default
all charts on the page share one group — zoom one and they all follow. Scope it with a
provider, name it with `syncKey`, or opt a chart out entirely:

```tsx
import { StreamChartGroup } from 'react-smoothie';

<StreamChartGroup fps={30} paused={holdEverything} sync>
  <StreamChart … /> {/* these two zoom/pause together, capped at 30fps, */}
  <StreamChart … /> {/* on their own animation loop */}
</StreamChartGroup>;

<StreamChart syncKey="left-column" … />; // app-wide named group
<StreamChart syncKey={false} … />; // fully independent
```

All charts render from a single `requestAnimationFrame` loop per group (module-wide
`globalCoordinator` without a provider) — frames stop entirely while the tab is hidden,
when a group is `paused`, and for detached charts whose data isn't changing, so zooming
into the past costs ~zero CPU.

```ts
import { globalCoordinator } from 'react-smoothie';
globalCoordinator.setFps(30); // cap every default-loop chart without a provider
globalCoordinator.setPaused(true);
```

## Migrating from v1

v2 is a clean break. The pieces map like this:

| v1                                               | v2                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `SmoothieComponent`                              | `StreamChart`                                                           |
| `TimeSeries` (smoothie's, `append(time, value)`) | `TimeSeries` (ours, **`append(value, time?)`** — time defaults to now)  |
| `series={[{ data, strokeStyle: {r,g,b}, … }]}`   | `series={[{ data, stroke: 'red', … }]}` — CSS colors                    |
| `streamDelay`                                    | `delay`                                                                 |
| `millisPerPixel` etc. (smoothie options)         | `window` (duration-based view) + `uplot` escape hatch                   |
| `interpolation`                                  | per-series `paths: 'linear' \| 'step' \| 'spline'`                      |
| `SmoothieProvider fps paused`                    | `StreamChartGroup fps paused sync`                                      |
| `chartRef.addTimeSeries()` (legacy ref API)      | removed — pass `series` props                                           |
| `nonRealtimeData`                                | `timeMode="data"`                                                       |
| `responsive` (opt-in)                            | responsive by default; `width` for fixed                                |
| n/a                                              | zoom/pan/detach, retention, sync groups, `useTimeSeries`                |

Also: the package is ESM-only, requires React ≥ 18, and needs
`import 'react-smoothie/style.css'` once per app.

## Development

```bash
bun install
bun run dev        # Vite demo at localhost:5173
bun run test       # vitest: unit (jsdom) + gesture tests in real Chromium
bun run build      # tsdown → dist/
```

Releases are tag-driven: pushing `vX.Y.Z` publishes to npm via Trusted Publishing
(prereleases land on the `next` dist-tag).
