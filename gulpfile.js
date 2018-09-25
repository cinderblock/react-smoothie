const gulp = require('gulp');
const babel = require('gulp-babel');

gulp.task('babel', () => {
  return gulp
    .src('SmoothieComponent.jsx')
    .pipe(
      babel({
        presets: ['@babel/env', '@babel/react'],
      })
    )
    .pipe(gulp.dest('.'));
});

gulp.task('dist', ['babel']);

gulp.task('default', ['dist']);
