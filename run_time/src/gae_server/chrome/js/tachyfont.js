'use strict';

/**
 * @license
 * Copyright 2014-2015 Google Inc. All rights reserved.
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

goog.provide('tachyfont');

goog.require('goog.Promise');
goog.require('goog.Uri');
goog.require('goog.debug.Console');
goog.require('goog.log');

goog.require('tachyfont.BinaryFontEditor');
goog.require('tachyfont.IncrementalFontUtils');
goog.require('tachyfont.TachyFont');
goog.require('tachyfont.TachyFontSet');
goog.require('webfonttailor.FontsInfo');


if (goog.DEBUG) {
  /**
   * A class variable to limit debug initialization to a single time.
   *
   * @private {boolean}
   */
  tachyfont.hasInitializedDebug_ = false;

  /**
   * A function to initialize the debug setup.
   *
   * @private
   */
  tachyfont.debugInitialization_ = function() {
    if (tachyfont.hasInitializedDebug_) {
      return;
    }
    tachyfont.hasInitializedDebug_ = true;
    // Get any URL debug parameters.
    /** @type {goog.Uri} */
    tachyfont.uri = goog.Uri.parse(window.location.href);

    /** @type {goog.debug.Logger.Level} */
    tachyfont.debug_level;
    /** @type {string} */
    tachyfont.debug_level_str =
      tachyfont.uri.getParameterValue('TachyFontDebugLevel') || '';
    if (tachyfont.debug_level_str) {
      tachyfont.debug_level =
        goog.debug.Logger.Level.getPredefinedLevel(tachyfont.debug_level_str);
    }

    // Send the debug output to the console.
    /**
     * @type {goog.debug.Console}
     * @private
     */
    tachyfont.debugConsole_ = new goog.debug.Console();
    tachyfont.debugConsole_.setCapturing(true);
    /**
     * @type {goog.debug.Logger}
     * @private
     */
    tachyfont.logger_ = goog.log.getLogger('debug', tachyfont.debug_level);
    /**
     * @type {boolean}
     * @private
     */
    tachyfont.buildDemo_ = false;
  }
}

/**
 * Enable/disable using/saving persisted data.
 * @typedef {boolean}
 */
tachyfont.persistData = true;

/**
 * A mapping from css weight names to weights.
 *
 * @type {!Object.<string, string>}
 */
tachyfont.cssWeightToNumber = {
        'lighter': '300',
         'normal': '400',
           'bold': '700',
         'bolder': '800'
};

/**
 * If the number of characters in the request is less than this count then add
 * additional characters to obfuscate the actual request.
 * @type {number}
 */
tachyfont.MINIMUM_NON_OBFUSCATION_LENGTH = 20;

/**
 * The range of characters to pick from.
 * @type {number}
 */
tachyfont.OBFUSCATION_RANGE = 256;

/**
 * @typedef {number}
 */
tachyfont.uint8;

/**
 * @typedef {Object}
 * TODO(bstell): this probably belongs in BinaryFontEditor.
 */
tachyfont.IncrementalFontLoader;


/**
 * Create a font identifing string.
 * @param {string} family The font family name;
 * @param {string} weight The font weight;
 * @return {string} The identifier for this font.
 */
tachyfont.fontId = function(family, weight) {
  // TODO(bstell): need to support slant/width/etc.
  var fontId = family + ';' + weight;
  return fontId;
};

/**
 * Walk the DOM.
 *
 * @param {Object} node The starting point for walk.
 * @param {function(Object)} func The function to call for each node.
 * TODO(bstell): The return value should be more flexible.
 * @return {boolean} Boolean result of the function.
 */
tachyfont.walkDom = function(node, func) {
  var addedText = func(node);
  var children = node.childNodes;
  for (var i = 0; i < children.length; i++) {
    addedText = tachyfont.walkDom(children[i], func) || addedText;
  }
  return addedText;
};

/**
 * Create a list of TachyFonts
 *
 * @param {string} familyName The font-family name.
 * TODO(bstell): remove the Object type.
 * @param {webfonttailor.FontsInfo|Object} fontsInfo The information about the
 *     fonts.
 * @param {Object.<string, string>} opt_params Optional parameters.
 * @return {tachyfont.TachyFontSet} The TachyFontSet object.
 */
tachyfont.loadFonts = function(familyName, fontsInfo, opt_params) {
  if (goog.DEBUG) {
    tachyfont.debugInitialization_();
    goog.log.fine(tachyfont.logger_, 'loadFonts');
  }
  var tachyFontSet = new tachyfont.TachyFontSet(familyName);
  var tachyFonts = tachyFontSet.fonts_;
  // TODO(bstell): this initialization of TachyFontSet should be in the
  // constructor or and init function.
  opt_params = opt_params || {};
  var url = fontsInfo['url'];
  var fonts = fontsInfo['fonts'];
  for (var i = 0; i < fonts.length; i++) {
    var fontInfo = fonts[i];
    fontInfo['familyName'] = familyName;
    fontInfo['url'] = url;
    var tachyFont = new tachyfont.TachyFont(fontInfo, opt_params);
    tachyFontSet.addFont(tachyFont);
    // TODO(bstell): need to support slant/width/etc.
    var fontId = tachyfont.fontId(familyName, fontInfo['weight']);
    tachyFontSet.fontIdToIndex[fontId] = i;
  }
  if (goog.DEBUG) {
    goog.log.log(tachyfont.logger_, goog.log.Level.FINER,
      'loadFonts: wait for preceding update');
  }
  var allLoaded = tachyFontSet.finishPrecedingUpdateFont_.getChainedPromise();
  allLoaded.getPrecedingPromise().
  then(function() {
    if (goog.DEBUG) {
      goog.log.log(tachyfont.logger_, goog.log.Level.FINER,
          'loadFonts: done waiting for preceding update');
    }
    // Try to get the base from persistent store.
    var bases = [];
    for (var i = 0; i < tachyFonts.length; i++) {
      var incrfont = tachyFonts[i].incrfont;
      var persistedBase = incrfont.getPersistedBase_();
      bases.push(persistedBase);
    }
    return goog.Promise.all(bases);
  }).
  then(function(arrayBaseData) {
    var fetchedBases = [];
    for (var i = 0; i < tachyFonts.length; i++) {
      var loadedBase = arrayBaseData[i];
      var incrfont = tachyFonts[i].incrfont;
      if (loadedBase != null) {
        incrfont.alreadyPersisted = true;
        incrfont.needToSetFont_ = true;
      } else {
        // If not persisted the fetch the base from the URL.
        loadedBase = incrfont.getUrlBase_(incrfont.backendService,
            incrfont.fontInfo_);
      }
      arrayBaseData[i] = goog.Promise.resolve(loadedBase);
    }
    // Have loaded fonts from persistent store or URL.
    goog.Promise.all(arrayBaseData).
    then(function(arrayBaseData) {
      var allCssSet = [];
      for (var i = 0; i < tachyFonts.length; i++) {
        var incrfont = tachyFonts[i].incrfont;
        var loadedBase = arrayBaseData[i];
        // If not persisted then need to wait for DOMContentLoaded to set the
        // font.
        if (!incrfont.alreadyPersisted) {
          incrfont.base.resolve(loadedBase);
          if (goog.DEBUG) {
            goog.log.fine(tachyfont.logger_, 'loadFonts: not persisted');
          }
          allCssSet.push(goog.Promise.resolve(null));
          continue;
        }
        // The font was in persistent store so:
        // * it is very likely that the font _already_ has the UI text so
        //   immediately show the UI in the TachyFont.
        if (goog.DEBUG) {
          goog.log.fine(tachyfont.logger_, 'loadFonts: setFont_');
        }
        // TODO(bstell): only set the font if there are characters.
        var cssSet = incrfont.setFont(loadedBase[1], loadedBase[0].isTtf).
          then(function(cssSetResult) {
            if (goog.DEBUG) {
              goog.log.fine(tachyfont.logger_, 'loadFonts: setFont_ done');
            }
            tachyfont.IncrementalFontUtils.setVisibility(incrfont.style,
              incrfont.fontInfo_, true);
            // Release other operations to proceede.
            incrfont.base.resolve(loadedBase);
          });
        allCssSet.push(cssSet);
      }
      return goog.Promise.all(allCssSet);
    }).
    then(function(allSetResults) {
      if (goog.DEBUG) {
        goog.log.fine(tachyfont.logger_, 'loadFonts: all fonts loaded');
      }
      // Allow any pending updates to happen.
      allLoaded.resolve();

    }).
    thenCatch(function(e) {
      if (goog.DEBUG) {
        goog.log.error(tachyfont.logger_, 'failed to get the font: ' +
          e.stack);
        debugger;
      }
    });
  });

  if (goog.DEBUG) {
    // Need to handle input fields
    if (typeof tachyfont.todo_handle_input_fields == 'undefined') {
      tachyfont.todo_handle_input_fields = 1;
      goog.log.error(tachyfont.logger_, 'need to handle input fields');
    }
  }

  // Get any characters that are already in the DOM.
  tachyfont.walkDom(document.documentElement, function(node) {
    if (node.nodeName == '#text') {
      return this.addTextToFontGroups(node);
    } else {
      return false;
    }
  }.bind(tachyFontSet));

  // Add DOM mutation observer.
  // This records the changes on a per-font basis.
  // Note: mutation observers do not look at INPUT field changes.
  //create an observer instance
  var observer = new MutationObserver(function(mutations) {
    if (goog.DEBUG) {
      goog.log.fine(tachyfont.logger_, 'MutationObserver');
    }
    mutations.forEach(function(mutation) {
      if (mutation.type == 'childList') {
        for (var i = 0; i < mutation.addedNodes.length; i++) {
          var node = mutation.addedNodes[i];
          // Look for text elements.
          if (node.nodeName == '#text') {
            tachyFontSet.addTextToFontGroups(node);
          }
        }
      } else if (mutation.type == 'characterData') {
        if (mutation.target.nodeName == '#text') {
          tachyFontSet.addTextToFontGroups(mutation.target);
        } else {
          if (goog.DEBUG) {
            goog.log.info(tachyfont.logger_,
                'need to handle characterData for non-text');
          }
        }
      }
    });
    // TODO(bstell): need to figure out if pendingChars_ is helpful in
    // determining when to update the char data and/or update the CSS.
    //console.log('tachyFontSet.pendingChars_ = ' + tachyFontSet.pendingChars_);
    // TODO(bstell): Should check if there were any chars.
    // If this is the 1st mutation event and it happened after DOMContentLoaded
    // then do the update now.
    var immediateUpdate;
    if (!tachyFontSet.hadMutationEvents_ && tachyFontSet.domContentLoaded_) {
      immediateUpdate = true;
    } else {
      immediateUpdate = false;
    }
    tachyFontSet.hadMutationEvents_ = true;
    if (immediateUpdate) {
      if (goog.DEBUG) {
        goog.log.info(tachyfont.logger_, 'mutation observer: updateFont');
      }
      tachyFontSet.updateFonts(true);
    } else {
      // For pages that load new data slowly: request the fonts be updated soon.
      // This attempts to minimize expensive operations:
      //     1. The round trip delays to fetch data.
      //     2. The set @font-family time (it takes significant time to pass the
      //        blobUrl data from Javascript to C++).
      tachyFontSet.requestUpdateFonts();
    }
  });

  // Watch for these mutations.
  var config = /** @type {!MutationObserverInit} */ ({ 'childList': true,
    'subtree': true, 'characterData': true });
  observer.observe(document.documentElement, config);

  // Update the fonts when the page content is loaded.
  document.addEventListener('DOMContentLoaded', function(event) {
    tachyFontSet.domContentLoaded_ = true;
    // On DOMContentLoaded we want to update the fonts. If there have been
    // mutation events then do the update now. Characters should be in the DOM
    // now but the order of DOMContentLoaded and mutation events is not defined
    // and a mutation event should be coming right after this. We could scan the
    // DOM and do the update right now but scanning the DOM is expensive. So
    // instead wait for the mutation event.
    if (tachyFontSet.hadMutationEvents_) {
      // We have characters so update the fonts.
      if (goog.DEBUG) {
        goog.log.info(tachyfont.logger_, 'DOMContentLoaded: updateFonts');
      }
      tachyFontSet.updateFonts(true);
    } else {
      // The mutation event should be very soon.
      if (goog.DEBUG) {
        goog.log.info(tachyfont.logger_,
            'DOMContentLoaded: wait for mutation event');
      }
    }
  });

  return tachyFontSet;
};

/**
 * Update a list of TachyFonts
 *
 * TODO(bstell): remove the tachyfont.TachyFont type.
 * @param {Array.<tachyfont.TachyFont>|tachyfont.TachyFontSet} tachyFonts The
 *     list of font objects.
 */
tachyfont.updateFonts = function(tachyFonts) {
  if (tachyFonts.constructor == Array) {
    if (goog.DEBUG) {
      goog.log.info(tachyfont.logger_,
          'tachyfont.updateFonts: passing in an array is deprecated');
    }
    for (var i = 0; i < tachyFonts.length; i++) {
      var tachyFont = tachyFonts[i];
      tachyFont.incrfont.loadChars();
    }
  } else if (tachyFonts.constructor == tachyfont.TachyFontSet) {
    if (goog.DEBUG) {
      goog.log.info(tachyfont.logger_, 'tachyfont.updateFonts');
    }
    tachyFonts.updateFonts(true);
  }
};


/**
 * Convert a string to an array of characters.
 * This function handles surrogate pairs.
 *
 * @param {string} str The input string.
 * @return {Array.<string>} The array of characters.
 */
tachyfont.stringToChars = function(str) {
  var charArray = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    var cc = c.charCodeAt(0);
    if (cc >= 0xD800 && cc <= 0xDBFF) {
      i += 1;
      c += str.charAt(i);
    }
    charArray.push(c);
  }
  return charArray;
};


/**
 * Convert a char to its codepoint.
 * This function handles surrogate pairs.
 *
 * @param {string} in_char The input char (string).
 * @return {number} The numeric value.
 */
tachyfont.charToCode = function(in_char) {
  var cc = in_char.charCodeAt(0);
  if (cc >= 0xD800 && cc <= 0xDBFF) {
    var high = (cc - 0xD800) << 10;
    var low = in_char.charCodeAt(1) - 0xDC00;
    var codepoint = high + low + 0x10000;
    return codepoint;
  } else {
    return cc;
  }
};


/**
 * @param {string} version
 * @param {string} signature
 * @param {number} count
 * @param {number} flags
 * @param {number} offsetToGlyphData
 * @param {ArrayBuffer} glyphData
 * @constructor
 */
tachyfont.GlyphBundleResponse = function(
    version, signature, count, flags, offsetToGlyphData, glyphData) {
  this.version = version;
  this.signature = signature;
  this.count = count;
  this.flags = flags;
  this.offsetToGlyphData = offsetToGlyphData;
  this.glyphData = glyphData;
};

/**
 * @return {number} the length of the glyph data in this response.
 */
tachyfont.GlyphBundleResponse.prototype.getDataLength = function() {
  return this.glyphData.byteLength - this.offsetToGlyphData;
};

/**
 * @return {tachyfont.BinaryFontEditor} a font editor for the glyph data in this
 *         response.
 */
tachyfont.GlyphBundleResponse.prototype.getFontEditor = function() {
  return new tachyfont.BinaryFontEditor(new DataView(this.glyphData),
                                        this.offsetToGlyphData);
};

/**
 * @return {number} Number of glyphs in this response.
 */
tachyfont.GlyphBundleResponse.prototype.getGlyphCount = function() {
  return this.count;
};

/**
 * @return {number} flags binary for this response.
 */
tachyfont.GlyphBundleResponse.prototype.getFlags = function() {
  return this.flags;
};


/**
 * Timing object for performance analysis.
 * @type {Object}
 */
window.timer1;

/**
 * Timing object for performance analysis.
 * @type {Object}
 */
window.timer2;


/**
 * TachyFontEnv - A namespace.
 */
tachyfont.TachyFontEnv = function() {
};


/**
 * Timing class for performance analysis.
 * @constructor
 */
tachyfont.Timer = function() {
};

/**
 * Placeholder for recording a timer start time.
 */
tachyfont.Timer.prototype.start = function() {
};

/**
 * Placeholder for recording a timer end time.
 */
tachyfont.Timer.prototype.end = function() {
};

/**
 * Placeholder for recording a timer done time (which changes the color).
 */
tachyfont.Timer.prototype.done = function() {
};

/**
 * Timing object for performance analysis.
 * @type {Object}
 */
tachyfont.timer2;

/**
 * Timing object for performance analysis.
 * @type {Object}
 */
tachyfont.timer1;

//Support running without demo features.
if (window.Timer) {
  tachyfont.timer1 = window.timer1;
  tachyfont.timer2 = window.timer2;

} else {
  /** Stub out timer functions. */
  tachyfont.timer1 = new tachyfont.Timer();
  tachyfont.timer2 = new tachyfont.Timer();
}

/**
 * Debugging help
 * Stub out the debug functions.
 * @type {Object}
 */
tachyfont.ForDebug = function() {
};

/**
 * Useful for debugging.
 * @type {Object}
 */
window.ForDebug;

if (window.ForDebug) {
  tachyfont.ForDebug = window.ForDebug;
} else {

  /** Stub out the debug functions.
   * @param {string} name The cookie name.
   * @param {*} fallback A value to return if the cookie is not found.
   * @return {*}
   */
  tachyfont.ForDebug.getCookie = function(name, fallback) {
    return fallback;
  };

  /** Stub out the debug functions.
   * @param {Object} incrFontMgr The incremental font manager object.
   * @param {string} fontName The font name.
   */
  tachyfont.ForDebug.addDropIdbButton = function(incrFontMgr, fontName) {};
  /** Stub out the debug functions. */
  tachyfont.ForDebug.addBandwidthControl = function() {};
  /** Stub out the debug functions. */
  tachyfont.ForDebug.addTimingTextSizeControl = function() {};
}

goog.exportSymbol('tachyfont.loadFonts', tachyfont.loadFonts);
