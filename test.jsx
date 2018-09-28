import React from 'react';
import ReactDOM from 'react-dom';

import SmoothieComponent, { TimeSeries } from './SmoothieComponent.jsx';

const TS = new TimeSeries();
const TS2 = new TimeSeries();

class TestComponent extends React.Component {
  render() {
    return (
      <SmoothieComponent
        ref="chart"
        responsive
        series={[
          {
            data: TS,
            strokeStyle: { b: 255 },
            fillStyle: { b: 255 },
            lineWidth: 4,
          },
        ]}
      />
    );
  }

  componentDidMount() {
    var ts1 = this.refs.chart.addTimeSeries({
      strokeStyle: 'rgba(0, 255, 0, 1)',
      fillStyle: 'rgba(0, 255, 0, 0.2)',
      lineWidth: 4,
    });

    this.refs.chart.addTimeSeries(TS2, {
      strokeStyle: { r: 255 },
      fillStyle: { r: 255, a: 0.5 },
      lineWidth: 4,
    });

    this.dataGenerator = setInterval(function() {
      var time = new Date().getTime();

      // Generate times slightly in the future
      // time += 1000;

      ts1.append(time, Math.random());
      TS2.append(time, Math.random());
      TS.append(time, Math.random());
    }, 500);
  }

  componentWillUnmount() {
    clearInterval(this.dataGenerator);
  }
}

ReactDOM.render(<TestComponent />, document.body.appendChild(document.createElement('div')));
