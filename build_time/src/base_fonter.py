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
from fontTools.cffLib import Index
import array
from rle_font import RleFont



class BaseFonter(object):
  """Create base font for the given font file"""
  
  LOCA_BLOCK_SIZE = 64

  def __init__(self, fontfile):
    self.fontfile = fontfile
    self.font = TTFont(fontfile)
    self.isCff = 'CFF ' in self.font

  def __zero_mtx(self, mtx):
    if mtx in self.font:
      new = dict.fromkeys(self.font[mtx].metrics.keys())
      for i, metric in self.font[mtx].metrics.iteritems():
        new[i] = [metric[0], 0]
      self.font[mtx].metrics.clear()
      self.font[mtx].metrics = new

  def __zero_glyf(self, output):
    self.font = TTFont(output)
    glyf_off = self.font.reader.tables['glyf'].offset
    glyf_len = self.font.reader.tables['glyf'].length
    self.font.close()
    filler = Filler(output)
    filler.fill(glyf_off, glyf_len, '\xff')
    filler.close()

  def __end_char_strings(self, output):
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
    size = rawIndexFile.offsets[-1] - 1
    offset = baseOffset + rawIndexFile.offsets[0]
    self.font.close()
    filler = Filler(output)
    filler.fill(offset, size, '\x0e')
    filler.close()



  def __fill_loca(self, output):  # more advanced filling needed
    self.font = TTFont(output)
    loca_off = self.font.reader.tables['loca'].offset
    loca_len = self.font.reader.tables['loca'].length
    long_format = self.font['head'].indexToLocFormat
    self.font.close()
    font_file = open(output,'r+b')
    if long_format:
      off_format = "I"
    else:
      off_format = "H"
    locations = array.array(off_format)
    font_file.seek(loca_off);
    locations.fromstring(font_file.read(loca_len))
    n = len(locations)
    block_count = (n-1) / BaseFonter.LOCA_BLOCK_SIZE
    for block_no in xrange(block_count):
      lower =  block_no * BaseFonter.LOCA_BLOCK_SIZE
      upper = (block_no+1) * BaseFonter.LOCA_BLOCK_SIZE
      locations[lower:upper] = array.array(off_format,[locations[upper-1]] * BaseFonter.LOCA_BLOCK_SIZE)
    else:
      lower =  block_count * BaseFonter.LOCA_BLOCK_SIZE
      upper = n
      assert upper-lower <= BaseFonter.LOCA_BLOCK_SIZE
      locations[lower:upper] =  array.array(off_format,[locations[-1]]*(upper-lower))
    font_file.seek(loca_off);
    loca_data = locations.tostring()
    assert len(loca_data)==loca_len
    font_file.write(loca_data)
    font_file.close()

    
  def __rle(self, output):
    rle_font = RleFont(output)
    rle_font.encode()
    rle_font.write(output)
    

  def base(self, output):
    """Call this function get base font Call only once, since given font will be closed

    """
    self.__zero_mtx('hmtx')
    self.__zero_mtx('vmtx')
    self.font.save(output, reorderTables=False)
    self.font.close()
    if self.isCff:
      self.__end_char_strings(output)
    else:
      self.__zero_glyf(output)
      self.__fill_loca(output)
    self.__rle(output)
