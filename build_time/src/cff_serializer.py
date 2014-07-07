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


from struct import pack
from dumper import Dumper
import sys
from fontTools.ttLib import TTFont
from fontTools.cffLib import Index


class CffSerializer(object):
  """Serializes 'cff' table for given font file
  """
  # formats
  fmt_CffTable = '>HHL'
  # flags
  NONE = 0
  HAS_HMTX = 1 << 0
  HAS_VMTX = 1 << 1
  CFF_FONT = 1 << 2
  CMP_NONE = NONE
  CMP_GZIP = (1 << 2) + NONE
  CMP_BROTLI = (1 << 2) + (1 << 2)
  CMP_LZMA = (1 << 2) + (1 << 3)
  CLEAN = NONE
  DIRTY = (1 << 6)

  def __init__(self, fontfile):
    self.font = TTFont(fontfile)
    assert 'CFF ' in self.font
    self.cffTableOffset = self.font.reader.tables['CFF '].offset
    cffTable = self.font['CFF '].cff
    assert len(cffTable.fontNames) == 1
    charStringOffset = cffTable[cffTable.fontNames[0]].rawDict['CharStrings']
    inner_file = self.font.reader.file
    inner_file.seek(self.cffTableOffset + charStringOffset)
    self.rawIndexFile = Index(inner_file)

  def __determine_mtx_fmt(self):
    self.fmt_mtx = ''
    self.has_hmtx_ = CffSerializer.HAS_HMTX if ('hmtx' in self.font)\
     else CffSerializer.NONE
    if self.has_hmtx_:
      self.fmt_mtx += 'h'
      self.HMTX = self.font['hmtx']
    self.has_vmtx_ = CffSerializer.HAS_VMTX if ('vmtx' in self.font)\
       else CffSerializer.NONE
    if self.has_vmtx_:
      self.fmt_mtx += 'h'
      self.VMTX = self.font['vmtx']

  def prepare_cff(self):
    """Prepare Cff table and table entries along with Cff CharString data
    """
    self.__determine_mtx_fmt()
    self.fmt_CffEntry = '>H' + self.fmt_mtx + 'LH'
    assert 'maxp' in self.font
    numGlyphs = self.font['maxp'].numGlyphs
    self.CffTable = (
        pack(
            CffSerializer.fmt_CffTable,
            (
                self.has_hmtx_ | self.has_vmtx_ | CffSerializer.CLEAN | CffSerializer.CFF_FONT),
            numGlyphs,
            self.rawIndexFile.offsetBase - self.cffTableOffset))
    self.glyphs_info = []
    self.glyphs_data = []
    glyphOrder = self.font.getGlyphOrder()
    cff_data_table_start = self.rawIndexFile.offsetBase
    offset_table = self.rawIndexFile.offsets
    for i in xrange(numGlyphs):
      offset = offset_table[i] + cff_data_table_start - self.cffTableOffset
      length = offset_table[i + 1] - offset_table[i]
      self.glyphs_data.append(self.rawIndexFile[i])
      args = [i]
      if self.has_hmtx_: args.append(self.HMTX.metrics[glyphOrder[i]][1])
      if self.has_vmtx_: args.append(self.VMTX.metrics[glyphOrder[i]][1])
      args.append(offset)
      args.append(length)
      # print i, glyphOrder[i], offset, length
      self.glyphs_info.append(pack(self.fmt_CffEntry, *args))

    self.cffReady = True

  def serialize_cff(self, output_idx, output_data):
    """Dump the Glyf data to the file
    """
    if self.cffReady:
      dumper = Dumper(output_idx)
      dumper.dump(self.CffTable)
      dumper.dump_for_each(self.glyphs_info)
      dumper.close()
      dumper = Dumper(output_data)
      dumper.dump_for_each(self.glyphs_data)
      dumper.close()

  def close(self):
    self.font.close()


if __name__ == '__main__':
  print 'args', sys.argv[1]
  cff = CffSerializer(sys.argv[1])
  cff.prepare_cff()
  cff.serialize_cff('cff_idx', 'cff_data')
  cff.close()
