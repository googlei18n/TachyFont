"""
  Copyright 2014 Google Inc. All rights reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
"""

from fontTools.ttLib import TTFont
from filler import Filler
from fontTools.cffLib import Index, readCard8, readCard16
import array
import errno
from rle_font import RleFont
import os
from compressor import Compressor
import sys
import struct
from io import SEEK_CUR
from fontTools.ttLib.tables import _c_m_a_p
from fontTools_wrapper_funcs import change_method, _decompile_in_table_cmap,\
  _decompile_in_cmap_format_4, _decompile_in_cmap_format_12_13
import io



class BaseFonter(object):
  """Create base font for the given font file"""

  LOCA_BLOCK_SIZE = 64
  BASE_VERSION = 1

  def __init__(self, fontfile):
    self.fontfile = fontfile
    self.font = TTFont(fontfile)
    self.isCff = 'CFF ' in self.font

  def __zero_mtx(self, mtx, output):
    """Zero side bearings in mtx tables
    Changed code, to not use the fontTools save function
    """
    if mtx in self.font:
      double_zero = '\0\0'
      offset = self.font.reader.tables[mtx].offset
      offset += 4 # Don't clear .notdef side bearing
      numGlyphs = self.font['maxp'].numGlyphs
      if mtx == 'hmtx':
        metricCount = self.font['hhea'].numberOfHMetrics
      else:
        metricCount = self.font['vhea'].numberOfVMetrics
      fontfile_handler = open(output, 'r+b')
      fontfile_handler.seek(offset)
      for i in xrange(1, numGlyphs):
        if i < metricCount:
          fontfile_handler.seek(2, SEEK_CUR)
          fontfile_handler.write(double_zero)
        else:
          fontfile_handler.write(double_zero)
      fontfile_handler.close()


  def __zero_glyf(self, output):
    self.font = TTFont(output)
    # Do not clear the .notdef outlines
    offset_table = self.font['loca'].locations
    notdef_len = offset_table[1] - offset_table[0]
    glyf_off = self.font.reader.tables['glyf'].offset + notdef_len
    glyf_len = self.font.reader.tables['glyf'].length - notdef_len
    self.font.close()
    filler = Filler(output)
    filler.fill(glyf_off, glyf_len, '\x00')
    filler.close()

  def __zero_charset_fmt(self,output):
    font = TTFont(output)
    cffTableOffset = font.reader.tables['CFF '].offset
    cffTable = font['CFF '].cff
    assert len(cffTable.fontNames) == 1 #only one font should be present
    charsetOffset = cffTable[cffTable.fontNames[0]].rawDict['charset']
    numGlyphs = font['maxp'].numGlyphs
    inner_file = font.reader.file
    inner_file.seek(cffTableOffset+charsetOffset)
    format = readCard8(inner_file);
    if format != 2 and format != 1:
      return None
    record_len = 4 if format == 2 else 3
    seenGlyphCount = 0
    size = 0
    while seenGlyphCount < numGlyphs:
      inner_file.seek(2,io.SEEK_CUR)
      if format == 2:
        nLeft = readCard16(inner_file)
      else: #format 1
        nLeft = readCard8(inner_file)
      seenGlyphCount += nLeft + 1
      size += 1
    font.close()
    filler = Filler(output)
    filler.fill(cffTableOffset+charsetOffset+1, record_len*size, '\x00')
    filler.close()

  def __zero_cmaps(self,output):
    font = TTFont(output)
    old_cmap_method = change_method(_c_m_a_p.table__c_m_a_p, _decompile_in_table_cmap,'decompile')
    old_12_method = change_method(_c_m_a_p.cmap_format_12_or_13,_decompile_in_cmap_format_12_13, 'decompile')
    old_4_method = change_method(_c_m_a_p.cmap_format_4,_decompile_in_cmap_format_4, 'decompile')

    cmap_offset = font.reader.tables['cmap'].offset
    cmapTables = font['cmap']
    cmap12 = cmapTables.getcmap(3, 10) #format 12
    cmap4 = cmapTables.getcmap(3, 1) #format 4

    ranges_to_zero = []
    if cmap12:
      ranges_to_zero.append((cmap_offset+cmap12.offset+16,cmap12.length-16))
    #if cmap4:
    #  ranges_to_zero.append((cmap_offset+cmap4.offset+14,cmap4.length-14))

    change_method(_c_m_a_p.cmap_format_12_or_13,old_12_method,'decompile')
    change_method(_c_m_a_p.cmap_format_4,old_4_method,'decompile')
    change_method(_c_m_a_p.table__c_m_a_p,old_cmap_method,'decompile')

    font.close()

    #if len(ranges_to_zero)<2: #return if both doesn't exist
    #  return

    for block in ranges_to_zero:
      filler = Filler(output)
      filler.fill(block[0], block[1], '\x00')
      filler.close()

  def __zero_char_strings(self, output):
    self.font = TTFont(output)
    assert 'CFF ' in self.font
    cffTableOffset = self.font.reader.tables['CFF '].offset
    cffTable = self.font['CFF '].cff
    assert len(cffTable.fontNames) == 1
    charStringOffset = cffTable[cffTable.fontNames[0]].rawDict['CharStrings']
    inner_file = self.font.reader.file
    inner_file.seek(cffTableOffset + charStringOffset)
    rawIndexFile = Index(inner_file)
    baseOffset = rawIndexFile.offsetBase
    notdef_glyph_size = rawIndexFile.offsets[1] - rawIndexFile.offsets[0]
    size = rawIndexFile.offsets[-1] - 1 - notdef_glyph_size
    offset = baseOffset + rawIndexFile.offsets[0] + notdef_glyph_size
    self.font.close()
    filler = Filler(output)
    filler.fill(offset, size, '\x00')
    filler.close()


  def __segment_table(self, locations, off_format, fill_with_upper):
    n = len(locations)
    block_count = (n - 1) / BaseFonter.LOCA_BLOCK_SIZE
    for block_no in xrange(block_count):
      lower = block_no * BaseFonter.LOCA_BLOCK_SIZE
      upper = (block_no + 1) * BaseFonter.LOCA_BLOCK_SIZE
      if fill_with_upper:
        filler_value = locations[upper - 1]
      else:
        filler_value = locations[lower]
      locations[lower:upper] = array.array(off_format, [filler_value] * BaseFonter.LOCA_BLOCK_SIZE)
    else:
      lower = block_count * BaseFonter.LOCA_BLOCK_SIZE
      upper = n
      assert upper - lower <= BaseFonter.LOCA_BLOCK_SIZE
      if fill_with_upper:
        filler_value = locations[upper - 1]
      else:
        filler_value = locations[lower]
      locations[lower:upper] = array.array(off_format, [filler_value] * (upper - lower))

  def __sparse_charstring_offsets(self,output):
    self.font = TTFont(output)
    assert 'CFF ' in self.font
    cffTableOffset = self.font.reader.tables['CFF '].offset
    cffTable = self.font['CFF '].cff
    assert len(cffTable.fontNames) == 1

    charStringOffset = cffTable[cffTable.fontNames[0]].rawDict['CharStrings']

    inner_file = self.font.reader.file

    inner_file.seek(cffTableOffset + charStringOffset)
    count = struct.unpack('>H',inner_file.read(2))[0]
    offSize = struct.unpack('B',inner_file.read(1))[0]

    inner_file.seek(cffTableOffset + charStringOffset )
    raw_index_file = Index(inner_file)

    # TODO(bstell) this needs to correctly handle the offset to .notdef
    locations = raw_index_file.offsets
    assert (count+1) == len(locations)

    self.font.close()

    off_format = 'L'
    self.__segment_table(locations, off_format, False)
    #checking max fake CharString size
    i = BaseFonter.LOCA_BLOCK_SIZE
    max_diff = 0
    while i < len(locations):
      diff = locations[i] - locations[i-1]
      max_diff = max(max_diff,diff)
      i+=BaseFonter.LOCA_BLOCK_SIZE
    assert max_diff < 65536 , 'LOCA_BLOCK_SIZE too big'

    new_offsets = bytearray()
    offSize = -offSize
    for offset in locations:
      bin_offset = struct.pack(">l", offset)[offSize:]
      new_offsets.extend(bin_offset)
    assert len(new_offsets) == (count+1) * -offSize

    font_file = open(output,'r+b')
    font_file.seek(cffTableOffset + charStringOffset + 3)
    # TODO(bstell) need to deal with the notdef glyph here
    font_file.write(new_offsets)
    font_file.close()

  def __fill_loca(self, output):  # more advanced filling needed
    self.font = TTFont(output)
    loca_off = self.font.reader.tables['loca'].offset
    loca_len = self.font.reader.tables['loca'].length
    long_format = self.font['head'].indexToLocFormat
    self.font.close()
    font_file = open(output,'r+b')
    if long_format:
      off_format = "I"
      notdef_len = 4
    else:
      off_format = "H"
      notdef_len = 2
    # Do not clear the .notdef glyph loca values
    loca_off += notdef_len
    loca_len -= notdef_len
    locations = array.array(off_format)
    font_file.seek(loca_off);
    locations.fromstring(font_file.read(loca_len))
    self.__segment_table(locations, off_format, True)
    font_file.seek(loca_off);
    loca_data = locations.tostring()
    assert len(loca_data)==loca_len
    font_file.write(loca_data)
    font_file.close()

  def __rle(self, output):
    rle_font = RleFont(output)
    rle_font.encode()
    rle_font.write(output)

  def __add_header(self, output, header_data):
    base_file = open(output,'rb')
    all_base = base_file.read()
    base_file.close()
    base_with_head_file = open(output,'wb')
    base_with_head_file.write(header_data)
    base_with_head_file.write(all_base)
    base_with_head_file.close()



  def base(self, output, header_data):
    """Call this function get base font Call only once, since given font will be closed
    """
    of = open(output, 'wb')
    self.font.reader.file.seek(0)
    of.write(self.font.reader.file.read())
    of.close()
    self.__zero_mtx('hmtx', output)
    self.__zero_mtx('vmtx', output)
    self.font.close()

    if self.isCff:
      self.__zero_char_strings(output)
      self.__sparse_charstring_offsets(output)
      self.__zero_charset_fmt(output)
    else:
      self.__zero_glyf(output)
      self.__fill_loca(output)

    self.__zero_cmaps(output)
    self.__rle(output)

    if header_data:
      self.__add_header(output, header_data)

  def dump_base(self, output):
    """Call this function get base font Call only once, since given font will be closed
    """
    of = open(output, 'wb')
    self.font.reader.file.seek(0)
    of.write(self.font.reader.file.read())
    of.close()
    self.__zero_mtx('hmtx', output)
    self.__zero_mtx('vmtx', output)
    self.font.close()

    if self.isCff:
      self.__zero_char_strings(output)
      self.__sparse_charstring_offsets(output)
      self.__zero_charset_fmt(output)
    else:
      self.__zero_glyf(output)
      self.__fill_loca(output)

    self.__zero_cmaps(output)
    #self.__rle(output)

    #if header_data:
    #  self.__add_header(output, header_data)

