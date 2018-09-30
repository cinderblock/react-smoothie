import React from 'react';
import reactAutoBind from 'react-autobind';

import { SmoothieChart, TimeSeries } from 'smoothie';

function DefaultTooltip(props) {
  if (!props.display) return <div />;

  return (
    <div style={{ userSelect: 'none' }}>
      <strong>{props.time}</strong>
      {props.data ? (
        <ul>
          {props.data.map((data, i) => (
            <li key={i}>{data.value}</li>
          ))}
        </ul>
      ) : (
        <div />
      )}
    </div>
  );
}

function seriesOptsParser(opts) {
  const ret = {};
  let { r: R, g: G, b: B } = opts;

  if (R === undefined) R = 0;
  if (G === undefined) G = 0;
  if (B === undefined) B = 0;

  if (opts.fillStyle === undefined && R + G + B) {
    opts.fillStyle = {};
  }

  if (opts.strokeStyle === undefined && R + G + B) {
    opts.strokeStyle = {};
  }

  Object.entries(opts).forEach(([name, val]) => {
    switch (name) {
      case 'data':
      case 'r':
      case 'g':
      case 'b':
        return;
      default:
    }

    switch (typeof val) {
      case 'string':
      case 'number':
      case 'boolean':
        ret[name] = val;
        return;
      default:
    }

    let { r, g, b, a } = val;

    if (r === undefined) r = R;
    if (g === undefined) g = G;
    if (b === undefined) b = B;

    if (a === undefined) {
      a = name == 'strokeStyle' ? 1 : r + g + b ? 0.2 : 0;
    }

    ret[name] = `rgba(${r}, ${g}, ${b}, ${a})`;
  });
  return ret;
}

class SmoothieComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { tooltip: {} };
    reactAutoBind(this);
  }

  componentDidMount() {
    if (!this.smoothie) {
      let opts = Object.assign({}, this.props);

      // SmoothieChart's tooltip injects a div at the end of the page.
      // This will not do. We shall make our own and intercept the data.

      let updateTooltip = o => {
        this.setState(state => {
          Object.assign(state.tooltip, o);
          return state;
        });
      };

      opts.tooltipFormatter = (t, data) => {
        if (!this.props.doNotSimplifyData) {
          data = data.map(set => ({
            index: set.index,
            value: set.value,
            series: { options: set.series.options },
          }));
        }

        updateTooltip({
          time: t,
          data,
        });
      };

      opts.tooltip = !!opts.tooltip;

      this.smoothie = new SmoothieChart(opts);

      // Intercept the set data
      this.smoothie.tooltipEl = {
        style: {
          set display(v) {
            updateTooltip({ display: v == 'block' });
          },
          set top(v) {
            updateTooltip({ top: Number(v.match(/^(\d+)px$/)[1]) });
          },
          set left(v) {
            updateTooltip({ left: Number(v.match(/^(\d+)px$/)[1]) });
          },
        },
      };
    }

    if (this.canvas) this.smoothie.streamTo(this.canvas, this.props.streamDelay);

    if (this.props.series) {
      this.props.series.forEach(series => {
        if (!(series.data instanceof TimeSeries)) {
          throw Error('Invalid type passed to series option');
        }

        this.smoothie.addTimeSeries(series.data, seriesOptsParser(series));
      });
    }
  }

  componentWillUnmount() {
    this.smoothie.stop();
    this.smoothie = undefined;
  }

  render() {
    let style = {};

    if (this.props.responsive === true) {
      style.width = '100%';
      style.height = this.props.height;
    }

    // Prevent extra pixels in wrapping element
    style.display = 'block';

    style = this.props.style || style;

    let tooltipParentStyle = this.props.tooltipParentStyle || {
      pointerEvents: 'none',
      position: 'absolute',
      left: this.state.tooltip.left,
      top: this.state.tooltip.top,
    };

    let Tooltip = this.props.tooltip;

    if (Tooltip === true) {
      Tooltip = DefaultTooltip;
    }

    return (
      <>
        <canvas
          className={this.props.className}
          style={style}
          width={this.props.responsive === true ? undefined : this.props.width}
          height={this.props.height}
          ref={canv => (this.canvas = canv)}
        />
        {this.props.tooltip ? (
          <div style={tooltipParentStyle} className={this.props.classNameTooltip}>
            <Tooltip {...this.state.tooltip} />
          </div>
        ) : (
          <></>
        )}
      </>
    );
  }

  addTimeSeries(tsOpts, addOpts) {
    if (addOpts === undefined) {
      addOpts = tsOpts;
      tsOpts = undefined;
    }

    let ts = tsOpts instanceof TimeSeries ? tsOpts : new TimeSeries(tsOpts);

    this.smoothie.addTimeSeries(ts, seriesOptsParser(addOpts));
    return ts;
  }
}

SmoothieComponent.defaultProps = {
  width: 800,
  height: 200,
  streamDelay: 0,
};

export { SmoothieComponent as default, TimeSeries, DefaultTooltip };
