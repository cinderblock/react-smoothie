var smoothie = require('smoothie');
var React = require('react');

var SmoothieComponent = React.createClass({
  getDefaultProps: function() {
    return {
      width: 800,
      height: 200,
      streamDelay: 0,
    }
  },
  componentDidMount: function() {
    if (!this.smoothie)
      this.smoothie = new smoothie.SmoothieChart(this.props);

    if (this.canvas)
      this.smoothie.streamTo(this.canvas, this.props.streamDelay);
  },
  componentDidUpdate: function(prevProps, prevState) {
    // console.log(this.props.width);
    // console.log(prevProps.width);
    // console.log(this.props.height);
    // console.log(prevProps.height);
    if (this.props.width != prevProps.width || this.props.height != prevProps.height) {
      console.log('Size changed');
      // this.smoothie.resize();
    } else {
      // console.log('Props changed, size the same');
    }
  },
  componentWillUnmount: function() {
    this.smoothie.stop();
    this.smoothie = undefined;
  },
  render: function() {
    return <canvas width={this.props.width} height={this.props.height} ref={canv => this.canvas = canv} />
  },
  addTimeSeries: function(tsOpts, addOpts) {
    var ts = new smoothie.TimeSeries(tsOpts);
    this.smoothie.addTimeSeries(ts, addOpts);
    return ts;
  }
});

module.exports = SmoothieComponent;
