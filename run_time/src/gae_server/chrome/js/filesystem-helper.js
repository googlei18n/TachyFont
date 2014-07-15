'use strict';

/*
 * Copyright 2014 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

/**
 * FilesystemHelper class
 * @param {Promise} filesystemReady Promise to filesystem is ready
 * @param {Boolean} assumeEmpty Ignore contents of the filesystem
 * @constructor
 */
function FilesystemHelper(filesystemReady, assumeEmpty) {
  this.filesystemReady = filesystemReady;
  this.assumeEmpty = assumeEmpty;
}
/**
 * Placeholder
 * @type type
 */
FilesystemHelper.TYPES = {
    ARRAYBUFFER: 0,
    TEXT: 1,
    BINARYSTRING: 2,
    DATAURL: 3
};
/**
 * Placeholder
 * @param {type} fileEntry
 * @return {Promise}
 */
FilesystemHelper.prototype.createFileWriter = function(fileEntry) {
  return new Promise(function(resolve, reject) {
    fileEntry.createWriter(function(fw) {
      resolve(fw);
    }, reject);
  });
};
/**
 * Placeholder
 * @param {type} filename
 * @param {type} toCreate
 * @return {FilesystemHelper.prototype@pro;filesystemReady@call;then}
 */
FilesystemHelper.prototype.getFileEntry = function(filename, toCreate) {
  return this.filesystemReady.then(function(fs) {
    return new Promise(function(resolve, reject) {
      fs.root.getFile(filename, {
        create: toCreate
      }, function(fileEntry) {
        resolve(fileEntry);
      }, reject);
    });
  });
};
/**
 * Placeholder
 * @param {type} fileEntry
 * @return {Promise}
 */
FilesystemHelper.prototype.getFileObject = function(fileEntry) {
  return new Promise(function(resolve, reject) {
    fileEntry.file(function(file) {
      resolve(file);
    }, reject);
  });
};
/**
 * Placeholder
 * @param {type} filename
 * @return {FilesystemHelper.prototype@call;getFileEntry@call;then}
 */
FilesystemHelper.prototype.getFileWriter = function(filename) {
  return this.getFileEntry(filename, true).then(this.createFileWriter);
};
/**
 * Placeholder
 * @param {type} filename
 * @return {FilesystemHelper.prototype@pro;filesystemReady@call;then}
 */
FilesystemHelper.prototype.checkIfFileExists = function(filename) {
  return this.filesystemReady.then(function(fs) {
    return new Promise(function(resolve, reject) {
      var exists;
      fs.root.createReader().readEntries(function(entries) {
        exists = entries.some(function(elem) {
          return elem.name == filename;
        });
      });
      resolve(exists && !this.assumeEmpty);

    });
  });
};
/**
 * Placeholder
 * @param {type} filename
 * @param {type} content
 * @param {type} contentType
 * @return {FilesystemHelper.prototype@call;getFileWriter@call;then}
 */
FilesystemHelper.prototype.writeToTheFile = function(filename, content,
  contentType) {
  return this.getFileWriter(filename).then(function(fileWriter) {
    return new Promise(function(resolve, reject) {
      fileWriter.onwriteend = function(e) {
        resolve(e);
      };
      fileWriter.onerror = function(e) {
        reject(e);
      };
      fileWriter.write(new Blob([
        content
      ], {
        type: contentType
      }));
    });
  });
};
/**
 * Placeholder
 * @param {type} filename
 * @param {type} type
 * @return {FilesystemHelper.prototype@call;getFileEntry@call;then@call;then}
 */
FilesystemHelper.prototype.getFileAs = function(filename, type) {
  return this.getFileEntry(filename, true).then(this.getFileObject).then(
    function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function(e) {
        resolve(e.target.result);
      };
      reader.onerror = reject;
      switch (type) {
        case FilesystemHelper.TYPES.ARRAYBUFFER:
          reader.readAsArrayBuffer(file);
          break;
        case FilesystemHelper.TYPES.TEXT:
          reader.readAsText(file);
          break;
        case FilesystemHelper.TYPES.BINARYSTRING:
          reader.readAsBinaryString(file);
          break;
        case FilesystemHelper.TYPES.DATAURL:
          reader.readAsDataURL(file);
          break;
        default:
          reject();
          break;
      }
    });
  });
};
/**
 * Placeholder
 * @param {type} filename
 * @return {FilesystemHelper.prototype@call;getFileEntry@call;then}
 */
FilesystemHelper.prototype.getFileURL = function(filename) {
  return this.getFileEntry(filename, false).then(function(fe) {
    return fe.toURL();
  });
};
