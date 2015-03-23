'use strict';

/**
 * @license
 * Copyright 2015 Google Inc. All rights reserved.
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

goog.provide('tachyfont.IncrementalFontUtils');

goog.require('goog.log');
goog.require('tachyfont.BinaryFontEditor');


/**
 * Incremental font loader utilities. A separate namespace is not longer needed.
 */
tachyfont.IncrementalFontUtils = {};


/**
 * Enum for flags in the coming glyph bundle
 * @enum {number}
 */
tachyfont.IncrementalFontUtils.FLAGS = {
  HAS_HMTX: 1,
  HAS_VMTX: 2,
  HAS_CFF: 4
};


/**
 * Segment size in the loca table
 * @const {number}
 */
tachyfont.IncrementalFontUtils.LOCA_BLOCK_SIZE = 64;


/**
 * The Style Sheet ID
 * @const {string}
 */
tachyfont.IncrementalFontUtils.STYLESHEET_ID =
    'Incremental\u00A0Font\u00A0Utils';


/**
 * Inject glyphs in the glyphData to the baseFont
 * @param {Object} obj The object with the font header information.
 * @param {DataView} baseFont Current base font
 * @param {tachyfont.GlyphBundleResponse} bundleResponse New glyph data
 * @return {DataView} Updated base font
 */
tachyfont.IncrementalFontUtils.injectCharacters = function(obj, baseFont,
    bundleResponse) {
  // time_start('inject')
  obj.dirty = true;
  var bundleBinEd = bundleResponse.getFontEditor();
  var baseBinEd = new tachyfont.BinaryFontEditor(baseFont, 0);

  var count = bundleResponse.getGlyphCount();
  var flags = bundleResponse.getFlags();

  var isCFF = flags & tachyfont.IncrementalFontUtils.FLAGS.HAS_CFF;
  var offsetDivisor = 1;
  if (!isCFF && obj.offsetSize == 2) {
    // For the loca "short version":
    //   "The actual local offset divided by 2 is stored."
    offsetDivisor = 2;
  }
  for (var i = 0; i < count; i += 1) {
    var id = bundleBinEd.getUint16_();
    var nextId = id + 1;
    var hmtx, vmtx;
    if (flags & tachyfont.IncrementalFontUtils.FLAGS.HAS_HMTX) {
      hmtx = bundleBinEd.getUint16_();
      baseBinEd.setMtxSideBearing(obj.hmtxOffset, obj.hmetricCount,
          id, hmtx);
    }
    if (flags & tachyfont.IncrementalFontUtils.FLAGS.HAS_VMTX) {
      vmtx = bundleBinEd.getUint16_();
      baseBinEd.setMtxSideBearing(obj.vmtxOffset, obj.vmetricCount,
          id, vmtx);
    }
    var offset = bundleBinEd.getUint32_();
    var length = bundleBinEd.getUint16_();

    if (!isCFF) {
      // Set the loca for this glyph.
      baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize,
          id, offset / offsetDivisor);
      var oldNextOne = baseBinEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, nextId);
      var newNextOne = offset + length;
      // Set the length of the current glyph (at the loca of nextId).
      baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize,
          nextId, newNextOne / offsetDivisor);

      // Fix the sparse loca values before this new value.
      var prev_id = id - 1;
      while (prev_id >= 0 && baseBinEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, prev_id) > offset) {
        baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize,
            prev_id, offset / offsetDivisor);
        prev_id--;
      }
      /*
       * Fix up the sparse loca values after this glyph.
       *
       * If value is changed and length is nonzero we should make the next glyph
       * a dummy glyph(ie: write -1 to make it a composite glyph).
       */
      var isChanged = oldNextOne != newNextOne;
      isChanged = isChanged && nextId < obj.numGlyphs;
      if (isChanged) {
        // Fix the loca value after this one.
        baseBinEd.seek(obj.glyphOffset + newNextOne);
        if (length > 0) {
          baseBinEd.setInt16(-1);
        }else if (length == 0) {
          /*if it is still zero,then could write -1*/
          var currentUint1 = baseBinEd.getUint32_(),
              currentUint2 = baseBinEd.getUint32_();
          if (currentUint1 == 0 && currentUint2 == 0) {
            baseBinEd.seek(obj.glyphOffset + newNextOne);
            baseBinEd.setInt16(-1);
          }
        }
      }
    } else {
      baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize,
          id, offset);
      var oldNextOne = baseBinEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, nextId);
      baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize, nextId,
          offset + length);
      nextId = id + 2;
      var offsetCount = obj.numGlyphs + 1;
      var currentIdOffset = offset + length, nextIdOffset;
      if (oldNextOne < currentIdOffset && nextId - 1 < offsetCount - 1) {
        baseBinEd.seek(obj.glyphOffset + currentIdOffset);
        baseBinEd.setUint8_(14);
      }
      while (nextId < offsetCount) {
        nextIdOffset = baseBinEd.getGlyphDataOffset(obj.glyphDataOffset,
            obj.offsetSize, nextId);
        if (nextIdOffset <= currentIdOffset) {
          currentIdOffset++;
          baseBinEd.setGlyphDataOffset(obj.glyphDataOffset, obj.offsetSize,
              nextId, currentIdOffset);
          if (nextId < offsetCount - 1) {
            baseBinEd.seek(obj.glyphOffset + currentIdOffset);
            baseBinEd.setUint8_(14);
          }
          nextId++;
        } else {
          break;
        }
      }
    }

    var bytes = bundleBinEd.getArrayOf(bundleBinEd.getUint8_, length);
    baseBinEd.seek(obj.glyphOffset + offset);
    baseBinEd.setArrayOf(baseBinEd.setUint8_, bytes);
  }
  // time_end('inject')

  return baseFont;
};


/**
 * Parses base font header, set properties.
 * @param {DataView} baseFont Base font with header.
 * @param {Object} headerInfo Header information
 */
tachyfont.IncrementalFontUtils.writeCmap12 = function(baseFont, headerInfo) {
  if (!headerInfo.cmap12)
    return;
  var binEd = new tachyfont.BinaryFontEditor(baseFont,
      headerInfo.cmap12.offset + 16);
  var nGroups = headerInfo.cmap12.nGroups;
  var segments = headerInfo.compact_gos.cmap12.segments;
  for (var i = 0; i < nGroups; i++) {
    binEd.setUint32_(segments[i][0]);
    binEd.setUint32_(segments[i][0] + segments[i][1] - 1);
    binEd.setUint32_(segments[i][2]);
  }
};


/**
 * Parses base font header, set properties.
 * @param {DataView} baseFont Base font with header.
 * @param {Object} headerInfo Header information
 */
tachyfont.IncrementalFontUtils.writeCmap4 = function(baseFont, headerInfo) {
  if (!headerInfo.cmap4)
    return;
  var segments = headerInfo.compact_gos.cmap4.segments;
  var glyphIdArray = headerInfo.compact_gos.cmap4.glyphIdArray;
  var binEd = new tachyfont.BinaryFontEditor(baseFont,
      headerInfo.cmap4.offset + 6);
  var segCount = binEd.getUint16_() / 2;
  if (segCount != segments.length) {
    if (goog.DEBUG) {
      alert('segCount=' + segCount + ', segments.length=' + segments.length);
      debugger;
    }
  }
  var glyphIdArrayLen = (headerInfo.cmap4.length - 16 - segCount * 8) / 2;
  headerInfo.cmap4.segCount = segCount;
  headerInfo.cmap4.glyphIdArrayLen = glyphIdArrayLen;
  binEd.skip(6); //skip searchRange,entrySelector,rangeShift
  // Write endCount values.
  for (var i = 0; i < segCount; i++) {
    binEd.setUint16_(segments[i][1]);
  }
  binEd.skip(2);//skip reservePad
  // Write startCount values.
  for (var i = 0; i < segCount; i++) {
    binEd.setUint16_(segments[i][0]);
  }
  // Write idDelta values.
  for (var i = 0; i < segCount; i++) {
    binEd.setUint16_(segments[i][2]);
  }
  // Write idRangeOffset vValues.
  for (var i = 0; i < segCount; i++) {
    binEd.setUint16_(segments[i][3]);
  }
  // Write glyphIdArray values.
  if (glyphIdArrayLen > 0)
    binEd.setArrayOf(binEd.setUint16_, glyphIdArray);
};


/**
 * Parses base font header, set properties.
 * @param {DataView} baseFont Base font with header.
 * @param {Object} headerInfo Header information
 */
tachyfont.IncrementalFontUtils.writeCharsetFormat2 =
    function(baseFont, headerInfo) {
  if (!headerInfo.charset_fmt)
    return;
  var binEd = new tachyfont.BinaryFontEditor(baseFont,
      headerInfo.charset_fmt.offset + 1);
  var nGroups = headerInfo.charset_fmt.gos.len;
  var segments = headerInfo.charset_fmt.gos.segments;
  var is_fmt_2 = (headerInfo.charset_fmt.gos.type == 6);
  for (var i = 0; i < nGroups; i++) {
    binEd.setUint16_(segments[i][0]);
    if (is_fmt_2)
      binEd.setUint16_(segments[i][1]);
    else
      binEd.setUint8_(segments[i][1]);
  }
};


/**
 * Parses base font header, set properties.
 * @param {DataView} baseFont Base font with header.
 * @return {Object} The header information.
 */
tachyfont.IncrementalFontUtils.parseBaseHeader = function(baseFont) {

  var binEd = new tachyfont.BinaryFontEditor(baseFont, 0);
  var results = binEd.parseBaseHeader();
  if (!results.headSize) {
    throw 'missing header info';
  }
  return results;
};


/**
 * Sanitize base font to pass OTS
 * @param {Object} obj The object with the font header information.
 * @param {DataView} baseFont Base font as DataView
 * @return {DataView} Sanitized base font
 */
tachyfont.IncrementalFontUtils.sanitizeBaseFont = function(obj, baseFont) {

  if (obj.isTtf) {
    obj.dirty = true;
    var binEd = new tachyfont.BinaryFontEditor(baseFont, 0);
    var glyphOffset = obj.glyphOffset;
    var glyphCount = obj.numGlyphs;
    var glyphSize, thisOne, nextOne;
    for (var i = (tachyfont.IncrementalFontUtils.LOCA_BLOCK_SIZE - 1);
        i < glyphCount;
        i += tachyfont.IncrementalFontUtils.LOCA_BLOCK_SIZE) {
      thisOne = binEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, i);
      nextOne = binEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, i + 1);
      glyphSize = nextOne - thisOne;
      if (glyphSize) {
        binEd.seek(glyphOffset + thisOne);
        binEd.setInt16(-1);
      }
    }
  } else {
    obj.dirty = true;
    var binEd = new tachyfont.BinaryFontEditor(baseFont, 0);
    var glyphOffset = obj.glyphOffset;
    var glyphCount = obj.numGlyphs;
    var lastRealOffset = binEd.getGlyphDataOffset(obj.glyphDataOffset,
        obj.offsetSize, 0);
    var delta = 0, thisOne;
    for (var i = 0; i < glyphCount + 1; i++) {
      thisOne = binEd.getGlyphDataOffset(obj.glyphDataOffset,
          obj.offsetSize, i);
      if (lastRealOffset == thisOne) {
        thisOne = lastRealOffset + delta;
        binEd.setGlyphDataOffset(obj.glyphDataOffset,
            obj.offsetSize, i, thisOne);
        delta++;
      } else {
        lastRealOffset = thisOne;
        delta = 1;
      }
      if (i < glyphCount) {
        binEd.seek(glyphOffset + thisOne);
        binEd.setUint8_(14);
      }
    }
  }
  return baseFont;
};


/**
 * Set a style's visibility.
 * @param {Object} style The style object
 * @param {Object.<string, string>} fontInfo The font information object
 * @param {boolean} visible True is setting visibility to visible.
 * @return {Object} New style object for given font and visibility
 */
tachyfont.IncrementalFontUtils.setVisibility = function(style, fontInfo,
    visible) {
  if (!style) {
    style = document.createElement('style');
    document.head.appendChild(style);
  }
  if (style.sheet.cssRules.length) {
    style.sheet.deleteRule(0);
  }
  var visibility;
  if (visible) {
    visibility = 'visible';
  } else {
    visibility = 'hidden';
  }
  var rule = '.' + fontInfo['name'] + ' { ' +
      'font-family: ' + fontInfo['familyName'] + '; ' +
      'font-weight: ' + fontInfo['weight'] + '; ' +
      'visibility: ' + visibility + '; }';

  style.sheet.insertRule(rule, style.sheet.cssRules.length);

  return style;
};


/**
 * Add the '@font-face' rule
 * @param {Object.<string, string>} fontInfo Info about this font.
 * @param {DataView} data The font data.
 * @param {string} mimeType The mime-type of the font.
  * @return {string} The blob URL.
  */
tachyfont.IncrementalFontUtils.getBlobUrl = function(fontInfo, data, mimeType) {
  var blob;
  try {
    blob = new Blob([data], { type: mimeType });
  } catch (e) {
    // IE 11 does not like using DataView here.
    if (e.name == 'InvalidStateError') {
      var buffer = data.buffer.slice(data.byteOffset);
      blob = new Blob([buffer], { type: mimeType});
    }
  }
  var blobUrl = window.URL.createObjectURL(blob);
  return blobUrl;
};


/**
 * Trim a CSSStyleSheet font-family string.
 *
 * @param {string} familyName The font-family name to trim.
 * @return {string} The trimed font-family name.
 */
tachyfont.IncrementalFontUtils.trimFamilyName = function(familyName) {
  var trimmedName = familyName.trim();
  // When there are spaces in the font-name, Chromium adds single quotes
  // around the font name in the style object; eg, "Noto Sans Japanese"
  // becomes "'Noto Sans Japanese'".
  // https://code.google.com/p/chromium/issues/detail?id=368293
  if (trimmedName.charAt(0) == "'" &&
      trimmedName.charAt(trimmedName.length - 1) == "'") {
    trimmedName = trimmedName.substring(1, trimmedName.length - 1);
  }
  return trimmedName;
};


/**
 * Get the TachyFont style sheet.
 *
 * @return {CSSStyleSheet} The style sheet.
 */
tachyfont.IncrementalFontUtils.getStyleSheet = function() {
  // TODO(bstell): consider caching this.
  var style = document.getElementById(
      tachyfont.IncrementalFontUtils.STYLESHEET_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = tachyfont.IncrementalFontUtils.STYLESHEET_ID;
    document.head.appendChild(style);
  }
  var sheet = style.sheet;
  return sheet;
};


/**
 * Delete a CSS style rule.
 *
 * @param {number} ruleToDelete The rule to delete.
 * @param {CSSStyleSheet} sheet The style sheet.
 */
tachyfont.IncrementalFontUtils.deleteCssRule = function(ruleToDelete, sheet) {
  if (ruleToDelete != -1) {
    if (sheet.deleteRule) {
      sheet.deleteRule(ruleToDelete);
    } else if (sheet.removeRule) {
      sheet.removeRule(ruleToDelete);
    } else {
      if (goog.DEBUG) {
        goog.log.error(tachyfont.logger_, 'no delete/drop rule');
      }
    }
  }
};


/**
 * Find the \@font-face rule for the given font spec.
 *
 * TODO(bstell): Add slant, width, etc.
 * @param {CSSStyleSheet} sheet The style sheet.
 * @param {string} fontFamily The fontFamily.
 * @param {string} weight The weight.
 * @return {number} The rule index; -1 if not found.
 */
tachyfont.IncrementalFontUtils.findFontFaceRule =
    function(sheet, fontFamily, weight) {
  var rule = -1;
  var rules = sheet.cssRules || sheet.rules;
  if (rules) {
    for (var i = 0; i < rules.length; i++) {
      var this_rule = rules[i];
      if (this_rule.type == CSSRule.FONT_FACE_RULE) {
        if (goog.DEBUG) {
          goog.log.log(tachyfont.logger_, goog.log.Level.FINER,
              'found an @font-face rule');
        }
        var this_style = this_rule.style;
        var thisFamily = this_style.getPropertyValue('font-family');
        thisFamily = tachyfont.IncrementalFontUtils.trimFamilyName(thisFamily);
        var thisWeight = this_style.getPropertyValue('font-weight');
        // TODO(bstell): consider using slant/width.
        if (thisFamily == fontFamily && thisWeight == weight) {
          rule = i;
          break;
        }
      }
    }
  }
  return rule;
};


/**
 * Set the CSS \@font-face rule.
 *
 * @param {CSSStyleSheet} sheet The style sheet.
 * @param {string} fontFamily The fontFamily.
 * @param {string} weight The weight.
 * @param {string} blobUrl The blob URL of the font data.
 * @param {string} format The format (truetype vs opentype) of the font.
 */
tachyfont.IncrementalFontUtils.setCssFontRule =
    function(sheet, fontFamily, weight, blobUrl, format) {
  var rule_str = '@font-face {\n' +
      '    font-family: ' + fontFamily + ';\n' +
      '    font-weight: ' + weight + ';\n' +
      '    src: url("' + blobUrl + '")' +
      ' format("' + format + '");\n' +
      '}\n';
  if (goog.DEBUG) {
    goog.log.log(tachyfont.logger_, goog.log.Level.FINER, 'rule = ' + rule_str);
  }
  var ruleToDelete = tachyfont.IncrementalFontUtils.findFontFaceRule(
      sheet, fontFamily, weight);
  tachyfont.IncrementalFontUtils.deleteCssRule(ruleToDelete, sheet);
  sheet.insertRule(rule_str, sheet.cssRules.length);
};
