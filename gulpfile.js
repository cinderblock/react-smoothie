const gulp = require('gulp');
const babel = require('gulp-babel');
const webpack = require('webpack-stream');

gulp.task('babel', () => {
  return gulp.src('SmoothieComponent.jsx')
    .pipe(babel({
      presets: ['es2015', 'react']
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('dist', ['babel']);

gulp.task('test.js', () => {
  return gulp.src('test.js')
    .pipe(webpack({
      module: {
        loaders: [
          {
            test: /\.jsx?$/,
            exclude: /node_modules/,
            loader: 'babel',
            query: {
              presets: ['es2015', 'react']
            }
          }
        ],
      },
      output: {
        filename: 'test.js'
      }
    }))
    .pipe(gulp.dest('test/'));
});

gulp.task('test', ['test.js']);

gulp.task('default', ['dist']);
