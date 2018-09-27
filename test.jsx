import React from 'react';
import ReactDOM from 'react-dom';

import SmoothieComponent, { TimeSeries } from './SmoothieComponent.jsx';

class TestComponent extends React.Component {
  render() {
    return (
      <SmoothieComponent
        ref="chart"
        responsive
      />
    );
  }

  componentDidMount() {
    var ts1 = this.refs.chart.addTimeSeries({
      strokeStyle: 'rgba(0, 255, 0, 1)',
      fillStyle: 'rgba(0, 255, 0, 0.2)',
      lineWidth: 4,
    });
    var ts2 = this.refs.chart.addTimeSeries({
      strokeStyle: 'rgba(255, 0, 0, 1)',
      fillStyle: 'rgba(255, 0, 0, 0.2)',
      lineWidth: 4,
    });

    this.dataGenerator = setInterval(function() {
      var time = new Date().getTime();

      // Generate times slightly in the future
      time += 1000;

      ts1.append(time, Math.random());
      ts2.append(time, Math.random());
    }, 500);
  }

  componentWillUnmount() {
    clearInterval(this.dataGenerator);
  }
}

ReactDOM.render(<TestComponent />, document.body.appendChild(document.createElement('div')));
