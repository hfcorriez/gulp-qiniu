var path = require('path');
var through2 = require('through2');
var PluginError = require('gulp-util').PluginError;
var colors = require('gulp-util').colors;
var log = require('gulp-util').log;
var QN = require('qn');
var Moment = require('moment');
var fs = require('fs');
var Q = require('q');
var util = require('util')

module.exports = function (qiniu, option) {
  option = option || {};
  option = extend({dir: '', versioning: false, versionFile: null}, option);

  var qn = QN.create(qiniu)
    , version = Moment().format('YYMMDDHHmm')
    , qs = [];

  return through2.obj(function (file, enc, next) {
    var that = this;
    if (file._contents === null) return next();

    var filePath = path.relative(file.base, file.path);
    var fileKey = option.dir + ((!option.dir || option.dir[option.dir.length - 1]) === '/' ? '' : '/') + (option.versioning ? version + '/' : '') + filePath;

    qs.push(Q.nbind(qn.delete, qn)(fileKey)
      .then(function () {
        return Q.nbind(qn.upload, qn)(file._contents, {key: fileKey})
      }, function () {
        return Q.nbind(qn.upload, qn)(file._contents, {key: fileKey})
      })
      .then(function () {
        log('Uploaded', colors.green(filePath), '→', colors.green(fileKey));
      }, function (err) {
        that.emit('error', new PluginError('gulp-qiniu', err));
      }));

    next();
  }, function () {
    Q.all(qs)
      .then(function (rets) {
        log('Total uploaded:', colors.green(rets.length));
        if (!option.versioning) return;
        log('Version:', colors.green(version));

        if (option.versionFile) {
          fs.writeFileSync(option.versionFile, JSON.stringify({version: version}))
          log('Write version file:', colors.green(option.versionFile));
        }
      }, function (err) {
        log('Failed upload files:', err.message);
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
