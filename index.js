var path = require('path');
var through2 = require('through2');
var PluginError = require('gulp-util').PluginError;
var colors = require('gulp-util').colors;
var log = require('gulp-util').log;
var QN = require('qn');
var Moment = require('moment');
var Q = require('q');
var fs = require('fs')
var crypto = require('crypto')
var minimatch = require('minimatch')
var uploadedFiles = 0;
var getEtag = require('./qetag')

module.exports = function (qiniu, option) {
  option = option || {};
  option = extend({dir: '', versioning: false, versionFile: null, ignore: [], concurrent: 10}, option);

  var qn = QN.create(qiniu)
    , version = Moment().format('YYMMDDHHmm')
    , qs = []
    , filesIndex = 0

  return through2.obj(function (file, enc, next) {
    var that = this;
    var isIgnore = false;
    var filePath = path.relative(file.base, file.path);
    filePath = filePath.split(path.sep).join('/');

    if (file._contents === null) return next();
    option.ignore.forEach(function (item) {
      if (minimatch(filePath, item)) isIgnore = true;
    })
    if (isIgnore) return next();

    filesIndex++

    var fileKey = option.dir + ((!option.dir || option.dir[option.dir.length - 1]) === '/' ? '' : '/') + (option.versioning ? version + '/' : '') + filePath;
    var retries = 0;
    var isConcurrent = filesIndex % Math.floor(option.concurrent) !== 0

    var handler = function () {
      return Q.nbind(qn.stat, qn)(fileKey)
        .spread(function (stat) {
          return Q.nfcall(getEtag, file._contents)
            .then(function (fileHash) {
              // Skip when hash equal
              if (stat.hash === fileHash) return false;

              // Start
              log('Start →', fileKey);

              // Then delete
              return Q.nbind(qn.delete, qn)(fileKey)
            })
        }, function () {
          // Start
          log('Start →', fileKey);

          // Upload when not exists
          return true;
        })
        .then(function (isUpload) {
          if (isUpload === false) return false;
          return Q.nbind(qn.upload, qn)(file._contents, {key: fileKey})
        })
        .then(function (stat) {
          // No upload
          if (stat === false) {
            log('Skip →', colors.grey(fileKey));
            !isConcurrent && next()
            return;
          }

          // Record hash
          uploadedFiles++;

          log('Upload →', colors.green((qiniu.origin ? qiniu.origin  + '/' : '') + fileKey));
          !isConcurrent && next()
        }, function (err) {
          log('Error →', colors.red(fileKey), new PluginError('gulp-qiniu', err).message);
          that.emit('Error', colors.red(fileKey), new PluginError('gulp-qiniu', err));

          if (retries++ < 3) {
            log('Retry(' + retries + ') →', colors.red(fileKey));
            return handler()
          } else {
            !isConcurrent && next()
          }
        })
    }

    qs.push(handler())

    isConcurrent && next()
  }, function () {
    Q.all(qs)
      .then(function (rets) {
        log('Total →', colors.green(uploadedFiles + '/' + rets.length));

        // Check if versioning
        if (!option.versioning) return;
        log('Version →', colors.green(version));

        if (option.versionFile) {
          fs.writeFileSync(option.versionFile, JSON.stringify({version: version}))
          log('Write version file →', colors.green(option.versionFile));
        }
      }, function (err) {
        log('Failed upload →', err.message);
      });
  });

  function extend(target, source) {
    target = target || {};
    for (var prop in source) {
      if (typeof source[prop] === 'object') {
        target[prop] = extend(target[prop], source[prop]);
      } else {
        target[prop] = source[prop];
      }
    }
    return target;
  }
};
