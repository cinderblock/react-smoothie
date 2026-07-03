import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import type { Configuration } from 'webpack';
import 'webpack-dev-server';

const config: Configuration = {
  entry: './example.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(import.meta.dirname, 'test'),
    publicPath: '/',
  },
  mode: 'development',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'React Smoothie Charts Test',
    }),
  ],
  devServer: {
    client: {
      overlay: {
        warnings: true,
        errors: true,
      },
    },
    // open: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    // Source uses ESM-style './x.js' specifiers that map to .ts/.tsx files
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
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
        type: 'asset/resource',
      },
    ],
  },
};

export default config;
