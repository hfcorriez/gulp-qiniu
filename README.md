# [gulp](http://gulpjs.com)-[qiniu](http://qiniu.com)

> 上传静态资源到七牛 CDN

## Install

```
npm install gulp-qiniu --save-dev
```

## Usage

实例代码:

```js
gulp.src('./public/**')
  .pipe(qiniu({
    accessKey: "xxxx",
    secretKey: "xxxx",
    bucket: "bucket",
    private: false
  }, {
    dir: 'assets/',
    versioning: true,
    versionFile: './cdn.json'
  }))
```

## License

MIT
