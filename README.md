# react-smoothie

React wrapper for [Smoothie Chart](http://smoothiecharts.org/)

## Install

```bash
npm install react-smoothie --save
```

## Usage

```nodejs
var SmoothieComponent = require('react-smoothie');

var TestComponent = React.createClass({
  // ...

  render: function() {
    return <SmoothieComponent ref="chart" width="1000" height="300" />;
  },

  componentDidMount: function() {
    var ts1 = this.refs.chart.addTimeSeries({},{ strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 4 });
    var ts2 = this.refs.chart.addTimeSeries({},{ strokeStyle: 'rgba(255, 0, 0, 1)', fillStyle: 'rgba(255, 0, 0, 0.2)', lineWidth: 4 });

    this.dataGenerator = setInterval(function() {
      var time = new Date().getTime();
      ts1.append(time, Math.random());
      ts2.append(time, Math.random());
    }, 500);
  },

  componentWillUnmount: function() {
    clearInterval(this.dataGenerator);
  }
});
```

## Props

`SmoothieComponent`'s props are all passed as the options object to _Smoothie Chart_'s constructor.

```nodejs
<SmoothieComponent ref='chart' width={1000} height={300} interpolation='step' />;
```

Two extra props can be passed to control the size of the `<canvas>` used:

### `width`

*default: `800`*

### `height`

*default: `200`*

## TimeSeries

The `TimeSeries` object from _Smoothie Chart_ is exposed via the `addTimeSeries()` function.

The first argument of `addTimeSeries()` gets passed to the `TimeSeries` constructor.
The second argument of `addTimeSeries()` gets passed as the second argument of `SmoothieChart.addTimeSeries()`.

```nodejs
var ts = this.refs.chart.addTimeSeries({/* TimeSeries opts */},{/* Chart.addTimeSeries opts */})

ts.append(new Date().getTime(), Math.random());
```

## Test

 - Run `gulp test` to generate a browser ready `test/test.js` from `test.js` that `test/index.html` can load.
 - Open `test/index.html` in your favorite browser
 - Watch random data fly!
