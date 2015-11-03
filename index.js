var path = require('path');
var through2 = require('through2');
var PluginError = require('gulp-util').PluginError;
var colors = require('gulp-util').colors;
var log = require('gulp-util').log;
var QN = require('qn');
var Moment = require('moment');
var Q = require('q');
var fs = require('fs')
var util = require('util')
var crypto = require('crypto')
var minimatch = require('minimatch')
var uploadedFiles = 0;
var getEtag = require('./qetag');

module.exports = function (qiniu, option) {
  option = option || {};
  option = extend({dir: '', versioning: false, versionFile: null, ignore:['*.html']}, option);

  var qn = QN.create(qiniu)
    , version = Moment().format('YYMMDDHHmm')
    , qs = [];

  return through2.obj(function (file, enc, next) {
    var that = this;
    var isIgnore = false;
    var filePath = path.relative(file.base, file.path);

    if (file._contents === null) return next();
    option.ignore.forEach(function(item) {
      if (minimatch(filePath, item)) isIgnore = true;
    })
    if (isIgnore) return next();

    var fileKey = option.dir + ((!option.dir || option.dir[option.dir.length - 1]) === '/' ? '' : '/') + (option.versioning ? version + '/' : '') + filePath;
    getEtag(file.path, function (fileHash) {
      qs.push(Q.nbind(qn.stat, qn)(fileKey)
        .spread(function (stat) {
          // Skip when hash equal
          if (stat.hash === fileHash) return false;

          // Then delete
          return Q.nbind(qn.delete, qn)(fileKey)
        }, function () {
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
            log('Skip:', colors.grey(filePath));
            return;
          }

          // Record hash
          uploadedFiles++;

          log('Upload:', colors.green(filePath), '→', colors.green(fileKey));
        }, function (err) {
          log('Error', colors.red(filePath), new PluginError('gulp-qiniu', err).message);
          that.emit('Error', colors.red(filePath), new PluginError('gulp-qiniu', err));
        })
      )

      next();   
    });
    
  }, function () {
    Q.all(qs)
      .then(function (rets) {
        log('Total:', colors.green(uploadedFiles + '/' + rets.length));

        // Check if versioning
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
