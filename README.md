# react-smoothie

React wrapper for [Smoothie Chart](http://smoothiecharts.org/)

## Install

With Yarn:

```bash
yarn add react-smoothie
```

With NPM:

```bash
npm install react-smoothie --save
```

## Usage

There are 2 main ways to populate data.

- Original `ref` based `addTimeSeries()`
- New _(added in `0.4.0`)_ props based with reference to TimeSeries

### Import / Require

Both import or require work

```javascript
const { default: SmoothieComponent, TimeSeries } = require('react-smoothie');
import SmoothieComponent, { TimeSeries } from 'react-smoothie';
```

### New prop based API

```jsx
const ts1 = new TimeSeries({});
const ts2 = new TimeSeries({
  resetBounds: true,
  resetBoundsInterval: 3000,
});

setInterval(function() {
  var time = new Date().getTime();

  ts1.append(time, Math.random());
  ts2.append(time, Math.random());
}, 500);

var TestComponent = React.createClass({
  render: function() {
    return (
      <SmoothieComponent
        responsive
        height={300}
        series={[
          {
            data: ts1,
            strokeStyle: { g: 255 },
            fillStyle: { g: 255 },
            lineWidth: 4,
          },
          {
            data: ts2,
            strokeStyle: { r: 255 },
            fillStyle: { r: 255 },
            lineWidth: 4,
          },
        ]}
      />
    );
  },
});
```

### Old reference based API

```jsx
var TestComponent = React.createClass({
  render: function() {
    return <SmoothieComponent ref="chart" responsive height={300} />;
  },

  componentDidMount: function() {
    // Initialize TimeSeries yourself
    var ts1 = new TimeSeries({});

    this.refs.chart.addTimeSeries(ts1, {
      strokeStyle: 'rgba(0, 255, 0, 1)',
      fillStyle: 'rgba(0, 255, 0, 0.2)',
      lineWidth: 4,
    });

    // Or let addTimeSeries create a new instance of TimeSeries for us
    var ts2 = this.refs.chart.addTimeSeries(
      {
        resetBounds: true,
        resetBoundsInterval: 3000,
      },
      {
        strokeStyle: { r: 255 },
        fillStyle: { r: 255 },
        lineWidth: 4,
      }
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
```

### More Examples

See [`example.jsx`](example.jsx) for a relatively standalone example.

## Props

`SmoothieComponent`'s props are all passed as the options object to _Smoothie Chart_'s constructor.

```jsx
<SmoothieComponent ref="chart" width={1000} height={300} interpolation="step" />
```

### Extra props

There are some extra props that control other behaviors.

#### `tooltip`

Generate a tooltip on mouseover

- `false` does not enabble tooltip
- `true` enables a default ugly tooltip
- `function` that returns a stateless React component

_default: `false`_

#### `responsive`

Enabling responsive mode automatically sets the width to `100%`.

_default: `false`_

#### `width`

Control the width of the `<canvas>` used.

_default: `800`_

#### `height`

Control the height of the `<canvas>` used.

_default: `200`_

#### `streamDelay`

_default: `0` (ms)_

Delay the displayed chart. This value is passed after the component mounts as the second argument to `SmoothieChart.streamTo`.

### Responsive charts

Experimental support for responsive charts was added in 0.3.0.
Simply set the `responsive` prop to `true` and canvas will use the full width of the parent container.
Height is still a controlled prop.

### TimeSeries

`TimeSeries` is the main class that _Smoothie Chart_ uses internally for each series of data.
There are two ways to access and use these objects, corresponding to the two API versions.

#### New API

`TimeSeries` is available as an import.

```jsx
const ts1 = new TimeSeries();
ts1.append(time, Math.random());
```

#### Old API

`TimeSeries` is exposed via the `addTimeSeries()` function.

The optional first argument of `addTimeSeries()` gets passed as the options to the `TimeSeries` constructor.
The last argument of `addTimeSeries()` gets passed as the options argument of `SmoothieChart.addTimeSeries()`.

As of `0.4.0`, an instance of `TimeSeries` can be passed as an argument to `addTimeSeries()`.

```jsx
var ts = this.refs.chart.addTimeSeries(
  {
    /* Optional TimeSeries opts */
  },
  {
    /* Chart.addTimeSeries opts */
  }
);

ts.append(new Date().getTime(), Math.random());
```

## Test / Example

Run `yarn dev` or `npm run dev` to start the Webpack Dev Server and open the page on your browser.
Don't forget to run `yarn` or `npm install` first to install dependencies.
