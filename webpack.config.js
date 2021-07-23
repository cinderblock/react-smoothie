const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: './example.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'test'),
    publicPath: '/',
  },
  mode: 'development',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'React Smoothie Charts Test',
    }),
  ],
  devServer: {
    overlay: {
      warnings: true,
      errors: true,
    },
    // open: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.(md)$/,
        use: [
          {
            loader: 'file-loader',
            options: {},
          },
        ],
      },
    ],
  },
};
