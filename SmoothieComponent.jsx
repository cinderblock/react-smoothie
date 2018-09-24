import React from 'react';
import reactAutoBind from 'react-autobind';

const smoothie = require('smoothie');

class SmoothieComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
    reactAutoBind(this);
  }

  componentDidMount() {
    if (!this.smoothie) this.smoothie = new smoothie.SmoothieChart(this.props);

    if (this.canvas) this.smoothie.streamTo(this.canvas, this.props.streamDelay);
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

    style = this.props.style || style;

    return (
      <canvas
        style={style}
        width={this.props.responsive === true ? undefined : this.props.width}
        height={this.props.height}
        ref={canv => (this.canvas = canv)}
      />
    );
  }

  addTimeSeries(tsOpts, addOpts) {
    var ts = new smoothie.TimeSeries(tsOpts);
    this.smoothie.addTimeSeries(ts, addOpts);
    return ts;
  }
}

SmoothieComponent.defaultProps = {
  width: 800,
  height: 200,
  streamDelay: 0,
};

module.exports = SmoothieComponent;
