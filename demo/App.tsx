import 'uplot/dist/uPlot.min.css';

import * as React from 'react';
import type uPlot from 'uplot';

import { StreamChart, StreamChartGroup, TimeSeries, useTimeSeries } from '../src/index.js';

/** Axis/grid colors for the demo's dark background, via the uPlot escape hatch */
const darkTheme: Partial<uPlot.Options> = {
  axes: [
    { stroke: '#9aa0ab', grid: { stroke: '#2a2e37' }, ticks: { stroke: '#2a2e37' } },
    { stroke: '#9aa0ab', grid: { stroke: '#2a2e37' }, ticks: { stroke: '#2a2e37' } },
  ],
};

/** Drive a TimeSeries from a generator on an interval; stops on unmount */
function useFeed(series: TimeSeries, intervalMs: number, generate: (t: number) => number | null) {
  React.useEffect(() => {
    const timer = setInterval(() => {
      series.append(generate(Date.now()));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [series, intervalMs, generate]);
}

const sine = (t: number) => Math.sin(t / 1200) * 40 + 50 + Math.random() * 4;
const noise = () => Math.random() * 30 + 10;
const sawtooth = (t: number) => ((t / 40) % 100) + Math.random() * 5;
const flakySignal = (t: number) => (Math.floor(t / 5000) % 3 === 2 ? null : Math.cos(t / 800) * 30 + 40);

export function App() {
  const temperature = useTimeSeries();
  const pressure = useTimeSeries();
  const saw = useTimeSeries();
  const flaky = useTimeSeries();
  const solo = useTimeSeries();

  useFeed(temperature, 50, sine);
  useFeed(pressure, 80, noise);
  useFeed(saw, 40, sawtooth);
  useFeed(flaky, 100, flakySignal);
  useFeed(solo, 60, sine);

  const [paused, setPaused] = React.useState(false);
  const [fps, setFps] = React.useState(0);
  const [live, setLive] = React.useState(true);

  return (
    <StreamChartGroup fps={fps} paused={paused}>
      <h1>react-smoothie v2</h1>
      <p>
        Realtime streaming charts for React, backed by{' '}
        <a href="https://github.com/leeoniya/uPlot">uPlot</a>.
      </p>
      <p className="hint">
        Wheel over a chart to change the timebase (stays live). Drag to zoom into the past —
        the chart detaches and a badge appears; double-click or hit the badge to return.
        Hovering pauses the viewport so you can actually read it. All charts in the group
        zoom together.
      </p>

      <label>
        <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} /> pause
        all rendering
      </label>{' '}
      <label>
        fps cap:{' '}
        <select value={fps} onChange={e => setFps(Number(e.target.value))}>
          <option value={0}>display rate</option>
          <option value={30}>30</option>
          <option value={10}>10</option>
          <option value={2}>2</option>
        </select>
      </label>{' '}
      <span className="hint">group is {live ? 'live' : 'detached'}</span>

      <h2>Two series, one chart</h2>
      <StreamChart
        height={260}
        window={20_000}
        delay={100}
        tooltip
        series={[
          { data: temperature, label: 'temperature', stroke: '#EAB839', fill: 'rgba(234,184,57,0.08)' },
          { data: pressure, label: 'pressure', stroke: '#6ED0E0', paths: 'step' },
        ]}
        onLiveChange={setLive}
        uplot={darkTheme}
      />

      <h2>Synchronized charts</h2>
      <p className="hint">Same group: zoom/pan one and the other follows. Cursor is synced too.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <StreamChart
          height={180}
          window={20_000}
          delay={100}
          series={[{ data: saw, label: 'sawtooth', stroke: '#EF843C' }]}
          uplot={darkTheme}
        />
        <StreamChart
          height={180}
          window={20_000}
          delay={100}
          series={[{ data: flaky, label: 'flaky sensor (gaps)', stroke: '#E24D42' }]}
          uplot={darkTheme}
        />
      </div>

      <h2>Independent chart</h2>
      <p className="hint">
        <code>syncKey={'{false}'}</code>: zooming this one doesn't touch the group, and vice versa.
      </p>
      <StreamChart
        height={180}
        window={10_000}
        delay={100}
        syncKey={false}
        series={[{ data: solo, label: 'solo', stroke: '#7EB26D', paths: 'spline' }]}
        uplot={darkTheme}
      />
    </StreamChartGroup>
  );
}
