import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import ReactMarkdown from 'react-markdown';

import README from './README.md';

import SmoothieComponent, { SmoothieProvider, TimeSeries } from './SmoothieComponent';

const TS = new TimeSeries();
const TS2 = new TimeSeries();

setInterval(() => {
  const time = new Date().getTime();

  TS.append(time, Math.random());
  TS2.append(time, Math.random());
}, 1000);

function TooltipChart() {
  const [toggle, setToggle] = React.useState(false);
  const [delay, setDelay] = React.useState(0);

  return (
    <>
      <button onClick={() => setToggle(s => !s)}>Toggle Existence</button>
      <button onClick={() => setDelay(d => d + 500)}>Increment Delay</button>
      <button onClick={() => setDelay(d => d - 500)}>Decrement Delay</button>
      <span> streamDelay: {delay}ms</span>
      {toggle ? (
        <></>
      ) : (
        <SmoothieComponent
          responsive
          interpolation="step"
          minValue={0}
          maxValue={1}
          streamDelay={delay}
          nonRealtimeData={false}
          tooltip={props => {
            if (!props.display) return <div />;

            return (
              <div
                style={{
                  userSelect: 'none',
                  background: '#444',
                  padding: '1em',
                  marginLeft: '20px',
                  fontFamily: 'consolas',
                  color: 'white',
                  fontSize: '10px',
                  pointerEvents: 'none',
                }}
              >
                <strong>{props.time}</strong>
                {props.data ? (
                  <ul>
                    {props.data.map((data, i) => (
                      <li key={i} style={{ color: data.series.options.strokeStyle }}>
                        {data.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div />
                )}
              </div>
            );
          }}
          series={[
            {
              data: TS,
              r: 255,
              lineWidth: 4,
              strokeStyle: { r: 255 },
            },
          ]}
        />
      )}
    </>
  );
}

/**
 * A bunch of charts sharing one animation loop — the default, no provider needed.
 * Open the browser profiler: all charts below render from a single requestAnimationFrame.
 */
function CoordinatedCharts({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <SmoothieComponent
          key={i}
          responsive
          height={100}
          series={[
            {
              data: i % 2 ? TS : TS2,
              strokeStyle: { r: (i * 90) % 256, g: (255 - i * 40) % 256, b: (i * 150) % 256 },
              lineWidth: 2,
            },
          ]}
        />
      ))}
    </div>
  );
}

/** Demo of `<SmoothieProvider>` overrides: fps cap, pausing, and opting out of coordination */
function ProviderDemo() {
  const [fps, setFps] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [coordinate, setCoordinate] = React.useState(true);
  const [count, setCount] = React.useState(3);

  return (
    <>
      <label>
        fps cap:{' '}
        <select value={fps} onChange={e => setFps(Number(e.target.value))}>
          <option value={0}>uncapped</option>
          <option value={30}>30</option>
          <option value={10}>10</option>
          <option value={2}>2</option>
        </select>
      </label>{' '}
      <label>
        <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} /> paused
      </label>{' '}
      <label>
        <input type="checkbox" checked={coordinate} onChange={e => setCoordinate(e.target.checked)} /> coordinate
      </label>{' '}
      <button onClick={() => setCount(c => c + 1)}>Add Chart</button>
      <button onClick={() => setCount(c => Math.max(0, c - 1))}>Remove Chart</button>
      <SmoothieProvider fps={fps} paused={paused} coordinate={coordinate}>
        <CoordinatedCharts count={count} />
      </SmoothieProvider>
    </>
  );
}

function Readme() {
  const [source, setSource] = React.useState<string>();
  const [fail, setFail] = React.useState(false);

  useEffect(() => {
    fetch(README)
      .then(response => response.text())
      .then(text => setSource(text))
      .catch(e => {
        setFail(true);
        setSource(e.message);
      });
  });

  return fail ? <>Failed to load markdown:{source}</> : <ReactMarkdown children={source} />;
}

createRoot(document.body.appendChild(document.createElement('div'))).render(
  <>
    <h3>Tooltip / stream delay</h3>
    <TooltipChart />
    <h3>Synchronized rendering (default) — one shared animation loop</h3>
    <CoordinatedCharts count={6} />
    <h3>Subtree overrides via SmoothieProvider</h3>
    <ProviderDemo />
    <Readme />
  </>
);
