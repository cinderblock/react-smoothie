import * as React from 'react';

import { SmoothieChart, TimeSeries, IChartOptions, ITimeSeriesOptions, ITimeSeriesPresentationOptions } from 'smoothie';

function DefaultTooltip(props: { display?: boolean; time?: number; data?: TooltipData }) {
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

export type ToolTip = typeof DefaultTooltip;

type rgba = { r?: number; g?: number; b?: number; a?: number };
export type PresentationOptions = rgba & {
  fillStyle?: rgba | string;
  strokeStyle?: rgba | string;
  lineWidth?: number;
};

function seriesOptsParser(opts: PresentationOptions): ITimeSeriesPresentationOptions {
  const ret: ITimeSeriesPresentationOptions = {};

  // Get default RGB values
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
    // Don't copy these to the final return
    switch (name) {
      case 'data':
      case 'r':
      case 'g':
      case 'b':
        return;
      default:
    }

    // Certain values are ready to go
    switch (typeof val) {
      case 'string':
      case 'number':
      case 'boolean':
        ret[name] = val;
        return;
      default:
    }

    // Otherwise we've got an object

    // Only convert our fancy rgba object to a string for supported members
    if (!(name == 'fillStyle' || name == 'strokeStyle')) {
      ret[name] = val;
      return;
    }

    let { r, g, b, a } = val as rgba;

    if (r === undefined) r = R;
    if (g === undefined) g = G;
    if (b === undefined) b = B;

    if (a === undefined) {
      a = name == 'strokeStyle' ? 1 : r + g + b ? 0.2 : 0;
    }

    ret[name] = `rgba(${r},${g},${b},${a})`;
  });
  return ret;
}

type TooltipData = { series: any; index: number; value: number }[];

type SmoothieComponentState = {
  tooltip: { time?: number; data?: TooltipData; display?: boolean; top?: number; left?: number };
};

type Style = { [x: string]: number | string };

export type SmoothieComponentSeries = { data: TimeSeries } & PresentationOptions;

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Props that we've defined in this package
 */
type ReactSmoothieProps = {
  streamDelay?: number;
  height?: number;
  width?: number;
  series?: SmoothieComponentSeries[];
  tooltip?: true | false | ToolTip;
  doNotSimplifyData?: boolean;
  style?: Style;
  tooltipParentStyle?: Style;
  containerStyle?: Style;
  classNameCanvas?: string;
  className?: string;
  classNameTooltip?: string;
  classNameContainer?: string;
};

/**
 * Props that we pass onto underlying Smoothie instance
 */
type SmoothieProps = Omit<IChartOptions, 'tooltip'>;

export type SmoothieComponentProps = ReactSmoothieProps & SmoothieProps;

class SmoothieComponent extends React.Component<SmoothieComponentProps, SmoothieComponentState> {
  smoothie: SmoothieChart;
  static defaultProps = {
    width: 800,
    height: 200,
    streamDelay: 0,
  };
  constructor(props: SmoothieComponentProps) {
    super(props);
    this.state = { tooltip: {} };

    let opts: IChartOptions = Object.assign({}, props, { tooltip: !!props.tooltip });

    // SmoothieChart's tooltip injects a div at the end of the page.
    // This will not do. We shall make our own and intercept the data.

    let updateTooltip = (o: SmoothieComponentState['tooltip']) => {
      this.setState(state => {
        Object.assign(state.tooltip, o);
        return state;
      });
    };

    opts.tooltipFormatter = (t, data) => {
      updateTooltip({
        time: t,
        data: props.doNotSimplifyData
          ? data
          : data.map(set => ({
              index: set.index,
              value: set.value,
              series: { options: (set.series as TimeSeries & { options: any }).options },
            })),
      });

      return '';
    };

    let smoothie = new SmoothieChart(opts) as SmoothieChart & {
      // We need to tell TypeScript about some non-exposed internal variables

      mouseY: number;
      mouseX: number;

      // TODO: type this more better
      tooltipEl: any;
    };

    let lastDisplay: string;

    // Intercept the set data
    smoothie.tooltipEl = {
      style: {
        // Intercept when smoothie.js sets tooltipEl.style.display
        set display(v: 'block' | 'string') {
          if (v === lastDisplay) return;
          lastDisplay = v;
          updateTooltip({ display: v == 'block' });
        },
        // Get smoothie's mouse events
        set top(v: any) {
          updateTooltip({
            top: smoothie.mouseY,
            left: smoothie.mouseX,
          });
        },
      },
    };

    if (props.series) {
      props.series.forEach(series => {
        if (!(series.data instanceof TimeSeries)) {
          throw Error('Invalid type passed to series option');
        }

        smoothie.addTimeSeries(series.data, seriesOptsParser(series));
      });
    }

    this.smoothie = smoothie;
  }

  componentWillUnmount() {
    this.smoothie.stop();
  }

  render() {
    let style = {} as { [x: string]: number | string };

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

    let Tooltip = this.props.tooltip as boolean | ToolTip;

    if (Tooltip === true) {
      Tooltip = DefaultTooltip;
    }

    let canvas = (
      <canvas
        className={this.props.classNameCanvas || this.props.className}
        style={style}
        width={this.props.responsive === true ? undefined : this.props.width}
        height={this.props.height}
        ref={canv => canv && this.smoothie.streamTo(canv, this.props.streamDelay)}
      />
    );

    let tooltip;
    if (Tooltip) {
      tooltip = (
        <div style={tooltipParentStyle} className={this.props.classNameTooltip}>
          <Tooltip {...this.state.tooltip} />
        </div>
      );
    }

    return (
      <div className={this.props.classNameContainer} style={this.props.containerStyle || { position: 'relative' }}>
        {canvas}
        {tooltip}
      </div>
    );
  }

  addTimeSeries(addOpts: PresentationOptions);
  addTimeSeries(tsOpts: ITimeSeriesOptions, addOpts: PresentationOptions);
  addTimeSeries(tsOpts: PresentationOptions | ITimeSeriesOptions, addOpts?: PresentationOptions) {
    if (addOpts === undefined) {
      addOpts = tsOpts as PresentationOptions;
      tsOpts = undefined;
    }

    let ts = tsOpts instanceof TimeSeries ? tsOpts : new TimeSeries(tsOpts as ITimeSeriesOptions);

    this.smoothie.addTimeSeries(ts, seriesOptsParser(addOpts));
    return ts;
  }
}

export { SmoothieComponent as default, TimeSeries, DefaultTooltip };
