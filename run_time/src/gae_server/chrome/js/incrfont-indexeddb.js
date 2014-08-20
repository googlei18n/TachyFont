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
 * IncrementalFont - A namespace.
 */
function IncrementalFont() {
}

/**
 * The IndexedDB version.
 * Increment this number every time there is a change in the schema.
 */
IncrementalFont.version = 1;


/**
 * The database name.
 */
IncrementalFont.DB_NAME = 'incrfonts';


/**
 * The time in milliseconds to wait before persisting the data.
 */
IncrementalFont.timeoutTime = 1000;


/**
 * The base name.
 */
IncrementalFont.BASE = 'base';


/**
 * The base is dirty (needs to be persisted) key.
 */
IncrementalFont.BASE_DIRTY = 'base_dirty';


/**
 * The char list name.
 */
IncrementalFont.CHARLIST = 'charlist';


/**
 * Get the incremental font object.
 * This class does the following:
 * 1. Create a class using the "@font-face" rule and with visibility=hidden
 * 2. Create an incremental font manager object.
 * 3. Open the IndexedDB.
 * 4. Start the operation to get the base.
 * 5. Start the operation to get the list of fetched/not-fetched chars.
 * 6. Create a "@font-face" rule (need the data to make the blob URL).
 * 7. When the base is available set the class visibility=visible
 *
 * @param {string} fontname The name of the font.
 * @return {array} An array with:
 *                 array[0] {Object} The IndexedDB object.
 *                 array[1] {Object}  The fileinfo from the header.
 *                 array[2] {DataView} The font data.
 */
IncrementalFont.createManager = function(fontname) {
  var incrFontMgr = new IncrementalFont.obj_(fontname);
  //timer.start('openIndexedDB.open ' + fontname);
  incrFontMgr.getIDB_ = incrFontMgr.openIndexedDB(fontname);
  //timer.end('openIndexedDB.open ' + fontname);

  // Create a class with visibility: hidden.
  incrFontMgr.style = IncrementalFontUtils.setVisibility(null, fontname, false);
  console.log('add a \'document.addEventListener("DOMContentLoaded", ...)\'' +
    'to automatically get the char data')

  incrFontMgr.getBase = incrFontMgr.getIDB_.
  then(function(idb) {
    var filedata = incrFontMgr.getData_(idb, IncrementalFont.BASE);
    return Promise.all([idb, filedata]);
  }).
  then(function(arr) {
    var idb = arr[0];
    var filedata = new DataView(arr[1]);
    var fileinfo = IncrementalFontUtils.parseBaseHeader(filedata);
    var fontdata = new DataView(arr[1], fileinfo.headSize);
    return Promise.all([idb, fileinfo, fontdata]);
  }).
  catch (function(e) {
    //timer.end('did not get the base data ' + fontname);
    console.log('Did not get base from IDB, need to fetch it: ' + fontname);
    return IncrementalFontUtils.requestURL('/fonts/' + incrFontMgr.fontname +
      '/base', 'GET', null, {}, 'arraybuffer').
    then(function(xfer_bytes) {
      var xfer_data = new DataView(xfer_bytes);
      var fileinfo = IncrementalFontUtils.parseBaseHeader(xfer_data);
      var header_data = new DataView(xfer_bytes, 0, fileinfo.headSize);
      var rle_fontdata = new DataView(xfer_bytes, fileinfo.headSize);
      var raw_base = RLEDecoder.rleDecode([header_data, rle_fontdata]);
      var raw_basefont = new DataView(raw_base.buffer, header_data.byteLength);
      
      IncrementalFontUtils.writeCmap12(raw_basefont, fileinfo);
      IncrementalFontUtils.writeCmap4(raw_basefont, fileinfo);
      IncrementalFontUtils.writeCharsetFormat2(raw_basefont, fileinfo);

      var basefont =
        IncrementalFontUtils.sanitizeBaseFont(fileinfo, raw_basefont);
      incrFontMgr.persistDelayed_(IncrementalFont.BASE);
      return [incrFontMgr.getIDB_, fileinfo, basefont];
    });
  }).
  then(function(arr) {
    var fileinfo = arr[1];
    // Create the @font-face rule.
    IncrementalFontUtils.setFont(fontname, arr[2], fileinfo.isTTF);
    // Make the class visible.
    IncrementalFontUtils.setVisibility(incrFontMgr.style, fontname, true);

    return arr;
  });

  // Start the operation to get the list of already fetched chars.
  //console.log('Get the list of already fetched chars.');
  incrFontMgr.getCharList = incrFontMgr.getIDB_.
  then(function(idb) {
    return incrFontMgr.getData_(idb, IncrementalFont.CHARLIST);
  }).
  catch (function(e) {
    return {};
  }).
  then(function(charlist_data) {
    return Promise.all([incrFontMgr.getIDB_, charlist_data]);
  });

  // For Debug: add a button to clear the IndexedDB.
  ForDebug.addDropIdbButton(incrFontMgr, fontname);

  return incrFontMgr;
};


/**
 * IncrFontIDB.obj_ - A class to handle interacting the IndexedDB.
 * @param {string} fontname The name of the font.
 * @constructor
 * @private
 */
IncrementalFont.obj_ = function(fontname) {
  this.fontname = fontname;
  this.charsURL = '/incremental_fonts/request';
  this.persistInfo = {};
  this.persistInfo[IncrementalFont.BASE_DIRTY] = false;
  this.persistInfo[IncrementalFont.CHARLIST_DIRTY] = false;
  this.style = null;

  // Promises
  this.getIDB_ = null;
  this.getBase = null;
  this.getCharList = null;
  this.finishPersistingData = Promise.resolve();
  this.finishPendingCharsRequest = Promise.resolve();
};


/**
 * Lazily data for these chars.
 * @param {string} element_name The name of the data item.
 */
IncrementalFont.obj_.prototype.loadNeededChars = function(element_name) {
  var that = this;
  var chars = '';
  var charlist;
  try {
    chars = document.getElementById(element_name).textContent;
  } catch (e) {
    debugger;
  }
  var pending_resolve, pending_reject;
  var old_finishPendingCharsRequest = this.finishPendingCharsRequest;
  this.finishPendingCharsRequest = new Promise(function(resolve, reject) {
    pending_resolve = resolve;
    pending_reject = reject;

    return old_finishPendingCharsRequest.
    then(function() {
      return that.getCharList.
      then(function(arr) {
        charlist = arr[1];
        var neededCodes = [];
        for (var i = 0; i < chars.length; i++) {
          var c = chars.charAt(i);
          if (!charlist[c]) {
            neededCodes.push(c.charCodeAt(0));
            charlist[c] = 1;
          }
        }
    
        if (neededCodes.length) {
          console.log('load ' + neededCodes.length + ' codes:');
          console.log(neededCodes);
        } else {
          //console.log('do not need anymore characters');
          return null;
        }
        // neededCodes.sort(function(a, b){ return a - b}; );
        //console.log('neededCodes = ' + neededCodes);
        return IncrementalFontUtils.requestCodepoints(that.fontname, neededCodes).
        then(function(chardata) {
          //console.log('requested char data length = ' + chardata.byteLength);
          return chardata;
        });
      }).
      then(function(chardata) {
        pending_resolve();
        return that.getBase.
        then(function(arr) {
          var fileinfo = arr[1];
          var fontdata = arr[2];
          if (chardata != null) {
            fontdata = IncrementalFontUtils.injectCharacters(fileinfo, fontdata,
              chardata);
            IncrementalFontUtils.setFont(that.fontname, fontdata, fileinfo.isTTF);
            // Update the data.
            that.getBase = Promise.all([arr[0], arr[1], fontdata]);
            that.getCharlist = Promise.all([that.getIDB_, charlist]);
            that.persistDelayed_(IncrementalFont.BASE);
            that.persistDelayed_(IncrementalFont.CHARLIST);
          }
        });
      });
    }).
    catch (function(e) {
      console.log('loadNeededChars: ' + e.message);
      debugger;
      pending_reject();
    });
  });
};

/**
 * Save data that needs to be persisted.
 * @param {string} name The name of the data item.
 * @private
 */
IncrementalFont.obj_.prototype.persistDelayed_ = function(name) {
  var that = this;
  //console.log('persistDelayed ' + name);

  // Note what needs to be persisted.
  if (name == IncrementalFont.BASE) {
    this.persistInfo[IncrementalFont.BASE_DIRTY] = true;
  } else if (name == IncrementalFont.CHARLIST) {
    this.persistInfo[IncrementalFont.CHARLIST_DIRTY] = true;
  }

  // In a little bit do the persisting.
  setTimeout(function() {
    that.persist_(name);
  }, 100);
};


/**
 * Save data that needs to be persisted.
 * @param {string} name The name of the data item.
 * @private
 */
IncrementalFont.obj_.prototype.persist_ = function(name) {
  var that = this;
  // Wait for any pending persist operation to finish.
  this.finishPersistingData.then(function() {
    // Previous persists may have already saved the data so see if there is
    // anything still to persist.
    var base_dirty = that.persistInfo[IncrementalFont.BASE_DIRTY];
    var charlist_dirty = that.persistInfo[IncrementalFont.CHARLIST_DIRTY];
    if (!base_dirty && !charlist_dirty) {
      return;
    }

    // What ever got in upto this point will get saved.
    that.persistInfo[IncrementalFont.BASE_DIRTY] = false;
    that.persistInfo[IncrementalFont.CHARLIST_DIRTY] = false;

    // Note that there is now a persist operation running.
    that.finishPersistingData = Promise.resolve().
    then(function() {
      if (base_dirty) {
        return that.getBase.
        then(function(arr) {
          console.log('save base');
          return that.saveData_(arr[0], IncrementalFont.BASE, arr[2].buffer);
        });
      }
    }).
    then(function() {
      if (charlist_dirty) {
        return that.getCharList.
        then(function(arr) {
          console.log('save charlist');
          return that.saveData_(arr[0], IncrementalFont.CHARLIST, arr[1]);
        });
      }
    }).
    catch (function(e) {
      console.log('persistDelayed_: ' + e.message);
      debugger;
    }).
    then(function() {
      //console.log('persisted ' + name);
    });
  });
};


/**
 * Save a data item.
 * @param {Object} idb The IndexedDB object.
 * @param {string} name The name of the item.
 * @param {Array} data The data.
 * @return {Promise} Operation completion.
 * @private
 */
IncrementalFont.obj_.prototype.saveData_ = function(idb, name, data) {
  var that = this;
  return that.getIDB_.
  then(function(db) {
    // the initialization form x = { varname: value } handles the key is a
    // literal string. If a variable varname is used for the key then the
    // string varname will be used ... NOT the value of the varname.
    return new Promise(function(resolve, reject) {
      var trans = db.transaction([name], 'readwrite');
      var store = trans.objectStore(name);
      var request = store.put(data, 0);
      request.onsuccess = function(e) {
        resolve();
      };
      request.onerror = function(e) {
        debugger;
        reject();
      };
    }).
    catch (function(e) {
      console.log('saveData ' + name + ': ' + e.message);
      debugger;
    });
  });
};

/**
 * Get the fontDB.
 * @param {string} fontname The name of the font.
 * @return {Promise} The font DB.
 */
IncrementalFont.obj_.prototype.openIndexedDB = function(fontname) {
  var that = this;

  var openIDB = new Promise(function(resolve, reject) {
    var db_name = IncrementalFont.DB_NAME + '/' + fontname;
    //timer.start('indexedDB.open ' + db_name);
    var dbOpen = indexedDB.open(db_name, IncrementalFont.version);
    //timer.end('indexedDB.open ' + db_name);

    dbOpen.onsuccess = function(e) {
      var db = e.target.result;
      resolve(db);
    };
    dbOpen.onerror = function(e) {
      console.log('!!! IncrFontIDB.obj_ "' + db_name + '": ' + e.value);
      debugger;
      reject(e);
    };

    // Will get called when the version changes.
    dbOpen.onupgradeneeded = function(e) {
      var db = e.target.result;
      e.target.transaction.onerror = function(e) {
        console.log('onupgradeneeded error: ' + e.value);
        debugger;
        reject(e);
      };
      if (db.objectStoreNames.contains(IncrementalFont.BASE)) {
        db.deleteObjectStore(IncrementalFont.BASE);
      }
      if (db.objectStoreNames.contains(IncrementalFont.CHARLIST)) {
        db.deleteObjectStore(IncrementalFont.CHARLIST);
      }
      var store = db.createObjectStore(IncrementalFont.BASE);
      var store = db.createObjectStore(IncrementalFont.CHARLIST);
    };
  }).then(function(db) {
    // TODO(bstell) timing call
    return db;
  });
  return openIDB;
};


/**
 * Get a part of the font.
 * @param {Object} idb The IndexedDB object.
 * @param {string} name The name of the font data to get.
 * @return {Promise} Promise to return the data.
 * @private
 */
IncrementalFont.obj_.prototype.getData_ = function(idb, name) {
  var that = this;
  var getData = new Promise(function(resolve, reject) {
    var trans = idb.transaction([name], 'readwrite');
    var store = trans.objectStore(name);
    var request = store.get(0);
    request.onsuccess = function(e) {
      var result = e.target.result;
      if (result != undefined) {
        resolve(result);
      } else {
        reject(e);
      }
    };

    request.onerror = function(e) {
      console.log('e = ' + e);
      debugger;
      reject(e);
    };
  }).
  catch (function(e) {
    return Promise.reject(e);
  });
  return getData;
};

