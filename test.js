var React = require('react');
var ReactDOM = require('react-dom');
var SmoothieComponent = require('./SmoothieComponent.jsx');

var TestComponent = React.createClass({
  render: function() {
    return <SmoothieComponent ref="chart" responsive />;
  },

  componentDidMount: function() {
    var ts1 = this.refs.chart.addTimeSeries(
      {},
      { strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 4 }
    );
    var ts2 = this.refs.chart.addTimeSeries(
      {},
      { strokeStyle: 'rgba(255, 0, 0, 1)', fillStyle: 'rgba(255, 0, 0, 0.2)', lineWidth: 4 }
    );

    this.dataGenerator = setInterval(function() {
      var time = new Date().getTime();
      ts1.append(time, Math.random());
      ts2.append(time, Math.random());
    }, 500);
  },

  componentWillUnmount: function() {
    clearInterval(this.dataGenerator);
  },
});

ReactDOM.render(<TestComponent />, document.getElementById('react-root'));
