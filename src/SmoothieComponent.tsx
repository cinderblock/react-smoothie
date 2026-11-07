import * as React from 'react';

import smoothie from 'smoothie';
import type { IChartOptions, ITimeSeriesOptions, ITimeSeriesPresentationOptions } from 'smoothie';

import { RenderCoordinator, RenderCoordinatorOptions, globalCoordinator } from './RenderCoordinator.js';

// smoothie is a UMD/CJS module whose named exports Node's ESM loader cannot statically
// detect, so grab the runtime values off the default export and re-declare the types.
const { SmoothieChart, TimeSeries } = smoothie;
type SmoothieChart = import('smoothie').SmoothieChart;
type TimeSeries = import('smoothie').TimeSeries;

export type SmoothieContextValue = {
  /** Coordinator rendering this subtree's charts, or `null` when charts should self-animate */
  coordinator: RenderCoordinator | null;
};

/**
 * `undefined` (no provider) means charts use the module-wide `globalCoordinator`.
 */
const SmoothieContext = React.createContext<SmoothieContextValue | undefined>(undefined);

export type SmoothieProviderProps = RenderCoordinatorOptions & {
  /**
   * Set to `false` to restore per-chart self-animation (one `requestAnimationFrame` loop
   * per chart, as driven by Smoothie Charts itself) for all charts in this subtree.
   *
   * _default: `true`_
   */
  coordinate?: boolean;

  children?: React.ReactNode;
};

/**
 * Renders all `SmoothieComponent` charts beneath it from a single shared animation loop —
 * separate from the global one — with optional frame rate cap and pausing.
 *
 * Charts don't need a provider to be coordinated; without one they share the global loop.
 * Use a provider to control `fps`/`paused` for a subtree, or `coordinate={false}` to opt
 * a subtree out of coordination entirely. The nearest provider wins.
 */
export function SmoothieProvider(props: SmoothieProviderProps) {
  const { fps = 0, paused = false, coordinate = true, children } = props;

  const ref = React.useRef<RenderCoordinator | null>(null);
  // Lazily create the coordinator with the initial options so the first frames after mount
  // already honor them; later changes are applied by the effects below.
  const coordinator = (ref.current ??= new RenderCoordinator({ fps, paused }));

  React.useEffect(() => {
    coordinator.setFps(fps);
  }, [coordinator, fps]);

  React.useEffect(() => {
    coordinator.setPaused(paused);
  }, [coordinator, paused]);

  const value = React.useMemo(() => ({ coordinator: coordinate ? coordinator : null }), [coordinate, coordinator]);

  return <SmoothieContext.Provider value={value}>{children}</SmoothieContext.Provider>;
}

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

// TODO: SmoothieCharts should update their types so that this is less hacky
type CanvasStyle = CanvasGradient | CanvasPattern;

/**
 * Non-exposed SmoothieChart internals we need for coordinated rendering.
 * The mouse handlers are bound in the SmoothieChart constructor, so their identities are stable.
 */
type SmoothieChartInternals = SmoothieChart & {
  delay?: number;
  mousemove: (evt: MouseEvent) => void;
  mouseout: (evt: MouseEvent) => void;
};

/**
 * undefined means 0
 */
type rgba = { r?: number; g?: number; b?: number; a?: number };

type RGBA = Required<rgba>;

export type PresentationOptions = rgba & {
  fillStyle?: rgba | CanvasStyle | ITimeSeriesPresentationOptions['fillStyle'];
  strokeStyle?: rgba | CanvasStyle | ITimeSeriesPresentationOptions['strokeStyle'];
} & Omit<ITimeSeriesPresentationOptions, 'fillStyle' | 'strokeStyle'>;

function isCanvasStyle(value: any): value is CanvasStyle {
  // Guard for environments without canvas support (SSR, jsdom)
  return (
    (typeof CanvasGradient !== 'undefined' && value instanceof CanvasGradient) ||
    (typeof CanvasPattern !== 'undefined' && value instanceof CanvasPattern)
  );
}
function isRgba(style: PresentationOptions['fillStyle'] | PresentationOptions['strokeStyle']): style is rgba {
  if (isCanvasStyle(style)) return false;

  if (typeof style !== 'object') return false;
  return true;

  return typeof style === 'object';
}

function convertRGBAtoCSSString(rgba: RGBA): string {
  const css = `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})`;
  return css;
}

function extractRGBAFromPresentationOptions(options: PresentationOptions): RGBA {
  const { r, g, b, a } = options;
  return {
    r: r ?? 0,
    g: g ?? 0,
    b: b ?? 0,
    a: a ?? 0,
  };
}

/**
 * We want to let users specify the presentation options a little more loosely.
 *
 * This converts our `PresentationOptions` to the options that SmoothieChart expects.
 */
function seriesOptsParser(opts: PresentationOptions): ITimeSeriesPresentationOptions {
  const defColor = extractRGBAFromPresentationOptions(opts);

  let fillStyle: PresentationOptions['fillStyle'];

  if (isCanvasStyle(opts.fillStyle) || typeof opts.fillStyle === 'string') {
    fillStyle = opts.fillStyle;
  } else {
    fillStyle = convertRGBAtoCSSString({ ...defColor, ...{ a: 0.2 }, ...opts.fillStyle });
  }

  let strokeStyle: PresentationOptions['strokeStyle'];

  if (isCanvasStyle(opts.strokeStyle) || typeof opts.strokeStyle === 'string') {
    strokeStyle = opts.strokeStyle;
  } else {
    strokeStyle = convertRGBAtoCSSString({ ...defColor, ...{ a: 1 }, ...opts.strokeStyle });
  }

  const ret = {
    ...opts,
    data: '',
    // TODO: SmoothieCharts should update their types so that this is less hacky
    fillStyle: fillStyle as ITimeSeriesPresentationOptions['fillStyle'],
    strokeStyle: strokeStyle as ITimeSeriesPresentationOptions['strokeStyle'],
  };

  delete ret.r;
  delete ret.g;
  delete ret.b;
  delete ret.a;
  delete ret.data;

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
  /** Freeze this chart (skip its frames) while `true`. The chart stays mounted and registered. */
  paused?: boolean;
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
  canvas: HTMLCanvasElement | null = null;
  /** Current canvas binding, so changes to the canvas or animation mode can be detached cleanly */
  private streaming?: { canvas: HTMLCanvasElement; coordinator: RenderCoordinator | null };
  static contextType = SmoothieContext;
  declare context: React.ContextType<typeof SmoothieContext>;
  static defaultProps = {
    width: 800,
    height: 200,
    streamDelay: 0,
  };
  constructor(props: SmoothieComponentProps) {
    super(props);
    this.state = { tooltip: {} };

    let opts: IChartOptions = Object.assign({}, props, { tooltip: !!props.tooltip });

    // SmoothieCharts's tooltip injects a div at the end of the page.
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
    this.detachStreaming();
  }

  componentDidUpdate(prevProps: SmoothieComponentProps, prevState: SmoothieComponentState) {
    const prevSeries = prevProps.series ?? [];
    const series = this.props.series ?? [];

    for (const s of prevSeries) {
      if (!series.includes(s)) this.smoothie.removeTimeSeries(s.data);
    }

    for (const s of series) {
      if (!prevSeries.includes(s)) this.smoothie.addTimeSeries(s.data, seriesOptsParser(s));
    }

    this.syncStreaming();
  }

  private handleCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this.canvas = canvas;
    this.syncStreaming();
  };

  /** The coordinator this chart should register with, or `null` to self-animate */
  private activeCoordinator(): RenderCoordinator | null {
    // No provider above us: coordinate by default via the shared global loop
    if (this.context === undefined) return globalCoordinator;
    return this.context.coordinator;
  }

  /**
   * Make the chart's animation match the current canvas, context, and props.
   * Idempotent; called on canvas (un)mount and on every update.
   */
  private syncStreaming() {
    const canvas = this.canvas;
    const coordinator = canvas ? this.activeCoordinator() : null;
    const internals = this.smoothie as SmoothieChartInternals;

    if (this.streaming && (this.streaming.canvas !== canvas || this.streaming.coordinator !== coordinator)) {
      this.detachStreaming();
    }

    if (!canvas) return;

    if (!this.streaming) {
      this.smoothie.streamTo(canvas, this.props.streamDelay);

      if (coordinator) {
        // The coordinator drives rendering; stop the chart's own animation loop. stop() also
        // removes the chart's mouse listeners, so re-add them to keep tooltips working.
        this.smoothie.stop();
        canvas.addEventListener('mousemove', internals.mousemove);
        canvas.addEventListener('mouseout', internals.mouseout);
      }

      this.streaming = { canvas, coordinator };
    }

    // Pick up streamDelay changes (this is all streamTo() does with it)
    internals.delay = this.props.streamDelay;

    if (coordinator) {
      // Also updates per-chart options of an already-registered chart
      coordinator.register(this.smoothie, { paused: this.props.paused });
    } else if (this.props.paused) {
      this.smoothie.stop();
    } else {
      this.smoothie.start();
    }
  }

  /** Undo whatever syncStreaming() set up. Idempotent. */
  private detachStreaming() {
    this.smoothie.stop();

    if (!this.streaming) return;

    const { canvas, coordinator } = this.streaming;

    if (coordinator) {
      const internals = this.smoothie as SmoothieChartInternals;
      coordinator.unregister(this.smoothie);
      canvas.removeEventListener('mousemove', internals.mousemove);
      canvas.removeEventListener('mouseout', internals.mouseout);
    }

    this.streaming = undefined;
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
        ref={this.handleCanvasRef}
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

  addTimeSeries(addOpts: PresentationOptions): TimeSeries;
  addTimeSeries(tsOpts: ITimeSeriesOptions, addOpts: PresentationOptions): TimeSeries;
  addTimeSeries(tsOpts: PresentationOptions | ITimeSeriesOptions, addOpts?: PresentationOptions): TimeSeries {
    if (addOpts === undefined) {
      addOpts = tsOpts as PresentationOptions;
      tsOpts = undefined;
    }

    let ts = tsOpts instanceof TimeSeries ? tsOpts : new TimeSeries(tsOpts as ITimeSeriesOptions);

    this.smoothie.addTimeSeries(ts, seriesOptsParser(addOpts));
    return ts;
  }

  removeTimeSeries(ts: TimeSeries) {
    this.smoothie.removeTimeSeries(ts);
  }
}

export { SmoothieComponent as default, TimeSeries, DefaultTooltip };
export { RenderCoordinator, globalCoordinator };
export type { RenderCoordinatorOptions };
