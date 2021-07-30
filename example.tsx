import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

import ReactMarkdown from 'react-markdown';

import README from './README.md';

import SmoothieComponent, { TimeSeries } from './SmoothieComponent';

const TS = new TimeSeries();
const TS2 = new TimeSeries();

function TestComponent() {
  const [toggle, setToggle] = React.useState(false);
  const [delay, setDelay] = React.useState(0);

  return (
    <>
      <button onClick={() => setToggle(s => !s)}>Toggle Existence</button>
      <button onClick={() => setDelay(d => d + 500)}>Increment Delay</button>
      <button onClick={() => setDelay(d => d - 500)}>Decrement Delay</button>
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

const interval = setInterval(function () {
  var time = new Date().getTime();

  // Generate times slightly in the future
  // time += 1000;

  // ts1.append(time, Math.random());
  TS2.append(time, Math.random());
  TS.append(time, Math.random());
}, 1000);

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

ReactDOM.render(
  <>
    <TestComponent />
    <Readme />
  </>,
  document.body.appendChild(document.createElement('div'))
);
