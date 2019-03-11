import React from 'react';
import ReactDOM from 'react-dom';

import ReactMarkdown from 'react-markdown';

import README from './README.md';

import SmoothieComponent, { TimeSeries } from '.';

const TS = new TimeSeries();
const TS2 = new TimeSeries();

class TestComponent extends React.Component {
  constructor(props) {
    super(props);

    this.state = {};
  }

  render() {
    return (
      <>
        <button onClick={() => this.setState({ toggle: !this.state.toggle })}>Toggle Existence</button>
        <button onClick={() => this.setState({ delay: (this.state.delay || 0) + 500 })}>Increment Delay</button>
        <button onClick={() => this.setState({ delay: (this.state.delay || 0) - 500 })}>Decrement Delay</button>
        {!this.state.toggle ? (
          <SmoothieComponent
            ref="chart"
            responsive
            interpolation="step"
            minValue={0}
            maxValue={1}
            streamDelay={this.state.delay}
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
              },
            ]}
          />
        ) : (
          <></>
        )}
      </>
    );
  }

  componentDidMount() {
    // var ts1 = this.refs.chart.addTimeSeries({
    //   strokeStyle: 'rgba(0, 255, 0, 1)',
    //   fillStyle: 'rgba(0, 255, 0, 0.2)',
    //   lineWidth: 4,
    // });

    // this.refs.chart.addTimeSeries(TS2, {
    //   strokeStyle: { r: 255 },
    //   fillStyle: { r: 255, a: 0.5 },
    //   lineWidth: 4,
    // });

    this.dataGenerator = setInterval(function() {
      var time = new Date().getTime();

      // Generate times slightly in the future
      // time += 1000;

      // ts1.append(time, Math.random());
      TS2.append(time, Math.random());
      TS.append(time, Math.random());
    }, 500);
  }

  componentWillUnmount() {
    clearInterval(this.dataGenerator);
  }
}

class Readme extends React.Component {
  constructor(props) {
    super(props);

    this.state = { text: null };
  }

  componentWillMount() {
    fetch(README)
      .then(response => response.text())
      .then(text => this.setState({ text }));
  }
  render() {
    return <ReactMarkdown source={this.state.text} />;
  }
}

ReactDOM.render(
  <>
    <TestComponent />
    <Readme />
  </>,
  document.body.appendChild(document.createElement('div'))
);
