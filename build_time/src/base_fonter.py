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


class BaseFonter(object):
  """Create base font for the given font file"""

  def __init__(self, fontfile):
    self.fontfile = fontfile
    self.font = TTFont(fontfile)
    self.isCff = 'CFF ' in self.font
    # assert 'glyf' in self.font, 'only support TrueType (quadratic) fonts \
    #(eg, not CFF) at this time'

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
    filler.fill(glyf_off, glyf_len, '\0')
    filler.close()

  def __end_char_strings(self, output):
    self.font = TTFont(output)
    assert 'CFF ' in self.font
    cffTableOffset = self.font.reader.tables['CFF '].offset
    #print 'CFF starts', cffTableOffset
    cffTable = self.font['CFF '].cff
    assert len(cffTable.fontNames) == 1
    charStringOffset = cffTable[cffTable.fontNames[0]].rawDict['CharStrings']
    #print 'CS', charStringOffset
    inner_file = self.font.reader.file
    inner_file.seek(cffTableOffset + charStringOffset)
    rawIndexFile = Index(inner_file)
    baseOffset = rawIndexFile.offsetBase
   # print 'Base', baseOffset
    size = rawIndexFile.offsets[-1] - 1
    offset = baseOffset + rawIndexFile.offsets[0]
    self.font.close()
    #print 'Filled', offset, size
    filler = Filler(output)
    filler.fill(offset, size, '\x0e')
    filler.close()

  def __zero_loca(self, output):  # more advanced filling needed
    self.font = TTFont(output)
    loca_off = self.font.reader.tables['loca'].offset
    loca_len = self.font.reader.tables['loca'].length
    self.font.close()
    filler = Filler(output)
    filler.fill(loca_off, loca_len, '\0')
    filler.close()

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
   # self.__zero_loca(output)
