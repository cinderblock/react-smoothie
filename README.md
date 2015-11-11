# react-smoothie

React wrapper for [Smoothie Chart](http://smoothiecharts.org/)

## Install

```
npm install react-smoothie --save
```

## Usage

```
var SmoothieComponent = require('react-smoothie');

var TestComponent = React.createClass({
  // ...

  render: function() {
    return <SmoothieComponent ref="chart"/>;
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

`SmoothieComponent`'s props are all passed as the options object to _Smoothie Chart_'s constructor like this: `new smoothie.SmoothieChart(...this.props);`

Two extra props can be passed to control the size of the `<canvas>` used:

### `width`

*default: `800`*

### `height`

*default: `200`*

## TimeSeries

The `TimeSeries` object from _Smoothie Chart_ is exposed via the `addTimeSeries()` function.

`.addTimeSeries({/* TimeSeries opts */},{/* Chart.addTimeSeries opts */})`

The two arguments of addTimeSeries() get passed to the `TimeSeries` constructor and as the second argument to `SmoothieChart.addTimeSeries()` individually.

## Test

 - Run `gulp test` to generate a browser ready `test/test.js` from `test.js` that `test/index.html` can load.
 - Open `test/index.html` in your favorite browser
 - Watch random data fly!